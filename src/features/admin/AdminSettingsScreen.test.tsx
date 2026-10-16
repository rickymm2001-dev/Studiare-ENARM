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
import { bankAdminText } from '@/i18n/bankAdmin';

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

/** Lo que manda la Edge Function de B12, con razonamiento por motor y los límites de la nube */
const CLOUD_CONFIG: AdminConfig = {
  ...CONFIG,
  models: {
    ...CONFIG.models,
    flashcards: { id: 'claude-haiku-5-5', effort: 'low', thinking: 'adaptive', maxTokens: 8000 },
  },
  prices: {
    ...CONFIG.prices,
    'claude-haiku-5-5': { input: 0.1, output: 0.5, cacheWrite: 0.125, cacheRead: 0.01 },
  },
  limits: {
    ...CONFIG.limits,
    perUserDailyUsd: 0.3,
    cardGenerationsPerDay: 20,
    sectionsPerGeneration: 12,
    maxPendingJobs: 12,
    engineShare: {
      forgetting: 0.1,
      weekly_report: 0.1,
      flashcards: 0.55,
      bias_tips: 0.1,
      restructure: 0.15,
    },
  },
};

/** Un proxy falso que guarda los cambios como el verdadero */
function stubProxy(initial: AdminConfig = CONFIG) {
  const puts: unknown[] = [];
  let config = initial;
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      if (url.endsWith('/api/health')) {
        return Promise.resolve(Response.json({ status: 'ok', mode: 'mock', version: 1 }));
      }
      if (url.endsWith('/api/ai/config') && init?.method === 'PUT') {
        const patch = JSON.parse(init.body as string) as {
          limits?: Partial<AdminConfig['limits']>;
          models?: Partial<AdminConfig['models']>;
        };
        puts.push(patch);
        config = {
          ...config,
          models: { ...config.models, ...patch.models },
          // Como mergeConfig del servicio, que mezcla también las cuotas y los límites por motor
          limits: {
            ...config.limits,
            ...patch.limits,
            ...(config.limits.engineShare
              ? { engineShare: { ...config.limits.engineShare, ...patch.limits?.engineShare } }
              : {}),
            perStudentPerDay: {
              ...config.limits.perStudentPerDay,
              ...patch.limits?.perStudentPerDay,
            },
          },
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

describe('umbrales de Inglés médico', () => {
  const english = adminText.adminConfig.thresholds;

  it('van aparte bajo su título, con su valor de fábrica y su explicación', async () => {
    await open();
    const card = screen.getByRole('region', { name: adminText.adminConfig.thresholdsForm.title });
    const group = within(card).getByRole('group', {
      name: adminText.adminConfig.thresholdsForm.englishTitle,
    });
    expect(within(group).getByLabelText(english['english.secondsPerItem'].label)).toHaveValue(90);
    expect(within(group).getByLabelText(english['english.examMinItems'].label)).toHaveValue(30);
    expect(within(group).getByLabelText(english['english.practiceMinCases'].label)).toHaveValue(1);
    expect(within(group).getByLabelText(english['english.minAnswersForStats'].label)).toHaveValue(
      20,
    );
    expect(within(group).getAllByRole('spinbutton')).toHaveLength(4);
    // Los demás umbrales quedan fuera de ese grupo
    expect(
      within(group).queryByLabelText(
        adminText.adminConfig.thresholds['bias.minTaggedErrors'].label,
      ),
    ).toBeNull();
  });

  it('un tiempo fuera de rango muestra el motivo y no deja guardar, y uno bueno se guarda solo', async () => {
    const typing = userEvent.setup();
    await open();
    const card = screen.getByRole('region', { name: adminText.adminConfig.thresholdsForm.title });
    const seconds = within(card).getByLabelText(english['english.secondsPerItem'].label);
    const save = within(card).getByRole('button', {
      name: adminText.adminConfig.thresholdsForm.save,
    });
    fireEvent.change(seconds, { target: { value: '20' } });
    await waitFor(() => {
      expect(save).toBeDisabled();
    });
    expect(seconds).toHaveAttribute('aria-invalid', 'true');
    fireEvent.change(seconds, { target: { value: '120' } });
    await waitFor(() => {
      expect(save).toBeEnabled();
    });
    await typing.click(save);
    expect(await within(card).findByText(adminText.adminConfig.thresholdsForm.saved)).toBeVisible();
    expect(readStoredOverrides()?.thresholds).toEqual({ english: { secondsPerItem: 120 } });
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

  it('apagar la marca de provisionales guarda que ya son los oficiales sin tocar los pesos', async () => {
    const typing = userEvent.setup();
    await open();
    const card = screen.getByRole('region', { name: adminText.adminConfig.weightsForm.title });
    expect(within(card).getByText(bankAdminText.weights.provisionalMark)).toBeVisible();
    expect(within(card).getByText(bankAdminText.weights.english)).toBeVisible();
    const save = within(card).getByRole('button', { name: adminText.adminConfig.weightsForm.save });
    expect(save).toBeDisabled();
    await typing.click(within(card).getByLabelText(bankAdminText.weights.provisional));
    expect(within(card).getByText(bankAdminText.weights.officialMark)).toBeVisible();
    await typing.click(save);
    expect(await within(card).findByText(adminText.adminConfig.weightsForm.saved)).toBeVisible();
    expect(readStoredOverrides()?.weights).toEqual({
      branches: {},
      topics: {},
      provisional: false,
    });
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

  it('con la Edge Function muestra el razonamiento por motor y los límites de la nube, y avisa lo de la compuerta', async () => {
    const typing = userEvent.setup();
    const puts = stubProxy(CLOUD_CONFIG);
    await open();
    const card = await screen.findByRole(
      'region',
      { name: adminText.adminConfig.aiForm.title },
      WAIT,
    );
    const text = adminText.adminConfig.aiForm;
    expect(await within(card).findByText(text.gateNote)).toBeVisible();
    const fieldsets = await within(card).findAllByRole('group');
    expect(fieldsets).toHaveLength(5);
    // Tarjetas con Haiku 5.5 y razonamiento automático
    expect(within(fieldsets[2] as HTMLElement).getByLabelText(text.thinking)).toHaveValue(
      'adaptive',
    );
    expect(within(fieldsets[0] as HTMLElement).getByLabelText(text.thinking)).toHaveValue('');
    expect(within(card).getByLabelText(text.perUserDaily)).toHaveValue(0.3);
    expect(within(card).getByLabelText(text.cardGenerations)).toHaveValue(20);
    expect(within(card).getByLabelText(text.sections)).toHaveValue(12);
    expect(within(card).getByLabelText(text.maxPending)).toHaveValue(12);
    expect(
      within(card).getByLabelText(text.share(adminText.adminCosts.engines.flashcards)),
    ).toHaveValue(55);

    // Un esfuerzo de los nuevos y un tope de la nube. Solo viaja lo que cambió
    await typing.selectOptions(
      within(fieldsets[2] as HTMLElement).getByLabelText(text.effort),
      text.efforts.max,
    );
    fireEvent.change(within(card).getByLabelText(text.perUserDaily), { target: { value: '0.5' } });
    fireEvent.change(
      within(card).getByLabelText(text.share(adminText.adminCosts.engines.flashcards)),
      { target: { value: '60' } },
    );
    await typing.click(within(card).getByRole('button', { name: text.save }));
    expect(await within(card).findByText(text.saved)).toBeVisible();
    expect(puts).toEqual([
      {
        models: {
          flashcards: { id: 'claude-haiku-5-5', effort: 'max', maxTokens: 8000 },
        },
        limits: { perUserDailyUsd: 0.5, engineShare: { flashcards: 0.6 } },
      },
    ]);
  });

  it('un límite de la nube fuera de rango no deja guardar', async () => {
    stubProxy(CLOUD_CONFIG);
    await open();
    const card = await screen.findByRole(
      'region',
      { name: adminText.adminConfig.aiForm.title },
      WAIT,
    );
    const text = adminText.adminConfig.aiForm;
    fireEvent.change(await within(card).findByLabelText(text.sections), {
      target: { value: '13' },
    });
    expect(await within(card).findByText(text.sectionsError)).toBeVisible();
    expect(within(card).getByRole('button', { name: text.save })).toBeDisabled();
  });

  it('si el servicio rechaza el cambio, muestra por qué', async () => {
    const typing = userEvent.setup();
    stubProxy(CLOUD_CONFIG);
    const base = globalThis.fetch;
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, init?: RequestInit) =>
        url.endsWith('/api/ai/config') && init?.method === 'PUT'
          ? Promise.resolve(
              Response.json(
                {
                  error: 'invalid_request',
                  message: 'claude-opus-5-5 no deja apagar el razonamiento',
                },
                { status: 400 },
              ),
            )
          : base(url, init),
      ),
    );
    await open();
    const card = await screen.findByRole(
      'region',
      { name: adminText.adminConfig.aiForm.title },
      WAIT,
    );
    const text = adminText.adminConfig.aiForm;
    fireEvent.change(await within(card).findByLabelText(text.budget), { target: { value: '3' } });
    await typing.click(within(card).getByRole('button', { name: text.save }));
    expect(
      await within(card).findByText('claude-opus-5-5 no deja apagar el razonamiento'),
    ).toBeVisible();
  });
});
