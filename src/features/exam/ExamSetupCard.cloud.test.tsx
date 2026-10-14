// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCloud } from '@/app/cloudState';
import { writeStoredFlags } from '@/config/featureFlags';
import { catalogEntryOf } from '@/data/bank/catalogMerge';
import { poolQuestionOfEntry } from '@/data/bank/cloudSource';
import type { CatalogRow } from '@/data/bank/contracts';
import { DataProvider } from '@/data/DataProvider';
import { fakeBankServer, wireRow } from '@/data/testing/bankCloud';
import { makeUser } from '@/data/testing/fixtures';
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
  cleanup();
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
    expect(await screen.findByRole('alert')).toHaveTextContent(
      t.cloudBank.shortfall.reasons.offline,
    );
    expect(loadExamState(user.id)).toBeNull();
  });
});
