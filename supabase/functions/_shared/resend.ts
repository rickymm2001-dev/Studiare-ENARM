// Envío de correos con Resend (B15 del plan del cambio, 3.5). Es el único lugar de las funciones que habla
// con api.resend.com. Quien lo usa es send-emails, que toma la cola con claim_email_batch y cierra cada
// correo con finish_email. Una prueba de arquitectura (externalExits.test.ts) revisa que nadie más lo haga.
//
// Documentación vigente que se siguió (resend-node en GitHub, leída el 2026-10-21, y la guía de Resend de
// baja en un clic). POST https://api.resend.com/emails con Authorization Bearer, from, to, subject, html,
// text, headers, tags (name y value, solo letras, números, guion y guion bajo) y reply_to en snake_case. El
// encabezado Idempotency-Key, de hasta 256 caracteres, vale 24 horas y devuelve la misma respuesta si se
// repite la misma petición. El límite por omisión es de 2 peticiones por segundo y al pasarse responde 429.
// Para la baja de un clic de Gmail y Yahoo (RFC 8058) pide List-Unsubscribe con una dirección https y
// List-Unsubscribe-Post igual a List-Unsubscribe=One-Click
//
// Nunca registra ni lanza con el contenido de un correo, una dirección o la llave. Un error de Resend
// puede repetir la dirección en su mensaje, así que de la respuesta solo se conserva el código y el nombre
// del error, que es una palabra fija. No depende de Deno, así se prueba con Vitest (D-096).
import type { EmailMessage, EmailSender } from './email.ts';

export const RESEND_ENDPOINT = 'https://api.resend.com/emails';

/** Una petición cada 550 milisegundos, bajo el límite de 2 por segundo que trae Resend por omisión */
export const RESEND_PACE_MS = 550;

/**
 * Por qué no salió el correo, para decidir qué hacer con él
 *   rate_limited  429, el límite de peticiones o la cuota. Se detiene el lote y se devuelve lo que falta
 *   unauthorized  401, la llave no sirve. También detiene el lote, porque todos los demás fallarían igual
 *   conflict      409 por una petición igual todavía en curso. Se devuelve a la cola para otro rato
 *   rejected      el resto de los 4xx, como un correo mal escrito o un dominio sin verificar. Queda failed
 *   server        5xx o respuesta sin sentido. Queda failed para otro intento
 *   network       no hubo respuesta. Queda failed para otro intento
 */
export type ResendFailure =
  'rate_limited' | 'unauthorized' | 'conflict' | 'rejected' | 'server' | 'network';

export class ResendError extends Error {
  readonly failure: ResendFailure;
  readonly status: number | null;
  /** El nombre del error de Resend, como validation_error. Una palabra fija, nunca el mensaje */
  readonly code: string | null;

  constructor(failure: ResendFailure, status: number | null, code: string | null) {
    super(
      status === null
        ? 'Resend no respondió'
        : `Resend respondió ${status}${code === null ? '' : ` ${code}`}`,
    );
    this.name = 'ResendError';
    this.failure = failure;
    this.status = status;
    this.code = code;
  }
}

export interface ResendSenderOptions {
  /** RESEND_API_KEY. Nunca se registra */
  apiKey: string;
  /** EMAIL_FROM, con el dominio de Ricardo, por ejemplo Studiare con la dirección de los recordatorios */
  from: string;
  /** SUPPORT_EMAIL. Si existe, las respuestas del alumno llegan ahí */
  replyTo?: string | null | undefined;
  fetch: typeof fetch;
}

/** El nombre de un error de Resend si es una palabra fija, y null si trae otra cosa */
function errorCodeOf(raw: unknown): string | null {
  if (raw === null || typeof raw !== 'object') return null;
  const name = (raw as { name?: unknown }).name;
  return typeof name === 'string' && /^[a-z][a-z_]{0,63}$/.test(name) ? name : null;
}

function failureOf(status: number, code: string | null): ResendFailure {
  if (status === 429) return 'rate_limited';
  if (status === 401) return 'unauthorized';
  if (status === 409) return code === 'concurrent_idempotent_requests' ? 'conflict' : 'rejected';
  if (status === 408 || status >= 500) return 'server';
  return 'rejected';
}

/** Manda un correo con Resend. Lanza ResendError si no salió */
export function createResendSender(options: ResendSenderOptions): EmailSender {
  const replyTo = options.replyTo?.trim() ?? '';
  return {
    async send(message: EmailMessage): Promise<{ id: string }> {
      const body = {
        from: options.from,
        to: [message.to],
        subject: message.subject,
        html: message.html,
        text: message.text,
        tags: message.tags,
        ...(replyTo === '' ? {} : { reply_to: replyTo }),
        ...(message.headers ? { headers: message.headers } : {}),
      };
      let response: Response;
      try {
        response = await options.fetch(RESEND_ENDPOINT, {
          method: 'POST',
          headers: {
            authorization: `Bearer ${options.apiKey}`,
            'content-type': 'application/json',
            'idempotency-key': message.idempotencyKey.slice(0, 256),
          },
          body: JSON.stringify(body),
        });
      } catch {
        throw new ResendError('network', null, null);
      }
      let reply: unknown;
      try {
        reply = await response.json();
      } catch {
        reply = null;
      }
      if (!response.ok) {
        const code = errorCodeOf(reply);
        throw new ResendError(failureOf(response.status, code), response.status, code);
      }
      const id =
        reply !== null && typeof reply === 'object' ? (reply as { id?: unknown }).id : null;
      return { id: typeof id === 'string' && id !== '' ? id : 'sin-id' };
    },
  };
}
