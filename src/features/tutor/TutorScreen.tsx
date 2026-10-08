// Tutor (pantalla 11, 8.2 a 8.5). Hipótesis sobre los errores del alumno con su evidencia y las
// acciones que la app sabe ejecutar, un informe semanal, consejos por sesgo y el lugar de las
// tarjetas en borrador. Todo sale de reglas sobre la bitácora y el banco cada vez que se abre. Con el
// análisis con IA encendido, la IA solo redacta la explicación de esos mismos resultados y, si algo
// falla, queda la plantilla. Nada de chat libre ni de predecir el puntaje.
import { Hourglass, Lightbulb, ListX } from 'lucide-react';
import { useMemo, useState } from 'react';
import { ScreenHeader } from '@/app/layout/ScreenHeader';
import { useDataApi } from '@/data/context';
import type { Option } from '@/data/schemas/bank';
import { errorIds } from '@/data/usecases/errorCards';
import { setConsent } from '@/data/usecases/profile';
import { t } from '@/i18n/es-MX';
import { Card, CardDescription, CardHeader, CardTitle } from '@/ui/components/card';
import { StatCell, StatPanel } from '@/ui/components/stat-panel';
import { Disclosure } from '@/ui/components/disclosure';
import { LoadingState } from '@/ui/states/states';
import { TOPIC_NAMES } from '../shared/topics';
import { RequireSession, type ReadySession } from '../shared/RequireSession';
import { useUserEvents } from '../shared/useUserEvents';
import { HypothesisCard, type EvidenceLookup } from './HypothesisCard';
import { createContrastCards } from './contrastCards';
import {
  hypothesisArtifactId,
  recordHypothesisAction,
  reopenHypothesis,
  respondToHypothesis,
} from './hypothesisStore';
import { enableNegationHighlight, shortenPomodoro } from './tutorActions';
import { confusedPairs, pickTop, type Hypothesis, type TutorAction } from './tutorModel';
import { useTutorData, useTutorView, type TutorData } from './useTutorData';
import { cardLabel } from './cardLabel';
import { BiasTipsCard, DraftCardsCard, FormingPatterns, WeeklyReportCard } from './TutorSections';
import { AiAnalysisCard } from './AiAnalysisCard';
import type { ItemTexts } from './aiInputs';
import { useTutorAi } from './useTutorAi';

/** Hipótesis abiertas de entrada. Con mucha actividad salen decenas y no se pueden leer todas */
const TOP_HYPOTHESES = 3;

export function TutorScreen() {
  return <RequireSession screen="tutor">{(session) => <Tutor session={session} />}</RequireSession>;
}

function Tutor({ session }: { session: ReadySession }) {
  const events = useUserEvents(session.user.id);
  const data = useTutorData(session.user.id, events);
  const header = (
    <ScreenHeader title={t.screens.tutor.title} description={t.screens.tutor.description} />
  );
  if (events === undefined || data === undefined) {
    return (
      <>
        {header}
        <LoadingState label={t.tutor.loading} />
      </>
    );
  }
  return (
    <>
      {header}
      <TutorBody session={session} events={events} data={data} />
    </>
  );
}

function TutorBody({
  session,
  events,
  data,
}: {
  session: ReadySession;
  events: NonNullable<ReturnType<typeof useUserEvents>>;
  data: TutorData;
}) {
  const api = useDataApi();
  const { user } = session;
  const { bank, content, artifacts } = data;
  const [messages, setMessages] = useState<Record<string, string>>({});
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const text = t.tutor;
  const view = useTutorView(session, events, data);

  const noteById = useMemo(() => new Map(content.notes.map((note) => [note.id, note])), [content]);
  const bundles = useMemo(() => {
    const byQuestion = new Map<string, Option[]>();
    for (const option of bank.options)
      byQuestion.set(option.questionVersionId, [
        ...(byQuestion.get(option.questionVersionId) ?? []),
        option,
      ]);
    return new Map(
      bank.questions.map((question) => [
        question.id,
        { question, options: byQuestion.get(question.id) ?? [] },
      ]),
    );
  }, [bank]);

  const statusOf = new Map(artifacts.map((artifact) => [artifact.id, artifact.status]));
  const statusFor = (hypothesis: Hypothesis) =>
    statusOf.get(hypothesisArtifactId(user.id, hypothesis.key));
  const shown = view.confirmed.filter((hypothesis) => statusFor(hypothesis) !== 'rejected');
  const dismissed = view.confirmed.filter((hypothesis) => statusFor(hypothesis) === 'rejected');
  // Una que descartó no se le vuelve a mostrar, ni siquiera como patrón que se está formando
  const formingShown = view.forming.filter((hypothesis) => statusFor(hypothesis) !== 'rejected');
  const errorCards = content.notes.filter((note) => note.deckId === errorIds.deck(user.id)).length;
  const questionById = new Map(bank.questions.map((question) => [question.id, question]));

  const lookup: EvidenceLookup = {
    labelOf: (kind, itemId) => {
      if (kind === 'question') {
        const prompt = questionById.get(itemId)?.prompt;
        return prompt && prompt.length > 110 ? `${prompt.slice(0, 107)}…` : prompt;
      }
      const card = content.cards.find((entry) => entry.id === itemId);
      const note = card ? noteById.get(card.noteId) : undefined;
      return note && card ? cardLabel(note, card.ordinal) : undefined;
    },
  };

  // Solo unas cuantas van abiertas, de reglas distintas, y el resto en una lista que se abre
  const { top, rest } = pickTop(shown, TOP_HYPOTHESES);

  // El texto completo de lo que forma cada hipótesis, para la IA. La pantalla usa una versión corta
  const texts: ItemTexts = {
    textOf: (kind, itemId) => {
      if (kind === 'question') {
        const question = questionById.get(itemId);
        if (!question) return undefined;
        return question.vignette ? `${question.vignette} ${question.prompt}` : question.prompt;
      }
      const card = content.cards.find((entry) => entry.id === itemId);
      const note = card ? noteById.get(card.noteId) : undefined;
      return note && card ? cardLabel(note, card.ordinal) : undefined;
    },
  };
  const tutorAi = useTutorAi({
    session,
    view,
    hypotheses: top,
    artifacts,
    texts,
    answersThisWeek: view.answersThisWeek,
  });
  const [turningOn, setTurningOn] = useState(false);

  const run = async (hypothesis: Hypothesis, job: () => Promise<string | undefined>) => {
    setBusyKey(hypothesis.key);
    try {
      const message = await job();
      setMessages((current) => ({ ...current, [hypothesis.key]: message ?? '' }));
    } catch {
      setMessages((current) => ({ ...current, [hypothesis.key]: text.actionFailed }));
    } finally {
      setBusyKey(null);
    }
  };

  const apply = (hypothesis: Hypothesis, action: TutorAction) =>
    run(hypothesis, async () => {
      let message: string | undefined;
      if (action === 'enable_highlight') {
        await enableNegationHighlight(api, user);
        message = text.actionDone.enable_highlight;
      } else if (action === 'suggest_break') {
        const result = await shortenPomodoro(api, user);
        message = text.actionDone.suggest_break(result.focus, result.rest);
      } else if (action === 'create_contrast_card') {
        const created = await createContrastCards(api, user, confusedPairs(hypothesis), bundles);
        message = text.actionDone.create_contrast_card(created);
      }
      // Las demás acciones solo llevan a otra pantalla y aquí solo se anotan
      await recordHypothesisAction(api, user, hypothesis, action);
      return message;
    });

  const card = (hypothesis: Hypothesis, compact: boolean) => (
    <HypothesisCard
      key={hypothesis.key}
      hypothesis={hypothesis}
      status={statusFor(hypothesis)}
      lookup={lookup}
      baseTopic={view.baseTopics.get(hypothesis.area)}
      message={messages[hypothesis.key]}
      busy={busyKey === hypothesis.key}
      compact={compact}
      ai={tutorAi.hypotheses.get(hypothesis.key)}
      onAction={(action) => {
        void apply(hypothesis, action);
      }}
      onRespond={(helpful) => {
        void run(hypothesis, async () => {
          await respondToHypothesis(api, user, hypothesis, helpful);
          return helpful ? undefined : text.answered.rejected;
        });
      }}
    />
  );

  return (
    <>
      <StatPanel label={text.stats.label}>
        <StatCell
          icon={<Lightbulb />}
          label={text.stats.hypotheses}
          value={shown.length.toLocaleString('es-MX')}
          caption={text.stats.hypothesesCaption}
        />
        <StatCell
          icon={<Hourglass />}
          label={text.stats.forming}
          value={formingShown.length.toLocaleString('es-MX')}
          caption={text.stats.formingCaption}
        />
        <StatCell
          icon={<ListX />}
          label={text.stats.errors}
          value={errorCards.toLocaleString('es-MX')}
          caption={text.stats.errorsCaption}
        />
      </StatPanel>
      <Card aria-labelledby="tutor-intro">
        <CardHeader>
          <CardTitle id="tutor-intro">{text.hypothesesTitle}</CardTitle>
          <CardDescription>{text.intro}</CardDescription>
        </CardHeader>
        <p className="text-sm text-fg-muted">{text.howItWorks}</p>
        {shown.length === 0 && dismissed.length === 0 ? (
          <p
            role="status"
            className="mt-2 rounded-md bg-primary-soft px-3 py-2 text-sm text-primary"
          >
            {text.calibrating(view.recentErrors)}
          </p>
        ) : null}
      </Card>

      <AiAnalysisCard
        state={tutorAi}
        busy={turningOn}
        onTurnOn={() => {
          setTurningOn(true);
          void setConsent(api, user, 'ai_analysis', true).finally(() => {
            setTurningOn(false);
          });
        }}
      />

      {top.map((hypothesis) => card(hypothesis, false))}

      {rest.length > 0 ? (
        <Disclosure title={text.moreTitle(rest.length)} summary={text.moreHint}>
          <ul className="flex flex-col gap-2">
            {rest.map((hypothesis) => {
              const rule = text.rules[hypothesis.rule as keyof typeof text.rules];
              const area = TOPIC_NAMES.get(hypothesis.area) ?? hypothesis.area;
              return (
                <li key={hypothesis.key}>
                  <Disclosure
                    title={rule.title}
                    summary={`${area} · ${text.findings(hypothesis.recentFindings)}`}
                  >
                    {card(hypothesis, true)}
                  </Disclosure>
                </li>
              );
            })}
          </ul>
        </Disclosure>
      ) : null}

      <FormingPatterns forming={formingShown} />

      {dismissed.length > 0 ? (
        <Disclosure title={text.dismissedTitle(dismissed.length)}>
          <ul className="flex flex-col gap-2">
            {dismissed.map((hypothesis) => {
              const rule = text.rules[hypothesis.rule as keyof typeof text.rules];
              return (
                <li key={hypothesis.key} className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="min-w-0 flex-1">{rule.title}</span>
                  <button
                    type="button"
                    className="min-h-touch rounded-md px-3 font-semibold text-primary hover:bg-muted"
                    aria-label={`${text.reopen}. ${rule.title}`}
                    onClick={() => {
                      void reopenHypothesis(api, user, hypothesis);
                    }}
                  >
                    {text.reopen}
                  </button>
                </li>
              );
            })}
          </ul>
        </Disclosure>
      ) : null}

      <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-2">
        <WeeklyReportCard report={view.report} ai={tutorAi.report} />
        <div className="flex flex-col gap-3">
          <BiasTipsCard tips={view.biasTips} calibration={view.biasCalibration} ai={tutorAi.tips} />
          <DraftCardsCard errorCards={errorCards} />
        </div>
      </div>
    </>
  );
}
