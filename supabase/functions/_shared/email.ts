// Correos de la plataforma (B10 y B15 del plan del cambio, 4 del diseño de B10 y 3 del de B15).
//
// Aquí viven las plantillas y la interfaz del envío. La base deja cada correo en la cola email_outbox
// (migración 20261022000001) con su tipo y unos pocos datos, fechas, montos y plan, nunca correos ni RFC.
// La función send-emails (B15) toma la cola con claim_email_batch, resuelve el destinatario con la llave de
// servicio, arma el correo con renderEmail, lo manda con ResendSender (resend.ts) y lo cierra con
// finish_email. Sin llaves de Resend queda noopSender, que no manda nada. No depende de Deno, así se prueba
// con Vitest (D-096).
//
// Los tipos de correo viven en la tabla email_kinds. La tabla ya trae content_report, cuya plantilla
// suma B11 (4.6 del plan de B11), distractor_flags, cuya plantilla suma B14 (3.5 del plan de B14), y
// daily_review_reminder, el recordatorio diario de repaso de B15 (3.2), el único que se puede dejar de
// recibir. Los demás son correos de servicio y no llevan baja
import { PLAN_PRICES_MXN, isPaidPlan, type PaidPlan } from './billingTypes.ts';
import { subscriptionUrl } from './http.ts';
import { GUARANTEE_DAYS } from './stripe.ts';

export type EmailKind =
  | 'trial_ending'
  | 'pass_expiring'
  | 'invoice_requested'
  | 'content_report'
  | 'distractor_flags'
  | 'daily_review_reminder';

export const EMAIL_KINDS: readonly EmailKind[] = [
  'trial_ending',
  'pass_expiring',
  'invoice_requested',
  'content_report',
  'distractor_flags',
  'daily_review_reminder',
];

export const isEmailKind = (value: unknown): value is EmailKind =>
  typeof value === 'string' && (EMAIL_KINDS as readonly string[]).includes(value);

/** Lo que se pide a la base y a los encabezados de un correo que se puede dejar de recibir (RFC 8058) */
export const LIST_UNSUBSCRIBE_POST = 'List-Unsubscribe=One-Click';

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
  /** El dedupe_key de la cola, para el encabezado Idempotency-Key de Resend */
  idempotencyKey: string;
  tags: { name: string; value: string }[];
  /** Encabezados del correo, como List-Unsubscribe. Solo los lleva el recordatorio */
  headers?: Record<string, string>;
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
  /**
   * La página de la app donde el alumno confirma que se da de baja, con su ficha. Es el enlace del pie del
   * recordatorio, y abre con GET sin dar de baja a nadie, así los revisores de enlaces del correo no lo
   * hacen (3.6). Sin ella el recordatorio no sale
   */
  unsubscribeUrl?: string;
  /**
   * La dirección de la función email-unsubscribe con la ficha. Va en el encabezado List-Unsubscribe, a la
   * que el correo de Gmail o de Yahoo hace POST para la baja de un clic. Sin ella el recordatorio sale solo
   * con el enlace del pie
   */
  oneClickUrl?: string;
  /** Ajustes del repaso en la sección de recordatorios. Si falta se arma desde appUrl */
  settingsUrl?: string;
}

export type RenderedEmail = Pick<EmailMessage, 'subject' | 'text' | 'html' | 'tags' | 'headers'>;

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

/** El motivo de un reporte dentro de la frase, igual que las opciones de Reportar un error */
const REPORT_REASONS = new Map<unknown, string>([
  ['clinical_error', 'un error clínico'],
  ['wrong_key', 'que la respuesta marcada no es la correcta'],
  ['typo', 'una errata'],
  ['outdated', 'información desactualizada'],
  ['other', 'otro problema'],
]);

const QUESTION_KEY = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,39}$/;

/** La clave de la pregunta en el Sheet, como GO-0001. Nunca el texto de la pregunta */
function questionKeyOf(kind: EmailKind, data: Record<string, unknown>): string {
  const value = data.questionKey;
  if (typeof value !== 'string' || !QUESTION_KEY.test(value)) {
    throw new MissingEmailData(kind, 'questionKey');
  }
  return value;
}

/** Las claves de pregunta de un resumen, de 1 a 10. Nunca el texto de las preguntas */
function questionKeysOf(kind: EmailKind, data: Record<string, unknown>): string[] {
  const value = data.questionKeys;
  if (!Array.isArray(value) || value.length < 1 || value.length > 10) {
    throw new MissingEmailData(kind, 'questionKeys');
  }
  const keys: string[] = [];
  for (const item of value as unknown[]) {
    if (typeof item !== 'string' || !QUESTION_KEY.test(item)) {
      throw new MissingEmailData(kind, 'questionKeys');
    }
    keys.push(item);
  }
  return keys;
}

/** Un conteo entero de 1 o más, como las marcas de un resumen */
function countOf(kind: EmailKind, data: Record<string, unknown>, field: string): number {
  const value = data[field];
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    throw new MissingEmailData(kind, field);
  }
  return value;
}

/** Una pantalla de la app bajo APP_URL, como /medico/reportes */
function appPage(appUrl: string, path: string): string {
  const target = new URL(appUrl);
  target.pathname = `${target.pathname.replace(/\/+$/, '')}${path}`;
  return target.toString();
}

/** Una pantalla de la app con su consulta, como /repasar?ajustes=recordatorios */
function appLink(appUrl: string, path: string, params: Record<string, string> = {}): string {
  const target = new URL(appPage(appUrl, path));
  for (const [name, value] of Object.entries(params)) target.searchParams.set(name, value);
  return target.toString();
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
  /** Enlaces del pie, como cambiar los recordatorios o darse de baja */
  footerLinks?: { label: string; url: string }[];
  /** El pie propio de un correo que se puede dejar de recibir. Los de servicio usan el de siempre */
  footer?: string;
  /** Encabezados del correo */
  headers?: Record<string, string>;
}

/** Un conteo entero de 0 o más que puede venir como null o no venir */
function optionalCountOf(
  kind: EmailKind,
  data: Record<string, unknown>,
  field: string,
): number | null {
  const value = data[field];
  if (value === null || value === undefined) return null;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new MissingEmailData(kind, field);
  }
  return value;
}

const cards = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/**
 * El recordatorio diario de repaso (3.2). Dice cuántas tarjetas vencen si la foto del alumno es reciente y,
 * si no, que su repaso lo espera. Lleva el botón a Repasar, el enlace para cambiar los recordatorios y el de
 * baja, y los encabezados de la baja de un clic. Sin el enlace de baja no sale
 */
function reminderTemplate(
  kind: EmailKind,
  data: Record<string, unknown>,
  ctx: EmailContext,
): Template {
  const due = optionalCountOf(kind, data, 'due');
  const fresh = optionalCountOf(kind, data, 'newAvailable') ?? 0;
  if (!ctx.unsubscribeUrl) throw new MissingEmailData(kind, 'unsubscribeUrl');
  const subject =
    due === null
      ? 'Tu repaso de hoy te espera'
      : due === 0
        ? 'Hoy no tienes tarjetas vencidas en Studiare'
        : `Hoy ${due === 1 ? 'te toca' : 'te tocan'} ${cards(due, 'tarjeta', 'tarjetas')} en Studiare`;
  const main =
    due === null
      ? 'Tu repaso de hoy te espera. Repasar a tiempo es lo que hace que no se te olvide lo que ya estudiaste.'
      : due === 0
        ? 'Hoy no tienes tarjetas vencidas. Es un buen momento para estudiar tarjetas nuevas o practicar preguntas.'
        : due === 1
          ? 'Hoy te toca 1 tarjeta. Repasarla a tiempo es lo que hace que no se te olvide.'
          : `Hoy te tocan ${due} tarjetas. Repasarlas a tiempo es lo que hace que no se te olviden.`;
  const headers: Record<string, string> | undefined = ctx.oneClickUrl
    ? { 'List-Unsubscribe': `<${ctx.oneClickUrl}>`, 'List-Unsubscribe-Post': LIST_UNSUBSCRIBE_POST }
    : undefined;
  return {
    subject,
    paragraphs: [
      greeting(ctx.alias),
      main,
      ...(fresh > 0 ? [`Además tienes ${cards(fresh, 'tarjeta nueva', 'tarjetas nuevas')}.`] : []),
    ],
    link: { label: 'Repasar ahora', url: appLink(ctx.appUrl, '/repasar') },
    footerLinks: [
      {
        label: 'Cambiar mis recordatorios',
        url: ctx.settingsUrl ?? appLink(ctx.appUrl, '/repasar', { ajustes: 'recordatorios' }),
      },
      { label: 'Darme de baja', url: ctx.unsubscribeUrl },
    ],
    footer:
      'Recibes este correo porque prendiste los recordatorios en Ajustes del repaso. Ahí cambias la hora y los días.',
    ...(headers ? { headers } : {}),
  };
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
    case 'content_report': {
      // Para el médico asignado o para el equipo. Sin el alumno ni el texto de la pregunta (4.6)
      const key = questionKeyOf(kind, data);
      const reason = REPORT_REASONS.get(data.reason);
      if (reason === undefined) throw new MissingEmailData(kind, 'reason');
      const open = typeof data.openReports === 'number' ? Math.floor(data.openReports) : 0;
      return {
        subject: 'Nuevo reporte en una pregunta que revisas',
        paragraphs: [
          greeting(ctx.alias),
          `Un alumno reportó ${reason} en la pregunta ${key}. Revísala en Studiare, Médico, Reportes.`,
          ...(open > 1 ? [`La pregunta tiene ${open} reportes abiertos.`] : []),
        ],
        link: { label: 'Ver los reportes', url: appPage(ctx.appUrl, '/medico/reportes') },
      };
    }
    case 'distractor_flags': {
      // Para el médico asignado. Cuántas opciones y hasta 10 claves de pregunta, sin texto ni alumnos
      const flags = countOf(kind, data, 'flags');
      const keys = questionKeysOf(kind, data);
      const options =
        flags === 1 ? '1 opción que casi nadie elige' : `${flags} opciones que casi nadie elige`;
      return {
        subject: 'Opciones por revisar en tus preguntas',
        paragraphs: [
          greeting(ctx.alias),
          `La calibración de anoche encontró ${options} en preguntas que revisas (${keys.join(', ')}). Revísalas en Studiare, Médico, Reportes.`,
        ],
        link: { label: 'Ver los reportes', url: appPage(ctx.appUrl, '/medico/reportes') },
      };
    }
    case 'daily_review_reminder':
      return reminderTemplate(kind, data, ctx);
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
  const {
    subject,
    paragraphs,
    link,
    footerLinks = [],
    footer: ownFooter,
    headers,
  } = template(kind, data, ctx);
  const support = ctx.supportEmail?.trim() ?? '';
  const baseFooter = ownFooter ?? 'Recibes este correo por tu cuenta de Studiare.';
  const footer =
    support === '' ? baseFooter : `${baseFooter} Si tienes dudas, escríbenos a ${support}.`;
  const text = [
    ...paragraphs,
    `${link.label} en ${link.url}`,
    ...footerLinks.map((item) => `${item.label} en ${item.url}`),
    footer,
  ].join('\n\n');
  const html = [
    '<!doctype html>',
    '<html lang="es-MX">',
    '<body style="font-family: system-ui, sans-serif; line-height: 1.5; color: #1f2937;">',
    ...paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`),
    `<p><a href="${escapeHtml(link.url)}">${escapeHtml(link.label)}</a></p>`,
    ...(footerLinks.length > 0
      ? [
          `<p style="font-size: 12px;">${footerLinks
            .map((item) => `<a href="${escapeHtml(item.url)}">${escapeHtml(item.label)}</a>`)
            .join(' · ')}</p>`,
        ]
      : []),
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
    ...(headers ? { headers } : {}),
  };
}

/**
 * El envío sin llaves, que no manda nada. Deja una línea en el registro con el tipo de correo, sin
 * destinatario, alias ni clave, y devuelve un id que dice que no salió. Es el de desarrollo y el de las
 * pruebas; en producción el envío real es ResendSender
 */
export function createNoopSender(log: (line: string) => void): EmailSender {
  return {
    send(message) {
      const kind = message.tags.find((tag) => tag.name === 'kind')?.value ?? 'desconocido';
      log(`Correo ${kind} sin enviar. El envío de correos no está configurado`);
      return Promise.resolve({ id: 'noop' });
    },
  };
}

export const noopSender: EmailSender = createNoopSender((line) => {
  console.error(line);
});
