// Facturas del alumno (B10, respuesta 12, 3.2). La app revisa el formato como request_invoice, lee solo
// lo propio aunque sea admin y traduce IV001 a IV003.
import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import {
  invalidInvoiceFields,
  invoiceablePayments,
  listMyInvoiceRequests,
  listMyPayments,
  normalizeRfc,
  requestInvoice,
  type InvoiceDraft,
  type MyPayment,
} from './invoices';

const AUTH = '11111111-1111-4111-8111-111111111111';
const PAYMENT = '22222222-2222-4222-8222-222222222222';

const draft = (patch: Partial<InvoiceDraft> = {}): InvoiceDraft => ({
  paymentId: PAYMENT,
  rfc: 'XAXX010101000',
  legalName: 'Ana López',
  taxRegime: '612',
  postalCode: '97000',
  cfdiUse: 'G03',
  email: 'ana@ejemplo.mx',
  ...patch,
});

/** Un cliente con from().select().eq().order() y rpc(), que guarda lo que se pidió */
function fakeCloud(reply: { data?: unknown; error?: unknown } | Error) {
  const calls: {
    table?: string;
    select?: string;
    eq?: [string, unknown];
    rpc?: [string, unknown];
  } = {};
  const result = () =>
    reply instanceof Error
      ? Promise.reject(reply)
      : Promise.resolve({ data: reply.data ?? null, error: reply.error ?? null });
  const cloud = {
    from: (table: string) => {
      calls.table = table;
      const query = {
        select: (columns: string) => {
          calls.select = columns;
          return query;
        },
        eq: (column: string, value: unknown) => {
          calls.eq = [column, value];
          return query;
        },
        order: () => result(),
      };
      return query;
    },
    rpc: (name: string, args: unknown) => {
      calls.rpc = [name, args];
      return result();
    },
  } as unknown as SupabaseClient;
  return { cloud, calls };
}

describe('formato de la solicitud', () => {
  it('acepta un RFC de persona física o moral, en minúsculas, con espacios o guiones', () => {
    expect(invalidInvoiceFields(draft())).toEqual([]);
    expect(invalidInvoiceFields(draft({ rfc: 'abc 010101 a1b' }))).toEqual([]);
    expect(invalidInvoiceFields(draft({ rfc: 'ÑAB-010101-AB1' }))).toEqual([]);
    expect(normalizeRfc(' xaxx-010101 000 ')).toBe('XAXX010101000');
  });

  it('marca cada campo con un formato que la base rechazaría, en el orden del formulario', () => {
    expect(
      invalidInvoiceFields(
        draft({
          paymentId: '',
          rfc: 'XAXX0101',
          legalName: '   ',
          taxRegime: '999',
          postalCode: '9700',
          cfdiUse: 'Z99',
          email: 'ana@',
        }),
      ),
    ).toEqual(['payment', 'rfc', 'legal_name', 'tax_regime', 'postal_code', 'cfdi_use', 'email']);
    expect(invalidInvoiceFields(draft({ postalCode: '97a00' }))).toEqual(['postal_code']);
    expect(invalidInvoiceFields(draft({ legalName: 'A'.repeat(255) }))).toEqual(['legal_name']);
  });

  it('solo se factura un pago pagado y mayor a 0', () => {
    const payment = (patch: Partial<MyPayment>): MyPayment => ({
      id: 'p',
      amountMxn: 79,
      status: 'paid',
      createdAt: '2026-10-14T00:00:00Z',
      paidAt: null,
      plan: 'founder',
      purpose: 'subscription',
      method: 'card',
      ...patch,
    });
    const list = [
      payment({ id: 'pagado' }),
      payment({ id: 'cero', amountMxn: 0 }),
      payment({ id: 'pendiente', status: 'pending' }),
      payment({ id: 'devuelto', status: 'refunded' }),
    ];
    expect(invoiceablePayments(list).map((item) => item.id)).toEqual(['pagado']);
  });
});

describe('lecturas del alumno', () => {
  it('lee sus pagos filtrando por su cuenta, porque el admin ve todos', async () => {
    const { cloud, calls } = fakeCloud({
      data: [
        {
          id: PAYMENT,
          amount_mxn: '71.10',
          status: 'paid',
          created_at: '2026-10-14T00:00:00Z',
          paid_at: '2026-10-14T00:00:01Z',
          plan: 'founder',
          purpose: 'subscription',
          method: 'card',
        },
      ],
    });
    expect(await listMyPayments(cloud, AUTH)).toEqual({
      ok: true,
      payments: [
        {
          id: PAYMENT,
          amountMxn: 71.1,
          status: 'paid',
          createdAt: '2026-10-14T00:00:00Z',
          paidAt: '2026-10-14T00:00:01Z',
          plan: 'founder',
          purpose: 'subscription',
          method: 'card',
        },
      ],
    });
    expect(calls.table).toBe('payments');
    expect(calls.eq).toEqual(['user_id', AUTH]);
  });

  it('lee sus solicitudes filtrando por su cuenta', async () => {
    const { cloud, calls } = fakeCloud({
      data: [
        {
          id: 'r1',
          payment_id: PAYMENT,
          status: 'rejected',
          admin_note: 'El RFC no coincide',
          email: 'ana@ejemplo.mx',
          created_at: '2026-10-14T00:00:00Z',
          issued_at: null,
        },
      ],
    });
    expect(await listMyInvoiceRequests(cloud, AUTH)).toEqual({
      ok: true,
      requests: [
        {
          id: 'r1',
          paymentId: PAYMENT,
          status: 'rejected',
          adminNote: 'El RFC no coincide',
          email: 'ana@ejemplo.mx',
          createdAt: '2026-10-14T00:00:00Z',
          issuedAt: null,
        },
      ],
    });
    expect(calls.table).toBe('invoice_requests');
    expect(calls.eq).toEqual(['user_id', AUTH]);
  });

  it('una lectura que falla no tira la tarjeta', async () => {
    expect(await listMyPayments(fakeCloud({ error: { code: '42P01' } }).cloud, AUTH)).toEqual({
      ok: false,
      reason: 'unknown',
    });
    expect(await listMyPayments(fakeCloud(new Error('sin red')).cloud, AUTH)).toEqual({
      ok: false,
      reason: 'network',
    });
    expect(await listMyInvoiceRequests(fakeCloud({ data: [{ id: 1 }] }).cloud, AUTH)).toEqual({
      ok: false,
      reason: 'unknown',
    });
  });
});

describe('pedir la factura', () => {
  it('manda los datos normalizados a request_invoice y devuelve el id', async () => {
    const { cloud, calls } = fakeCloud({ data: 'solicitud-1' });
    expect(
      await requestInvoice(
        cloud,
        draft({ rfc: 'xaxx 010101 000', legalName: '  Ana   López ', email: ' Ana@Ejemplo.MX ' }),
      ),
    ).toEqual({ ok: true, id: 'solicitud-1' });
    expect(calls.rpc).toEqual([
      'request_invoice',
      {
        p_payment: PAYMENT,
        p_rfc: 'XAXX010101000',
        p_legal_name: 'Ana López',
        p_tax_regime: '612',
        p_postal_code: '97000',
        p_cfdi_use: 'G03',
        p_email: 'ana@ejemplo.mx',
      },
    ]);
  });

  it('IV001 dice el campo, IV002 que no se factura, IV003 que ya la pidió', async () => {
    const reply = (error: unknown) => requestInvoice(fakeCloud({ error }).cloud, draft());
    expect(await reply({ code: 'IV001', details: 'postal_code' })).toEqual({
      ok: false,
      reason: 'invalid',
      field: 'postal_code',
    });
    expect(await reply({ code: 'IV001', details: 'otro' })).toEqual({
      ok: false,
      reason: 'invalid',
      field: 'payment',
    });
    expect(await reply({ code: 'IV002' })).toEqual({ ok: false, reason: 'not_payable' });
    expect(await reply({ code: 'IV003' })).toEqual({ ok: false, reason: 'duplicate' });
    expect(await reply({ code: '42501' })).toEqual({ ok: false, reason: 'not_active_device' });
    expect(await reply({ code: 'XX000' })).toEqual({ ok: false, reason: 'unknown' });
    expect(await reply({ message: 'Failed to fetch' })).toEqual({ ok: false, reason: 'network' });
    expect(await requestInvoice(fakeCloud(new Error('sin red')).cloud, draft())).toEqual({
      ok: false,
      reason: 'network',
    });
  });
});
