// send-emails de la cola al envío y su cierre, apagado y sin llave (B15, 3.5). Usa una cola en memoria y el
// Resend simulado: ninguna petición sale a la red
import { describe, expect, it } from 'vitest';
import { createFakeResend } from './fakeResend.ts';
import { RESEND_PACE_MS, createResendSender } from './resend.ts';
import {
  EMAIL_BATCH_SIZE,
  EMAIL_TICK_HEADER,
  handleSendEmails,
  runEmailBatch,
  type SendEmailsDeps,
} from './sendEmails.ts';
import type { EmailRecipient, QueuedEmail } from './supabase.ts';

const KEY = 're_llave_de_prueba_falsa_0000';
const TICK = 'ficha-de-cron-de-prueba-0123456789abcdef';
const TOKEN = '0123456789abcdef0123456789abcdef0123';

const reminder = (
  id: string,
  data: Record<string, unknown> = { due: 12, newAvailable: 3, day: '2026-10-20' },
): QueuedEmail => ({
  id,
  kind: 'daily_review_reminder',
  data,
  dedupeKey: `daily_review_reminder:${id}:2026-10-20`,
  attempts: 1,
});

const service = (id: string, kind = 'trial_ending'): QueuedEmail => ({
  id,
  kind,
  data: { trialEnd: '2026-10-25T16:00:00Z', plan: 'monthly' },
  dedupeKey: `${kind}:${id}`,
  attempts: 1,
});

const student = (address: string, withToken = true): EmailRecipient => ({
  emails: [address],
  alias: 'Luna',
  unsubscribeToken: withToken ? TOKEN : null,
});

interface Harness {
  deps: SendEmailsDeps;
  fake: ReturnType<typeof createFakeResend>;
  finished: { id: string; status: string; error: string | null }[];
  released: string[];
  logs: string[];
  errors: unknown[];
  clock: { now: number };
  sleeps: number[];
  claims: number[];
  work: Promise<unknown>[];
}

function harness(
  rows: QueuedEmail[],
  recipients: Record<string, EmailRecipient>,
  options: {
    script?: Parameters<typeof createFakeResend>[0]['script'];
    sender?: 'ok' | 'none';
    appUrl?: string | undefined;
    background?: boolean;
    finishFails?: boolean;
  } = {},
): Harness {
  const clock = { now: 1_000_000 };
  const fake = createFakeResend({ apiKey: KEY, now: () => clock.now, script: options.script });
  const finished: Harness['finished'] = [];
  const released: string[] = [];
  const logs: string[] = [];
  const errors: unknown[] = [];
  const sleeps: number[] = [];
  const claims: number[] = [];
  const work: Promise<unknown>[] = [];
  let finishCalls = 0;
  const deps: SendEmailsDeps = {
    env: {
      appUrl: 'appUrl' in options ? options.appUrl : 'https://app.ejemplo.mx/Studiare-ENARM',
      supabaseUrl: 'https://proyecto.supabase.co',
      supportEmail: 'ayuda@ejemplo.mx',
    },
    sender:
      options.sender === 'none'
        ? null
        : createResendSender({
            apiKey: KEY,
            from: 'Studiare <recordatorios@ejemplo.mx>',
            replyTo: 'ayuda@ejemplo.mx',
            fetch: fake.fetch,
          }),
    tickOk: (token) => Promise.resolve(token === TICK),
    claim: (limit) => {
      claims.push(limit);
      return Promise.resolve(rows.splice(0, limit));
    },
    recipients: (ids) =>
      Promise.resolve(
        new Map(ids.flatMap((id) => (recipients[id] ? [[id, recipients[id]] as const] : []))),
      ),
    finish: (result) => {
      finishCalls += 1;
      if (options.finishFails && finishCalls === 1)
        return Promise.reject(new Error('la base se cayó'));
      finished.push(result);
      return Promise.resolve();
    },
    release: (id) => {
      released.push(id);
      return Promise.resolve();
    },
    sleep: (ms) => {
      sleeps.push(ms);
      clock.now += ms;
      return Promise.resolve();
    },
    log: (line) => logs.push(line),
    onError: (error) => errors.push(error),
    ...(options.background
      ? {
          waitUntil: (promise: Promise<unknown>) => {
            work.push(promise);
          },
        }
      : {}),
  };
  return { deps, fake, finished, released, logs, errors, clock, sleeps, claims, work };
}

const call = (
  deps: SendEmailsDeps,
  headers: Record<string, string> = { [EMAIL_TICK_HEADER]: TICK },
) =>
  handleSendEmails(
    new Request('https://proyecto.supabase.co/functions/v1/send-emails', {
      method: 'POST',
      headers,
      body: '{}',
    }),
    deps,
  );

describe('send-emails, quién puede llamar y con qué configuración', () => {
  it('sin ficha de Cron responde 401 y no toca la cola', async () => {
    const h = harness([reminder('a')], { a: student('luna@ejemplo.mx') });
    expect((await call(h.deps, {})).status).toBe(401);
    expect((await call(h.deps, { [EMAIL_TICK_HEADER]: 'otra-ficha' })).status).toBe(401);
    expect((await call(h.deps, { authorization: 'Bearer cualquiera' })).status).toBe(401);
    expect(h.claims).toEqual([]);
    expect(h.fake.requests).toHaveLength(0);
  });

  it('solo atiende POST', async () => {
    const h = harness([], {});
    const response = await handleSendEmails(
      new Request('https://proyecto.supabase.co/functions/v1/send-emails', { method: 'GET' }),
      h.deps,
    );
    expect(response.status).toBe(405);
  });

  it('sin la llave de Resend responde que falta la configuración y no reclama ni manda nada', async () => {
    const h = harness([reminder('a')], { a: student('luna@ejemplo.mx') }, { sender: 'none' });
    const response = await call(h.deps);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'missing_configuration' });
    expect(h.claims).toEqual([]);
    expect(h.fake.requests).toHaveLength(0);
    expect(h.logs).toHaveLength(1);
    expect(h.logs[0]).toContain('sin configuración');
    expect(h.logs.join(' ')).not.toMatch(/re_|@|Bearer/);
  });

  it('sin la dirección de la app tampoco sale nada', async () => {
    const h = harness([reminder('a')], { a: student('luna@ejemplo.mx') }, { appUrl: undefined });
    expect((await call(h.deps)).status).toBe(503);
    expect(h.claims).toEqual([]);
  });
});

describe('send-emails, de la cola al envío', () => {
  it('manda cada correo, lo cierra como sent y respeta el ritmo de 550 ms', async () => {
    const pass: QueuedEmail = {
      ...service('c', 'pass_expiring'),
      data: { passEnd: '2026-11-03T05:59:59Z', plan: 'monthly' },
    };
    const h = harness([reminder('a'), service('b'), pass], {
      a: student('luna@ejemplo.mx'),
      b: student('sol@ejemplo.mx', false),
      c: student('mar@ejemplo.mx', false),
    });
    const response = await call(h.deps);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      claimed: 3,
      sent: 3,
      skipped: 0,
      failed: 0,
      released: 0,
      stoppedBy: null,
    });
    expect(h.claims).toEqual([EMAIL_BATCH_SIZE]);
    expect(h.finished).toEqual([
      { id: 'a', status: 'sent', error: null },
      { id: 'b', status: 'sent', error: null },
      { id: 'c', status: 'sent', error: null },
    ]);
    // Una petición cada 550 ms: dos esperas para tres correos, y nunca más de 2 por segundo
    expect(h.sleeps).toEqual([RESEND_PACE_MS, RESEND_PACE_MS]);
    const times = h.fake.requests.map((request) => request.at);
    expect(times.slice(1).map((time, index) => time - (times[index] ?? 0))).toEqual([
      RESEND_PACE_MS,
      RESEND_PACE_MS,
    ]);
    expect(h.fake.accepted).toHaveLength(3);
  });

  it('el recordatorio lleva su baja de un clic y su enlace del pie, y el de servicio ninguno', async () => {
    const h = harness([reminder('a'), service('b')], {
      a: student('luna@ejemplo.mx'),
      b: student('sol@ejemplo.mx', false),
    });
    await call(h.deps);
    const [first, second] = h.fake.accepted;
    expect(first?.body.to).toEqual(['luna@ejemplo.mx']);
    expect(first?.headers['idempotency-key']).toBe('daily_review_reminder:a:2026-10-20');
    expect(first?.body.reply_to).toBe('ayuda@ejemplo.mx');
    expect(first?.body.headers).toEqual({
      'List-Unsubscribe': `<https://proyecto.supabase.co/functions/v1/email-unsubscribe?t=${TOKEN}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    });
    // El enlace del pie va a la página de la app, que no da de baja con un GET
    expect(String(first?.body.text)).toContain(
      `Darme de baja en https://app.ejemplo.mx/Studiare-ENARM/correo/baja?t=${TOKEN}`,
    );
    expect(String(first?.body.text)).toContain('Hola, Luna.');
    expect(String(first?.body.subject)).toBe('Hoy te tocan 12 tarjetas en Studiare');
    expect(second?.body).not.toHaveProperty('headers');
    expect(String(second?.body.text)).not.toContain('Darme de baja');
  });

  it('el correo del equipo va a cada administrador por separado, sin verse entre ellos', async () => {
    const h = harness([{ ...service('a', 'invoice_requested'), data: { amountMxn: 149 } }], {
      a: { emails: ['dueno@ejemplo.mx', 'admin@ejemplo.mx'], alias: null, unsubscribeToken: null },
    });
    await call(h.deps);
    expect(h.fake.accepted.map((request) => request.body.to)).toEqual([
      ['dueno@ejemplo.mx'],
      ['admin@ejemplo.mx'],
    ]);
    expect(h.fake.accepted.map((request) => request.headers['idempotency-key'])).toEqual([
      'invoice_requested:a',
      'invoice_requested:a:1',
    ]);
    expect(h.sleeps).toEqual([RESEND_PACE_MS]);
    expect(h.finished).toEqual([{ id: 'a', status: 'sent', error: null }]);
  });

  it('salta con su motivo lo que no se debe mandar y no gasta el ritmo', async () => {
    const h = harness(
      [
        reminder('sinCorreo'),
        reminder('sinBaja'),
        reminder('fichaRara'),
        reminder('bueno'),
        { ...service('tipoNuevo', 'promocion'), data: {} },
        reminder('sinFila'),
      ],
      {
        sinCorreo: { emails: [], alias: 'Luna', unsubscribeToken: TOKEN },
        sinBaja: student('luna@ejemplo.mx', false),
        fichaRara: {
          emails: ['luna@ejemplo.mx'],
          alias: 'Luna',
          unsubscribeToken: 'x" onmouseover="mal',
        },
        bueno: student('luna@ejemplo.mx'),
        tipoNuevo: student('luna@ejemplo.mx'),
      },
    );
    const summary = await runEmailBatch(h.deps);
    expect(h.finished).toEqual([
      { id: 'sinCorreo', status: 'skipped', error: 'no_recipient' },
      { id: 'sinBaja', status: 'skipped', error: 'unsubscribed' },
      { id: 'fichaRara', status: 'skipped', error: 'unsubscribed' },
      { id: 'bueno', status: 'sent', error: null },
      { id: 'tipoNuevo', status: 'skipped', error: 'unknown_kind' },
      { id: 'sinFila', status: 'skipped', error: 'no_recipient' },
    ]);
    expect(summary).toMatchObject({ claimed: 6, sent: 1, skipped: 5, failed: 0 });
    expect(h.fake.accepted).toHaveLength(1);
    // Solo salió una petición, así que no hubo ninguna espera
    expect(h.sleeps).toEqual([]);
  });

  it('un correo al que le falta un dato queda failed con el campo que falta y sin datos de nadie', async () => {
    const h = harness(
      [
        { ...service('a'), data: { plan: 'monthly' } },
        reminder('b', { due: -3, newAvailable: 0, day: 'x' }),
      ],
      { a: student('luna@ejemplo.mx', false), b: student('sol@ejemplo.mx') },
    );
    await call(h.deps);
    expect(h.finished).toEqual([
      { id: 'a', status: 'failed', error: 'Falta trialEnd para el correo trial_ending' },
      { id: 'b', status: 'failed', error: 'Falta due para el correo daily_review_reminder' },
    ]);
    expect(h.fake.requests).toHaveLength(0);
  });

  it('un rechazo de validación o una falla del servidor de Resend deja el correo failed con el motivo', async () => {
    const h = harness(
      [service('a'), service('b'), service('c')],
      {
        a: student('luna@ejemplo.mx', false),
        b: student('sol@ejemplo.mx', false),
        c: student('mar@ejemplo.mx', false),
      },
      {
        script: (_request, index) =>
          index === 0
            ? { status: 422, name: 'validation_error' }
            : index === 1
              ? { status: 503 }
              : undefined,
      },
    );
    await call(h.deps);
    expect(h.finished).toEqual([
      { id: 'a', status: 'failed', error: 'Resend respondió 422 validation_error' },
      { id: 'b', status: 'failed', error: 'Resend respondió 503 error_de_prueba' },
      { id: 'c', status: 'sent', error: null },
    ]);
    expect(h.released).toEqual([]);
    expect(h.finished.map((item) => item.error).join(' ')).not.toMatch(/@|ejemplo\.mx/);
  });

  it('con un 429 detiene el lote y devuelve lo que falta con release_email, sin gastar el intento', async () => {
    const h = harness(
      [service('a'), service('b'), service('c'), service('d')],
      Object.fromEntries(
        ['a', 'b', 'c', 'd'].map((id) => [id, student(`${id}@ejemplo.mx`, false)]),
      ),
      {
        script: (_request, index) =>
          index === 1 ? { status: 429, name: 'rate_limit_exceeded' } : undefined,
      },
    );
    const response = await call(h.deps);
    expect(await response.json()).toMatchObject({
      sent: 1,
      released: 3,
      stoppedBy: 'rate_limited',
    });
    expect(h.finished).toEqual([{ id: 'a', status: 'sent', error: null }]);
    expect(h.released).toEqual(['b', 'c', 'd']);
    // No siguió mandando después del 429
    expect(h.fake.requests).toHaveLength(2);
  });

  it('una llave que Resend rechaza (401) también detiene el lote', async () => {
    const h = harness([service('a'), service('b')], {
      a: student('luna@ejemplo.mx', false),
      b: student('sol@ejemplo.mx', false),
    });
    h.deps.sender = createResendSender({
      apiKey: 're_otra_llave_falsa',
      from: 'a',
      fetch: h.fake.fetch,
    });
    const response = await call(h.deps);
    expect(await response.json()).toMatchObject({
      sent: 0,
      failed: 0,
      released: 2,
      stoppedBy: 'unauthorized',
    });
    expect(h.released).toEqual(['a', 'b']);
    expect(h.finished).toEqual([]);
  });

  it('una petición igual todavía en curso (409) vuelve a la cola y el lote sigue', async () => {
    const h = harness(
      [service('a'), service('b')],
      { a: student('luna@ejemplo.mx', false), b: student('sol@ejemplo.mx', false) },
      {
        script: (_request, index) =>
          index === 0 ? { status: 409, name: 'concurrent_idempotent_requests' } : undefined,
      },
    );
    await call(h.deps);
    expect(h.released).toEqual(['a']);
    expect(h.finished).toEqual([{ id: 'b', status: 'sent', error: null }]);
  });

  it('si Resend recibió el correo y la base no pudo cerrarlo, el reintento no manda otro', async () => {
    const h = harness(
      [service('a')],
      { a: student('luna@ejemplo.mx', false) },
      { finishFails: true },
    );
    await expect(call(h.deps)).rejects.toThrow('la base se cayó');
    // El correo vuelve a salir de la cola con la misma clave y Resend lo reconoce
    const again = [service('a')];
    h.deps.claim = (limit) => Promise.resolve(again.splice(0, limit));
    await call(h.deps);
    expect(h.fake.accepted).toHaveLength(1);
    expect(h.fake.replays).toBe(1);
    expect(h.finished).toEqual([{ id: 'a', status: 'sent', error: null }]);
  });

  it('sin nada en la cola no pide destinatarios ni manda', async () => {
    const h = harness([], {});
    let asked = false;
    h.deps.recipients = () => {
      asked = true;
      return Promise.resolve(new Map<string, EmailRecipient>());
    };
    const response = await call(h.deps);
    expect(await response.json()).toMatchObject({ claimed: 0, sent: 0 });
    expect(asked).toBe(false);
  });

  it('toma de la cola como mucho 20 por llamada', async () => {
    const rows = Array.from({ length: 25 }, (_, index) => service(`m${index}`));
    const recipients = Object.fromEntries(
      rows.map((row) => [row.id, student(`${row.id}@ejemplo.mx`, false)]),
    );
    const h = harness(rows, recipients);
    const response = await call(h.deps);
    expect(await response.json()).toMatchObject({ claimed: 20, sent: 20 });
    expect(rows).toHaveLength(5);
  });
});

describe('send-emails, en segundo plano y sin dejar rastro de nadie', () => {
  it('con waitUntil contesta 202 enseguida y termina el lote después', async () => {
    const h = harness(
      [service('a')],
      { a: student('luna@ejemplo.mx', false) },
      { background: true },
    );
    const response = await call(h.deps);
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ status: 'accepted' });
    expect(h.work).toHaveLength(1);
    await Promise.all(h.work);
    expect(h.finished).toEqual([{ id: 'a', status: 'sent', error: null }]);
  });

  it('un error en segundo plano se avisa y no se pierde', async () => {
    const h = harness(
      [service('a')],
      { a: student('luna@ejemplo.mx', false) },
      { background: true },
    );
    h.deps.claim = () => Promise.reject(new Error('la base se cayó'));
    await call(h.deps);
    await Promise.all(h.work);
    expect(h.errors).toHaveLength(1);
    expect(h.logs).toContain('send-emails falló en segundo plano');
  });

  it('ni el registro ni la respuesta traen correos, alias, fichas, llaves ni el contenido', async () => {
    const h = harness(
      [reminder('a'), service('b'), reminder('c', { due: -1 })],
      {
        a: student('luna@ejemplo.mx'),
        b: { emails: ['sol@ejemplo.mx'], alias: 'Sol', unsubscribeToken: null },
        c: student('mar@ejemplo.mx'),
      },
      {
        script: (_request, index) =>
          index === 1 ? { status: 422, name: 'validation_error' } : undefined,
      },
    );
    const response = await call(h.deps);
    const visible = [
      await response.text(),
      ...h.logs,
      ...h.finished.map((item) => item.error ?? ''),
    ].join('\n');
    expect(visible).not.toMatch(/@|Luna|Sol\b|re_llave|Bearer|0123456789abcdef|tarjetas|Hola/);
  });
});
