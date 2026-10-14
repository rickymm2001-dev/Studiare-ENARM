// Admin, Pagos (B10 del plan del cambio, 3.3). Resumen de lugares Fundador, pruebas y pases, solicitudes
// de factura, códigos de influencer y pagos recientes. Todo sale de funciones de la base que revisan
// is_admin por dentro y responden 42501 a cualquier otro. Aquí solo se llaman y se traducen sus errores.
// La columna Registros de los códigos sale de admin_influencer_code_counts de B9, y si esa función no
// existe la columna se omite sola.
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

type Rpc = Pick<SupabaseClient, 'rpc'>;

export type AdminFailure = 'not_admin' | 'no_session' | 'network' | 'unknown';
export type AdminResult<T> = { ok: true; value: T } | { ok: false; reason: AdminFailure };

export const PAYMENTS_PAGE_SIZE = 50;
export const INVOICES_PAGE_SIZE = 50;

interface RpcError {
  code?: string | undefined;
}

function failureOf(error: RpcError): AdminFailure {
  if (error.code === '42501') return 'not_admin';
  if (error.code === '28000') return 'no_session';
  // Sin código es que la petición ni llegó al servidor
  if (!error.code) return 'network';
  return 'unknown';
}

const count = z.coerce.number().int().nonnegative();

const SummarySchema = z.object({
  founder: z.object({ total: count, held: count, confirmed: count, open: z.boolean() }),
  activeTrials: count,
  activePasses: count,
  needsRefund: count,
  pendingActions: count,
  failedActions: count,
  pendingInvoices: count,
});
export type BillingSummary = z.infer<typeof SummarySchema>;

const PaymentRow = z.object({
  id: z.string(),
  user_id: z.string(),
  alias: z.string().nullable(),
  plan: z.string().nullable(),
  purpose: z.string().nullable(),
  method: z.string().nullable(),
  provider: z.string(),
  amount_mxn: z.coerce.number(),
  discount_mxn: z.coerce.number().nullable(),
  promotion_code: z.string().nullable(),
  status: z.string(),
  paid_at: z.string().nullable(),
  created_at: z.string(),
  total: z.coerce.number(),
});

export interface AdminPayment {
  id: string;
  alias: string | null;
  plan: string | null;
  purpose: string | null;
  method: string | null;
  provider: string;
  amountMxn: number;
  discountMxn: number | null;
  promotionCode: string | null;
  status: string;
  paidAt: string | null;
  createdAt: string;
}

const CodeRow = z.object({
  code: z.string(),
  trials: z.coerce.number(),
  payments: z.coerce.number(),
  paying_users: z.coerce.number(),
  revenue_mxn: z.coerce.number(),
});
const SignupCodeRow = z.object({ code: z.string(), total: z.coerce.number() });

export interface PromotionCodeStat {
  code: string;
  /** Registros con el código en Cómo nos conociste (B9). null si esa función no existe */
  signups: number | null;
  trials: number;
  payments: number;
  payingUsers: number;
  revenueMxn: number;
}

const InvoiceRow = z.object({
  id: z.string(),
  user_id: z.string(),
  alias: z.string().nullable(),
  account_email: z.string().nullable(),
  payment_id: z.string().nullable(),
  amount_mxn: z.coerce.number().nullable(),
  paid_at: z.string().nullable(),
  plan: z.string().nullable(),
  method: z.string().nullable(),
  rfc: z.string(),
  legal_name: z.string(),
  tax_regime: z.string(),
  postal_code: z.string(),
  cfdi_use: z.string(),
  email: z.string(),
  status: z.enum(['pending', 'issued', 'rejected']),
  admin_note: z.string().nullable(),
  created_at: z.string(),
  issued_at: z.string().nullable(),
  total: z.coerce.number(),
});
export type InvoiceStatus = z.infer<typeof InvoiceRow>['status'];

export interface AdminInvoiceRequest {
  id: string;
  alias: string | null;
  accountEmail: string | null;
  paymentId: string | null;
  amountMxn: number | null;
  paidAt: string | null;
  plan: string | null;
  method: string | null;
  rfc: string;
  legalName: string;
  taxRegime: string;
  postalCode: string;
  cfdiUse: string;
  email: string;
  status: InvoiceStatus;
  adminNote: string | null;
  createdAt: string;
  issuedAt: string | null;
}

export async function readBillingSummary(cloud: Rpc): Promise<AdminResult<BillingSummary>> {
  try {
    const reply = await cloud.rpc('admin_billing_summary');
    if (reply.error) return { ok: false, reason: failureOf(reply.error) };
    const parsed = SummarySchema.safeParse(reply.data);
    return parsed.success ? { ok: true, value: parsed.data } : { ok: false, reason: 'unknown' };
  } catch {
    return { ok: false, reason: 'network' };
  }
}

export async function listRecentPayments(
  cloud: Rpc,
  page = 0,
): Promise<AdminResult<{ payments: AdminPayment[]; total: number }>> {
  try {
    const reply = await cloud.rpc('admin_recent_payments', {
      p_limit: PAYMENTS_PAGE_SIZE,
      p_offset: Math.max(0, page) * PAYMENTS_PAGE_SIZE,
    });
    if (reply.error) return { ok: false, reason: failureOf(reply.error) };
    const parsed = z.array(PaymentRow).safeParse(reply.data);
    if (!parsed.success) return { ok: false, reason: 'unknown' };
    return {
      ok: true,
      value: {
        total: parsed.data[0]?.total ?? 0,
        payments: parsed.data.map((row) => ({
          id: row.id,
          alias: row.alias,
          plan: row.plan,
          purpose: row.purpose,
          method: row.method,
          provider: row.provider,
          amountMxn: row.amount_mxn,
          discountMxn: row.discount_mxn,
          promotionCode: row.promotion_code,
          status: row.status,
          paidAt: row.paid_at,
          createdAt: row.created_at,
        })),
      },
    };
  } catch {
    return { ok: false, reason: 'network' };
  }
}

/** Marca como devuelto un pago que la pasarela no reembolsa, como OXXO (8.7). La nota es obligatoria */
export async function markPaymentRefunded(
  cloud: Rpc,
  paymentId: string,
  note: string,
): Promise<AdminResult<'refunded' | 'already_refunded'> | { ok: false; reason: 'invalid' }> {
  try {
    const reply = await cloud.rpc('admin_mark_payment_refunded', {
      p_payment: paymentId,
      p_note: note.trim(),
    });
    if (reply.error) {
      return reply.error.code === '22023'
        ? { ok: false, reason: 'invalid' }
        : { ok: false, reason: failureOf(reply.error) };
    }
    const data: unknown = reply.data;
    return data === 'refunded' || data === 'already_refunded'
      ? { ok: true, value: data }
      : { ok: false, reason: 'unknown' };
  } catch {
    return { ok: false, reason: 'network' };
  }
}

/** Las cifras por código. Los registros de B9 solo si su función existe y contesta */
export async function readPromotionCodeStats(
  cloud: Rpc,
): Promise<AdminResult<{ codes: PromotionCodeStat[]; withSignups: boolean }>> {
  try {
    const [stats, signups] = await Promise.all([
      cloud.rpc('admin_promotion_code_stats'),
      cloud.rpc('admin_influencer_code_counts'),
    ]);
    if (stats.error) return { ok: false, reason: failureOf(stats.error) };
    const parsed = z.array(CodeRow).safeParse(stats.data);
    if (!parsed.success) return { ok: false, reason: 'unknown' };
    const signupRows = signups.error ? null : z.array(SignupCodeRow).safeParse(signups.data);
    const bySignup = signupRows?.success
      ? new Map(signupRows.data.map((row) => [row.code.toUpperCase(), row.total]))
      : null;
    const codes: PromotionCodeStat[] = parsed.data.map((row) => ({
      code: row.code,
      signups: bySignup ? (bySignup.get(row.code.toUpperCase()) ?? 0) : null,
      trials: row.trials,
      payments: row.payments,
      payingUsers: row.paying_users,
      revenueMxn: row.revenue_mxn,
    }));
    // Un código con registros y todavía sin pruebas ni pagos también cuenta para el influencer
    if (bySignup) {
      for (const [code, total] of bySignup) {
        if (codes.some((item) => item.code.toUpperCase() === code)) continue;
        codes.push({
          code,
          signups: total,
          trials: 0,
          payments: 0,
          payingUsers: 0,
          revenueMxn: 0,
        });
      }
    }
    return { ok: true, value: { codes, withSignups: bySignup !== null } };
  } catch {
    return { ok: false, reason: 'network' };
  }
}

export async function listInvoiceRequests(
  cloud: Rpc,
  input: { status: InvoiceStatus | null; page?: number },
): Promise<AdminResult<{ requests: AdminInvoiceRequest[]; total: number }>> {
  try {
    const reply = await cloud.rpc('admin_invoice_requests', {
      p_status: input.status,
      p_limit: INVOICES_PAGE_SIZE,
      p_offset: Math.max(0, input.page ?? 0) * INVOICES_PAGE_SIZE,
    });
    if (reply.error) return { ok: false, reason: failureOf(reply.error) };
    const parsed = z.array(InvoiceRow).safeParse(reply.data);
    if (!parsed.success) return { ok: false, reason: 'unknown' };
    return {
      ok: true,
      value: {
        total: parsed.data[0]?.total ?? 0,
        requests: parsed.data.map((row) => ({
          id: row.id,
          alias: row.alias,
          accountEmail: row.account_email,
          paymentId: row.payment_id,
          amountMxn: row.amount_mxn,
          paidAt: row.paid_at,
          plan: row.plan,
          method: row.method,
          rfc: row.rfc,
          legalName: row.legal_name,
          taxRegime: row.tax_regime,
          postalCode: row.postal_code,
          cfdiUse: row.cfdi_use,
          email: row.email,
          status: row.status,
          adminNote: row.admin_note,
          createdAt: row.created_at,
          issuedAt: row.issued_at,
        })),
      },
    };
  } catch {
    return { ok: false, reason: 'network' };
  }
}

/** Marca una solicitud como emitida, rechazada o de nuevo pendiente, con una nota opcional */
export async function setInvoiceStatus(
  cloud: Rpc,
  input: { id: string; status: InvoiceStatus; note: string | null },
): Promise<{ ok: true } | { ok: false; reason: AdminFailure | 'duplicate' | 'invalid' }> {
  try {
    const reply = await cloud.rpc('admin_set_invoice_status', {
      p_id: input.id,
      p_status: input.status,
      p_note: input.note === null || input.note.trim() === '' ? null : input.note.trim(),
    });
    if (reply.error) {
      if (reply.error.code === 'IV003') return { ok: false, reason: 'duplicate' };
      if (reply.error.code === '22023') return { ok: false, reason: 'invalid' };
      return { ok: false, reason: failureOf(reply.error) };
    }
    return { ok: true };
  } catch {
    return { ok: false, reason: 'network' };
  }
}
