// @vitest-environment jsdom
// Acuerdo noche por noche (B14, 7.2 del plan de B14). El kappa que calculó la calibración cada noche, con sus
// pares y la paridad contra el tablero del médico. Sin la nube dice que no hay calibración, y una lectura que
// falla solo apaga esta tarjeta.
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { calibrationAdminTexts } from '@/i18n/calibrationAdmin';
import { physicianText } from '@/i18n/physician';
import { AgreementHistoryCard } from './AgreementHistoryCard';

const holder = vi.hoisted((): { cloud: unknown } => ({ cloud: null }));
vi.mock('@/data/cloud/client', () => ({
  getCloud: () => holder.cloud,
  cloudConfigured: () => holder.cloud !== null,
  loadCloud: () => Promise.resolve(holder.cloud),
}));

const text = calibrationAdminTexts.agreementHistory;

const night = (day: string, over: Record<string, unknown> = {}) => ({
  studyDay: day,
  at: `${day}T10:31:40.000Z`,
  pairs: 84,
  kappa: 0.52,
  observed: 0.7,
  expected: 0.37,
  parity: true,
  ...over,
});

function fakeCloud(
  nights: readonly unknown[],
  error: { code: string } | null = null,
): { calls: { name: string; args: unknown }[] } {
  const calls: { name: string; args: unknown }[] = [];
  holder.cloud = {
    rpc: (name: string, args: unknown) => {
      calls.push({ name, args });
      return Promise.resolve(error ? { data: null, error } : { data: { nights }, error: null });
    },
  };
  return { calls };
}

const showCard = (props: { cloud?: boolean; ready?: boolean } = {}) =>
  render(
    <AgreementHistoryCard cloud={props.cloud ?? true} ready={props.ready ?? true} sourceKey="k" />,
  );

afterEach(() => {
  cleanup();
  holder.cloud = null;
});

describe('Acuerdo noche por noche', () => {
  it('pide las 60 noches y las pone en una tabla con la noche, los pares, el kappa y la paridad', async () => {
    const { calls } = fakeCloud([
      night('2026-10-15'),
      night('2026-10-14', { pairs: 70, kappa: 0.4, parity: false }),
      night('2026-10-13', { pairs: 0, kappa: null, parity: null }),
    ]);
    showCard();
    const table = await screen.findByRole('table');
    expect(calls).toEqual([{ name: 'editor_agreement_history', args: { p_limit: 60 } }]);
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(3);
    // La noche es el día de estudio del corte menos uno
    expect(within(rows[0] as HTMLElement).getByRole('rowheader')).toHaveTextContent(
      '14 de octubre',
    );
    expect(within(rows[0] as HTMLElement).getByText('0.52')).toBeVisible();
    expect(within(rows[0] as HTMLElement).getByText(text.parityMatch)).toBeVisible();
    expect(within(rows[1] as HTMLElement).getByText(text.parityMismatch)).toBeVisible();
    expect(within(rows[2] as HTMLElement).getByText(text.noKappa)).toBeVisible();
    expect(within(rows[2] as HTMLElement).getByText(text.parityUnknown)).toBeVisible();
  });

  it('si alguna noche no coincide lo avisa debajo', async () => {
    fakeCloud([night('2026-10-15', { parity: false })]);
    showCard();
    expect(await screen.findByText(text.mismatchNote)).toBeVisible();
  });

  it('si todas coinciden no trae el aviso', async () => {
    fakeCloud([night('2026-10-15'), night('2026-10-14')]);
    showCard();
    await screen.findByRole('table');
    expect(screen.queryByText(text.mismatchNote)).toBeNull();
  });

  it('con muchas noches enseña 14 y abre el resto con un botón', async () => {
    const days = Array.from({ length: 20 }, (_, index) => `2026-10-${30 - index}`);
    fakeCloud(days.map((day) => night(day)));
    const typing = userEvent.setup();
    showCard();
    const table = await screen.findByRole('table');
    expect(within(table).getAllByRole('row')).toHaveLength(15);
    await typing.click(screen.getByRole('button', { name: text.showAll(20) }));
    expect(within(table).getAllByRole('row')).toHaveLength(21);
    await typing.click(screen.getByRole('button', { name: text.showFewer }));
    expect(within(table).getAllByRole('row')).toHaveLength(15);
  });

  it('sin noches dice cuándo aparecen', async () => {
    fakeCloud([]);
    showCard();
    expect(await screen.findByText(text.empty)).toBeVisible();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('sin la nube, como en la demostración, dice que no hay calibración y no pide nada', () => {
    const { calls } = fakeCloud([]);
    showCard({ cloud: false });
    expect(screen.getByText(text.local)).toBeVisible();
    expect(calls).toEqual([]);
  });

  it('mientras el tablero carga no pide nada', () => {
    const { calls } = fakeCloud([]);
    showCard({ ready: false });
    expect(calls).toEqual([]);
  });

  it('si la lectura falla lo dice con su botón de reintento y no tira el tablero', async () => {
    fakeCloud([], { code: '42501' });
    showCard();
    expect(await screen.findByText(text.failed)).toBeVisible();
    expect(screen.getByText(physicianText.errors.forbidden ?? '')).toBeVisible();
    expect(screen.getByRole('button')).toBeVisible();
  });
});
