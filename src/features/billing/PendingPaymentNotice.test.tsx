// @vitest-environment jsdom
// El aviso del pase que venció sin pago (B10). my_plan solo manda voucher_expired, así que el aviso busca
// en los pagos del alumno el método del que venció y lo dice con sus palabras, sin llamar ficha OXXO a
// una transferencia SPEI o a un pago de Mercado Pago.
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCloud } from '@/app/cloudState';
import type { Subscription } from '@/data/schemas/people';
import { billingCloudText } from '@/i18n/billingCloud';
import { t } from '@/i18n/es-MX';
import { PendingPaymentNotice } from './PendingPaymentNotice';

const holder = vi.hoisted((): { cloud: unknown } => ({ cloud: null }));
vi.mock('@/data/cloud/client', () => ({
  getCloud: () => holder.cloud,
  cloudConfigured: () => holder.cloud !== null,
  loadCloud: () => Promise.resolve(holder.cloud),
}));

const AUTH = '11111111-1111-4111-8111-111111111111';
const expiredText = billingCloudText.pending.voucherExpired;

const expired: Subscription = {
  userId: '01J9Z000000000000000000001',
  plan: 'free',
  status: 'none',
  isSimulated: false,
  periodEnd: null,
  issue: 'voucher_expired',
  updatedAt: '2026-10-14T00:00:00.000Z',
};

const payment = (patch: Record<string, unknown>) => ({
  id: 'pago-1',
  amount_mxn: 149,
  status: 'expired',
  created_at: '2026-10-10T15:00:00.000Z',
  paid_at: null,
  plan: 'monthly',
  purpose: 'pass',
  method: 'oxxo',
  ...patch,
});

/** La nube con los pagos del alumno, como payments con su permiso por fila */
function cloudWith(payments: unknown[] | 'error') {
  const reads: string[] = [];
  holder.cloud = {
    from: (table: string) => {
      reads.push(table);
      const query = {
        select: () => query,
        eq: () => query,
        order: () =>
          Promise.resolve(
            payments === 'error'
              ? { data: null, error: { code: '08006', message: 'sin red' } }
              : { data: payments, error: null },
          ),
      };
      return query;
    },
  };
  return reads;
}

beforeEach(() => {
  useCloud.setState({
    state: {
      status: 'linked',
      identity: { authId: AUTH, email: 'ana@ejemplo.mx', role: 'student', alias: null },
    },
  });
});
afterEach(() => {
  cleanup();
  holder.cloud = null;
  useCloud.setState({ state: { status: 'off' } });
});

describe('aviso del pase que venció sin pago', () => {
  it('una transferencia SPEI vencida se dice como transferencia y no como ficha OXXO', async () => {
    cloudWith([
      payment({ id: 'viejo', method: 'oxxo', created_at: '2026-09-01T15:00:00.000Z' }),
      payment({ id: 'nuevo', method: 'spei', created_at: '2026-10-10T15:00:00.000Z' }),
    ]);
    render(<PendingPaymentNotice subscription={expired} />);
    expect(await screen.findByRole('status')).toHaveTextContent(expiredText.spei);
    expect(screen.queryByText(/ficha OXXO/)).toBeNull();
  });

  it('un pago de Mercado Pago vencido se dice como de Mercado Pago', async () => {
    cloudWith([payment({ method: 'mercadopago' })]);
    render(<PendingPaymentNotice subscription={expired} />);
    expect(await screen.findByRole('status')).toHaveTextContent(expiredText.mercadopago);
  });

  it('una ficha OXXO vencida se dice como ficha', async () => {
    cloudWith([payment({ method: 'oxxo' }), payment({ id: 'pagado', status: 'paid' })]);
    render(<PendingPaymentNotice subscription={expired} />);
    expect(await screen.findByRole('status')).toHaveTextContent(expiredText.oxxo);
  });

  it('si no se pueden leer los pagos lo dice sin nombrar un método', async () => {
    cloudWith('error');
    render(<PendingPaymentNotice subscription={expired} />);
    expect(await screen.findByRole('status')).toHaveTextContent(expiredText.unknown);
  });

  it('con un pago pendiente no busca nada y dice el pendiente', () => {
    const reads = cloudWith([]);
    render(
      <PendingPaymentNotice
        subscription={{
          ...expired,
          pendingPayment: {
            method: 'spei',
            plan: 'monthly',
            amountMxn: 149,
            expiresAt: null,
            createdAt: '2026-10-14T15:00:00.000Z',
          },
        }}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent(
      billingCloudText.pending.spei(t.billing.price(149)),
    );
    expect(reads).toEqual([]);
  });
});
