// La función send-emails (B15 del plan del cambio, 3.5). Cron la llama cada minuto con la ficha email_tick,
// solo si el envío está prendido y hay correos listos. Toma hasta 20 correos de la cola con
// claim_email_batch, resuelve a quién van con email_recipients (la cola nunca guarda un correo), arma cada
// uno con renderEmail, lo manda con Resend y lo cierra con finish_email como sent, skipped o failed.
//
// Qué hace con cada resultado de Resend
//   - Salió bien. sent
//   - 429 o una llave que no sirve (401). Se detiene el lote y se devuelve lo que falta con release_email,
//     sin gastar el intento. Los demás fallarían igual
//   - 409 por una petición igual en curso. Se devuelve a la cola
//   - Otro 4xx, como un dominio sin verificar. failed con el motivo, sin datos
//   - 5xx o sin respuesta. failed para otro intento, hasta 5, como en B10
//   - Sin correo confirmado, sin ficha de baja vigente en un recordatorio o un tipo que esta función no
//     conoce. skipped con el motivo
// El ritmo es una petición cada 550 milisegundos, bajo el límite de 2 por segundo de Resend. Son unos 20
// correos por minuto por llamada y una llamada por minuto. Si muchos alumnos eligen la misma hora, el último
// sale a los pocos minutos
//
// Sin la llave de Resend o sin el remitente responde 503 y no manda ni reclama nada. Sin la ficha de Cron
// responde 401 antes de tocar nada. Nunca registra el contenido de un correo, una dirección, una ficha ni
// una llave: solo conteos y códigos. No depende de Deno, así se prueba con Vitest (D-096).
import { isEmailKind, renderEmail, type EmailContext, type EmailKind } from './email.ts';
import type { EmailSender } from './email.ts';
import { json, readJsonRecord } from './http.ts';
import { RESEND_PACE_MS, ResendError } from './resend.ts';
import type { EmailRecipient, QueuedEmail } from './supabase.ts';

/** Cuántos correos toma cada llamada. Con 550 ms entre uno y otro caben en el plazo de la función */
export const EMAIL_BATCH_SIZE = 20;
/** A cuántas direcciones se manda un correo del equipo, como máximo */
const MAX_ADDRESSES = 5;
export const EMAIL_TICK_HEADER = 'x-email-tick';
/** La forma de la ficha de baja que deja la base. Una con otra forma nunca se pone en un enlace */
const UNSUBSCRIBE_TOKEN = /^[0-9a-f]{36}$/;

export interface SendEmailsEnv {
  /** APP_URL, la dirección pública de la app */
  appUrl: string | undefined;
  /** SUPABASE_URL, que Supabase inyecta. De ahí sale la dirección de la baja de un clic */
  supabaseUrl: string | undefined;
  /** SUPPORT_EMAIL, el correo de ayuda del pie y de las respuestas */
  supportEmail: string | undefined;
}

export interface SendEmailsDeps {
  env: SendEmailsEnv;
  /** null si falta RESEND_API_KEY o EMAIL_FROM. Entonces no se reclama ni se manda nada */
  sender: EmailSender | null;
  /** email_tick_ok, que compara contra el secreto de Vault */
  tickOk: (token: string) => Promise<boolean>;
  claim: (limit: number) => Promise<QueuedEmail[]>;
  recipients: (ids: readonly string[]) => Promise<Map<string, EmailRecipient>>;
  finish: (result: {
    id: string;
    status: 'sent' | 'skipped' | 'failed';
    error: string | null;
  }) => Promise<void>;
  release: (id: string) => Promise<void>;
  sleep: (ms: number) => Promise<void>;
  log: (line: string) => void;
  /**
   * Para seguir en segundo plano después de contestar 202. Sin ella la función termina el lote antes de
   * contestar, que es como lo prueba Vitest
   */
  waitUntil?: (work: Promise<unknown>) => void;
  /** Avisa de un error que pasó en segundo plano, donde ya no lo ve la envoltura de la función */
  onError?: (error: unknown) => void;
}

export interface BatchSummary {
  claimed: number;
  sent: number;
  skipped: number;
  failed: number;
  released: number;
  /** Por qué se detuvo el lote antes de terminar, o null */
  stoppedBy: 'rate_limited' | 'unauthorized' | null;
}

const EMPTY_SUMMARY: BatchSummary = {
  claimed: 0,
  sent: 0,
  skipped: 0,
  failed: 0,
  released: 0,
  stoppedBy: null,
};

/** Una pantalla de la app con su ficha, como /correo/baja?t=... */
function appUrlWith(appUrl: string, path: string, params: Record<string, string>): string {
  const target = new URL(appUrl);
  target.pathname = `${target.pathname.replace(/\/+$/, '')}${path}`;
  for (const [name, value] of Object.entries(params)) target.searchParams.set(name, value);
  return target.toString();
}

type Verdict =
  | { kind: 'sent' }
  | { kind: 'skipped'; reason: string }
  | { kind: 'failed'; reason: string }
  | { kind: 'release' }
  | { kind: 'stop'; reason: 'rate_limited' | 'unauthorized' };

/** Arma y manda un correo. No lanza: cada resultado es un veredicto para cerrarlo */
async function deliver(
  deps: SendEmailsDeps,
  sender: EmailSender,
  appUrl: string,
  email: QueuedEmail,
  recipient: EmailRecipient | undefined,
  pace: () => Promise<void>,
): Promise<Verdict> {
  if (!isEmailKind(email.kind)) return { kind: 'skipped', reason: 'unknown_kind' };
  const kind: EmailKind = email.kind;
  const addresses = recipient?.emails.slice(0, MAX_ADDRESSES) ?? [];
  if (recipient === undefined || addresses.length === 0) {
    return { kind: 'skipped', reason: 'no_recipient' };
  }

  const context: EmailContext = {
    appUrl,
    supportEmail: deps.env.supportEmail ?? null,
    alias: recipient.alias,
  };
  if (kind === 'daily_review_reminder') {
    const token = recipient.unsubscribeToken;
    // Prendido y sin baja. Si el alumno ya no lo quiere, o su ficha no tiene la forma, el recordatorio no sale
    if (token === null || !UNSUBSCRIBE_TOKEN.test(token)) {
      return { kind: 'skipped', reason: 'unsubscribed' };
    }
    context.unsubscribeUrl = appUrlWith(appUrl, '/correo/baja', { t: token });
    if (deps.env.supabaseUrl) {
      context.oneClickUrl = `${deps.env.supabaseUrl.replace(/\/+$/, '')}/functions/v1/email-unsubscribe?t=${token}`;
    }
  }

  let rendered: ReturnType<typeof renderEmail>;
  try {
    rendered = renderEmail(kind, email.data, context);
  } catch (error) {
    // El mensaje de renderEmail solo nombra el campo que falta, nunca su valor
    return {
      kind: 'failed',
      reason: error instanceof Error ? error.message.slice(0, 200) : 'No se pudo armar el correo',
    };
  }

  for (const [index, address] of addresses.entries()) {
    await pace();
    try {
      await sender.send({
        ...rendered,
        to: address,
        // El correo del equipo va a cada quien por separado, con su propia clave de repetición
        idempotencyKey: index === 0 ? email.dedupeKey : `${email.dedupeKey}:${index}`,
      });
    } catch (error) {
      if (!(error instanceof ResendError)) {
        return { kind: 'failed', reason: 'No se pudo mandar el correo' };
      }
      if (error.failure === 'rate_limited') return { kind: 'stop', reason: 'rate_limited' };
      if (error.failure === 'unauthorized') return { kind: 'stop', reason: 'unauthorized' };
      if (error.failure === 'conflict') return { kind: 'release' };
      return { kind: 'failed', reason: error.message };
    }
  }
  return { kind: 'sent' };
}

/** Toma un lote, lo manda al ritmo de Resend y cierra cada correo */
export async function runEmailBatch(deps: SendEmailsDeps): Promise<BatchSummary> {
  const { sender, env } = deps;
  if (sender === null || !env.appUrl) return { ...EMPTY_SUMMARY };
  const emails = await deps.claim(EMAIL_BATCH_SIZE);
  const summary: BatchSummary = { ...EMPTY_SUMMARY, claimed: emails.length };
  if (emails.length === 0) return summary;
  const recipients = await deps.recipients(emails.map((email) => email.id));

  // Una petición cada 550 ms. Se espera antes de cada petición menos de la primera, y solo cuando de verdad
  // va a salir una: un correo que se salta no gasta el ritmo
  let requested = false;
  const pace = async () => {
    if (requested) await deps.sleep(RESEND_PACE_MS);
    requested = true;
  };

  for (const [index, email] of emails.entries()) {
    const verdict = await deliver(deps, sender, env.appUrl, email, recipients.get(email.id), pace);
    if (verdict.kind === 'sent') {
      await deps.finish({ id: email.id, status: 'sent', error: null });
      summary.sent += 1;
    } else if (verdict.kind === 'skipped' || verdict.kind === 'failed') {
      await deps.finish({ id: email.id, status: verdict.kind, error: verdict.reason });
      summary[verdict.kind] += 1;
    } else if (verdict.kind === 'release') {
      await deps.release(email.id);
      summary.released += 1;
    } else {
      // Se detiene. Este y los que faltan vuelven a la cola sin gastar el intento
      for (const pending of emails.slice(index)) {
        await deps.release(pending.id);
        summary.released += 1;
      }
      summary.stoppedBy = verdict.reason;
      break;
    }
  }
  deps.log(
    `send-emails reclamó ${summary.claimed}, mandó ${summary.sent}, saltó ${summary.skipped}, falló ${summary.failed}, devolvió ${summary.released}${
      summary.stoppedBy ? ` y se detuvo por ${summary.stoppedBy}` : ''
    }`,
  );
  return summary;
}

export async function handleSendEmails(request: Request, deps: SendEmailsDeps): Promise<Response> {
  if (request.method !== 'POST') return json({ error: 'method' }, 405, {});
  // Solo Cron, con la ficha de Vault. Sin ella no se toca la cola
  const token = request.headers.get(EMAIL_TICK_HEADER) ?? '';
  if (token === '' || !(await deps.tickOk(token))) return json({ error: 'unauthorized' }, 401, {});
  // Lo que Cron manda en el cuerpo no se usa, pero se lee para no dejar la conexión a medias
  await readJsonRecord(request);

  if (deps.sender === null || !deps.env.appUrl) {
    deps.log(
      'send-emails sin configuración. Faltan RESEND_API_KEY, EMAIL_FROM o APP_URL, y no se manda nada',
    );
    return json({ error: 'missing_configuration' }, 503, {});
  }

  const work = runEmailBatch(deps);
  if (deps.waitUntil) {
    // Cron espera 5 segundos y el lote tarda más. Se contesta enseguida y se sigue en segundo plano
    deps.waitUntil(
      work.catch((error: unknown) => {
        deps.log('send-emails falló en segundo plano');
        deps.onError?.(error);
      }),
    );
    return json({ status: 'accepted' }, 202, {});
  }
  return json(await work, 200, {});
}
