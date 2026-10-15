// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SCREENS } from '@/app/screens';
import type { AiEngine } from '@/engines/aiContracts';
import { mockOutput } from '@/engines/aiMock';
import { renderApp, resetApp, type RenderedApp } from '@/app/testing/renderApp';
import type { DataApi } from '@/data/context';
import type { User } from '@/data/schemas/people';
import { setConsent } from '@/data/usecases/profile';
import { makeEvent, makeQuestionWithOptions, subscribe } from '@/data/testing/fixtures';
import { t } from '@/i18n/es-MX';
import { POLL_MS } from './useTutorAi';

// Arma toda la pantalla del tutor con cinco errores seguros, así que necesita más de 5 segundos
vi.setConfig({ testTimeout: 30_000 });

let app: RenderedApp | undefined;
afterEach(async () => {
  cleanup();
  vi.unstubAllGlobals();
  await resetApp(app?.api);
  app = undefined;
});

const WAIT = { timeout: 20_000 };
const HOUR = 60 * 60 * 1000;

/** Cinco errores contestados con seguridad en el mismo tema, que forman la hipótesis de confianza alta */
async function seedErrors(api: DataApi, user: User) {
  const base = Date.now();
  for (let index = 0; index < 5; index += 1) {
    const { question, options } = makeQuestionWithOptions();
    await api.repos.questions.addVersion(question, options);
    const wrong = options[1];
    if (!wrong) throw new Error('Sin opción incorrecta');
    const at = new Date(base - (index + 2) * HOUR);
    await api.recordEvent(
      makeEvent(
        'question_answered',
        {
          questionVersionId: question.id,
          optionVersionId: wrong.id,
          correct: false,
          confidence: 'sure',
          msToAnswer: 30_000,
          changeCount: 0,
          highlightEnabled: false,
        },
        { userId: user.id, clock: { now: () => at } },
      ),
    );
  }
}

async function open(plan: 'monthly' | 'free', consent: boolean) {
  app = await renderApp(SCREENS.tutor.path, {
    seed: async (api, user) => {
      await subscribe(api, user, plan);
      await seedErrors(api, user);
      if (consent) await setConsent(api, user, 'ai_analysis', true);
    },
  });
  return app;
}

const rule = t.tutor.rules.high_confidence_error;

describe('análisis con IA en el tutor', () => {
  it('sin plan de pago no se enciende y la hipótesis queda con su plantilla', async () => {
    const rendered = await open('free', true);
    expect(await screen.findByText(t.tutor.ai.freePlan, undefined, WAIT)).toBeVisible();
    expect(await screen.findByText(rule.title, undefined, WAIT)).toBeVisible();
    expect(screen.queryByText(t.tutor.ai.written.template)).toBeNull();
    expect(await rendered.api.repos.aiCallLog.list()).toHaveLength(0);
  });

  it('con plan de pago pero sin consentimiento pide encenderlo y no llama a nada', async () => {
    const rendered = await open('monthly', false);
    expect(await screen.findByText(t.tutor.ai.off, undefined, WAIT)).toBeVisible();
    expect(screen.getByRole('button', { name: t.tutor.ai.turnOn })).toBeVisible();
    expect(await rendered.api.repos.aiCallLog.list()).toHaveLength(0);
  });

  it('encenderlo guarda el consentimiento y la IA redacta la hipótesis en borrador', async () => {
    const typing = userEvent.setup();
    const rendered = await open('monthly', false);
    await typing.click(await screen.findByRole('button', { name: t.tutor.ai.turnOn }, WAIT));

    // Sin proxy, como en la demo, redacta con las respuestas fijas del cliente y lo dice
    const card = await screen.findByRole('region', { name: rule.title }, WAIT);
    await waitFor(() => {
      expect(within(card).getByText(t.tutor.ai.written.template)).toBeVisible();
    }, WAIT);
    expect(within(card).getByText(t.tutor.ai.draft)).toBeVisible();
    // La redacción de la IA reemplaza a la plantilla
    expect(within(card).queryByText(rule.message)).toBeNull();

    const calls = await rendered.api.repos.aiCallLog.list();
    expect(calls.filter((call) => call.engine === 'forgetting')).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      userId: rendered.user.id,
      mode: 'template',
      outcome: 'ok',
      estimatedCostUsd: 0,
    });
    const artifact = (await rendered.api.repos.aiArtifacts.list()).find(
      (entry) => entry.kind === 'hypothesis',
    );
    expect(artifact).toMatchObject({
      userId: rendered.user.id,
      status: 'draft',
      mode: 'template',
      decidedBy: null,
    });
    expect(artifact?.content.ai).toMatchObject({ mode: 'template', confidence: 'low' });
    expect(artifact?.validatorResult.passed).toBe(true);
  });

  it('con el consentimiento ya dado la redacta sola', async () => {
    const rendered = await open('monthly', true);
    const card = await screen.findByRole('region', { name: rule.title }, WAIT);
    await within(card).findByText(t.tutor.ai.written.template, undefined, WAIT);
    expect(
      (await rendered.api.repos.aiCallLog.list()).filter((call) => call.engine === 'forgetting'),
    ).toHaveLength(1);
    // Responder a la hipótesis conserva lo que escribió la IA
    await userEvent.setup().click(within(card).getByRole('button', { name: t.tutor.helpful }));
    await within(card).findByText(t.tutor.answered.approved, undefined, WAIT);
    const artifact = (await rendered.api.repos.aiArtifacts.list()).find(
      (entry) => entry.kind === 'hypothesis',
    );
    expect(artifact).toMatchObject({ status: 'approved' });
    expect(artifact?.content.ai).toBeDefined();
  });

  it('si el proxy no deja usar la IA, avisa, deja la plantilla y no cuenta nada', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url.endsWith('/api/health')) {
          return Promise.resolve(Response.json({ status: 'ok', mode: 'real', version: 2 }));
        }
        return Promise.resolve(
          Response.json(
            {
              error: 'student_limit',
              message: 'Llegaste al límite de usos de IA de hoy. Vuelve mañana.',
            },
            { status: 429 },
          ),
        );
      }),
    );
    const rendered = await open('monthly', true);
    expect(
      await screen.findByText(
        t.tutor.ai.notice('Llegaste al límite de usos de IA de hoy. Vuelve mañana.'),
        undefined,
        WAIT,
      ),
    ).toBeVisible();
    const card = await screen.findByRole('region', { name: rule.title }, WAIT);
    expect(within(card).queryByText(t.tutor.ai.draft)).toBeNull();
    // Encolar y que el servidor lo niegue no costó nada, así que no hay renglón de costo
    expect(await rendered.api.repos.aiCallLog.list()).toHaveLength(0);
    expect(within(card).queryByText(t.tutor.ai.pending)).toBeNull();
  });
});

type Json = Record<string, unknown>;

/**
 * Un proxy de IA simulado. Contesta la salud, encola la hipótesis y la termina en la segunda pregunta
 * por su estado, y contesta al momento el informe y los consejos con las respuestas fijas del motor
 */
function stubProxy(options: { engines?: Partial<Record<AiEngine, 'open' | 'gated'>> } = {}) {
  const calls: { url: string; body: Json | undefined }[] = [];
  let hypothesisInput: unknown;
  let jobKey = '';
  let polls = 0;
  const meta = (engine: AiEngine) => ({
    engine,
    mode: 'mock',
    model: 'claude-haiku-5-5',
    promptVersion: `${engine}.base.v1`,
    inputTokens: 1500,
    outputTokens: 300,
    cacheWriteTokens: 0,
    cacheReadTokens: 0,
    estimatedCostUsd: 0.0002,
    latencyMs: 0,
    outcome: 'ok',
    validator: { passed: true, issues: [] },
  });
  const job = (status: 'queued' | 'ready') => ({
    jobKey,
    engine: 'forgetting',
    status,
    queuedAt: new Date().toISOString(),
    readyAt: status === 'ready' ? new Date().toISOString() : null,
    ...(status === 'ready'
      ? { output: mockOutput('forgetting', hypothesisInput as never), meta: meta('forgetting') }
      : {}),
  });
  const stub = vi.fn((url: string, init?: RequestInit) => {
    const body = init?.body ? (JSON.parse(init.body as string) as Json) : undefined;
    calls.push({ url, body });
    if (url.endsWith('/api/health')) {
      return Promise.resolve(
        Response.json({
          status: 'ok',
          mode: 'mock',
          version: 2,
          ...(options.engines ? { engines: options.engines } : {}),
        }),
      );
    }
    if (url.endsWith('/api/ai/jobs/forgetting')) {
      hypothesisInput = body?.input;
      jobKey = body?.jobKey as string;
      return Promise.resolve(Response.json(job('queued'), { status: 202 }));
    }
    if (url.endsWith('/api/ai/jobs/status')) {
      polls += 1;
      return Promise.resolve(Response.json({ jobs: [job(polls < 2 ? 'queued' : 'ready')] }));
    }
    const engine = /\/api\/ai\/(\w+)$/.exec(url)?.[1] as AiEngine | undefined;
    if (engine && body) {
      return Promise.resolve(
        Response.json({ output: mockOutput(engine, body.input as never), meta: meta(engine) }),
      );
    }
    return Promise.resolve(Response.json({ error: 'nope' }, { status: 404 }));
  });
  return { stub, calls };
}

const engineCalls = (calls: { url: string }[]) =>
  calls.filter((call) => call.url.includes('/api/ai/')).map((call) => call.url.split('/api')[1]);

describe('hipótesis por lote', () => {
  const originalPoll = POLL_MS.mock;
  afterEach(() => {
    (POLL_MS as { mock: number }).mock = originalPoll;
  });

  it('se encola, enseña el aviso de pendiente con su plantilla y al llegar queda en borrador', async () => {
    (POLL_MS as { mock: number }).mock = 50;
    const { stub, calls } = stubProxy();
    vi.stubGlobal('fetch', stub);
    const rendered = await open('monthly', true);

    const card = await screen.findByRole('region', { name: rule.title }, WAIT);
    // Primero la plantilla con el aviso. Todavía no hay texto de la IA ni renglón de costo
    expect(await within(card).findByText(t.tutor.ai.pending, undefined, WAIT)).toBeVisible();
    expect(within(card).getByText(rule.message)).toBeVisible();

    // Después llega, la plantilla se reemplaza y queda como borrador sin validar por médico
    await within(card).findByText(t.tutor.ai.written.mock, undefined, WAIT);
    expect(within(card).getByText(t.tutor.ai.draft)).toBeVisible();
    expect(within(card).queryByText(t.tutor.ai.pending)).toBeNull();
    expect(within(card).queryByText(rule.message)).toBeNull();

    const artifact = (await rendered.api.repos.aiArtifacts.list()).find(
      (entry) => entry.kind === 'hypothesis',
    );
    expect(artifact).toMatchObject({ status: 'draft', mode: 'mock', decidedBy: null });
    expect(artifact?.content.aiPending).toBeNull();
    const log = await rendered.api.repos.aiCallLog.list();
    expect(log.filter((call) => call.engine === 'forgetting')).toHaveLength(1);
    expect(engineCalls(calls)).toContain('/ai/jobs/forgetting');
    expect(engineCalls(calls)).toContain('/ai/jobs/status');
  });

  it('con los motores cerrados para alumnos no pide nada y dice cuándo se abre', async () => {
    const { stub, calls } = stubProxy({
      engines: {
        forgetting: 'gated',
        weekly_report: 'gated',
        flashcards: 'gated',
        bias_tips: 'gated',
        restructure: 'gated',
      },
    });
    vi.stubGlobal('fetch', stub);
    const rendered = await open('monthly', true);
    const intro = await screen.findByRole('region', { name: t.tutor.ai.title }, WAIT);
    expect(await within(intro).findByText(t.ai.access.gated, undefined, WAIT)).toBeVisible();
    expect(within(intro).queryByRole('button', { name: t.tutor.ai.turnOn })).toBeNull();
    // La hipótesis sigue con su plantilla, sin aviso de pendiente ni etiqueta de IA
    const card = await screen.findByRole('region', { name: rule.title }, WAIT);
    expect(within(card).getByText(rule.message)).toBeVisible();
    expect(within(card).queryByText(t.tutor.ai.pending)).toBeNull();
    expect(engineCalls(calls)).toEqual([]);
    expect(await rendered.api.repos.aiCallLog.list()).toHaveLength(0);
  });

  it('con las hipótesis abiertas y lo demás cerrado pide solo ese motor', async () => {
    (POLL_MS as { mock: number }).mock = 50;
    const { stub, calls } = stubProxy({
      engines: { forgetting: 'open', weekly_report: 'gated', bias_tips: 'gated' },
    });
    vi.stubGlobal('fetch', stub);
    await open('monthly', true);
    const card = await screen.findByRole('region', { name: rule.title }, WAIT);
    await within(card).findByText(t.tutor.ai.written.mock, undefined, WAIT);
    expect(
      engineCalls(calls).filter(
        (url) => url !== '/ai/jobs/forgetting' && url !== '/ai/jobs/status',
      ),
    ).toEqual([]);
  });

  it('con las hipótesis cerradas y otro motor abierto la deja con su plantilla y sin pedirla', async () => {
    const { stub, calls } = stubProxy({
      engines: { forgetting: 'gated', weekly_report: 'open', bias_tips: 'gated' },
    });
    vi.stubGlobal('fetch', stub);
    await open('monthly', true);
    const card = await screen.findByRole('region', { name: rule.title }, WAIT);
    await screen.findByText(t.tutor.ai.on, undefined, WAIT);
    expect(within(card).getByText(rule.message)).toBeVisible();
    expect(within(card).queryByText(t.tutor.ai.pending)).toBeNull();
    expect(engineCalls(calls)).not.toContain('/ai/jobs/forgetting');
  });

  it('en producción, sin IA, el Tutor usa sus plantillas sin hablar de IA', async () => {
    vi.stubEnv('VITE_APP_ENV', 'production');
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new TypeError('sin red'))),
    );
    const rendered = await open('monthly', true);
    const card = await screen.findByRole('region', { name: rule.title }, WAIT);
    expect(within(card).getByText(rule.message)).toBeVisible();
    // Ni la tarjeta de análisis con IA ni sus avisos
    await waitFor(() => {
      expect(screen.queryByRole('region', { name: t.tutor.ai.title })).toBeNull();
    });
    expect(screen.queryByText(t.tutor.ai.written.template)).toBeNull();
    expect(await rendered.api.repos.aiCallLog.list()).toHaveLength(0);
    vi.unstubAllEnvs();
  });
});

describe('responder a una hipótesis', () => {
  const hypothesisStatus = async (rendered: RenderedApp) =>
    (await rendered.api.repos.aiArtifacts.list()).find((entry) => entry.kind === 'hypothesis')
      ?.status;

  it('No me ayuda la descarta en el mismo toque, no vuelve a ofrecer los botones y se deshace', async () => {
    const typing = userEvent.setup();
    const rendered = await open('free', false);
    const card = await screen.findByRole('region', { name: rule.title }, WAIT);
    await typing.click(within(card).getByRole('button', { name: t.tutor.notHelpful }));

    // Sin esperar a que la base lo guarde, la tarjeta ya se fue a las descartadas
    expect(screen.queryByRole('region', { name: rule.title })).toBeNull();
    expect(screen.getByText(t.tutor.answered.rejected)).toBeVisible();
    expect(screen.getByText(t.tutor.dismissedTitle(1))).toBeVisible();
    // Ya guardada, sigue fuera y sus botones no regresan
    await waitFor(async () => {
      expect(await hypothesisStatus(rendered)).toBe('rejected');
    }, WAIT);
    expect(screen.queryByRole('region', { name: rule.title })).toBeNull();
    expect(screen.queryByRole('button', { name: t.tutor.notHelpful })).toBeNull();

    // Volver a mostrarla también cambia en el mismo toque
    const reopen = screen.getByRole('button', { name: new RegExp(t.tutor.reopen) });
    await waitFor(() => {
      expect(reopen).toBeEnabled();
    }, WAIT);
    await typing.click(reopen);
    expect(screen.getByRole('region', { name: rule.title })).toBeVisible();
    expect(screen.queryByText(t.tutor.dismissedTitle(1))).toBeNull();
    await waitFor(async () => {
      expect(await hypothesisStatus(rendered)).toBe('draft');
    }, WAIT);
  });
});
