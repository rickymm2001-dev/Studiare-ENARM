// Admin, Pagos (B10, 3.3). Cada lectura llama a su función de la base, 42501 es que no es admin y la
// columna Registros de los códigos solo aparece si existe la función de B9.
import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import {
  listInvoiceRequests,
  listRecentPayments,
  markPaymentRefunded,
  readBillingSummary,
  readPromotionCodeStats,
  setInvoiceStatus,
} from './adminBilling';

type Reply = { data?: unknown; error?: unknown } | Error;

function fakeCloud(replies: Record<string, Reply>) {
  const calls: [string, unknown][] = [];
  const cloud = {
    rpc: (name: string, args?: unknown) => {
      calls.push([name, args]);
      const reply = replies[name] ?? { error: { code: 'PGRST202' } };
      return reply instanceof Error
        ? Promise.reject(reply)
        : Promise.resolve({ data: reply.data ?? null, error: reply.error ?? null });
    },
  } as unknown as SupabaseClient;
  return { cloud, calls };
}

const NOT_ADMIN = {
  error: { code: '42501', message: 'Solo un administrador puede ver los pagos' },
};

const SUMMARY = {
  founder: { total: 100, held: 3, confirmed: 34, open: true },
  activeTrials: 3,
  activePasses: 5,
  needsRefund: 0,
  pendingActions: 0,
  failedActions: 1,
  pendingInvoices: 2,
};

describe('Admin, Pagos', () => {
  it('quien no es admin recibe not_admin en cada lectura, y sin red es network', async () => {
    const { cloud } = fakeCloud({
      admin_billing_summary: NOT_ADMIN,
      admin_recent_payments: NOT_ADMIN,
      admin_promotion_code_stats: NOT_ADMIN,
      admin_invoice_requests: NOT_ADMIN,
    });
    for (const result of [
      await readBillingSummary(cloud),
      await listRecentPayments(cloud),
      await readPromotionCodeStats(cloud),
      await listInvoiceRequests(cloud, { status: null }),
    ]) {
      expect(result).toEqual({ ok: false, reason: 'not_admin' });
    }
    expect(
      await readBillingSummary(fakeCloud({ admin_billing_summary: new Error('red') }).cloud),
    ).toEqual({ ok: false, reason: 'network' });
    expect(
      await readBillingSummary(
        fakeCloud({ admin_billing_summary: { error: { code: '28000' } } }).cloud,
      ),
    ).toEqual({ ok: false, reason: 'no_session' });
  });

  it('lee el resumen de lugares Fundador, pruebas, pases y pendientes', async () => {
    expect(
      await readBillingSummary(fakeCloud({ admin_billing_summary: { data: SUMMARY } }).cloud),
    ).toEqual({ ok: true, value: SUMMARY });
    expect(
      await readBillingSummary(
        fakeCloud({ admin_billing_summary: { data: { founder: 1 } } }).cloud,
      ),
    ).toEqual({ ok: false, reason: 'unknown' });
  });

  it('lee los pagos recientes por página de 50, con su descuento y su código', async () => {
    const { cloud, calls } = fakeCloud({
      admin_recent_payments: {
        data: [
          {
            id: 'p1',
            user_id: 'u1',
            alias: 'Ana',
            plan: 'founder',
            purpose: 'subscription',
            method: 'card',
            provider: 'stripe',
            amount_mxn: '71.10',
            discount_mxn: '7.90',
            promotion_code: 'PRUEBA10',
            status: 'paid',
            paid_at: '2026-10-14T00:00:00Z',
            created_at: '2026-10-14T00:00:00Z',
            total: 1,
          },
        ],
      },
    });
    const result = await listRecentPayments(cloud, 1);
    expect(calls).toEqual([['admin_recent_payments', { p_limit: 50, p_offset: 50 }]]);
    expect(result).toMatchObject({
      ok: true,
      value: {
        total: 1,
        payments: [
          {
            id: 'p1',
            amountMxn: 71.1,
            discountMxn: 7.9,
            promotionCode: 'PRUEBA10',
            status: 'paid',
          },
        ],
      },
    });
  });

  it('marca devuelto un pago con su nota, y una nota vacía o un pago no cobrado es invalid', async () => {
    const { cloud, calls } = fakeCloud({ admin_mark_payment_refunded: { data: 'refunded' } });
    expect(await markPaymentRefunded(cloud, 'p1', '  Transferencia 123  ')).toEqual({
      ok: true,
      value: 'refunded',
    });
    expect(calls).toEqual([
      ['admin_mark_payment_refunded', { p_payment: 'p1', p_note: 'Transferencia 123' }],
    ]);
    expect(
      await markPaymentRefunded(
        fakeCloud({ admin_mark_payment_refunded: { error: { code: '22023' } } }).cloud,
        'p1',
        '',
      ),
    ).toEqual({ ok: false, reason: 'invalid' });
  });

  it('los códigos traen la columna Registros solo si existe la función de B9', async () => {
    const stats = {
      data: [{ code: 'PRUEBA10', trials: 1, payments: 2, paying_users: 2, revenue_mxn: '142.20' }],
    };
    const withB9 = await readPromotionCodeStats(
      fakeCloud({
        admin_promotion_code_stats: stats,
        admin_influencer_code_counts: {
          data: [
            { code: 'PRUEBA10', total: 7 },
            { code: 'NUEVO', total: 3 },
          ],
        },
      }).cloud,
    );
    expect(withB9).toEqual({
      ok: true,
      value: {
        withSignups: true,
        codes: [
          {
            code: 'PRUEBA10',
            signups: 7,
            trials: 1,
            payments: 2,
            payingUsers: 2,
            revenueMxn: 142.2,
          },
          { code: 'NUEVO', signups: 3, trials: 0, payments: 0, payingUsers: 0, revenueMxn: 0 },
        ],
      },
    });
    // Sin la función de B9 la columna se omite sola
    const withoutB9 = await readPromotionCodeStats(
      fakeCloud({ admin_promotion_code_stats: stats }).cloud,
    );
    expect(withoutB9).toEqual({
      ok: true,
      value: {
        withSignups: false,
        codes: [
          {
            code: 'PRUEBA10',
            signups: null,
            trials: 1,
            payments: 2,
            payingUsers: 2,
            revenueMxn: 142.2,
          },
        ],
      },
    });
  });

  it('lee las solicitudes de factura con su filtro y cambia su estado', async () => {
    const row = {
      id: 'r1',
      user_id: 'u1',
      alias: 'Ana',
      account_email: 'ana@ejemplo.mx',
      payment_id: 'p1',
      amount_mxn: 79,
      paid_at: '2026-10-14T00:00:00Z',
      plan: 'founder',
      method: 'card',
      rfc: 'XAXX010101000',
      legal_name: 'ANA LÓPEZ',
      tax_regime: '612',
      postal_code: '97000',
      cfdi_use: 'G03',
      email: 'ana@ejemplo.mx',
      status: 'pending',
      admin_note: null,
      created_at: '2026-10-14T00:00:00Z',
      issued_at: null,
      total: 1,
    };
    const { cloud, calls } = fakeCloud({
      admin_invoice_requests: { data: [row] },
      admin_set_invoice_status: { data: null },
    });
    const list = await listInvoiceRequests(cloud, { status: 'pending' });
    expect(list).toMatchObject({
      ok: true,
      value: { total: 1, requests: [{ id: 'r1', legalName: 'ANA LÓPEZ', status: 'pending' }] },
    });
    expect(await setInvoiceStatus(cloud, { id: 'r1', status: 'rejected', note: ' RFC ' })).toEqual({
      ok: true,
    });
    expect(calls).toEqual([
      ['admin_invoice_requests', { p_status: 'pending', p_limit: 50, p_offset: 0 }],
      ['admin_set_invoice_status', { p_id: 'r1', p_status: 'rejected', p_note: 'RFC' }],
    ]);
    expect(
      await setInvoiceStatus(
        fakeCloud({ admin_set_invoice_status: { error: { code: 'IV003' } } }).cloud,
        { id: 'r1', status: 'pending', note: null },
      ),
    ).toEqual({ ok: false, reason: 'duplicate' });
    expect(
      await setInvoiceStatus(fakeCloud({ admin_set_invoice_status: NOT_ADMIN }).cloud, {
        id: 'r1',
        status: 'issued',
        note: null,
      }),
    ).toEqual({ ok: false, reason: 'not_admin' });
  });
});
