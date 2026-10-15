// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCloud } from '@/app/cloudState';
import { SCREENS } from '@/app/screens';
import { renderApp, resetApp, type RenderedApp } from '@/app/testing/renderApp';
import { writeStoredFlags } from '@/config/featureFlags';
import type { CatalogRow } from '@/data/bank/contracts';
import { createCloudSource } from '@/data/bank/cloudSource';
import { uuidToUlid } from '@/data/cloud/cloudIds';
import { fakeBankServer, wireRow } from '@/data/testing/bankCloud';
import { cloudBankScreensText as bankText } from '@/i18n/cloudBankScreens';
import { t } from '@/i18n/es-MX';
import { useBankNotice } from '../shared/bankNotice';
import { usePractice } from './practice';

vi.setConfig({ testTimeout: 30_000 });

// Simular con el banco de la nube (B11, 5.1 a 5.5). getCloud devuelve el banco falso de cada prueba
// Con sdkLoading, getCloud todavía no lo tiene y loadCloud lo entrega cuando termina de bajar
const holder = vi.hoisted((): { cloud: unknown; sdkLoading: Promise<unknown> | null } => ({
  cloud: null,
  sdkLoading: null,
}));
vi.mock('@/data/cloud/client', () => ({
  getCloud: () => (holder.sdkLoading ? null : holder.cloud),
  cloudConfigured: () => true,
  loadCloud: async () => {
    await holder.sdkLoading;
    return holder.cloud;
  },
}));

let app: RenderedApp | undefined;

const rows = (count: number) =>
  Array.from({ length: count }, (_, index) => wireRow({ seq: index + 1 }));

function bank(catalog: CatalogRow[], options: Parameters<typeof fakeBankServer>[1] = {}) {
  const server = fakeBankServer(catalog, options);
  holder.cloud = server.server;
  return server;
}

beforeEach(() => {
  localStorage.clear();
  writeStoredFlags({ cloudBank: true });
  useCloud.setState({
    state: {
      status: 'linked',
      identity: { authId: 'cuenta', email: 'ana@ejemplo.mx', role: 'student', alias: 'Ana' },
    },
  });
});

afterEach(async () => {
  cleanup();
  await resetApp(app?.api);
  app = undefined;
  holder.cloud = null;
  holder.sdkLoading = null;
  localStorage.clear();
  useCloud.setState({ state: { status: 'off' } });
  useBankNotice.getState().clear();
});

const setup = () =>
  screen.findByRole('region', { name: t.simulator.setupTitle }, { timeout: 20_000 });

describe('Simular con el banco de la nube', () => {
  it('elige del catálogo, sin el aviso de demostración y con el tope del servidor', async () => {
    const server = bank(rows(25));
    // Ya abrió 18 preguntas nuevas hoy en otro dispositivo
    for (const row of rows(18)) server.read.add(row.versionId);
    app = await renderApp(SCREENS.simulatorSetup.path);
    const practice = await setup();
    // El banco de la nube no es de demostración y no lo dice
    expect(within(practice).getByText(bankText.bankNote(25))).toBeVisible();
    expect(within(practice).queryByText(t.simulator.bankNote(25))).toBeNull();
    const stats = screen.getByRole('region', { name: t.simulator.stats.label });
    await waitFor(() => {
      expect(stats).toHaveTextContent(
        `${t.simulator.stats.today}2${t.simulator.stats.todayCaption}`,
      );
    });
    expect(screen.queryByRole('region', { name: t.labels.demoVersion })).toBeNull();
    // Nunca pidió cuerpos solo por abrir la pantalla
    expect(server.server.calls.some((call) => call.name === 'fetch_questions')).toBe(false);
  });

  it('al topar en Gratis muestra el aviso de B8 con la prueba gratis', async () => {
    const server = bank(rows(25));
    for (const row of rows(20)) server.read.add(row.versionId);
    app = await renderApp(SCREENS.simulatorSetup.path);
    const practice = await setup();
    expect(await within(practice).findByText(t.simulator.limitReached)).toBeVisible();
    expect(within(practice).getByRole('link', { name: t.billing.freeTrialCta })).toBeVisible();
    expect(within(practice).queryByRole('button', { name: t.simulator.start })).toBeNull();
  });

  it('en un plan de pago avisa el freno con la hora en que puede seguir', async () => {
    const server = bank(rows(10), { plan: 'monthly' });
    server.state.brakeUntil = new Date(Date.now() + 45_000).toISOString();
    app = await renderApp(SCREENS.simulatorSetup.path);
    const practice = await setup();
    expect(
      await within(practice).findByText(bankText.brake(server.state.brakeUntil)),
    ).toBeVisible();
  });

  it('baja los cuerpos al empezar y arranca con lo concedido, diciendo por qué faltó lo demás', async () => {
    const user = userEvent.setup();
    const catalog = rows(5);
    const server = bank(catalog, { plan: 'monthly' });
    // Dos ya no están en el banco aunque este navegador todavía no lo sabe
    for (const row of catalog.slice(0, 2)) server.state.deny.set(row.versionId, 'retired');
    app = await renderApp(SCREENS.simulatorSetup.path);
    const practice = await setup();
    await user.selectOptions(within(practice).getByLabelText(t.simulator.count), '5');
    await user.click(within(practice).getByRole('button', { name: t.simulator.start }));
    await waitFor(() => {
      expect(usePractice.getState().questionIds).toHaveLength(3);
    });
    const granted = catalog.slice(2).map((row) => uuidToUlid(row.versionId));
    expect([...usePractice.getState().questionIds].sort()).toEqual([...granted].sort());
    const fetch = server.server.calls.find((call) => call.name === 'fetch_questions');
    expect(fetch?.args?.p_purpose).toBe('practice');
    expect(await screen.findByText(bankText.shortfall.started(3, 5))).toBeVisible();
    expect(screen.getByText(bankText.shortfall.reasons.unavailable)).toBeVisible();
    await user.click(screen.getByRole('button', { name: bankText.shortfall.dismiss }));
    expect(screen.queryByText(bankText.shortfall.started(3, 5))).toBeNull();
  });

  it('al abrir la app espera al SDK de la nube y no toma su carga como sin conexión', async () => {
    const user = userEvent.setup();
    const server = bank(rows(5), { plan: 'monthly' });
    // Así queda justo después de recargar. El catálogo ya está en el navegador, el SDK sigue bajando
    // y la cuenta se está revisando
    let release = () => undefined as unknown;
    holder.sdkLoading = new Promise((resolve) => {
      release = () => {
        resolve(undefined);
      };
    });
    useCloud.setState({ state: { status: 'checking' } });
    app = await renderApp(SCREENS.simulatorSetup.path, {
      seed: async (api) => {
        await createCloudSource({ repos: api.repos, cloud: () => server.server }).prepare();
      },
    });
    const practice = await setup();
    await user.selectOptions(within(practice).getByLabelText(t.simulator.count), '5');
    await user.click(within(practice).getByRole('button', { name: t.simulator.start }));
    release();
    holder.sdkLoading = null;
    await waitFor(() => {
      expect(usePractice.getState().questionIds).toHaveLength(5);
    });
    expect(screen.queryByText(bankText.shortfall.reasons.offline)).toBeNull();
  });

  it('sin conexión y sin catálogo bajado pide conectarse una vez y no usa el banco de demostración', async () => {
    const server = bank(rows(5));
    server.state.offline = true;
    app = await renderApp(SCREENS.simulatorSetup.path);
    expect(await screen.findByText(bankText.neverDownloaded.title)).toBeVisible();
    expect(screen.queryByRole('region', { name: t.simulator.setupTitle })).toBeNull();
    expect(await app.api.repos.questions.listLatest()).toEqual([]);
  });

  it('con la bandera apagada es el banco de demostración de siempre, con su aviso', async () => {
    writeStoredFlags({ cloudBank: false });
    const server = bank(rows(5));
    app = await renderApp(SCREENS.simulatorSetup.path);
    const practice = await setup();
    expect(screen.getByRole('region', { name: t.labels.demoVersion })).toBeVisible();
    expect(within(practice).getByText(/^Banco de demostración con/)).toBeVisible();
    expect(server.server.calls).toEqual([]);
  });
});
