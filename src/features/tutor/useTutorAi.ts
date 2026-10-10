// El análisis con IA del tutor (8.2, 8.3, 8.5). Con el consentimiento de análisis con IA y un plan que
// lo incluya, pide a los motores lo que falta, uno por uno, y deja que la pantalla lea el resultado
// de los artefactos. Cada trabajo se intenta una vez por visita. Si falla, la pantalla sigue con su
// plantilla y lo dice. Un límite diario o de presupuesto detiene los trabajos que faltan.
import { useEffect, useState } from 'react';
import type { AiStatus } from '@/ai/client';
import { useAiStatus } from '@/ai/useAiStatus';
import { PLANS } from '@/config/billing';
import { useDataApi } from '@/data/context';
import { useLiveData } from '@/data/hooks';
import type { AiArtifact } from '@/data/schemas/activity';
import { currentConsents } from '@/data/usecases/profile';
import { studyDayOf } from '@/engines/studyDay';
import { t } from '@/i18n/es-MX';
import type { ReadySession } from '../shared/RequireSession';
import { useActivePlan } from '../shared/useActivePlan';
import {
  BiasTipAiSchema,
  HypothesisAiSchema,
  ReportAiSchema,
  biasTipArtifactId,
  readAi,
  reportArtifactId,
  weekStart,
  type BiasTipAi,
  type HypothesisAi,
  type ReportAi,
} from './aiContent';
import type { ItemTexts } from './aiInputs';
import { planAiJobs, runAiJob } from './aiPlan';
import { hypothesisArtifactId } from './hypothesisStore';
import type { Hypothesis } from './tutorModel';
import type { TutorView } from './tutorView';

/** Fallas que paran los trabajos que faltan, porque los siguientes fallarían igual */
const STOPPING: ReadonlySet<string> = new Set([
  'student_limit',
  'budget_exceeded',
  'rate_limited',
  'unauthorized',
  'plan_required',
  'offline',
  'network',
]);

export type AiAccess = 'loading' | 'free-plan' | 'off' | 'on';

export interface TutorAiState {
  access: AiAccess;
  status: AiStatus;
  /** Se están pidiendo explicaciones a la IA */
  working: boolean;
  /** Por qué no se pudo, para decírselo al alumno. null si no pasó nada */
  notice: string | null;
  hypotheses: ReadonlyMap<string, HypothesisAi>;
  report: ReportAi | undefined;
  tips: ReadonlyMap<string, BiasTipAi>;
}

export function useTutorAi(input: {
  session: ReadySession;
  view: TutorView;
  /** Las hipótesis abiertas, sin las descartadas */
  hypotheses: readonly Hypothesis[];
  artifacts: readonly AiArtifact[];
  texts: ItemTexts;
  answersThisWeek: number;
}): TutorAiState {
  const { session, view, hypotheses, artifacts, texts, answersThisWeek } = input;
  const { user } = session;
  const api = useDataApi();
  const status = useAiStatus();
  const plan = useActivePlan(user.id);
  const consents = useLiveData(() => currentConsents(api, user.id), [api.repos, user.id]);
  const [notice, setNotice] = useState<string | null>(null);
  // Trabajos ya intentados en esta visita, para no repetir uno que falló
  const [attempted, setAttempted] = useState<ReadonlySet<string>>(new Set());
  // Un límite diario o de presupuesto, o la falta de conexión, detiene los que faltan
  const [stopped, setStopped] = useState(false);

  const access: AiAccess =
    plan === undefined || consents === undefined
      ? 'loading'
      : !PLANS[plan].access.aiTutor
        ? 'free-plan'
        : consents.ai_analysis
          ? 'on'
          : 'off';

  const byId = new Map(artifacts.map((artifact) => [artifact.id, artifact]));
  const week = weekStart(studyDayOf(new Date(), user.timeZone));
  const state: Omit<TutorAiState, 'working'> = {
    access,
    status,
    notice,
    hypotheses: new Map(
      hypotheses.flatMap((hypothesis) => {
        const ai = readAi(
          HypothesisAiSchema,
          byId.get(hypothesisArtifactId(user.id, hypothesis.key)),
        );
        return ai ? [[hypothesis.key, ai] as const] : [];
      }),
    ),
    report: (() => {
      const ai = readAi(ReportAiSchema, byId.get(reportArtifactId(user.id, week)));
      return ai?.week === week ? ai : undefined;
    })(),
    tips: new Map(
      view.biasTips.flatMap((tip) => {
        const ai = readAi(BiasTipAiSchema, byId.get(biasTipArtifactId(user.id, tip.tag)));
        return ai ? [[tip.tag, ai] as const] : [];
      }),
    ),
  };

  // Qué falta pedir. Los trabajos se piden de uno en uno. Al terminar uno cambia lo que falta y
  // sigue el siguiente
  const jobs =
    access === 'on' && !stopped && status.kind !== 'checking' && status.kind !== 'offline'
      ? planAiJobs({
          now: new Date(),
          userId: user.id,
          day: studyDayOf(new Date(), user.timeZone),
          hypotheses,
          report: view.report,
          answersThisWeek,
          tips: view.biasTips,
          artifacts: byId,
          texts,
        }).filter((job) => !attempted.has(job.key))
      : [];
  const next = jobs[0];
  const nextKey = next?.key;

  useEffect(() => {
    if (!next) return;
    let cancelled = false;
    const finish = (message: string | null, stop: boolean) => {
      if (cancelled) return;
      setAttempted((current) => new Set(current).add(next.key));
      if (message !== null) setNotice(message);
      if (stop) setStopped(true);
    };
    runAiJob(api, user, next, { status }).then(
      (outcome) => {
        if (outcome.ok) finish(null, false);
        else finish(outcome.message, STOPPING.has(outcome.reason));
      },
      () => {
        finish(t.tutor.ai.notice(t.tutor.actionFailed), false);
      },
    );
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- api y user cambian en cada pintura y el trabajo siguiente se identifica por su clave
  }, [nextKey, status.kind]);

  return { ...state, working: next !== undefined };
}
