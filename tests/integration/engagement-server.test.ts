// El servidor de B15 cumple los contratos que fijó el paso 0 (7.5 del plan de B15). Las funciones de
// supabase/functions no importan de src, así que lo que comparten con la app, las formas de las respuestas, el
// catálogo de eventos de dinero y los mensajes de la prueba de alertas, se compara aquí, donde sí se pueden
// importar las dos cosas. Si alguien cambia un lado y no el otro, esta prueba falla.
import { describe, expect, it } from 'vitest';
import {
  EMAIL_STATUSES,
  EmailUnsubscribeReplySchema,
  MONITORING_TEST_FUNCTION,
  MONITORING_TEST_MESSAGES,
  MonitoringTestReplySchema,
  ReminderEmailDataSchema,
  UNSUBSCRIBE_PAGE_PATH,
  UNSUBSCRIBE_TOKEN,
} from '@/data/cloud/engagementContracts';
import { SERVER_ANALYTICS_EVENTS } from '@/data/analytics/catalog';
import { SERVER_EVENT_PROPS } from '../../supabase/functions/_shared/analyticsFlush.ts';
import { EMAIL_KINDS, renderEmail } from '../../supabase/functions/_shared/email.ts';
import {
  MONITORING_TEST_MESSAGE,
  type MonitoringDeps,
} from '../../supabase/functions/_shared/monitoring.ts';
import { handleMonitoringTest } from '../../supabase/functions/_shared/monitoringTest.ts';
import { handleEmailUnsubscribe } from '../../supabase/functions/_shared/unsubscribe.ts';
import { FAKE_EMAIL_KINDS } from '../e2e/support/fakeEngagement';

describe('eventos de dinero del servidor y del catálogo de la app', () => {
  it('son los mismos ocho, en el mismo orden, con las mismas propiedades y valores', () => {
    expect(Object.keys(SERVER_EVENT_PROPS)).toEqual(Object.keys(SERVER_ANALYTICS_EVENTS));
    for (const [name, props] of Object.entries(SERVER_ANALYTICS_EVENTS)) {
      const mine = SERVER_EVENT_PROPS[name] ?? {};
      expect(Object.keys(mine).sort(), name).toEqual(Object.keys(props).sort());
      for (const [prop, values] of Object.entries(props)) {
        expect([...(mine[prop] ?? [])].map(String).sort(), `${name}.${prop}`).toEqual(
          [...(values as readonly (string | boolean)[])].map(String).sort(),
        );
      }
    }
  });
});

describe('correos', () => {
  it('los tipos de la plantilla son los de email_kinds que siembra el doble de Playwright', () => {
    expect([...EMAIL_KINDS].sort()).toEqual([...FAKE_EMAIL_KINDS].sort());
  });

  it('el estado de un correo es uno de los cuatro de la cola', () => {
    expect([...EMAIL_STATUSES]).toEqual(['queued', 'sent', 'skipped', 'failed']);
  });

  it('el dato del recordatorio de la cola, el de ReminderEmailDataSchema, alcanza para armar el correo', () => {
    for (const data of [
      { due: 37, newAvailable: 10, day: '2026-10-20' },
      { due: null, newAvailable: 0, day: '2026-10-20' },
    ]) {
      expect(ReminderEmailDataSchema.safeParse(data).success).toBe(true);
      const email = renderEmail('daily_review_reminder', data, {
        appUrl: 'https://app.ejemplo.mx',
        supportEmail: null,
        alias: 'Luna',
        unsubscribeUrl: `https://app.ejemplo.mx${UNSUBSCRIBE_PAGE_PATH}?t=0123456789abcdef0123456789abcdef0123`,
      });
      expect(email.subject.length).toBeGreaterThan(0);
    }
  });
});

describe('la baja de un clic y la página de la app', () => {
  const TOKEN = '0123456789abcdef0123456789abcdef0123';

  it('la ficha de la función tiene la misma forma que espera la app', () => {
    expect(UNSUBSCRIBE_TOKEN.test(TOKEN)).toBe(true);
    expect(UNSUBSCRIBE_TOKEN.test(TOKEN.toUpperCase())).toBe(false);
  });

  it('la respuesta a la página cumple EmailUnsubscribeReplySchema', async () => {
    for (const result of ['done', 'already', 'invalid'] as const) {
      const response = await handleEmailUnsubscribe(
        new Request('https://proyecto.supabase.co/functions/v1/email-unsubscribe', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ token: TOKEN }),
        }),
        {
          appUrl: 'https://app.ejemplo.mx',
          unsubscribe: () => Promise.resolve(result),
          log: () => undefined,
        },
      );
      expect(EmailUnsubscribeReplySchema.parse(await response.json())).toEqual({ result });
    }
  });

  it('la redirección del GET lleva a la ruta pública de la app', async () => {
    const response = await handleEmailUnsubscribe(
      new Request(`https://proyecto.supabase.co/functions/v1/email-unsubscribe?t=${TOKEN}`),
      {
        appUrl: 'https://app.ejemplo.mx',
        unsubscribe: () => Promise.resolve('done'),
        log: () => undefined,
      },
    );
    expect(response.headers.get('location')).toBe(
      `https://app.ejemplo.mx${UNSUBSCRIBE_PAGE_PATH}?t=${TOKEN}`,
    );
  });
});

describe('la prueba de alertas', () => {
  it('el mensaje fijo de las funciones es el del contrato, y la respuesta cumple MonitoringTestReplySchema', async () => {
    expect(MONITORING_TEST_MESSAGE).toBe(MONITORING_TEST_MESSAGES.functions);
    const monitoring = (dsn: string | undefined): MonitoringDeps => ({
      dsn,
      fetch: () => Promise.resolve(new Response('{}', { status: 200 })),
      now: () => 1_800_000_000_000,
      uuid: () => crypto.randomUUID(),
      region: 'us-east-1',
      version: 'v1',
      environment: 'production',
      log: () => undefined,
    });
    const call = (dsn: string | undefined) =>
      handleMonitoringTest(
        new Request(`https://proyecto.supabase.co/functions/v1/${MONITORING_TEST_FUNCTION}`, {
          method: 'POST',
          headers: { authorization: 'Bearer sesion' },
        }),
        { appUrl: undefined, adminOk: () => Promise.resolve(true), monitoring: monitoring(dsn) },
      );
    const dsn = 'https://0123456789abcdef0123456789abcdef@o450.ingest.sentry.io/45';
    expect(MonitoringTestReplySchema.parse(await (await call(dsn)).json())).toEqual({
      result: 'sent',
    });
    expect(MonitoringTestReplySchema.parse(await (await call(undefined)).json())).toEqual({
      result: 'missing_dsn',
    });
  });
});
