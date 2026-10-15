// @vitest-environment jsdom
// Costo de la IA en la nube (B12, 2.5). Lo que devuelve admin_ai_cost_report, por motor, por modo y por
// alumno, sin el texto de nadie
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCloud } from '@/app/cloudState';
import { adminText } from '@/i18n/admin';
import { CloudCostsCard } from './CloudCostsCard';
import { formatUsd } from './format';

vi.setConfig({ testTimeout: 30_000 });

const holder = vi.hoisted((): { cloud: unknown } => ({ cloud: null }));
vi.mock('@/data/cloud/client', () => ({
  getCloud: () => holder.cloud,
  cloudConfigured: () => holder.cloud !== null,
  loadCloud: () => Promise.resolve(holder.cloud),
}));

const text = adminText.adminCosts.cloud;

const REPORT = {
  from: '2026-10-01',
  to: '2026-10-31',
  calls: 120,
  totalUsd: 1.5,
  byEngine: {
    forgetting: { calls: 40, costUsd: 0.3 },
    flashcards: { calls: 80, costUsd: 1.2 },
  },
  byMode: { sync: { calls: 80, costUsd: 1.2 }, batch: { calls: 40, costUsd: 0.3 } },
  byOutcome: { ok: 110, retried_ok: 6, refused: 4 },
  users: 12,
  students: 11,
  perStudentMonthlyUsd: { mean: 0.136, p50: 0.09, p90: 0.31 },
  paidStudentsToday: 9,
};

function fakeCloud(reply: { data?: unknown; error?: { code: string } | null }) {
  const calls: [string, unknown][] = [];
  holder.cloud = {
    rpc: (name: string, args: unknown) => {
      calls.push([name, args]);
      return Promise.resolve({ data: reply.data ?? null, error: reply.error ?? null });
    },
  };
  return calls;
}

beforeEach(() => {
  useCloud.setState({
    state: {
      status: 'linked',
      identity: { authId: 'yo', email: 'yo@ejemplo.mx', role: 'admin', alias: null },
    },
  });
});
afterEach(() => {
  cleanup();
  holder.cloud = null;
  useCloud.setState({ state: { status: 'off' } });
});

describe('costo de la IA en la nube', () => {
  it('sin la cuenta de la nube dice qué hace falta y no pide nada', () => {
    useCloud.setState({ state: { status: 'off' } });
    const calls = fakeCloud({ data: REPORT });
    render(<CloudCostsCard />);
    expect(screen.getByText(text.needsCloud)).toBeVisible();
    expect(screen.queryByRole('button', { name: text.show })).toBeNull();
    expect(calls).toEqual([]);
  });

  it('muestra el gasto, el costo por alumno, el desglose por motor y por modo, y los resultados', async () => {
    const calls = fakeCloud({ data: REPORT });
    render(<CloudCostsCard />);
    expect(await screen.findByText(formatUsd(1.5))).toBeVisible();
    expect(calls[0]?.[0]).toBe('admin_ai_cost_report');
    // Del primer día del mes a hoy
    expect(calls[0]?.[1]).toMatchObject({
      p_from: expect.stringMatching(/^\d{4}-\d{2}-01$/) as string,
    });

    const perStudent = screen.getByRole('region', { name: text.perStudentTitle });
    expect(within(perStudent).getByText(text.perStudentValue(formatUsd(0.136)))).toBeVisible();
    expect(within(perStudent).getByText(text.perStudentValue(formatUsd(0.09)))).toBeVisible();
    expect(within(perStudent).getByText(text.perStudentValue(formatUsd(0.31)))).toBeVisible();

    const engines = screen.getByRole('region', { name: text.engineTitle });
    const rows = within(engines).getAllByRole('row').slice(1);
    // De lo que más costó a lo que menos, con su parte
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringContaining(`${adminText.adminCosts.engines.flashcards}80${formatUsd(1.2)}`),
      expect.stringContaining(`${adminText.adminCosts.engines.forgetting}40${formatUsd(0.3)}`),
    ]);
    expect(within(rows[0] as HTMLElement).getByText('80%')).toBeVisible();

    const modes = screen.getByRole('region', { name: text.modeTitle });
    expect(within(modes).getByText(text.modes.batch ?? '')).toBeVisible();
    expect(within(modes).getByText(text.modes.sync ?? '')).toBeVisible();
    const outcomes = screen.getByRole('region', { name: text.outcomeTitle });
    expect(within(outcomes).getByText(text.outcomes.refused ?? '')).toBeVisible();
    // No sale ningún texto ni correo de nadie
    expect(document.body.textContent).not.toMatch(/@/);
  });

  it('un periodo sin llamadas lo dice y sin alumnos no inventa promedios', async () => {
    fakeCloud({
      data: {
        ...REPORT,
        calls: 3,
        totalUsd: 0,
        byEngine: {},
        byMode: {},
        byOutcome: { ok: 3 },
        users: 1,
        students: 0,
        perStudentMonthlyUsd: { mean: 0, p50: 0, p90: 0 },
      },
    });
    render(<CloudCostsCard />);
    expect(await screen.findByText(text.noStudents)).toBeVisible();
    cleanup();
    fakeCloud({ data: { ...REPORT, calls: 0, byEngine: {}, byMode: {}, byOutcome: {} } });
    render(<CloudCostsCard />);
    expect(await screen.findByText(text.empty)).toBeVisible();
  });

  it('cambia el periodo, valida las fechas y vuelve a pedir', async () => {
    const typing = userEvent.setup();
    const calls = fakeCloud({ data: REPORT });
    render(<CloudCostsCard />);
    await screen.findByText(formatUsd(1.5));
    fireEvent.change(screen.getByLabelText(text.from), { target: { value: '2026-09-01' } });
    fireEvent.change(screen.getByLabelText(text.to), { target: { value: '2026-09-30' } });
    await typing.click(screen.getByRole('button', { name: text.show }));
    await waitFor(() => {
      expect(calls.at(-1)?.[1]).toEqual({ p_from: '2026-09-01', p_to: '2026-09-30' });
    });
    fireEvent.change(screen.getByLabelText(text.to), { target: { value: '2026-08-01' } });
    expect(await screen.findByText(text.invalidRange)).toBeVisible();
    expect(screen.getByRole('button', { name: text.show })).toBeDisabled();
  });

  it('sin permiso, o sin red, dice qué pasó y deja intentar de nuevo', async () => {
    const typing = userEvent.setup();
    fakeCloud({ error: { code: '42501' } });
    render(<CloudCostsCard />);
    expect(await screen.findByText(text.failures.forbidden ?? '')).toBeVisible();
    fakeCloud({ data: REPORT });
    await typing.click(screen.getByRole('button', { name: 'Intentar de nuevo' }));
    expect(await screen.findByText(formatUsd(1.5))).toBeVisible();
  });
});
