// Atrasos y fechas de repaso (D-085, fila 5). Cuando se juntan muchas tarjetas vencidas avisa y
// ofrece repartirlas entre unos días. Además deja posponer lo de hoy, adelantar repasos y deshacer el
// último cambio. Todo cambia solo la fecha de la tarjeta y se guarda como evento nuevo, la memoria de
// la tarjeta no se toca y la bitácora no se edita.
import { CalendarClock, Undo2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { DEFAULT_THRESHOLDS } from '@/config/thresholds';
import { useDataApi } from '@/data/context';
import type { Card } from '@/data/schemas/decks';
import type { AppEvent } from '@/data/schemas/events';
import { recordReschedule, undoReschedule } from '@/data/usecases/reschedule';
import {
  advanceReviews,
  MAX_ADVANCE_COUNT,
  MAX_POSTPONE_DAYS,
  MAX_SPREAD_DAYS,
  postponeCards,
  spreadOverdue,
  summarizeOverdue,
} from '@/engines/reschedule';
import { lastUndoableAction } from '@/engines/rescheduleLog';
import { studyDayEnd, studyDayOf } from '@/engines/studyDay';
import { t } from '@/i18n/es-MX';
import { Badge } from '@/ui/components/badge';
import { Button } from '@/ui/components/button';
import { Card as Panel, CardDescription, CardHeader, CardTitle } from '@/ui/components/card';
import { Disclosure } from '@/ui/components/disclosure';
import { SelectField, TextField } from '@/ui/components/field';
import type { ReadySession } from '../shared/RequireSession';
import { queueCardsOf } from './dailyLoadData';
import { schedulerConfig } from './schedulerConfig';
import { latestCardStates } from './study';

const POSTPONE_OPTIONS = [1, 2, 3, 5, 7, 10, 14, 21, MAX_POSTPONE_DAYS];
const SPREAD_OPTIONS = Array.from({ length: MAX_SPREAD_DAYS }, (_, index) => index + 1);
const RULES = {
  minOverdue: DEFAULT_THRESHOLDS.daily.recoveryMinOverdue,
  overdueShareOfLimit: DEFAULT_THRESHOLDS.daily.recoveryOverdueShareOfLimit,
};

/** El día con su nombre corto, por ejemplo mié 9. Hoy se escribe Hoy */
function dayLabel(day: string, today: string): string {
  if (day === today) return t.overdue.today;
  return new Intl.DateTimeFormat('es-MX', { weekday: 'short', day: 'numeric', timeZone: 'UTC' }).format(
    new Date(`${day}T12:00:00Z`),
  );
}

type Done = { kind: 'spread' | 'postpone' | 'advance' | 'undo'; count: number };

export function OverdueTools({
  session,
  cards,
  events,
}: {
  session: ReadySession;
  /** Las tarjetas que se están repasando, de los mazos que sigue y sin las suspendidas */
  cards: readonly Pick<Card, 'id' | 'noteId'>[];
  events: readonly AppEvent[];
}) {
  const api = useDataApi();
  const config = useMemo(() => schedulerConfig(session), [session]);
  const states = useMemo(() => latestCardStates(events), [events]);
  const queueCards = useMemo(() => queueCardsOf(cards, states), [cards, states]);
  const actor = { id: session.user.id, timeZone: session.user.timeZone };

  // Lo calculado al abrir y cada vez que cambian las tarjetas o la bitácora
  const view = useMemo(() => {
    const now = new Date();
    const today = studyDayOf(now, config.timeZone);
    const endOfToday = studyDayEnd(today, config.timeZone).getTime();
    const scheduled = queueCards.filter((card) => card.state !== null && card.state.state !== 'new');
    const dueByToday = scheduled.filter(
      (card) => new Date((card.state as NonNullable<typeof card.state>).due).getTime() < endOfToday,
    );
    return {
      now,
      today,
      summary: summarizeOverdue({ cards: queueCards, now, config, rules: RULES }),
      dueByToday,
      aheadCount: scheduled.length - dueByToday.length,
    };
  }, [queueCards, config]);
  const { summary } = view;

  const [spreadDays, setSpreadDays] = useState(() =>
    String(summary.needsRecovery ? summary.suggestedDays : 3),
  );
  const [postponeDays, setPostponeDays] = useState('1');
  const [advanceCount, setAdvanceCount] = useState('20');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<Done | null>(null);
  const [failed, setFailed] = useState(false);

  const plan = useMemo(
    () => spreadOverdue({ cards: queueCards, now: view.now, config, days: Number(spreadDays) }),
    [queueCards, view.now, config, spreadDays],
  );
  const suggestedPlan = useMemo(
    () =>
      spreadOverdue({ cards: queueCards, now: view.now, config, days: summary.suggestedDays }),
    [queueCards, view.now, config, summary.suggestedDays],
  );
  const currentDue = (cardId: string) => states.get(cardId)?.due ?? null;
  const undoable = useMemo(() => lastUndoableAction(events, currentDue), [events, states]);

  const run = async (job: () => Promise<Done>) => {
    setBusy(true);
    setFailed(false);
    setDone(null);
    try {
      setDone(await job());
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };
  const spread = (days: number) =>
    run(async () => {
      const result = spreadOverdue({ cards: queueCards, now: new Date(), config, days });
      const count = await recordReschedule(api, actor, {
        kind: 'spread',
        assignments: result.assignments,
        days,
      });
      return { kind: 'spread', count };
    });
  const postponeItems = postponeCards({
    cards: view.dueByToday,
    now: view.now,
    config,
    days: Number(postponeDays),
  });
  const advanceItems = advanceReviews({
    cards: queueCards,
    now: view.now,
    config,
    count: Math.min(MAX_ADVANCE_COUNT, Math.max(0, Math.round(Number(advanceCount) || 0))),
  });

  const preview = (result: typeof plan) =>
    result.perDay
      .map((entry) => t.overdue.previewDay(dayLabel(entry.day, view.today), entry.count))
      .join(' · ');
  const text = t.overdue;

  const tools = (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-fg-muted">{text.memoryNote}</p>
      <div className="grid gap-4 lg:grid-cols-3">
        <section aria-label={text.spreadTitle} className="flex flex-col gap-2">
          <h3 className="font-semibold">{text.spreadTitle}</h3>
          <SelectField
            label={text.spreadDays}
            value={spreadDays}
            options={SPREAD_OPTIONS.map((days) => ({
              value: String(days),
              label: text.spreadDaysOption(days),
            }))}
            onChange={(event) => {
              setSpreadDays(event.target.value);
            }}
          />
          {summary.overdue === 0 ? (
            <p className="text-sm text-fg-muted">{text.noOverdue}</p>
          ) : plan.perDay.length === 0 ? (
            <p className="text-sm text-fg-muted">{text.noDays}</p>
          ) : (
            <p className="text-sm">
              <span className="font-medium">{text.spreadPreview}. </span>
              {preview(plan)}
            </p>
          )}
          {plan.overCapacity ? <p className="text-sm text-warning">{text.overCapacity}</p> : null}
          <Button
            variant="secondary"
            size="sm"
            className="self-start"
            disabled={busy || plan.assignments.length === 0}
            onClick={() => {
              void spread(Number(spreadDays));
            }}
          >
            {text.spreadButton(plan.assignments.length)}
          </Button>
        </section>

        <section aria-label={text.postponeTitle} className="flex flex-col gap-2">
          <h3 className="font-semibold">{text.postponeTitle}</h3>
          <p className="text-sm text-fg-muted">{text.postponeBody(view.dueByToday.length)}</p>
          <SelectField
            label={text.postponeDays}
            value={postponeDays}
            options={POSTPONE_OPTIONS.map((days) => ({
              value: String(days),
              label: text.postponeOption(days),
            }))}
            onChange={(event) => {
              setPostponeDays(event.target.value);
            }}
          />
          <Button
            variant="secondary"
            size="sm"
            className="self-start"
            disabled={busy || postponeItems.length === 0}
            onClick={() => {
              void run(async () => ({
                kind: 'postpone',
                count: await recordReschedule(api, actor, {
                  kind: 'postpone',
                  assignments: postponeItems,
                  days: Number(postponeDays),
                }),
              }));
            }}
          >
            {text.postponeButton(postponeItems.length)}
          </Button>
        </section>

        <section aria-label={text.advanceTitle} className="flex flex-col gap-2">
          <h3 className="font-semibold">{text.advanceTitle}</h3>
          <p className="text-sm text-fg-muted">{text.advanceBody(view.aheadCount)}</p>
          <TextField
            label={text.advanceCount}
            type="number"
            inputMode="numeric"
            min={0}
            max={view.aheadCount}
            value={advanceCount}
            onChange={(event) => {
              setAdvanceCount(event.target.value);
            }}
          />
          <Button
            variant="secondary"
            size="sm"
            className="self-start"
            disabled={busy || advanceItems.length === 0}
            onClick={() => {
              void run(async () => ({
                kind: 'advance',
                count: await recordReschedule(api, actor, {
                  kind: 'advance',
                  assignments: advanceItems,
                  days: null,
                }),
              }));
            }}
          >
            {text.advanceButton(advanceItems.length)}
          </Button>
        </section>
      </div>

      {undoable ? (
        <section aria-label={text.undoTitle} className="flex flex-col gap-2 border-t border-line pt-3">
          <p className="text-sm">
            {text.undoBody(
              undoable.kind,
              undoable.batches.reduce((total, batch) => total + batch.cards.length, 0),
            )}
          </p>
          <Button
            variant="ghost"
            size="sm"
            className="self-start"
            disabled={busy}
            onClick={() => {
              void run(async () => ({
                kind: 'undo',
                count: await undoReschedule(api, actor, undoable, currentDue),
              }));
            }}
          >
            <Undo2 aria-hidden />
            {text.undoButton}
          </Button>
        </section>
      ) : null}

      <p
        role="status"
        className={failed ? 'text-sm font-medium text-danger' : 'text-sm font-medium text-success'}
      >
        {busy
          ? text.working
          : failed
            ? text.error
            : done
              ? done.count === 0
                ? text.done.nothing
                : text.done[done.kind](done.count)
              : ''}
      </p>
    </div>
  );

  return (
    <>
      {summary.needsRecovery ? (
        <Panel aria-labelledby="recuperacion-titulo" className="border-warning">
          <CardHeader>
            <div className="flex flex-wrap items-center gap-2">
              <CalendarClock aria-hidden className="size-5 text-warning" />
              <CardTitle id="recuperacion-titulo">{text.recoveryTitle(summary.overdue)}</CardTitle>
              <Badge variant="warning">{text.summary(summary.overdue)}</Badge>
            </div>
            <CardDescription>{text.recoveryBody}</CardDescription>
          </CardHeader>
          {suggestedPlan.perDay.length > 0 ? (
            <p className="mb-3 text-sm">{preview(suggestedPlan)}</p>
          ) : null}
          <Button
            className="self-start"
            disabled={busy || suggestedPlan.assignments.length === 0}
            onClick={() => {
              setSpreadDays(String(summary.suggestedDays));
              void spread(summary.suggestedDays);
            }}
          >
            {text.spreadButton(suggestedPlan.assignments.length)}
          </Button>
        </Panel>
      ) : null}
      <Disclosure title={text.title} summary={text.summary(summary.overdue)}>
        {tools}
      </Disclosure>
    </>
  );
}
