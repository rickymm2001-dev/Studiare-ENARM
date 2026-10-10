// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { cleanup, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { usePreferences } from '@/app/preferences';
import { SCREENS } from '@/app/screens';
import { renderApp, resetApp, type RenderedApp } from '@/app/testing/renderApp';
import { writeStoredOverrides } from '@/config/overridesStore';
import type { AiCallLog } from '@/data/schemas/activity';
import { newId } from '@/data/testing/fixtures';
import { t } from '@/i18n/es-MX';
import { adminText } from '@/i18n/admin';
import { formatUsd } from './format';

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
const DAY = 24 * 60 * 60 * 1000;

const call = (overrides: Partial<AiCallLog> = {}): AiCallLog => ({
  id: newId(),
  userId: null,
  engine: 'forgetting',
  mode: 'real',
  model: 'claude-haiku-4-5',
  at: new Date().toISOString(),
  inputTokens: 1000,
  outputTokens: 200,
  cacheWriteTokens: 0,
  cacheReadTokens: 0,
  estimatedCostUsd: 0.002,
  latencyMs: 500,
  outcome: 'ok',
  ...overrides,
});

async function open(calls: AiCallLog[]) {
  usePreferences.setState({ role: 'admin' });
  app = await renderApp(SCREENS.aiCosts.path, {
    seed: async (api) => {
      await api.repos.aiCallLog.putMany(calls);
    },
  });
  await screen.findByRole('heading', { level: 1, name: adminText.adminCosts.title }, WAIT);
  return app;
}

/** Calls repartidas en varios días y alumnos, las suficientes para proyectar */
function enough(): AiCallLog[] {
  const now = Date.now();
  return Array.from({ length: 36 }, (_, index) =>
    call({
      userId: index % 2 === 0 ? '01HZX0000000000000000000AA' : '01HZX0000000000000000000BB',
      engine: index % 3 === 0 ? 'flashcards' : 'forgetting',
      at: new Date(now - (index % 6) * DAY - 60_000).toISOString(),
      estimatedCostUsd: 0.01,
    }),
  );
}

describe('costos de IA (pantalla 23)', () => {
  it('sin llamadas dice que todavía no hay y no proyecta', async () => {
    await open([]);
    expect(await screen.findByText(adminText.adminCosts.empty.title)).toBeVisible();
    expect(screen.queryByRole('region', { name: adminText.adminCosts.log.title })).toBeNull();
  });

  it('separa el gasto real del teórico y lo dice con texto', async () => {
    await open([
      call({ estimatedCostUsd: 0.5 }),
      call({ estimatedCostUsd: 0.25 }),
      call({ mode: 'mock', estimatedCostUsd: 3 }),
      call({ mode: 'template', estimatedCostUsd: 0 }),
    ]);
    const stats = await screen.findByRole('region', { name: adminText.adminCosts.stats.label });
    expect(within(stats).getByText(formatUsd(0.75))).toBeVisible();
    expect(within(stats).getByText(formatUsd(3))).toBeVisible();
    expect(within(stats).getByText(adminText.adminCosts.stats.simulatedCaption(2))).toBeVisible();
    expect(within(stats).getByText(adminText.adminCosts.stats.realCaption(2))).toBeVisible();
  });

  it('con pocas llamadas la proyección calibra y dice cuántas faltan', async () => {
    await open([call(), call()]);
    expect(
      await screen.findByText(
        t.states.calibrating.remaining(28, adminText.adminCosts.projection.units.calls),
      ),
    ).toBeVisible();
  });

  it('con suficientes proyecta por alumno al mes y la compara con la estimación del plan maestro', async () => {
    writeStoredOverrides({ aiCostEstimateUsd: 0.5 });
    await open(enough());
    const card = await screen.findByRole('region', { name: adminText.adminCosts.projection.title });
    expect(within(card).getByText(/^USD .+ por alumno al mes$/)).toBeVisible();
    expect(
      within(card).getByText(adminText.adminCosts.projection.above(formatUsd(0.5))),
    ).toBeVisible();
  });

  it('sin estimación del plan maestro lo dice', async () => {
    await open(enough());
    const card = await screen.findByRole('region', { name: adminText.adminCosts.projection.title });
    expect(within(card).getByText(adminText.adminCosts.projection.noEstimate)).toBeVisible();
  });

  it('si solo hay llamadas simuladas la proyección es teórica y lo avisa', async () => {
    await open(enough().map((entry) => ({ ...entry, mode: 'mock' as const })));
    const card = await screen.findByRole('region', { name: adminText.adminCosts.projection.title });
    expect(within(card).getByText(adminText.adminCosts.projection.simulatedNote)).toBeVisible();
  });

  it('la bitácora se filtra por motor, modo y resultado', async () => {
    const typing = userEvent.setup();
    await open([
      call({ engine: 'forgetting' }),
      call({ engine: 'flashcards', outcome: 'fallback' }),
      call({ engine: 'flashcards', mode: 'mock' }),
    ]);
    const log = await screen.findByRole('region', { name: adminText.adminCosts.log.title });
    const rows = () => within(log).getAllByRole('row').length - 1;
    expect(rows()).toBe(3);
    await typing.selectOptions(
      within(log).getByLabelText(adminText.adminCosts.log.filterEngine),
      'flashcards',
    );
    expect(rows()).toBe(2);
    await typing.selectOptions(
      within(log).getByLabelText(adminText.adminCosts.log.filterMode),
      'real',
    );
    expect(rows()).toBe(1);
    await typing.selectOptions(
      within(log).getByLabelText(adminText.adminCosts.log.filterOutcome),
      'ok',
    );
    expect(within(log).getByText(adminText.adminCosts.log.none)).toBeVisible();
  });

  it('la bitácora muestra el modelo, los tokens y el resultado de cada llamada, y solo el final del ID del alumno', async () => {
    await open([
      call({
        userId: '01HZX0000000000000000000AA',
        model: 'claude-sonnet-5-5',
        inputTokens: 1200,
        cacheReadTokens: 300,
        outputTokens: 80,
        outcome: 'retried_ok',
      }),
    ]);
    const log = await screen.findByRole('region', { name: adminText.adminCosts.log.title });
    const [, row] = within(log).getAllByRole('row');
    if (!row) throw new Error('Sin renglón');
    expect(within(row).getByText('claude-sonnet-5-5')).toBeVisible();
    expect(within(row).getByText(adminText.adminCosts.log.tokens(1500, 80))).toBeVisible();
    expect(within(row).getByText(adminText.adminCosts.outcomes.retried_ok)).toBeVisible();
    expect(within(row).getByText('0000AA')).toBeVisible();
    expect(within(log).queryByText('01HZX0000000000000000000AA')).toBeNull();
  });

  it('con el proxy encendido muestra el gasto de hoy contra el presupuesto', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url.endsWith('/api/health')) {
          return Promise.resolve(Response.json({ status: 'ok', mode: 'real', version: 1 }));
        }
        if (url.endsWith('/api/ai/usage')) {
          return Promise.resolve(
            Response.json({
              mode: 'real',
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
              usage: { day: '2026-10-08', calls: 7, students: 2, spentUsd: 1.25, byEngine: {} },
            }),
          );
        }
        return Promise.resolve(new Response('', { status: 404 }));
      }),
    );
    await open([call()]);
    const today = await screen.findByRole('region', { name: adminText.adminCosts.today.title });
    expect(
      await within(today).findByText(
        adminText.adminCosts.today.spent(formatUsd(1.25), formatUsd(5)),
        undefined,
        WAIT,
      ),
    ).toBeVisible();
    expect(within(today).getByText(adminText.adminCosts.today.calls(7, 2))).toBeVisible();
    // Con 1.25 de 5 todavía hay margen y no hay aviso
    expect(within(today).queryByText(adminText.adminCosts.today.paused)).toBeNull();
    expect(within(today).queryByText(adminText.adminCosts.today.nearLimit(25))).toBeNull();
  });

  it.each([
    [5, 'paused'],
    [4.2, 'nearLimit'],
  ] as const)('con gasto de %s de 5 avisa que la IA %s', async (spentUsd, expected) => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url.endsWith('/api/health')) {
          return Promise.resolve(Response.json({ status: 'ok', mode: 'real', version: 1 }));
        }
        if (url.endsWith('/api/ai/usage')) {
          return Promise.resolve(
            Response.json({
              mode: 'real',
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
              usage: { day: '2026-10-08', calls: 7, students: 2, spentUsd, byEngine: {} },
            }),
          );
        }
        return Promise.resolve(new Response('', { status: 404 }));
      }),
    );
    await open([call()]);
    const today = await screen.findByRole('region', { name: adminText.adminCosts.today.title });
    const text = adminText.adminCosts.today;
    const notice = await within(today).findByText(
      expected === 'paused' ? text.paused : text.nearLimit(84),
      undefined,
      WAIT,
    );
    expect(notice).toBeVisible();
    expect(notice).toHaveAttribute('role', expected === 'paused' ? 'alert' : 'status');
  });

  it('sin proxy dice que la bitácora es la de este navegador', async () => {
    await open([call()]);
    const today = await screen.findByRole('region', { name: adminText.adminCosts.today.title });
    expect(
      await within(today).findByText(adminText.adminCosts.today.noProxy, undefined, WAIT),
    ).toBeVisible();
  });
});
