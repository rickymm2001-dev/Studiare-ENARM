// Correos de pagos (B10 del plan del cambio, 4 del diseño).
//
// Aquí viven las plantillas y la interfaz del envío. La base deja cada correo en la cola email_outbox
// (migración 20261022000001) con su tipo y unos pocos datos, fechas, montos y plan, nunca correos ni RFC.
// B15 agrega quien los manda de verdad (Resend), la función que toma la cola con claim_email_batch,
// resuelve el destinatario con la llave de servicio, arma el correo con renderEmail y lo cierra con
// finish_email. En B10 solo existe noopSender, que no manda nada. No depende de Deno, así se prueba con
// Vitest (D-096).
//
// Los tipos de correo viven en la tabla email_kinds. La tabla ya trae content_report (B11) y
// daily_review_reminder (B15), que suman aquí su plantilla en su bloque
import { PLAN_PRICES_MXN, isPaidPlan, type PaidPlan } from './billingTypes.ts';
import { subscriptionUrl } from './http.ts';
import { GUARANTEE_DAYS } from './stripe.ts';

export type EmailKind = 'trial_ending' | 'pass_expiring' | 'invoice_requested';

export const EMAIL_KINDS: readonly EmailKind[] = [
  'trial_ending',
  'pass_expiring',
  'invoice_requested',
];

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
  /** El dedupe_key de la cola, para el encabezado Idempotency-Key de Resend */
  idempotencyKey: string;
  tags: { name: string; value: string }[];
}

export interface EmailSender {
  send(message: EmailMessage): Promise<{ id: string }>;
}

export interface EmailContext {
  /** Dirección pública de la app (APP_URL) */
  appUrl: string;
  /** Correo de ayuda que se muestra al pie, o null para no mostrar ninguno */
  supportEmail: string | null;
  /** El alias del alumno para el saludo, o null para saludar sin nombre */
  alias: string | null;
}

export type RenderedEmail = Pick<EmailMessage, 'subject' | 'text' | 'html' | 'tags'>;

/** Nombre de cada plan como lo ve el alumno, igual que en la app */
const PLAN_NAMES: Record<PaidPlan, string> = {
  founder: 'Mensual Fundador',
  founder_annual: 'Anual Fundador',
  monthly: 'Mensual',
  annual: 'Anual',
};

const longDate = new Intl.DateTimeFormat('es-MX', {
  dateStyle: 'long',
  timeZone: 'America/Mexico_City',
});

const pesos = (amount: number) =>
  `$${amount.toLocaleString('es-MX', { maximumFractionDigits: 2 })} MXN`;

/** Un dato que no viene o no se entiende. B15 deja el correo en failed con este motivo */
class MissingEmailData extends Error {
  constructor(kind: EmailKind, field: string) {
    super(`Falta ${field} para el correo ${kind}`);
    this.name = 'MissingEmailData';
  }
}

function dateOf(kind: EmailKind, data: Record<string, unknown>, field: string): string {
  const value = data[field];
  const time = typeof value === 'string' ? Date.parse(value) : Number.NaN;
  if (Number.isNaN(time)) throw new MissingEmailData(kind, field);
  return longDate.format(new Date(time));
}

function amountOf(data: Record<string, unknown>): number | null {
  const value = data.amountMxn;
  const amount =
    typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

function planOf(kind: EmailKind, data: Record<string, unknown>): PaidPlan {
  if (!isPaidPlan(data.plan)) throw new MissingEmailData(kind, 'plan');
  return data.plan;
}

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

/** El saludo con el alias, que escribe el alumno y por eso se limpia */
function greeting(alias: string | null): string {
  const clean = (alias ?? '').replace(/\s+/g, ' ').trim().slice(0, 60);
  return clean === '' ? 'Hola.' : `Hola, ${clean}.`;
}

interface Template {
  subject: string;
  /** Párrafos del cuerpo, en texto plano */
  paragraphs: string[];
  /** El botón del correo */
  link: { label: string; url: string };
}

function template(kind: EmailKind, data: Record<string, unknown>, ctx: EmailContext): Template {
  switch (kind) {
    case 'trial_ending': {
      const date = dateOf(kind, data, 'trialEnd');
      const plan = planOf(kind, data);
      const amount = pesos(amountOf(data) ?? PLAN_PRICES_MXN[plan]);
      return {
        subject: `Tu prueba gratis de Studiare termina el ${date}`,
        paragraphs: [
          greeting(ctx.alias),
          `Tu prueba gratis termina el ${date}. Ese día se cobran ${amount} a tu tarjeta y tu plan ${PLAN_NAMES[plan]} sigue sin cortes.`,
          `Si no quieres continuar, cancela antes en Studiare, Suscripción, Administrar suscripción. Después del primer cobro tienes ${GUARANTEE_DAYS} días de garantía.`,
        ],
        link: { label: 'Ver mi suscripción', url: subscriptionUrl(ctx.appUrl) },
      };
    }
    case 'pass_expiring': {
      const date = dateOf(kind, data, 'passEnd');
      const plan = planOf(kind, data);
      const length = plan === 'annual' || plan === 'founder_annual' ? '1 año' : '1 mes';
      return {
        subject: `Tu pase de Studiare vence el ${date}`,
        paragraphs: [
          greeting(ctx.alias),
          `Tu pase de ${length} vence el ${date}.`,
          'Para no perder tu plan, paga otro periodo con OXXO o SPEI, o cámbiate a tarjeta con renovación automática en Suscripción.',
        ],
        link: { label: 'Ir a Suscripción', url: subscriptionUrl(ctx.appUrl) },
      };
    }
    case 'invoice_requested': {
      const amount = amountOf(data);
      if (amount === null) throw new MissingEmailData(kind, 'amountMxn');
      // Para el equipo. Sin RFC ni datos fiscales, que se ven solo dentro de la app
      return {
        subject: 'Nueva solicitud de factura',
        paragraphs: [
          `Hay una solicitud de factura nueva por ${pesos(amount)}.`,
          'Revísala en Studiare, Administración, Pagos.',
        ],
        link: { label: 'Abrir Studiare', url: new URL(ctx.appUrl).toString() },
      };
    }
  }
}

/**
 * Arma el asunto, el texto, el HTML y las etiquetas de un correo de la cola. Lanza si faltan datos,
 * para que el correo quede failed con el motivo y no salga a medias
 */
export function renderEmail(
  kind: EmailKind,
  data: Record<string, unknown>,
  ctx: EmailContext,
): RenderedEmail {
  const { subject, paragraphs, link } = template(kind, data, ctx);
  const support = ctx.supportEmail?.trim() ?? '';
  const footer =
    support === ''
      ? 'Recibes este correo por tu cuenta de Studiare.'
      : `Recibes este correo por tu cuenta de Studiare. Si tienes dudas, escríbenos a ${support}.`;
  const text = [...paragraphs, `${link.label} en ${link.url}`, footer].join('\n\n');
  const html = [
    '<!doctype html>',
    '<html lang="es-MX">',
    '<body style="font-family: system-ui, sans-serif; line-height: 1.5; color: #1f2937;">',
    ...paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`),
    `<p><a href="${escapeHtml(link.url)}">${escapeHtml(link.label)}</a></p>`,
    `<p style="font-size: 12px; color: #6b7280;">${escapeHtml(footer)}</p>`,
    '</body>',
    '</html>',
  ].join('\n');
  return {
    subject,
    text,
    html,
    // Resend acepta letras, números, guion y guion bajo en las etiquetas
    tags: [
      { name: 'app', value: 'studiare' },
      { name: 'kind', value: kind },
    ],
  };
}

/**
 * El envío de B10, que no manda nada. Deja una línea en el registro con el tipo de correo, sin
 * destinatario, alias ni clave, y devuelve un id que dice que no salió
 */
export function createNoopSender(log: (line: string) => void): EmailSender {
  return {
    send(message) {
      const kind = message.tags.find((tag) => tag.name === 'kind')?.value ?? 'desconocido';
      log(`Correo ${kind} sin enviar. El envío de correos llega en B15`);
      return Promise.resolve({ id: 'noop' });
    },
  };
}

export const noopSender: EmailSender = createNoopSender((line) => {
  console.error(line);
});
