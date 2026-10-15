// @vitest-environment jsdom
// Costos de IA con la cuenta de la nube conectada (B12, 2.5). El costo de verdad es el de la nube. La
// bitácora de este navegador solo se ve si este navegador hizo llamadas, porque sus ceros y su aviso de
// que no hay llamadas contradirían a lo que cuenta la nube.
import 'fake-indexeddb/auto';
import { cleanup, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useCloud } from '@/app/cloudState';
import { usePreferences } from '@/app/preferences';
import { SCREENS } from '@/app/screens';
import { renderApp, resetApp, type RenderedApp } from '@/app/testing/renderApp';
import type { AiCallLog } from '@/data/schemas/activity';
import { newId } from '@/data/testing/fixtures';
import { adminText } from '@/i18n/admin';

vi.setConfig({ testTimeout: 30_000 });

// La nube conectada solo para el reporte de costos. El resto de la app sigue sin cliente de la nube
const holder = vi.hoisted((): { cloud: unknown } => ({ cloud: null }));
vi.mock('@/data/cloud/client', () => ({
  getCloud: () => null,
  cloudConfigured: () => false,
  loadCloud: () => Promise.resolve(holder.cloud),
}));

let app: RenderedApp | undefined;
afterEach(async () => {
  cleanup();
  holder.cloud = null;
  useCloud.setState({ state: { status: 'off' } });
  localStorage.clear();
  await resetApp(app?.api);
  app = undefined;
});

const WAIT = { timeout: 20_000 };
const text = adminText.adminCosts;

const REPORT = {
  from: '2026-10-01',
  to: '2026-10-31',
  calls: 120,
  totalUsd: 1.5,
  byEngine: { flashcards: { calls: 120, costUsd: 1.5 } },
  byMode: { sync: { calls: 120, costUsd: 1.5 } },
  byOutcome: { ok: 120 },
  users: 12,
  students: 11,
  perStudentMonthlyUsd: { mean: 0.136, p50: 0.09, p90: 0.31 },
  paidStudentsToday: 9,
};

const call = (): AiCallLog => ({
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
});

async function openLinked(calls: AiCallLog[]) {
  holder.cloud = {
    rpc: () => Promise.resolve({ data: REPORT, error: null }),
  };
  useCloud.setState({
    state: {
      status: 'linked',
      identity: { authId: 'yo', email: 'yo@ejemplo.mx', role: 'admin', alias: null },
    },
  });
  usePreferences.setState({ role: 'admin' });
  app = await renderApp(SCREENS.aiCosts.path, {
    seed: async (api) => {
      await api.repos.aiCallLog.putMany(calls);
    },
  });
  await screen.findByRole('heading', { level: 1, name: text.title }, WAIT);
  const cloud = await screen.findByRole('region', { name: text.cloud.title }, WAIT);
  // Ya llegó el reporte de la nube
  expect(
    await within(cloud).findByText(text.cloud.totalCaption(120), undefined, WAIT),
  ).toBeVisible();
}

describe('costos de IA con la nube conectada', () => {
  it('sin llamadas en este navegador no se ven sus ceros ni su aviso de que no hay llamadas', async () => {
    await openLinked([]);
    expect(screen.queryByRole('region', { name: text.stats.label })).toBeNull();
    expect(screen.queryByText(text.empty.title)).toBeNull();
  });

  it('con llamadas hechas desde este navegador también se ven, junto al costo de la nube', async () => {
    await openLinked([call(), call()]);
    const stats = await screen.findByRole('region', { name: text.stats.label }, WAIT);
    expect(within(stats).getByText(text.stats.realCaption(2))).toBeVisible();
    expect(screen.queryByText(text.empty.title)).toBeNull();
    expect(screen.getByRole('region', { name: text.cloud.title })).toBeVisible();
  });
});
