// Carga diaria (D-085, fila 6). Dos ayudas dentro de los límites de hoy. El perfil guía deja tus
// ajustes de repaso como los recomienda la guía de Anki y la sugerencia calcula cuántas tarjetas
// nuevas por día aguantas según tus repasos que vienen y los minutos que estudias. También permite
// quitar el límite de nuevas, con su aviso. Nada se aplica solo, cada cambio sale de un botón.
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { screenPath } from '@/app/screens';
import { examDateFor } from '@/config/exam';
import { DEFAULT_THRESHOLDS } from '@/config/thresholds';
import { useDataApi } from '@/data/context';
import type { Card } from '@/data/schemas/decks';
import type { AppEvent } from '@/data/schemas/events';
import { updateProfile } from '@/data/usecases/profile';
import { estimateCardTimes, suggestNewPerDay } from '@/engines/dailyLoad';
import { guideProfile, guideProfileChanges } from '@/engines/guideProfile';
import { studyDayOf } from '@/engines/studyDay';
import { t } from '@/i18n/es-MX';
import { Button } from '@/ui/components/button';
import { CheckboxField } from '@/ui/components/field';
import { CalibratingNote } from '@/ui/states/states';
import { FeatureGate } from '../shared/FeatureGate';
import type { ReadySession } from '../shared/RequireSession';
import { queueCardsOf, timeSamplesOf } from './dailyLoadData';
import { dayLabel } from './dayLabel';
import { schedulerConfig } from './schedulerConfig';
import { latestCardStates } from './study';

const RULES = DEFAULT_THRESHOLDS.daily;

export function DailyLoadPanel({
  session,
  cards,
  events,
}: {
  session: ReadySession;
  /** Las tarjetas que se están repasando, de los mazos que sigue y sin las suspendidas */
  cards: readonly Pick<Card, 'id' | 'noteId'>[];
  events: readonly AppEvent[];
}) {
  const { user } = session;
  return (
    <div className="flex flex-col gap-4">
      <FeatureGate userId={user.id} feature="guideProfile">
        <GuideProfile session={session} />
      </FeatureGate>
      <NewPerDay session={session} cards={cards} events={events} />
    </div>
  );
}

function GuideProfile({ session }: { session: ReadySession }) {
  const api = useDataApi();
  const { user, settings } = session;
  const text = t.dailyLoad;
  const [busy, setBusy] = useState(false);
  const [applied, setApplied] = useState(false);
  const proposed = useMemo(
    () =>
      guideProfile({ today: studyDayOf(new Date(), user.timeZone), examDate: examDateFor(user) }),
    [user],
  );
  const changes = guideProfileChanges(settings, proposed);

  return (
    <section aria-label={text.guideTitle} className="flex flex-col gap-2">
      <h3 className="font-semibold">{text.guideTitle}</h3>
      <p className="text-sm text-fg-muted">{text.guideBody}</p>
      {changes.length === 0 ? (
        <p className="text-sm">{text.guideAlready}</p>
      ) : (
        <ul className="list-disc pl-5 text-sm">
          {changes.map((change) => (
            <li key={change.field}>
              {text.guideChange(text.guideFields[change.field], change.from, change.to)}
            </li>
          ))}
        </ul>
      )}
      {changes.length > 0 ? (
        <Button
          variant="secondary"
          size="sm"
          className="self-start"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            setApplied(false);
            void updateProfile(api, user, {
              settings: {
                desiredRetention: proposed.desiredRetention,
                maxIntervalDays: proposed.maxIntervalDays,
                spacing: proposed.spacing,
              },
            })
              .then(() => {
                setApplied(true);
              })
              .finally(() => {
                setBusy(false);
              });
          }}
        >
          {text.guideApply}
        </Button>
      ) : null}
      <p role="status" className="text-sm font-medium text-success">
        {applied ? text.guideApplied : ''}
      </p>
    </section>
  );
}

function NewPerDay({
  session,
  cards,
  events,
}: {
  session: ReadySession;
  cards: readonly Pick<Card, 'id' | 'noteId'>[];
  events: readonly AppEvent[];
}) {
  const api = useDataApi();
  const { user, settings } = session;
  const text = t.dailyLoad;
  // El cálculo proyecta varios días de repasos y en una colección grande tarda. Por eso corre al
  // pedirlo y no cada vez que se abre Repasar
  const [requested, setRequested] = useState(false);
  const [saved, setSaved] = useState(false);

  const result = useMemo(() => {
    if (!requested || settings.unlimitedNewCards) return null;
    const config = schedulerConfig(session);
    const queueCards = queueCardsOf(cards, latestCardStates(events));
    const times = estimateCardTimes(timeSamplesOf(events), {
      minReviewsToMeasure: RULES.minReviewsToMeasure,
      referenceSecondsPerReview: RULES.referenceSecondsPerReview,
      referenceSecondsPerNew: RULES.referenceSecondsPerNew,
      capSeconds: RULES.cardTimeCapSeconds,
    });
    const now = new Date();
    return {
      times,
      today: studyDayOf(now, user.timeZone),
      unseen: queueCards.filter((card) => card.state === null || card.state.state === 'new').length,
      suggestion: suggestNewPerDay({
        cards: queueCards,
        now,
        config,
        dailyMinutes: user.dailyMinutes,
        times,
        rules: RULES,
      }),
    };
  }, [requested, settings.unlimitedNewCards, session, cards, events, user]);

  const setUnlimited = (unlimitedNewCards: boolean) => {
    setSaved(false);
    setRequested(false);
    void updateProfile(api, user, { settings: { unlimitedNewCards } });
  };

  const suggestion = result?.suggestion;
  // La sugerencia no puede pasar de las nuevas que existen ni del máximo que acepta el ajuste
  const useValue =
    suggestion?.status === 'ready' && result
      ? Math.min(suggestion.suggested, result.unseen, 500)
      : null;

  return (
    <FeatureGate userId={user.id} feature="newPerDaySuggestion">
      <section aria-label={text.suggestionTitle} className="flex flex-col gap-2">
        <h3 className="font-semibold">{text.suggestionTitle}</h3>
        <CheckboxField
          label={t.settings.unlimitedNewCards}
          hint={t.settings.unlimitedNewCardsHint}
          checked={settings.unlimitedNewCards}
          onChange={(event) => {
            setUnlimited(event.target.checked);
          }}
        />
        {settings.unlimitedNewCards ? (
          <p className="text-sm text-warning">{text.unlimitedOn}</p>
        ) : (
          <>
            <p className="text-sm text-fg-muted">{text.current(settings.newCardsPerDay)}</p>
            {result === null ? (
              <Button
                variant="secondary"
                size="sm"
                className="self-start"
                onClick={() => {
                  setRequested(true);
                }}
              >
                {text.calculate}
              </Button>
            ) : null}
            {suggestion?.status === 'needs_minutes' ? (
              <div className="flex flex-col items-start gap-2">
                <p className="text-sm">{text.needsMinutes}</p>
                <Button asChild variant="secondary" size="sm">
                  <Link to={screenPath('planner')}>{text.goToPlan}</Link>
                </Button>
              </div>
            ) : null}
            {suggestion?.status === 'no_new_cards' ? (
              <p className="text-sm">{text.noNewCards}</p>
            ) : null}
            {suggestion?.status === 'ready' && result && useValue !== null ? (
              <div className="flex flex-col items-start gap-2">
                <p className="font-medium">{text.suggested(useValue)}</p>
                <p className="text-sm text-fg-muted">{text.basis(suggestion.budgetMinutes)}</p>
                {suggestion.peakDay !== null && useValue > 0 ? (
                  <p className="text-sm text-fg-muted">
                    {text.peak(suggestion.peakMinutes, dayLabel(suggestion.peakDay, result.today))}
                  </p>
                ) : null}
                {suggestion.backlogOverBudget ? (
                  <p className="text-sm text-warning">{text.backlogOver}</p>
                ) : null}
                {suggestion.measured ? (
                  <p className="text-sm text-fg-muted">{text.measuredNote}</p>
                ) : (
                  <>
                    <CalibratingNote
                      current={result.times.reviews}
                      target={RULES.minReviewsToMeasure}
                      unit={text.calibratingUnit}
                      className="w-full"
                    />
                    <p className="text-sm text-fg-muted">{text.referenceTimes}</p>
                  </>
                )}
                <Button
                  size="sm"
                  disabled={useValue === settings.newCardsPerDay}
                  onClick={() => {
                    void updateProfile(api, user, { settings: { newCardsPerDay: useValue } }).then(
                      () => {
                        setSaved(true);
                      },
                    );
                  }}
                >
                  {text.use(useValue)}
                </Button>
              </div>
            ) : null}
          </>
        )}
        <p role="status" className="text-sm font-medium text-success">
          {saved ? text.applied : ''}
        </p>
      </section>
    </FeatureGate>
  );
}
