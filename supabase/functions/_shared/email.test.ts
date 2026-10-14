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
  content_report: { questionKey: 'GO-0001', reason: 'wrong_key', openReports: 1 },
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

  it('el reporte avisa al médico con la clave y el motivo, sin el alumno ni la pregunta', () => {
    const email = renderEmail('content_report', samples.content_report, ctx);
    expect(email.subject).toBe('Nuevo reporte en una pregunta que revisas');
    expect(email.text).toBe(
      [
        'Hola, Dra. Luna.',
        'Un alumno reportó que la respuesta marcada no es la correcta en la pregunta GO-0001. Revísala en Studiare, Médico, Reportes.',
        'Ver los reportes en https://app.ejemplo.mx/Studiare-ENARM/medico/reportes',
        'Recibes este correo por tu cuenta de Studiare.',
      ].join('\n\n'),
    );
    const many = renderEmail(
      'content_report',
      { questionKey: 'MI-0420', reason: 'clinical_error', openReports: 3 },
      { ...ctx, alias: null },
    );
    expect(many.text).toContain(
      'Hola.\n\nUn alumno reportó un error clínico en la pregunta MI-0420. Revísala en Studiare, Médico, Reportes.\n\nLa pregunta tiene 3 reportes abiertos.',
    );
    for (const [reason, phrase] of [
      ['typo', 'una errata'],
      ['outdated', 'información desactualizada'],
      ['other', 'otro problema'],
    ] as const) {
      expect(renderEmail('content_report', { questionKey: 'GO-0001', reason }, ctx).text).toContain(
        `Un alumno reportó ${phrase} en la pregunta GO-0001.`,
      );
    }
  });

  it('el reporte no sale sin clave o con un motivo que no existe', () => {
    expect(() => renderEmail('content_report', { reason: 'typo' }, ctx)).toThrow(
      'Falta questionKey para el correo content_report',
    );
    expect(() =>
      renderEmail('content_report', { questionKey: '<b>GO</b>', reason: 'typo' }, ctx),
    ).toThrow('Falta questionKey');
    expect(() =>
      renderEmail('content_report', { questionKey: 'GO-0001', reason: 'toString' }, ctx),
    ).toThrow('Falta reason para el correo content_report');
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
