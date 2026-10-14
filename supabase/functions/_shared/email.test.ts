import { describe, expect, it } from 'vitest';
import {
  EMAIL_KINDS,
  createNoopSender,
  renderEmail,
  type EmailContext,
  type EmailKind,
} from './email.ts';

const ctx: EmailContext = {
  appUrl: 'https://app.ejemplo.mx/Studiare-ENARM/',
  supportEmail: null,
  alias: 'Dra. Luna',
};

/** Los datos como los deja la base en email_outbox, con las fechas como las manda PostgREST */
const samples: Record<EmailKind, Record<string, unknown>> = {
  trial_ending: { trialEnd: '2026-10-21T16:00:00+00:00', plan: 'founder', amountMxn: 79 },
  pass_expiring: { passEnd: '2026-11-13T05:59:59+00:00', plan: 'monthly' },
  invoice_requested: { requestId: '0b8f5f8e-1d6a-4c55-9e8e-7f3c2a1b0c9d', amountMxn: 1499 },
};

/** El texto sin direcciones web, que sí llevan dos puntos */
const withoutUrls = (value: string) => value.replace(/https?:\/\/\S+/g, '');

describe('plantillas de correo', () => {
  it('fin de la prueba con la fecha de Ciudad de México, el monto, el plan y la garantía', () => {
    const email = renderEmail('trial_ending', samples.trial_ending, ctx);
    expect(email.subject).toBe('Tu prueba gratis de Studiare termina el 21 de octubre de 2026');
    expect(email.text).toContain('Hola, Dra. Luna.');
    expect(email.text).toContain(
      'Tu prueba gratis termina el 21 de octubre de 2026. Ese día se cobran $79 MXN a tu tarjeta y tu plan Mensual Fundador sigue sin cortes.',
    );
    expect(email.text).toContain(
      'cancela antes en Studiare, Suscripción, Administrar suscripción. Después del primer cobro tienes 7 días de garantía.',
    );
    expect(email.text).toContain(
      'Ver mi suscripción en https://app.ejemplo.mx/Studiare-ENARM/suscripcion',
    );
  });

  it('sin monto usa el precio del plan', () => {
    const email = renderEmail(
      'trial_ending',
      { trialEnd: '2026-10-21T16:00:00Z', plan: 'annual' },
      ctx,
    );
    expect(email.text).toContain('se cobran $1,499 MXN a tu tarjeta y tu plan Anual sigue');
  });

  it('el pase que vence dice si es de 1 mes o de 1 año y cómo seguir', () => {
    const month = renderEmail('pass_expiring', samples.pass_expiring, ctx);
    // 05:59:59 UTC del 13 es el 12 a las 23:59:59 en Ciudad de México
    expect(month.subject).toBe('Tu pase de Studiare vence el 12 de noviembre de 2026');
    expect(month.text).toContain('Tu pase de 1 mes vence el 12 de noviembre de 2026.');
    expect(month.text).toContain(
      'paga otro periodo con OXXO o SPEI, o cámbiate a tarjeta con renovación automática en Suscripción.',
    );
    const year = renderEmail('pass_expiring', { ...samples.pass_expiring, plan: 'annual' }, ctx);
    expect(year.text).toContain('Tu pase de 1 año vence');
  });

  it('la solicitud de factura va al equipo con el monto y sin datos fiscales', () => {
    const email = renderEmail('invoice_requested', samples.invoice_requested, ctx);
    expect(email.subject).toBe('Nueva solicitud de factura');
    expect(email.text).toContain(
      'Hay una solicitud de factura nueva por $1,499 MXN.\n\nRevísala en Studiare, Administración, Pagos.',
    );
    expect(email.text).not.toContain('Hola');
    expect(email.text).not.toMatch(/RFC|0b8f5f8e/);
  });

  it('ningún correo lleva dos puntos en sus frases, correos de personas ni RFC, y trata de tú', () => {
    for (const kind of EMAIL_KINDS) {
      const email = renderEmail(kind, samples[kind], ctx);
      expect(withoutUrls(email.subject)).not.toContain(':');
      expect(withoutUrls(email.text)).not.toContain(':');
      expect(`${email.text} ${email.html}`).not.toContain('@');
      expect(email.text).not.toMatch(/\busted\b|\bsu cuenta\b/i);
      expect(email.tags).toEqual([
        { name: 'app', value: 'studiare' },
        { name: 'kind', value: kind },
      ]);
    }
  });

  it('el correo de ayuda va al pie solo si existe', () => {
    const email = renderEmail('pass_expiring', samples.pass_expiring, {
      ...ctx,
      supportEmail: ' ayuda@studiare.mx ',
    });
    expect(email.text).toContain('Si tienes dudas, escríbenos a ayuda@studiare.mx.');
    expect(email.html).toContain('escríbenos a ayuda@studiare.mx.');
  });

  it('el HTML limpia el alias y saluda sin nombre si no hay', () => {
    const email = renderEmail('trial_ending', samples.trial_ending, {
      ...ctx,
      alias: '<b>Luna</b> & "Sol"',
    });
    expect(email.html).toContain('<p>Hola, &lt;b&gt;Luna&lt;/b&gt; &amp; &quot;Sol&quot;.</p>');
    expect(email.html).not.toContain('<b>Luna</b>');
    expect(email.html).toContain(
      '<a href="https://app.ejemplo.mx/Studiare-ENARM/suscripcion">Ver mi suscripción</a>',
    );
    expect(renderEmail('trial_ending', samples.trial_ending, { ...ctx, alias: '  ' }).text).toMatch(
      /^Hola\.\n/,
    );
  });

  it('lanza con el dato que falta, para que el correo no salga a medias', () => {
    expect(() => renderEmail('trial_ending', { plan: 'monthly' }, ctx)).toThrow(
      'Falta trialEnd para el correo trial_ending',
    );
    expect(() =>
      renderEmail('trial_ending', { trialEnd: '2026-10-21T16:00:00Z', plan: 'free' }, ctx),
    ).toThrow('Falta plan para el correo trial_ending');
    expect(() => renderEmail('pass_expiring', { passEnd: 'mañana', plan: 'monthly' }, ctx)).toThrow(
      'Falta passEnd',
    );
    expect(() => renderEmail('invoice_requested', { amountMxn: 0 }, ctx)).toThrow(
      'Falta amountMxn para el correo invoice_requested',
    );
  });
});

describe('envío de B10', () => {
  it('no manda nada y deja una línea sin destinatario, alias ni clave', async () => {
    const lines: string[] = [];
    const sender = createNoopSender((line) => lines.push(line));
    const rendered = renderEmail('trial_ending', samples.trial_ending, ctx);
    const result = await sender.send({
      ...rendered,
      to: 'alumna@ejemplo.mx',
      idempotencyKey: 'trial_ending:sub_1:2026-10-21',
    });
    expect(result).toEqual({ id: 'noop' });
    expect(lines).toEqual(['Correo trial_ending sin enviar. El envío de correos llega en B15']);
    expect(lines.join(' ')).not.toMatch(/alumna|Luna|sub_1/);
  });
});
