// El análisis con IA del tutor (8.2, 8.3, 8.5, B12 3.4). Con el consentimiento de análisis con IA, un
// plan que lo incluya y los motores abiertos para alumnos por la compuerta 1, pide a los motores lo
// que falta, uno por uno, y deja que la pantalla lea el resultado de los artefactos. El informe y los
// consejos llegan al momento. La hipótesis se encola y llega en una hora o hasta en un día, así que
// al abrir el Tutor, y cada minuto mientras sigue abierto, se pregunta por las que faltan. Cada
// trabajo se intenta una vez por visita. Si falla, la pantalla sigue con su plantilla y lo dice. Un
// límite diario o de presupuesto detiene los trabajos que faltan.
import { useEffect, useRef, useState } from 'react';
import type { AiStatus } from '@/ai/client';
import { engineOpenFor, featureAccess } from '@/ai/gate';
import { canQueue } from '@/ai/jobs';
import { useAiStatus } from '@/ai/useAiStatus';
import { usePreferences } from '@/app/preferences';
import { PLANS } from '@/config/billing';
import { readAppEnv } from '@/config/featureFlags';
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
  isPendingStale,
  isRecentFailure,
  readAi,
  readFailed,
  readPending,
  reportArtifactId,
  weekStart,
  type BiasTipAi,
  type HypothesisAi,
  type ReportAi,
} from './aiContent';
import { biasVocabularyOf, type ItemTexts } from './aiInputs';
import { collectPendingJobs, planAiJobs, runAiJob, TUTOR_ENGINES } from './aiPlan';
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
  'gate_closed',
  'paused',
  'staff_only',
  'not_configured',
  'offline',
  'network',
]);

/** Cada cuánto se pregunta por las hipótesis que faltan. El proxy simulado las termina en segundos */
export const POLL_MS = { real: 60_000, mock: 5_000 } as const;

export type AiAccess =
  | 'loading'
  | 'free-plan'
  /** Los motores siguen cerrados para alumnos hasta que dos médicos terminen de revisarlos */
  | 'gated'
  /** No hay IA. En producción el Tutor usa sus plantillas sin decir IA */
  | 'unavailable'
  | 'off'
  | 'on';

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
  /** Claves de las hipótesis cuya explicación con IA viene en camino */
  pending: ReadonlySet<string>;
  /** Claves de las hipótesis cuyo trabajo falló hace poco, para decirlo y dejar la plantilla */
  failed: ReadonlySet<string>;
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
  const status = useAiStatus({ demo: session.isDemo });
  const role = usePreferences((state) => state.role);
  const plan = useActivePlan(user.id);
  const consents = useLiveData(() => currentConsents(api, user.id), [api.repos, user.id]);
  const [notice, setNotice] = useState<string | null>(null);
  // Trabajos ya intentados en esta visita, para no repetir uno que falló
  const [attempted, setAttempted] = useState<ReadonlySet<string>>(new Set());
  // Un límite diario o de presupuesto, o la falta de conexión, detiene los que faltan
  const [stopped, setStopped] = useState(false);

  const feature = featureAccess(status, TUTOR_ENGINES, role);
  const access: AiAccess =
    plan === undefined || consents === undefined
      ? 'loading'
      : !PLANS[plan].access.aiTutor
        ? 'free-plan'
        : feature === 'unavailable'
          ? 'unavailable'
          : feature === 'gated'
            ? 'gated'
            : consents.ai_analysis
              ? 'on'
              : 'off';

  const byId = new Map(artifacts.map((artifact) => [artifact.id, artifact]));
  const now = new Date();
  const week = weekStart(studyDayOf(now, user.timeZone));
  const pending = new Set<string>();
  const failed = new Set<string>();
  for (const hypothesis of hypotheses) {
    const artifact = byId.get(hypothesisArtifactId(user.id, hypothesis.key));
    const waiting = readPending(artifact);
    if (waiting && !isPendingStale(waiting, now)) pending.add(hypothesis.key);
    const problem = readFailed(artifact);
    if (problem && isRecentFailure(problem, now)) failed.add(hypothesis.key);
  }
  const state: Omit<TutorAiState, 'working'> = {
    access,
    status,
    notice,
    pending,
    failed,
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
  // sigue el siguiente. Un motor cerrado para alumnos no se pide
  const jobs =
    access === 'on' && !stopped && status.kind !== 'checking' && status.kind !== 'offline'
      ? planAiJobs({
          now,
          userId: user.id,
          day: studyDayOf(now, user.timeZone),
          hypotheses,
          report: view.report,
          answersThisWeek,
          tips: view.biasTips,
          artifacts: byId,
          texts,
          engines: new Set(TUTOR_ENGINES.filter((engine) => engineOpenFor(status, engine, role))),
          reviewedTipsOnly: readAppEnv() === 'production',
          vocabulary: biasVocabularyOf(view.vocabulary),
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

  // Las hipótesis en camino. Al abrir el Tutor y cada minuto se pregunta por las que faltan, y lo
  // que llega se vuelve a validar y se guarda como cualquier otro resultado
  const latest = useRef(artifacts);
  useEffect(() => {
    latest.current = artifacts;
  });
  const waitingIds = artifacts
    .filter((artifact) => artifact.kind === 'hypothesis' && readPending(artifact) !== undefined)
    .map((artifact) => artifact.id)
    .sort()
    .join(',');
  const polling = access === 'on' && canQueue(status) && waitingIds !== '';
  const pollMs = status.kind === 'mock' ? POLL_MS.mock : POLL_MS.real;
  useEffect(() => {
    if (!polling) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = () => {
      collectPendingJobs(api, user, latest.current).then(
        (outcome) => {
          if (cancelled) return;
          if (!outcome.ok) {
            // Sin permiso o con la IA en pausa no tiene caso seguir preguntando
            if (STOPPING.has(outcome.reason) && outcome.reason !== 'network') {
              setNotice(outcome.message);
              return;
            }
          } else if (outcome.failed > 0) {
            setNotice(t.tutor.ai.jobFailed);
          }
          timer = setTimeout(tick, pollMs);
        },
        () => {
          if (!cancelled) timer = setTimeout(tick, pollMs);
        },
      );
    };
    tick();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- api y user cambian en cada pintura. Se vuelve a armar solo si cambian las hipótesis en camino o el modo
  }, [polling, waitingIds, pollMs]);

  return { ...state, working: next !== undefined };
}
