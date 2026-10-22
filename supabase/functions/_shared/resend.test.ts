import { describe, expect, it } from 'vitest';
import { renderEmail, type EmailContext, type EmailMessage } from './email.ts';
import { createFakeResend } from './fakeResend.ts';
import { RESEND_ENDPOINT, RESEND_PACE_MS, ResendError, createResendSender } from './resend.ts';

const KEY = 're_llave_de_prueba_falsa_0000';
const TOKEN = '0123456789abcdef0123456789abcdef0123';

const ctx: EmailContext = {
  appUrl: 'https://app.ejemplo.mx/',
  supportEmail: null,
  alias: 'Luna',
  unsubscribeUrl: `https://app.ejemplo.mx/correo/baja?t=${TOKEN}`,
  oneClickUrl: `https://proyecto.supabase.co/functions/v1/email-unsubscribe?t=${TOKEN}`,
};

function message(
  kind: 'daily_review_reminder' | 'trial_ending',
  to = 'luna@ejemplo.mx',
): EmailMessage {
  const rendered =
    kind === 'daily_review_reminder'
      ? renderEmail(kind, { due: 4, newAvailable: 0, day: '2026-10-20' }, ctx)
      : renderEmail(kind, { trialEnd: '2026-10-21T16:00:00Z', plan: 'monthly' }, ctx);
  return { ...rendered, to, idempotencyKey: `${kind}:alumna:2026-10-20` };
}

function sender(fake: ReturnType<typeof createFakeResend>, replyTo?: string) {
  return createResendSender({
    apiKey: KEY,
    from: 'Studiare <recordatorios@ejemplo.mx>',
    replyTo,
    fetch: fake.fetch,
  });
}

describe('ResendSender', () => {
  it('manda POST a /emails con la llave, la clave de repetición y el cuerpo de la API', async () => {
    const fake = createFakeResend({ apiKey: KEY });
    const result = await sender(fake).send(message('trial_ending'));
    expect(result).toEqual({ id: 're-simulado-1' });
    const [request] = fake.accepted;
    expect(request?.url).toBe(RESEND_ENDPOINT);
    expect(request?.method).toBe('POST');
    expect(request?.headers).toMatchObject({
      authorization: `Bearer ${KEY}`,
      'content-type': 'application/json',
      'idempotency-key': 'trial_ending:alumna:2026-10-20',
    });
    expect(request?.body).toMatchObject({
      from: 'Studiare <recordatorios@ejemplo.mx>',
      to: ['luna@ejemplo.mx'],
      tags: [
        { name: 'app', value: 'studiare' },
        { name: 'kind', value: 'trial_ending' },
      ],
    });
    expect(typeof request?.body.subject).toBe('string');
    expect(typeof request?.body.html).toBe('string');
    expect(typeof request?.body.text).toBe('string');
  });

  it('la baja de un clic solo va en el recordatorio, con las dos cabeceras de RFC 8058', async () => {
    const fake = createFakeResend({ apiKey: KEY });
    await sender(fake).send(message('daily_review_reminder'));
    await sender(fake).send(message('trial_ending'));
    const [reminder, service] = fake.accepted;
    expect(reminder?.body.headers).toEqual({
      'List-Unsubscribe': `<https://proyecto.supabase.co/functions/v1/email-unsubscribe?t=${TOKEN}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    });
    expect(service?.body).not.toHaveProperty('headers');
  });

  it('reply_to solo va si hay correo de soporte, y con el nombre de la API en snake_case', async () => {
    const fake = createFakeResend({ apiKey: KEY });
    await sender(fake).send(message('trial_ending'));
    await sender(fake, ' ayuda@ejemplo.mx ').send({
      ...message('trial_ending'),
      idempotencyKey: 'otra-clave',
    });
    expect(fake.accepted[0]?.body).not.toHaveProperty('reply_to');
    expect(fake.accepted[1]?.body.reply_to).toBe('ayuda@ejemplo.mx');
    expect(fake.accepted[1]?.body).not.toHaveProperty('replyTo');
  });

  it('repetir la misma clave no manda otro correo y devuelve el mismo id', async () => {
    const fake = createFakeResend({ apiKey: KEY });
    const first = await sender(fake).send(message('daily_review_reminder'));
    const second = await sender(fake).send(message('daily_review_reminder'));
    expect(second).toEqual(first);
    expect(fake.accepted).toHaveLength(1);
    expect(fake.replays).toBe(1);
  });

  it('recorta la clave de repetición a 256 caracteres', async () => {
    const fake = createFakeResend({ apiKey: KEY });
    await sender(fake).send({ ...message('trial_ending'), idempotencyKey: 'k'.repeat(300) });
    expect(fake.accepted[0]?.headers['idempotency-key']).toHaveLength(256);
  });

  it('clasifica los fallos sin repetir el mensaje de Resend ni la dirección', async () => {
    const cases: [number, string | undefined, string][] = [
      [429, 'rate_limit_exceeded', 'rate_limited'],
      [429, 'daily_quota_exceeded', 'rate_limited'],
      [401, 'restricted_api_key', 'unauthorized'],
      [409, 'concurrent_idempotent_requests', 'conflict'],
      [409, 'invalid_idempotent_request', 'rejected'],
      [422, 'validation_error', 'rejected'],
      [403, 'validation_error', 'rejected'],
      [400, undefined, 'rejected'],
      [500, 'internal_server_error', 'server'],
      [503, undefined, 'server'],
      [408, undefined, 'server'],
    ];
    for (const [status, name, failure] of cases) {
      const fake = createFakeResend({
        apiKey: KEY,
        script: () => ({ status, ...(name ? { name } : {}) }),
      });
      const error = await sender(fake)
        .send(message('trial_ending', 'secreta@ejemplo.mx'))
        .catch((caught: unknown) => caught);
      expect(error, `${status} ${name ?? ''}`).toBeInstanceOf(ResendError);
      const resend = error as ResendError;
      expect(resend.failure, `${status} ${name ?? ''}`).toBe(failure);
      expect(resend.status).toBe(status);
      // Sin nombre, el Resend simulado manda uno de prueba
      expect(resend.message).toBe(`Resend respondió ${status} ${name ?? 'error_de_prueba'}`);
      expect(resend.message).not.toMatch(/secreta|ejemplo\.mx|Mensaje de prueba/);
    }
  });

  it('un nombre de error que no es una palabra fija se descarta', async () => {
    const fetchImpl: typeof fetch = () =>
      Promise.resolve(
        new Response(JSON.stringify({ name: 'secreta@ejemplo.mx dijo que no', message: 'x' }), {
          status: 422,
          headers: { 'content-type': 'application/json' },
        }),
      );
    const error = await createResendSender({ apiKey: KEY, from: 'a', fetch: fetchImpl })
      .send(message('trial_ending'))
      .catch((caught: unknown) => caught);
    expect((error as ResendError).message).toBe('Resend respondió 422');
    expect((error as ResendError).code).toBeNull();
  });

  it('sin respuesta lanza network, y una respuesta que no es JSON se trata por su estado', async () => {
    const down: typeof fetch = () => Promise.reject(new TypeError('fetch failed'));
    const lost = await createResendSender({ apiKey: KEY, from: 'a', fetch: down })
      .send(message('trial_ending'))
      .catch((caught: unknown) => caught);
    expect(lost).toBeInstanceOf(ResendError);
    expect((lost as ResendError).failure).toBe('network');
    expect((lost as ResendError).message).toBe('Resend no respondió');
    const html: typeof fetch = () =>
      Promise.resolve(new Response('<html>mal</html>', { status: 502 }));
    const bad = await createResendSender({ apiKey: KEY, from: 'a', fetch: html })
      .send(message('trial_ending'))
      .catch((caught: unknown) => caught);
    expect((bad as ResendError).failure).toBe('server');
  });

  it('una llave equivocada recibe 401 y no se manda nada', async () => {
    const fake = createFakeResend({ apiKey: KEY });
    const error = await createResendSender({
      apiKey: 're_otra_llave_falsa',
      from: 'a',
      fetch: fake.fetch,
    })
      .send(message('trial_ending'))
      .catch((caught: unknown) => caught);
    expect((error as ResendError).failure).toBe('unauthorized');
    expect(fake.accepted).toHaveLength(0);
  });

  it('el ritmo de 550 ms cabe en el límite de 2 por segundo, y sin él Resend responde 429', async () => {
    let clock = 0;
    const fake = createFakeResend({ apiKey: KEY, now: () => clock });
    const paced = sender(fake);
    for (let index = 0; index < 20; index += 1) {
      await paced.send({ ...message('trial_ending'), idempotencyKey: `paced-${index}` });
      clock += RESEND_PACE_MS;
    }
    expect(fake.accepted).toHaveLength(20);
    // Sin esperar, la tercera petición del mismo segundo se pasa
    const burst = createFakeResend({ apiKey: KEY, now: () => 0 });
    await sender(burst).send({ ...message('trial_ending'), idempotencyKey: 'b1' });
    await sender(burst).send({ ...message('trial_ending'), idempotencyKey: 'b2' });
    const third = await sender(burst)
      .send({ ...message('trial_ending'), idempotencyKey: 'b3' })
      .catch((caught: unknown) => caught);
    expect((third as ResendError).failure).toBe('rate_limited');
  });

  it('rechaza lo que Resend rechazaría, como una etiqueta con espacios', async () => {
    const fake = createFakeResend({ apiKey: KEY });
    const error = await sender(fake)
      .send({ ...message('trial_ending'), tags: [{ name: 'mal nombre', value: 'x' }] })
      .catch((caught: unknown) => caught);
    expect((error as ResendError).failure).toBe('rejected');
    expect((error as ResendError).code).toBe('validation_error');
  });
});
