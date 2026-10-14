// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SCREENS } from '@/app/screens';
import { renderApp, resetApp, type RenderedApp } from '@/app/testing/renderApp';
import type { DataApi } from '@/data/context';
import type { User } from '@/data/schemas/people';
import { setConsent } from '@/data/usecases/profile';
import { makeEvent, makeQuestionWithOptions, subscribe } from '@/data/testing/fixtures';
import { t } from '@/i18n/es-MX';

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

  it('si el proxy no deja usar la IA, avisa, deja la plantilla y registra la llamada', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url.endsWith('/api/health')) {
          return Promise.resolve(Response.json({ status: 'ok', mode: 'real', version: 1 }));
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
    const [call] = await rendered.api.repos.aiCallLog.list();
    expect(call).toMatchObject({ engine: 'forgetting', mode: 'real', outcome: 'fallback' });
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
