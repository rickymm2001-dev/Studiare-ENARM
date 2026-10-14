// Facturas a pedido del alumno (B10 del plan del cambio, respuesta 12, 3.2). El alumno lee sus pagos y
// sus solicitudes por su permiso por fila y pide la factura de un pago con request_invoice, que vuelve
// a revisar cada dato. La app revisa el formato antes, para decirlo junto a cada campo. La factura la
// emite Ricardo a mano y aquí solo vive la solicitud con su estado.
//
// payments e invoice_requests también dejan ver todo al admin, así que las lecturas filtran por la
// cuenta de quien llama, para que un admin vea solo lo suyo en su Perfil.
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { CFDI_USES, TAX_REGIMES } from '@/config/cfdi';

export interface MyPayment {
  id: string;
  amountMxn: number;
  status: string;
  createdAt: string;
  paidAt: string | null;
  plan: string | null;
  purpose: string | null;
  method: string | null;
}

export interface MyInvoiceRequest {
  id: string;
  paymentId: string | null;
  status: 'pending' | 'issued' | 'rejected';
  adminNote: string | null;
  email: string;
  createdAt: string;
  issuedAt: string | null;
}

export interface InvoiceDraft {
  paymentId: string;
  rfc: string;
  legalName: string;
  taxRegime: string;
  postalCode: string;
  cfdiUse: string;
  email: string;
}

/** Los campos con los nombres que request_invoice manda en el detalle de IV001 */
export type InvoiceField =
  'payment' | 'rfc' | 'legal_name' | 'tax_regime' | 'postal_code' | 'cfdi_use' | 'email';

const FIELDS: readonly InvoiceField[] = [
  'payment',
  'rfc',
  'legal_name',
  'tax_regime',
  'postal_code',
  'cfdi_use',
  'email',
];

export type ReadFailure = 'network' | 'unknown';
export type RequestInvoiceResult =
  | { ok: true; id: string }
  | { ok: false; reason: 'invalid'; field: InvoiceField }
  | {
      ok: false;
      reason: 'not_payable' | 'duplicate' | 'not_active_device' | 'network' | 'unknown';
    };

const RFC = /^[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3}$/;
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const REGIMES = new Set(TAX_REGIMES.map((entry) => entry.code));
const USES = new Set(CFDI_USES.map((entry) => entry.code));

/** El RFC como lo guarda la base, en mayúsculas y sin espacios ni guiones */
export const normalizeRfc = (raw: string) => raw.replace(/[\s-]/g, '').toUpperCase();

/**
 * Los campos con un formato que la base rechazaría, en el orden del formulario. Vacío si todo está
 * bien. Es la misma revisión de request_invoice, para decirlo antes de mandar
 */
export function invalidInvoiceFields(draft: InvoiceDraft): InvoiceField[] {
  const invalid: InvoiceField[] = [];
  if (draft.paymentId.trim() === '') invalid.push('payment');
  if (!RFC.test(normalizeRfc(draft.rfc))) invalid.push('rfc');
  const name = draft.legalName.replace(/\s+/g, ' ').trim();
  if (name.length < 1 || name.length > 254) invalid.push('legal_name');
  if (!REGIMES.has(draft.taxRegime.trim())) invalid.push('tax_regime');
  if (!/^[0-9]{5}$/.test(draft.postalCode.trim())) invalid.push('postal_code');
  if (!USES.has(draft.cfdiUse.trim().toUpperCase())) invalid.push('cfdi_use');
  const email = draft.email.trim().toLowerCase();
  if (email.length > 254 || !EMAIL.test(email)) invalid.push('email');
  return invalid;
}

const PaymentRow = z.object({
  id: z.string(),
  amount_mxn: z.coerce.number(),
  status: z.string(),
  created_at: z.string(),
  paid_at: z.string().nullable().optional(),
  plan: z.string().nullable().optional(),
  purpose: z.string().nullable().optional(),
  method: z.string().nullable().optional(),
});

const RequestRow = z.object({
  id: z.string(),
  payment_id: z.string().nullable(),
  status: z.enum(['pending', 'issued', 'rejected']),
  admin_note: z.string().nullable().optional(),
  email: z.string(),
  created_at: z.string(),
  issued_at: z.string().nullable().optional(),
});

interface PostgrestError {
  code?: string | undefined;
  details?: string | undefined;
}

const readFailure = (error: PostgrestError): ReadFailure => (error.code ? 'unknown' : 'network');

/** Los pagos de quien llama, del más nuevo al más viejo */
export async function listMyPayments(
  cloud: Pick<SupabaseClient, 'from'>,
  authId: string,
): Promise<{ ok: true; payments: MyPayment[] } | { ok: false; reason: ReadFailure }> {
  try {
    const reply = await cloud
      .from('payments')
      .select('id, amount_mxn, status, created_at, paid_at, plan, purpose, method')
      .eq('user_id', authId)
      .order('created_at', { ascending: false });
    if (reply.error) return { ok: false, reason: readFailure(reply.error) };
    const parsed = z.array(PaymentRow).safeParse(reply.data);
    if (!parsed.success) return { ok: false, reason: 'unknown' };
    return {
      ok: true,
      payments: parsed.data.map((row) => ({
        id: row.id,
        amountMxn: row.amount_mxn,
        status: row.status,
        createdAt: row.created_at,
        paidAt: row.paid_at ?? null,
        plan: row.plan ?? null,
        purpose: row.purpose ?? null,
        method: row.method ?? null,
      })),
    };
  } catch {
    return { ok: false, reason: 'network' };
  }
}

/** Los pagos de los que se puede pedir factura. Pagados y mayores a 0, como pide request_invoice */
export const invoiceablePayments = (payments: readonly MyPayment[]) =>
  payments.filter((payment) => payment.status === 'paid' && payment.amountMxn > 0);

/** Las solicitudes de factura de quien llama, de la más nueva a la más vieja */
export async function listMyInvoiceRequests(
  cloud: Pick<SupabaseClient, 'from'>,
  authId: string,
): Promise<{ ok: true; requests: MyInvoiceRequest[] } | { ok: false; reason: ReadFailure }> {
  try {
    const reply = await cloud
      .from('invoice_requests')
      .select('id, payment_id, status, admin_note, email, created_at, issued_at')
      .eq('user_id', authId)
      .order('created_at', { ascending: false });
    if (reply.error) return { ok: false, reason: readFailure(reply.error) };
    const parsed = z.array(RequestRow).safeParse(reply.data);
    if (!parsed.success) return { ok: false, reason: 'unknown' };
    return {
      ok: true,
      requests: parsed.data.map((row) => ({
        id: row.id,
        paymentId: row.payment_id,
        status: row.status,
        adminNote: row.admin_note ?? null,
        email: row.email,
        createdAt: row.created_at,
        issuedAt: row.issued_at ?? null,
      })),
    };
  } catch {
    return { ok: false, reason: 'network' };
  }
}

/** Pide la factura de un pago. Traduce IV001 al campo que falló, IV002 e IV003 */
export async function requestInvoice(
  cloud: Pick<SupabaseClient, 'rpc'>,
  draft: InvoiceDraft,
): Promise<RequestInvoiceResult> {
  try {
    const reply = await cloud.rpc('request_invoice', {
      p_payment: draft.paymentId,
      p_rfc: normalizeRfc(draft.rfc),
      p_legal_name: draft.legalName.replace(/\s+/g, ' ').trim(),
      p_tax_regime: draft.taxRegime.trim(),
      p_postal_code: draft.postalCode.trim(),
      p_cfdi_use: draft.cfdiUse.trim().toUpperCase(),
      p_email: draft.email.trim().toLowerCase(),
    });
    if (reply.error) {
      const error = reply.error as PostgrestError;
      switch (error.code) {
        case 'IV001': {
          const field = FIELDS.find((name) => name === error.details) ?? 'payment';
          return { ok: false, reason: 'invalid', field };
        }
        case 'IV002':
          return { ok: false, reason: 'not_payable' };
        case 'IV003':
          return { ok: false, reason: 'duplicate' };
        case '42501':
          return { ok: false, reason: 'not_active_device' };
        default:
          return { ok: false, reason: error.code ? 'unknown' : 'network' };
      }
    }
    return typeof reply.data === 'string'
      ? { ok: true, id: reply.data }
      : { ok: false, reason: 'unknown' };
  } catch {
    return { ok: false, reason: 'network' };
  }
}
