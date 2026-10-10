// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AdminConfig } from '@/ai/admin';
import { usePreferences } from '@/app/preferences';
import { SCREENS } from '@/app/screens';
import { renderApp, resetApp, type RenderedApp } from '@/app/testing/renderApp';
import { readStoredOverrides } from '@/config/overridesStore';
import { topicTaxonomy } from '@/demo/content';
import { t } from '@/i18n/es-MX';
import { adminText } from '@/i18n/admin';

vi.setConfig({ testTimeout: 30_000 });

let app: RenderedApp | undefined;
afterEach(async () => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
  await resetApp(app?.api);
  app = undefined;
});

const WAIT = { timeout: 20_000 };
const FIRST_BRANCH = topicTaxonomy.branches[0]?.name ?? '';

async function open() {
  usePreferences.setState({ role: 'admin' });
  app = await renderApp(SCREENS.adminSettings.path);
  await screen.findByRole('heading', { level: 1, name: t.screens.adminSettings.title }, WAIT);
}

const CONFIG: AdminConfig = {
  models: {
    forgetting: { id: 'claude-haiku-4-5', effort: null, maxTokens: 1500 },
    weekly_report: { id: 'claude-haiku-4-5', effort: null, maxTokens: 1500 },
    flashcards: { id: 'claude-sonnet-5-5', effort: 'low', maxTokens: 6000 },
    bias_tips: { id: 'claude-haiku-4-5', effort: null, maxTokens: 1000 },
    restructure: { id: 'claude-sonnet-5-5', effort: 'low', maxTokens: 4000 },
  },
  prices: {
    'claude-haiku-4-5': { input: 1, output: 5, cacheWrite: 1.25, cacheRead: 0.1 },
    'claude-sonnet-5-5': { input: 2, output: 10, cacheWrite: 2.5, cacheRead: 0.2 },
  },
  limits: {
    perStudentPerDay: {
      forgetting: 12,
      weekly_report: 4,
      flashcards: 240,
      bias_tips: 12,
      restructure: 20,
    },
    dailyBudgetUsd: 5,
    timeoutMs: 30000,
    maxRetries: 2,
  },
};

/** Un proxy falso que guarda los cambios como el verdadero */
function stubProxy() {
  const puts: unknown[] = [];
  let config = CONFIG;
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      if (url.endsWith('/api/health')) {
        return Promise.resolve(Response.json({ status: 'ok', mode: 'mock', version: 1 }));
      }
      if (url.endsWith('/api/ai/config') && init?.method === 'PUT') {
        const patch = JSON.parse(init.body as string) as {
          limits?: { dailyBudgetUsd?: number };
          models?: Partial<AdminConfig['models']>;
        };
        puts.push(patch);
        config = {
          ...config,
          models: { ...config.models, ...patch.models },
          limits: { ...config.limits, ...patch.limits },
        };
        return Promise.resolve(Response.json({ mode: 'mock', config }));
      }
      if (url.endsWith('/api/ai/config')) {
        return Promise.resolve(
          Response.json({ mode: 'mock', config, prompts: { forgetting: 'forgetting.base.v1' } }),
        );
      }
      return Promise.resolve(new Response('', { status: 404 }));
    }),
  );
  return puts;
}

describe('umbrales', () => {
  it('muestra los umbrales de la sección 12 con su valor de fábrica', async () => {
    await open();
    const card = screen.getByRole('region', { name: adminText.adminConfig.thresholdsForm.title });
    const field = within(card).getByLabelText(
      adminText.adminConfig.thresholds['bias.minTaggedErrors'].label,
    );
    expect(field).toHaveValue(40);
    expect(
      within(card).getByRole('button', { name: adminText.adminConfig.thresholdsForm.save }),
    ).toBeDisabled();
  });

  it('un valor fuera de regla muestra el motivo y no deja guardar', async () => {
    await open();
    const card = screen.getByRole('region', { name: adminText.adminConfig.thresholdsForm.title });
    fireEvent.change(
      within(card).getByLabelText(adminText.adminConfig.thresholds['fsrs.desiredRetention'].label),
      { target: { value: '0.5' } },
    );
    expect(
      within(card).getByRole('button', { name: adminText.adminConfig.thresholdsForm.save }),
    ).toBeDisabled();
    fireEvent.change(
      within(card).getByLabelText(adminText.adminConfig.thresholds['bias.minTaggedErrors'].label),
      { target: { value: '12.5' } },
    );
    expect(
      await within(card).findByText(adminText.adminConfig.thresholdsForm.notInteger),
    ).toBeVisible();
  });

  it('guarda solo lo que cambió en este navegador y se puede restablecer', async () => {
    const typing = userEvent.setup();
    await open();
    const card = screen.getByRole('region', { name: adminText.adminConfig.thresholdsForm.title });
    fireEvent.change(
      within(card).getByLabelText(adminText.adminConfig.thresholds['bias.minTaggedErrors'].label),
      { target: { value: '25' } },
    );
    await typing.click(
      within(card).getByRole('button', { name: adminText.adminConfig.thresholdsForm.save }),
    );
    expect(await within(card).findByText(adminText.adminConfig.thresholdsForm.saved)).toBeVisible();
    expect(readStoredOverrides()?.thresholds).toEqual({ bias: { minTaggedErrors: 25 } });
    expect(
      within(card).getByRole('button', { name: adminText.adminConfig.thresholdsForm.reload }),
    ).toBeVisible();

    await typing.click(
      within(card).getByRole('button', { name: adminText.adminConfig.thresholdsForm.reset }),
    );
    expect(
      await within(card).findByText(adminText.adminConfig.thresholdsForm.resetDone),
    ).toBeVisible();
    expect(readStoredOverrides()).toBeNull();
    expect(
      within(card).getByLabelText(adminText.adminConfig.thresholds['bias.minTaggedErrors'].label),
    ).toHaveValue(40);
  });
});

describe('pesos del ENARM', () => {
  it('dice que son provisionales y guarda solo los pesos que cambian', async () => {
    const typing = userEvent.setup();
    await open();
    const card = screen.getByRole('region', { name: adminText.adminConfig.weightsForm.title });
    expect(within(card).getByText(adminText.adminConfig.weightsForm.provisional)).toBeVisible();
    // Abre la primera rama
    await typing.click(within(card).getByText(FIRST_BRANCH));
    const [weight] = within(card).getAllByLabelText(/^Peso de la rama/);
    if (!weight) throw new Error('Sin peso de rama');
    fireEvent.change(weight, { target: { value: '2' } });
    await typing.click(
      within(card).getByRole('button', { name: adminText.adminConfig.weightsForm.save }),
    );
    expect(await within(card).findByText(adminText.adminConfig.weightsForm.saved)).toBeVisible();
    const stored = readStoredOverrides()?.weights;
    expect(Object.values(stored?.branches ?? {})).toEqual([2]);
    expect(stored?.topics).toEqual({});
    await typing.click(
      within(card).getByRole('button', { name: adminText.adminConfig.weightsForm.reset }),
    );
    expect(
      await within(card).findByText(adminText.adminConfig.weightsForm.resetDone),
    ).toBeVisible();
    expect(readStoredOverrides()).toBeNull();
  });

  it('un peso que no es positivo no deja guardar', async () => {
    const typing = userEvent.setup();
    await open();
    const card = screen.getByRole('region', { name: adminText.adminConfig.weightsForm.title });
    await typing.click(within(card).getByText(FIRST_BRANCH));
    const [weight] = within(card).getAllByLabelText(/^Peso de la rama/);
    if (!weight) throw new Error('Sin peso de rama');
    fireEvent.change(weight, { target: { value: '0' } });
    expect(await within(card).findByText(adminText.adminConfig.weightsForm.invalid)).toBeVisible();
    expect(
      within(card).getByRole('button', { name: adminText.adminConfig.weightsForm.save }),
    ).toBeDisabled();
  });
});

describe('modelos, precios y límites de la IA', () => {
  it('sin proxy dice dónde vive la configuración y deja guardar la estimación del plan maestro', async () => {
    const typing = userEvent.setup();
    await open();
    expect(
      await screen.findByText(adminText.adminConfig.aiForm.noProxy, undefined, WAIT),
    ).toBeVisible();
    const card = screen.getByRole('region', { name: adminText.adminConfig.aiForm.estimate.title });
    fireEvent.change(within(card).getByLabelText(adminText.adminConfig.aiForm.estimate.label), {
      target: { value: '1.5' },
    });
    await typing.click(
      within(card).getByRole('button', { name: adminText.adminConfig.aiForm.estimate.save }),
    );
    expect(
      await within(card).findByText(adminText.adminConfig.aiForm.estimate.saved),
    ).toBeVisible();
    expect(readStoredOverrides()?.aiCostEstimateUsd).toBe(1.5);
    // Vaciarla la quita
    fireEvent.change(within(card).getByLabelText(adminText.adminConfig.aiForm.estimate.label), {
      target: { value: '' },
    });
    await typing.click(
      within(card).getByRole('button', { name: adminText.adminConfig.aiForm.estimate.save }),
    );
    await waitFor(() => {
      expect(readStoredOverrides()).toBeNull();
    });
  });

  it('con proxy muestra el modelo de cada motor y la versión de su prompt', async () => {
    stubProxy();
    await open();
    const card = await screen.findByRole(
      'region',
      { name: adminText.adminConfig.aiForm.title },
      WAIT,
    );
    const fieldsets = await within(card).findAllByRole('group');
    expect(fieldsets).toHaveLength(5);
    expect(
      within(fieldsets[0] as HTMLElement).getByText(
        adminText.adminConfig.aiForm.promptVersion('forgetting.base.v1'),
      ),
    ).toBeVisible();
    expect(
      within(fieldsets[2] as HTMLElement).getByLabelText(adminText.adminConfig.aiForm.model),
    ).toHaveValue('claude-sonnet-5-5');
  });

  it('guarda los cambios en el proxy y solo manda lo que cambió', async () => {
    const typing = userEvent.setup();
    const puts = stubProxy();
    await open();
    const card = await screen.findByRole(
      'region',
      { name: adminText.adminConfig.aiForm.title },
      WAIT,
    );
    const budget = await within(card).findByLabelText(adminText.adminConfig.aiForm.budget);
    expect(
      within(card).getByRole('button', { name: adminText.adminConfig.aiForm.save }),
    ).toBeDisabled();
    fireEvent.change(budget, { target: { value: '2.5' } });
    await typing.click(
      within(card).getByRole('button', { name: adminText.adminConfig.aiForm.save }),
    );
    expect(await within(card).findByText(adminText.adminConfig.aiForm.saved)).toBeVisible();
    expect(puts).toEqual([{ limits: { dailyBudgetUsd: 2.5 } }]);
    // Ya guardado, el botón vuelve a apagarse
    await waitFor(() => {
      expect(
        within(card).getByRole('button', { name: adminText.adminConfig.aiForm.save }),
      ).toBeDisabled();
    });
  });

  it('un tope fuera de rango muestra su error y no deja guardar', async () => {
    stubProxy();
    await open();
    const card = await screen.findByRole(
      'region',
      { name: adminText.adminConfig.aiForm.title },
      WAIT,
    );
    const [tokens] = await within(card).findAllByLabelText(adminText.adminConfig.aiForm.maxTokens);
    if (!tokens) throw new Error('Sin campo');
    fireEvent.change(tokens, { target: { value: '5' } });
    expect(await within(card).findByText(adminText.adminConfig.aiForm.tokensError)).toBeVisible();
    expect(
      within(card).getByRole('button', { name: adminText.adminConfig.aiForm.save }),
    ).toBeDisabled();
  });
});
