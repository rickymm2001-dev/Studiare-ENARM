// Qué le falta pedir a la IA en el tutor y cómo se pide (8.2, 8.3, 8.5). Una hipótesis confirmada,
// el informe de la semana y cada consejo por sesgo se piden una vez y valen 7 días, el informe una
// semana. No se pide lo descartado ni lo que no tiene evidencia suficiente. Sin React ni Dexie en
// la parte que decide. La que llama al proxy recibe el acceso a los datos de afuera.
import { callEngine, type CallOptions, type FailureReason } from '@/ai/engines';
import type { DataApi } from '@/data/context';
import type { AiArtifact } from '@/data/schemas/activity';
import type { User } from '@/data/schemas/people';
import { logAiCall, storeAiResult } from '@/data/usecases/aiTutor';
import type { BiasTipInput, HypothesisInput, WeeklyReportInput } from '@/engines/aiContracts';
import {
  BiasTipAiSchema,
  HypothesisAiSchema,
  ReportAiSchema,
  biasTipArtifactId,
  isFresh,
  readAi,
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
}

export function planAiJobs(input: PlanInput): AiJob[] {
  const jobs: AiJob[] = [];

  for (const hypothesis of input.hypotheses) {
    const artifactId = hypothesisArtifactId(input.userId, hypothesis.key);
    const artifact = input.artifacts.get(artifactId);
    if (artifact?.status === 'rejected') continue;
    if (isFresh(readAi(HypothesisAiSchema, artifact), input.now)) continue;
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
  if (reportInput && reportAi?.week !== week) {
    jobs.push({
      type: 'report',
      key: `report|${week}`,
      week,
      input: reportInput,
      artifactId: reportId,
    });
  }

  let tipJobs = 0;
  for (const tip of input.tips) {
    if (tipJobs >= MAX_TIP_JOBS) break;
    const artifactId = biasTipArtifactId(input.userId, tip.tag);
    if (isFresh(readAi(BiasTipAiSchema, input.artifacts.get(artifactId)), input.now)) continue;
    const built = biasTipInputFrom(tip, input.texts);
    if (built) {
      jobs.push({ type: 'tip', key: `tip|${tip.tag}`, tip, input: built, artifactId });
      tipJobs += 1;
    }
  }
  return jobs;
}

export type JobOutcome = { ok: true } | { ok: false; reason: FailureReason; message: string };

type Api = Pick<DataApi, 'repos' | 'recordEvent'>;
type Person = Pick<User, 'id' | 'timeZone' | 'alias'>;

const stampOf = (meta: { mode: 'real' | 'mock' | 'template' }, now: Date) => ({
  generatedAt: now.toISOString(),
  mode: meta.mode,
});

/**
 * Pide un trabajo a la IA y guarda el resultado. Todo lo que cuesta queda en la bitácora, también lo
 * que falla. Si falla, la pantalla se queda con su plantilla y no se guarda nada en el artefacto
 */
export async function runAiJob(
  api: Api,
  user: Person,
  job: AiJob,
  options: Pick<CallOptions, 'status' | 'fetchImpl'>,
  now: Date = new Date(),
): Promise<JobOutcome> {
  const callOptions: CallOptions = {
    ...options,
    studentRef: user.id,
    names: [user.alias],
  };
  if (job.type === 'hypothesis') {
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
