// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect } from 'react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCloud } from '@/app/cloudState';
import { DEFAULT_PREFERENCES, usePreferences } from '@/app/preferences';
import { writeStoredFlags } from '@/config/featureFlags';
import { catalogEntryOf } from '@/data/bank/catalogMerge';
import { createCloudSource, poolQuestionOfEntry } from '@/data/bank/cloudSource';
import type { CatalogRow } from '@/data/bank/contracts';
import { uuidToUlid } from '@/data/cloud/cloudIds';
import { useDataApi, type DataApi } from '@/data/context';
import { DataProvider } from '@/data/DataProvider';
import { fakeBankServer, wireRow } from '@/data/testing/bankCloud';
import { makeUser } from '@/data/testing/fixtures';
import { cloudBankScreensText as bankText } from '@/i18n/cloudBankScreens';
import { t } from '@/i18n/es-MX';
import { useBankNotice } from '../shared/bankNotice';
import type { ReadySession } from '../shared/RequireSession';
import { ExamSetupCard } from './ExamSetupCard';
import { clearExamState, loadExamState } from './examStorage';

// El examen con el banco de la nube (B11, 5.4). Baja todos sus cuerpos antes de empezar
vi.setConfig({ testTimeout: 30_000 });
const holder = vi.hoisted((): { cloud: unknown } => ({ cloud: null }));
vi.mock('@/data/cloud/client', () => ({
  getCloud: () => holder.cloud,
  cloudConfigured: () => true,
  loadCloud: () => Promise.resolve(holder.cloud),
}));

const user = makeUser();
const session: ReadySession = { status: 'ready', user, settings: user.settings, isDemo: false };

beforeEach(() => {
  writeStoredFlags({ cloudBank: true });
  useCloud.setState({
    state: {
      status: 'linked',
      identity: { authId: 'cuenta', email: 'ana@ejemplo.mx', role: 'student', alias: 'Ana' },
    },
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  cleanup();
  usePreferences.setState(DEFAULT_PREFERENCES);
  clearExamState(user.id);
  holder.cloud = null;
  localStorage.clear();
  useCloud.setState({ state: { status: 'off' } });
  useBankNotice.getState().clear();
});

const pool = (rows: CatalogRow[]) =>
  rows.map((row) => {
    const entry = catalogEntryOf(row);
    if (!entry) throw new Error('Fila inválida');
    return poolQuestionOfEntry(entry);
  });

describe('examen completo con el banco de la nube', () => {
  it('baja los cuerpos con el propósito de examen y empieza con lo concedido, avisando por qué', async () => {
    const typing = userEvent.setup();
    const rows = Array.from({ length: 25 }, (_, index) =>
      wireRow({
        seq: index + 1,
        branch: index % 2 === 0 ? 'internal_medicine' : 'pediatrics',
        topic: index % 2 === 0 ? 'cardiology' : 'neonatology',
      }),
    );
    const server = fakeBankServer(rows, { freeLimit: 15 });
    holder.cloud = server.server;
    render(
      <DataProvider kind="real">
        <MemoryRouter>
          <ExamSetupCard session={session} questions={pool(rows)} plan="free" left={20} />
        </MemoryRouter>
      </DataProvider>,
    );
    await typing.click(screen.getByRole('button', { name: t.exam.start }));
    await waitFor(() => {
      expect(loadExamState(user.id)?.questionIds).toHaveLength(15);
    });
    const fetches = server.server.calls.filter((call) => call.name === 'fetch_questions');
    expect(fetches.every((call) => call.args?.p_purpose === 'exam')).toBe(true);
    expect((fetches[0]?.args?.p_version_ids as string[]).length).toBe(20);
    expect(loadExamState(user.id)).toMatchObject({ requested: 20, shortfall: 5 });
    expect(useBankNotice.getState().notice).toEqual({
      reason: 'daily_limit',
      granted: 15,
      requested: 20,
      retryAt: null,
    });
  });

  it('sin conexión y sin nada bajado no empieza y dice por qué', async () => {
    const typing = userEvent.setup();
    const rows = Array.from({ length: 5 }, (_, index) => wireRow({ seq: index + 1 }));
    const server = fakeBankServer(rows);
    server.state.offline = true;
    holder.cloud = server.server;
    render(
      <DataProvider kind="real">
        <MemoryRouter>
          <ExamSetupCard session={session} questions={pool(rows)} plan="monthly" left={null} />
        </MemoryRouter>
      </DataProvider>,
    );
    await typing.click(screen.getByRole('button', { name: t.exam.start }));
    expect(await screen.findByRole('alert')).toHaveTextContent(bankText.shortfall.reasons.offline);
    expect(loadExamState(user.id)).toBeNull();
  });

  it('sin preguntas en Gratis el candado es el mismo de los demás, con la prueba si le toca', async () => {
    const captured: { api?: DataApi } = {};
    function Capture() {
      const api = useDataApi();
      useEffect(() => {
        captured.api = api;
      }, [api]);
      return null;
    }
    render(
      <DataProvider kind="real">
        <MemoryRouter>
          <Capture />
          <ExamSetupCard session={session} questions={[]} plan="free" left={0} />
        </MemoryRouter>
      </DataProvider>,
    );
    await waitFor(() => {
      expect(captured.api).toBeDefined();
    });
    // La sesión abierta del alumno, Gratis como lo refleja my_plan, que dice que todavía le toca la
    // prueba (B10)
    await (captured.api as DataApi).repos.users.put(user);
    usePreferences.setState({ sessionUserId: user.id });
    await (captured.api as DataApi).repos.subscriptions.put({
      userId: user.id,
      plan: 'free',
      status: 'none',
      isSimulated: false,
      trialAvailable: true,
      updatedAt: new Date().toISOString(),
    });
    expect(await screen.findByRole('link', { name: t.billing.freeTrialCta })).toHaveAttribute(
      'href',
      '/suscripcion?plan=mensual',
    );
    expect(screen.queryByRole('button', { name: t.exam.start })).toBeNull();
  });

  it('sin conexión arma el examen solo con lo ya bajado aunque el banco sea más grande', async () => {
    const typing = userEvent.setup();
    // Un banco de 40 con 25 cuerpos ya bajados en este navegador (M2 de la revisión de B11)
    const rows = Array.from({ length: 40 }, (_, index) =>
      wireRow({
        seq: index + 1,
        branch: index % 2 === 0 ? 'internal_medicine' : 'pediatrics',
        topic: index % 2 === 0 ? 'cardiology' : 'neonatology',
      }),
    );
    const server = fakeBankServer(rows, { plan: 'monthly' });
    holder.cloud = server.server;
    const stored = new Set(rows.slice(0, 25).map((row) => uuidToUlid(row.versionId) ?? ''));
    let api: DataApi | undefined;
    function Capture() {
      api = useDataApi();
      return null;
    }
    render(
      <DataProvider kind="real">
        <MemoryRouter>
          <Capture />
          <ExamSetupCard
            session={session}
            questions={pool(rows).map((question) => ({
              ...question,
              cached: stored.has(question.id),
            }))}
            plan="monthly"
            left={null}
          />
        </MemoryRouter>
      </DataProvider>,
    );
    await waitFor(() => {
      expect(api).toBeDefined();
    });
    const source = createCloudSource({
      repos: (api as DataApi).repos,
      cloud: () => server.server,
    });
    await source.prepare();
    await source.ensureBodies([...stored], 'exam');
    server.state.offline = true;
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    await typing.selectOptions(screen.getByLabelText(t.exam.size), '20');
    await typing.click(screen.getByRole('button', { name: t.exam.start }));
    await waitFor(() => {
      expect(loadExamState(user.id)?.questionIds).toHaveLength(20);
    });
    expect(loadExamState(user.id)?.questionIds.every((id) => stored.has(id))).toBe(true);
    expect(useBankNotice.getState().notice).toEqual({
      reason: 'offline',
      granted: 20,
      requested: 20,
      retryAt: null,
    });
  });
});
