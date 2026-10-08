import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import type { AiArtifact } from '@/data/schemas/activity';
import { testApi, makeUser } from '@/data/testing/fixtures';
import {
  biasTipArtifactId,
  reportArtifactId,
  weekStart,
  type BiasTipAi,
  type HypothesisAi,
  type ReportAi,
} from './aiContent';
import { planAiJobs, runAiJob, MAX_TIP_JOBS, type AiJob, type PlanInput } from './aiPlan';
import { hypothesisArtifactId } from './hypothesisStore';
import type { Hypothesis } from './tutorModel';
import type { BiasTip } from './tutorView';

const NOW = new Date('2026-10-08T15:00:00.000Z');
const USER = '01HZX0000000000000000000AA';
const DAY = '2026-10-08';
// IDs con forma de ULID, como los de la app
const ulid = (n: number) => `01J${String(n).padStart(23, '0')}`;
const [Q1, Q2, C3, EV1, EV2, EV3] = [1, 2, 3, 4, 5, 6].map(ulid) as [
  string,
  string,
  string,
  string,
  string,
  string,
];

const hypothesis = (overrides: Partial<Hypothesis> = {}): Hypothesis => ({
  key: 'interference|cardiology',
  rule: 'interference',
  area: 'cardiology',
  status: 'confirmed',
  recentFindings: 6,
  findingsNeeded: 0,
  confidence: 'low',
  actions: ['create_contrast_card'],
  items: [
    {
      eventId: EV1,
      itemId: Q1,
      kind: 'question',
      at: '2026-10-07T10:00:00.000Z',
      confusedWithItemId: null,
    },
    {
      eventId: EV2,
      itemId: Q2,
      kind: 'question',
      at: '2026-10-07T11:00:00.000Z',
      confusedWithItemId: null,
    },
    {
      eventId: EV3,
      itemId: C3,
      kind: 'card',
      at: '2026-10-07T12:00:00.000Z',
      confusedWithItemId: null,
    },
  ],
  causeMismatches: 0,
  causesReported: 0,
  ...overrides,
});

const tip = (tag: string, examples: string[] = [Q1, Q2]): BiasTip => ({
  tag,
  name: `Sesgo ${tag}`,
  tip: 'Nombra el dato que no encaja.',
  level: 'focus',
  examples,
});

const TEXTS: Record<string, string> = {
  [Q1]: 'Hombre con dolor torácico opresivo',
  [Q2]: 'Mujer con disnea de esfuerzo',
  [C3]: 'Tarjeta sobre insuficiencia cardiaca',
};

const plan = (overrides: Partial<PlanInput> = {}): AiJob[] =>
  planAiJobs({
    now: NOW,
    userId: USER,
    day: DAY,
    hypotheses: [hypothesis()],
    report: {
      ready: true,
      priorities: [
        {
          key: 'topic:cardiology',
          kind: 'topic',
          title: 'Cardiología',
          action: 'Practica el tema',
          draft: false,
          to: '/x',
          review: false,
        },
      ],
      habit: null,
      challenge: null,
    },
    answersThisWeek: 40,
    tips: [tip('anchoring')],
    artifacts: new Map(),
    texts: { textOf: (_kind, id) => TEXTS[id] },
    ...overrides,
  });

const artifact = (
  id: string,
  kind: AiArtifact['kind'],
  ai: AiArtifact['content'][string],
  status: AiArtifact['status'] = 'draft',
): AiArtifact => ({
  id,
  userId: USER,
  kind,
  status,
  mode: 'template',
  model: 'respuestas-fijas-v1',
  promptVersion: 'x.local.v1',
  content: { ai },
  validatorResult: { passed: true, issues: [] },
  sourceIds: [],
  createdAt: NOW.toISOString(),
  decidedAt: status === 'draft' ? null : NOW.toISOString(),
  decidedBy: status === 'draft' ? null : USER,
});

const hypothesisAi = (generatedAt: string): HypothesisAi => ({
  hypothesis: 'Una frase.',
  evidence: [EV1],
  confidence: 'low',
  actions: [],
  studentMessage: 'Uno. Dos.',
  generatedAt,
  mode: 'template',
});

describe('qué se pide a la IA', () => {
  it('pide la hipótesis, el informe y cada consejo cuando nada se ha pedido', () => {
    const jobs = plan();
    expect(jobs.map((job) => job.type)).toEqual(['hypothesis', 'report', 'tip']);
    const [first] = jobs;
    expect(first).toMatchObject({
      type: 'hypothesis',
      artifactId: hypothesisArtifactId(USER, 'interference|cardiology'),
      input: { rule: 'interference', recentFindings: 6, allowedActions: ['create_contrast_card'] },
    });
    // Cada prueba lleva el ID del evento como referencia y el texto del banco
    expect(first?.type === 'hypothesis' && first.input.evidence[0]).toMatchObject({
      ref: EV1,
      text: TEXTS[Q1],
    });
  });

  it('no repite una hipótesis con resultado de hace menos de 7 días y sí la renueva después', () => {
    const id = hypothesisArtifactId(USER, 'interference|cardiology');
    const fresh = new Map([
      [id, artifact(id, 'hypothesis', { ...hypothesisAi('2026-10-03T15:00:00.000Z') })],
    ]);
    expect(plan({ artifacts: fresh }).map((job) => job.type)).not.toContain('hypothesis');
    const old = new Map([
      [id, artifact(id, 'hypothesis', { ...hypothesisAi('2026-10-01T14:00:00.000Z') })],
    ]);
    expect(plan({ artifacts: old }).map((job) => job.type)).toContain('hypothesis');
  });

  it('no pide la hipótesis que el alumno descartó ni la que no trae evidencia suficiente', () => {
    const id = hypothesisArtifactId(USER, 'interference|cardiology');
    const rejected = new Map([[id, artifact(id, 'hypothesis', {}, 'rejected')]]);
    expect(plan({ artifacts: rejected }).map((job) => job.type)).not.toContain('hypothesis');
    const lonely = plan({
      texts: { textOf: (_kind, itemId) => (itemId === Q1 ? TEXTS[Q1] : undefined) },
    });
    expect(lonely.map((job) => job.type)).not.toContain('hypothesis');
  });

  it('el informe se pide una vez por semana y no se pide mientras calibra', () => {
    const week = weekStart(DAY);
    const id = reportArtifactId(USER, week);
    const ai: ReportAi = {
      summary: 'Resumen.',
      priorities: [{ ref: 'topic:cardiology', text: 'Texto' }],
      habit: null,
      challenge: null,
      generatedAt: '2026-10-06T10:00:00.000Z',
      mode: 'template',
      week,
    };
    const done = new Map([[id, artifact(id, 'weekly_report', ai)]]);
    expect(plan({ artifacts: done }).map((job) => job.type)).not.toContain('report');
    // Un informe de la semana anterior no cuenta
    const last = new Map([[id, artifact(id, 'weekly_report', { ...ai, week: '2026-09-28' })]]);
    expect(plan({ artifacts: last }).map((job) => job.type)).toContain('report');
    const calibrating = plan({ report: { ready: false, have: 3, need: 30 } });
    expect(calibrating.map((job) => job.type)).not.toContain('report');
  });

  it('el informe lleva solo lo ya calculado y la cifra de la semana', () => {
    const job = plan().find((entry) => entry.type === 'report');
    expect(job?.type === 'report' && job.input).toMatchObject({
      answers: 40,
      priorities: [{ ref: 'topic:cardiology', title: 'Cardiología', detail: 'Practica el tema' }],
      habit: null,
      challenge: null,
    });
  });

  it('un consejo necesita dos ejemplos reales, no se repite en 7 días y se limita a unos cuantos', () => {
    expect(plan({ tips: [tip('anchoring', [Q1])] }).map((job) => job.type)).not.toContain('tip');
    const ai: BiasTipAi = {
      tip: 'Texto',
      exampleRefs: [Q1, Q2],
      generatedAt: '2026-10-07T10:00:00.000Z',
      mode: 'template',
    };
    const id = biasTipArtifactId(USER, 'anchoring');
    const fresh = new Map([[id, artifact(id, 'bias_tip', ai)]]);
    expect(plan({ artifacts: fresh }).map((job) => job.type)).not.toContain('tip');
    const many = ['a', 'b', 'c', 'd', 'e', 'f'].map((tag) => tip(tag));
    expect(plan({ tips: many }).filter((job) => job.type === 'tip')).toHaveLength(MAX_TIP_JOBS);
  });

  it('un resultado dañado en el artefacto se ignora y se vuelve a pedir', () => {
    const id = hypothesisArtifactId(USER, 'interference|cardiology');
    const broken = new Map([[id, artifact(id, 'hypothesis', { hypothesis: 5 })]]);
    expect(plan({ artifacts: broken }).map((job) => job.type)).toContain('hypothesis');
  });
});

describe('semana', () => {
  it('empieza el lunes', () => {
    expect(weekStart('2026-10-08')).toBe('2026-10-05');
    expect(weekStart('2026-10-05')).toBe('2026-10-05');
    expect(weekStart('2026-10-11')).toBe('2026-10-05');
    expect(weekStart('2026-01-01')).toBe('2025-12-29');
  });
});

describe('pedir un trabajo', () => {
  const disposers: (() => Promise<unknown>)[] = [];
  afterEach(async () => {
    await Promise.all(disposers.splice(0).map((dispose) => dispose()));
  });
  const setup = () => {
    const api = testApi('real');
    disposers.push(api.dispose);
    return { api, user: makeUser({ id: USER }) };
  };

  it('guarda el resultado en el artefacto en borrador y deja el renglón de costo', async () => {
    const { api, user } = setup();
    const [job] = plan();
    if (!job) throw new Error('Sin trabajo');
    const outcome = await runAiJob(api, user, job, { status: { kind: 'no-proxy' } }, NOW);
    expect(outcome).toEqual({ ok: true });
    const stored = await api.repos.aiArtifacts.get(job.artifactId);
    expect(stored).toMatchObject({ kind: 'hypothesis', status: 'draft', mode: 'template' });
    expect(stored?.content.rule).toBe('interference');
    expect(stored?.content.ai).toMatchObject({ mode: 'template', generatedAt: NOW.toISOString() });
    expect(stored?.sourceIds).toEqual([Q1, Q2, C3]);
    expect(await api.repos.aiCallLog.list()).toHaveLength(1);
  });

  it('un informe y un consejo se guardan con su propio artefacto', async () => {
    const { api, user } = setup();
    for (const job of plan().filter((entry) => entry.type !== 'hypothesis')) {
      expect(await runAiJob(api, user, job, { status: { kind: 'no-proxy' } }, NOW)).toEqual({
        ok: true,
      });
    }
    const kinds = (await api.repos.aiArtifacts.list()).map((entry) => entry.kind).sort();
    expect(kinds).toEqual(['bias_tip', 'weekly_report']);
    expect(await api.repos.aiCallLog.list()).toHaveLength(2);
  });

  it('sin conexión no llama ni guarda nada', async () => {
    const { api, user } = setup();
    const [job] = plan();
    if (!job) throw new Error('Sin trabajo');
    const outcome = await runAiJob(api, user, job, { status: { kind: 'offline' } }, NOW);
    expect(outcome).toMatchObject({ ok: false, reason: 'offline' });
    expect(await api.repos.aiCallLog.list()).toHaveLength(0);
    expect(await api.repos.aiArtifacts.list()).toHaveLength(0);
  });

  it('si el proxy falla deja el costo en la bitácora y no toca el artefacto', async () => {
    const { api, user } = setup();
    const [job] = plan();
    if (!job) throw new Error('Sin trabajo');
    const fetchImpl = (() =>
      Promise.resolve(
        Response.json(
          {
            error: 'invalid_output',
            message: 'La IA no dio una respuesta que se pueda usar. Se usa la versión sin IA.',
            cost: {
              model: 'claude-haiku-4-5',
              inputTokens: 2000,
              outputTokens: 400,
              cacheWriteTokens: 0,
              cacheReadTokens: 0,
              estimatedCostUsd: 0.004,
              latencyMs: 1500,
            },
          },
          { status: 502 },
        ),
      )) as unknown as typeof fetch;
    const outcome = await runAiJob(api, user, job, { status: { kind: 'real' }, fetchImpl }, NOW);
    expect(outcome).toMatchObject({ ok: false, reason: 'invalid_output' });
    expect(await api.repos.aiCallLog.list()).toEqual([
      expect.objectContaining({
        engine: 'forgetting',
        mode: 'real',
        outcome: 'fallback',
        estimatedCostUsd: 0.004,
      }),
    ]);
    expect(await api.repos.aiArtifacts.list()).toHaveLength(0);
  });
});
