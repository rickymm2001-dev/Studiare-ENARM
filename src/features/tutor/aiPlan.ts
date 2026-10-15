// Qué le falta pedir a la IA en el tutor y cómo se pide (8.2, 8.3, 8.5, B12 3.4). El informe de la
// semana y cada consejo por sesgo se piden al momento, una vez, y valen 7 días, el informe una
// semana. La hipótesis confirmada se pide por trabajo, a mitad de costo, y llega en una hora o hasta
// en un día. Mientras llega, la hipótesis sigue con su plantilla y el artefacto guarda lo que se
// pidió. No se pide lo descartado ni lo que no tiene evidencia suficiente, ni lo que el servidor no
// abre todavía a alumnos. Sin React ni Dexie en la parte que decide. La que llama al proxy recibe el
// acceso a los datos de afuera.
import { callEngine, type CallOptions, type FailureReason } from '@/ai/engines';
import {
  canQueue,
  enqueueJob,
  fetchJobs,
  hypothesisJobKey,
  resultOfJob,
  type JobResult,
  type QueueableStatus,
} from '@/ai/jobs';
import type { DataApi } from '@/data/context';
import type { AiArtifact } from '@/data/schemas/activity';
import type { User } from '@/data/schemas/people';
import { logAiCall, storeAiResult } from '@/data/usecases/aiTutor';
import type {
  AiEngine,
  BiasTipInput,
  BiasVocabulary,
  HypothesisInput,
  WeeklyReportInput,
} from '@/engines/aiContracts';
import {
  BiasTipAiSchema,
  HypothesisAiSchema,
  ReportAiSchema,
  biasTipArtifactId,
  isFresh,
  isPendingStale,
  isRecentFailure,
  readAi,
  readFailed,
  readPending,
  reportArtifactId,
  weekStart,
} from './aiContent';
import {
  biasTipInputFrom,
  hypothesisInputFrom,
  weeklyReportInputFrom,
  type ItemTexts,
} from './aiInputs';
import { ensureHypothesisArtifact, hypothesisArtifactId } from './hypothesisStore';
import type { Hypothesis } from './tutorModel';
import type { BiasTip } from './tutorView';
import type { WeeklyReport } from './weeklyReport';

/** Consejos por sesgo que se piden a la vez. Con muchos se gastaría de más y no se leerían todos */
export const MAX_TIP_JOBS = 4;

export type AiJob =
  | {
      type: 'hypothesis';
      key: string;
      hypothesis: Hypothesis;
      input: HypothesisInput;
      artifactId: string;
    }
  | { type: 'report'; key: string; week: string; input: WeeklyReportInput; artifactId: string }
  | { type: 'tip'; key: string; tip: BiasTip; input: BiasTipInput; artifactId: string };

/** Los motores del Tutor y el que atiende cada trabajo */
export const TUTOR_ENGINES = [
  'forgetting',
  'weekly_report',
  'bias_tips',
] as const satisfies readonly AiEngine[];
export const ENGINE_OF_JOB = {
  hypothesis: 'forgetting',
  report: 'weekly_report',
  tip: 'bias_tips',
} as const satisfies Record<AiJob['type'], AiEngine>;

export interface PlanInput {
  now: Date;
  userId: string;
  /** El día de estudio del alumno, AAAA-MM-DD */
  day: string;
  /** Las hipótesis que se le muestran abiertas, sin las que descartó */
  hypotheses: readonly Hypothesis[];
  report: WeeklyReport;
  answersThisWeek: number;
  tips: readonly BiasTip[];
  artifacts: ReadonlyMap<string, AiArtifact>;
  texts: ItemTexts;
  /** Los motores que se pueden pedir ahora. Sin esto, todos. Un motor cerrado a alumnos no se pide */
  engines?: ReadonlySet<AiEngine>;
  /**
   * En producción solo se personaliza un consejo cuyo texto base ya revisó un médico. Uno pendiente
   * se queda con su plantilla (B12, 10.13). En la demo siguen los borradores con su etiqueta
   */
  reviewedTipsOnly?: boolean;
  /** Cómo llama la app a los sesgos ante el alumno. Va en la entrada para que la IA use la misma palabra */
  vocabulary?: BiasVocabulary;
}

export function planAiJobs(input: PlanInput): AiJob[] {
  const jobs: AiJob[] = [];
  const allowed = (engine: AiEngine) => input.engines === undefined || input.engines.has(engine);

  for (const hypothesis of allowed('forgetting') ? input.hypotheses : []) {
    const artifactId = hypothesisArtifactId(input.userId, hypothesis.key);
    const artifact = input.artifacts.get(artifactId);
    if (artifact?.status === 'rejected') continue;
    if (isFresh(readAi(HypothesisAiSchema, artifact), input.now)) continue;
    // Ya se pidió y la explicación viene en camino, o se pidió y falló hace poco
    const pending = readPending(artifact);
    if (pending && !isPendingStale(pending, input.now)) continue;
    const failed = readFailed(artifact);
    if (failed && isRecentFailure(failed, input.now)) continue;
    const built = hypothesisInputFrom(hypothesis, input.texts);
    if (built) {
      jobs.push({
        type: 'hypothesis',
        key: `hypothesis|${hypothesis.key}`,
        hypothesis,
        input: built,
        artifactId,
      });
    }
  }

  const week = weekStart(input.day);
  const reportId = reportArtifactId(input.userId, week);
  const reportAi = readAi(ReportAiSchema, input.artifacts.get(reportId));
  const reportInput = weeklyReportInputFrom(input.report, input.answersThisWeek);
  if (allowed('weekly_report') && reportInput && reportAi?.week !== week) {
    jobs.push({
      type: 'report',
      key: `report|${week}`,
      week,
      input: reportInput,
      artifactId: reportId,
    });
  }

  let tipJobs = 0;
  for (const tip of allowed('bias_tips') ? input.tips : []) {
    if (tipJobs >= MAX_TIP_JOBS) break;
    if (input.reviewedTipsOnly && tip.reviewed !== true) continue;
    const artifactId = biasTipArtifactId(input.userId, tip.tag);
    if (isFresh(readAi(BiasTipAiSchema, input.artifacts.get(artifactId)), input.now)) continue;
    const built = biasTipInputFrom(tip, input.texts, input.vocabulary);
    if (built) {
      jobs.push({ type: 'tip', key: `tip|${tip.tag}`, tip, input: built, artifactId });
      tipJobs += 1;
    }
  }
  return jobs;
}

/**
 * Pedir un trabajo termina de tres maneras. ok, con el resultado guardado. ok y pending, con la
 * hipótesis en cola y su explicación en camino. O con la falla y su mensaje
 */
export type JobOutcome =
  { ok: true; pending?: boolean } | { ok: false; reason: FailureReason; message: string };

type Api = Pick<DataApi, 'repos' | 'recordEvent'>;
type Person = Pick<User, 'id' | 'timeZone' | 'alias'>;

const stampOf = (meta: { mode: 'real' | 'mock' | 'template' }, now: Date) => ({
  generatedAt: now.toISOString(),
  mode: meta.mode,
});

type RunOptions = Pick<CallOptions, 'status' | 'fetchImpl'>;

/**
 * Pide un trabajo a la IA y guarda el resultado. Todo lo que cuesta queda en la bitácora, también lo
 * que falla. Si falla, la pantalla se queda con su plantilla y no se guarda nada en el artefacto. La
 * hipótesis, con un proxy que responde, se encola y queda pendiente. Sin proxy, en desarrollo y en la
 * demo, sale de las respuestas fijas del cliente en el momento
 */
export async function runAiJob(
  api: Api,
  user: Person,
  job: AiJob,
  options: RunOptions,
  now: Date = new Date(),
): Promise<JobOutcome> {
  const callOptions: CallOptions = {
    ...options,
    studentRef: user.id,
    names: [user.alias],
  };
  if (job.type === 'hypothesis') {
    if (canQueue(options.status)) {
      return queueHypothesis(api, user, job, options.status, options, now);
    }
    const call = await callEngine('forgetting', job.input, callOptions);
    if (call.meta) await logAiCall(api, user, call.meta, now);
    if (!call.ok) return { ok: false, reason: call.reason, message: call.message };
    const artifact = await ensureHypothesisArtifact(api, user, job.hypothesis, now);
    await storeAiResult(
      api,
      user,
      {
        id: job.artifactId,
        kind: 'hypothesis',
        existing: artifact,
        meta: call.meta,
        content: { ai: { ...call.output, ...stampOf(call.meta, now) } },
        sourceIds: job.hypothesis.items.map((item) => item.itemId),
      },
      now,
    );
    return { ok: true };
  }

  if (job.type === 'report') {
    const call = await callEngine('weekly_report', job.input, callOptions);
    if (call.meta) await logAiCall(api, user, call.meta, now);
    if (!call.ok) return { ok: false, reason: call.reason, message: call.message };
    await storeAiResult(
      api,
      user,
      {
        id: job.artifactId,
        kind: 'weekly_report',
        existing: await api.repos.aiArtifacts.get(job.artifactId),
        meta: call.meta,
        content: { ai: { ...call.output, ...stampOf(call.meta, now), week: job.week } },
        sourceIds: [],
      },
      now,
    );
    return { ok: true };
  }

  const call = await callEngine('bias_tips', job.input, callOptions);
  if (call.meta) await logAiCall(api, user, call.meta, now);
  if (!call.ok) return { ok: false, reason: call.reason, message: call.message };
  await storeAiResult(
    api,
    user,
    {
      id: job.artifactId,
      kind: 'bias_tip',
      existing: await api.repos.aiArtifacts.get(job.artifactId),
      meta: call.meta,
      content: { tag: job.tip.tag, ai: { ...call.output, ...stampOf(call.meta, now) } },
      sourceIds: job.tip.examples,
    },
    now,
  );
  return { ok: true };
}

// ---------------------------------------------------------------------------------------------
// Hipótesis por lote (B12, 3.4)

type HypothesisJob = Extract<AiJob, { type: 'hypothesis' }>;

/** Lo que dejó un trabajo ya resuelto. Listo se guarda como siempre y fallido deja la plantilla y su motivo */
async function settleHypothesis(
  api: Api,
  user: Person,
  artifact: AiArtifact,
  result: Exclude<JobResult<'forgetting'>, { state: 'waiting' }>,
  now: Date,
): Promise<JobOutcome> {
  if (result.state === 'failed') {
    await api.repos.aiArtifacts.put({
      ...artifact,
      content: {
        ...artifact.content,
        aiPending: null,
        aiFailed: { at: now.toISOString(), reason: result.reason, message: result.message },
      },
    });
    return { ok: false, reason: result.reason, message: result.message };
  }
  await logAiCall(api, user, result.meta, now);
  await storeAiResult(
    api,
    user,
    {
      id: artifact.id,
      kind: 'hypothesis',
      existing: artifact,
      meta: result.meta,
      content: {
        ai: { ...result.output, ...stampOf(result.meta, now) },
        aiPending: null,
        aiFailed: null,
      },
      sourceIds: artifact.sourceIds,
    },
    now,
  );
  return { ok: true };
}

async function queueHypothesis(
  api: Api,
  user: Person,
  job: HypothesisJob,
  status: QueueableStatus,
  options: RunOptions,
  now: Date,
): Promise<JobOutcome> {
  const jobKey = await hypothesisJobKey(job.hypothesis.rule, job.hypothesis.area);
  const enqueued = await enqueueJob('forgetting', jobKey, job.input, {
    status,
    studentRef: user.id,
    names: [user.alias],
    ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
  });
  if (!enqueued.ok) return { ok: false, reason: enqueued.reason, message: enqueued.message };

  const artifact = await ensureHypothesisArtifact(api, user, job.hypothesis, now);
  const result = resultOfJob('forgetting', enqueued.job, job.input);
  if (result.state === 'waiting') {
    await api.repos.aiArtifacts.put({
      ...artifact,
      content: {
        ...artifact.content,
        aiPending: { jobKey, requestedAt: now.toISOString(), input: job.input },
        aiFailed: null,
      },
    });
    return { ok: true, pending: true };
  }
  // El servidor ya lo tenía listo, porque otro dispositivo lo pidió con la misma evidencia
  return settleHypothesis(api, user, artifact, result, now);
}

export interface CollectReport {
  /** Explicaciones que llegaron y se guardaron */
  delivered: number;
  /** Trabajos que el servidor no pudo terminar */
  failed: number;
  /** Siguen en camino */
  waiting: number;
}

export type CollectOutcome =
  ({ ok: true } & CollectReport) | { ok: false; reason: FailureReason; message: string };

/**
 * Pregunta por las hipótesis pendientes y guarda las que ya llegaron. Lo que llega se vuelve a
 * validar con la entrada que guardó la app al pedirlo. Un trabajo que el servidor ya no conoce y
 * pasó de 26 horas se suelta, para que se vuelva a pedir
 */
export async function collectPendingJobs(
  api: Api,
  user: Person,
  artifacts: readonly AiArtifact[],
  options: Pick<CallOptions, 'fetchImpl'> = {},
  now: Date = new Date(),
): Promise<CollectOutcome> {
  const pending = artifacts.flatMap((artifact) => {
    const job = artifact.kind === 'hypothesis' ? readPending(artifact) : undefined;
    return job ? [{ id: artifact.id, job }] : [];
  });
  const report: CollectReport = { delivered: 0, failed: 0, waiting: 0 };
  if (pending.length === 0) return { ok: true, ...report };

  const fetched = await fetchJobs(
    pending.map((entry) => entry.job.jobKey),
    options.fetchImpl ? { fetchImpl: options.fetchImpl } : {},
  );
  if (!fetched.ok) return fetched;
  const byKey = new Map(fetched.jobs.map((job) => [job.jobKey, job]));

  for (const entry of pending) {
    // Lo guardado puede haber cambiado desde que la pantalla leyó los artefactos
    const current = await api.repos.aiArtifacts.get(entry.id);
    if (!current || readPending(current)?.jobKey !== entry.job.jobKey) continue;
    const job = byKey.get(entry.job.jobKey);
    if (!job) {
      if (isPendingStale(entry.job, now)) {
        await api.repos.aiArtifacts.put({
          ...current,
          content: { ...current.content, aiPending: null },
        });
      } else {
        report.waiting += 1;
      }
      continue;
    }
    const result = resultOfJob('forgetting', job, entry.job.input);
    if (result.state === 'waiting') {
      report.waiting += 1;
      continue;
    }
    const outcome = await settleHypothesis(api, user, current, result, now);
    if (outcome.ok) report.delivered += 1;
    else report.failed += 1;
  }
  return { ok: true, ...report };
}
