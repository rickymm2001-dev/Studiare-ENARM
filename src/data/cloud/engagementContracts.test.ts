// Los contratos de B15 entre la app, el servidor y los dobles (7.5 del plan de B15). Las muestras son las
// del plan, tal cual, porque cambiar una forma después del paso 0 pide a la sesión principal
import { describe, expect, it } from 'vitest';
import {
  ALL_WEEK_DAYS,
  AnalyticsIdentitySchema,
  DueSnapshotSchema,
  EMAIL_DELIVERY_OFF,
  EMAIL_STATUSES,
  EmailDeliverySchema,
  EmailOverviewSchema,
  EmailUnsubscribeReplySchema,
  MONITORING_TEST_MESSAGES,
  MonitoringTestReplySchema,
  REMINDER_FREQUENCIES,
  ReminderEmailDataSchema,
  ReminderPrefsSchema,
  UNAVAILABLE_REMINDER_PREFS,
  UNSUBSCRIBE_TOKEN,
  WEEKDAYS,
  daysOfFrequency,
  frequencyOf,
} from './engagementContracts';

describe('recordatorios por correo', () => {
  it('my_reminder_prefs y set_reminder_prefs devuelven la forma del plan', () => {
    const sample = {
      available: true,
      enabled: false,
      hour: 20,
      days: [1, 2, 3, 4, 5],
      frequency: 'weekdays',
      onlyWhenDue: true,
      timeZone: 'America/Merida',
      unsubscribed: false,
    };
    expect(ReminderPrefsSchema.parse(sample)).toEqual(sample);
    // Una respuesta con campos de más se acepta y se quitan
    expect(ReminderPrefsSchema.parse({ ...sample, extra: 1 })).toEqual(sample);
  });

  it('rechaza una hora fuera de 5 a 23, días repetidos fuera de 0 a 6 o una lista vacía', () => {
    const base = { ...UNAVAILABLE_REMINDER_PREFS, available: true };
    expect(ReminderPrefsSchema.safeParse({ ...base, hour: 4 }).success).toBe(false);
    expect(ReminderPrefsSchema.safeParse({ ...base, hour: 24 }).success).toBe(false);
    expect(ReminderPrefsSchema.safeParse({ ...base, hour: 20.5 }).success).toBe(false);
    expect(ReminderPrefsSchema.safeParse({ ...base, days: [] }).success).toBe(false);
    expect(ReminderPrefsSchema.safeParse({ ...base, days: [7] }).success).toBe(false);
    expect(ReminderPrefsSchema.safeParse({ ...base, frequency: 'monthly' }).success).toBe(false);
  });

  it('sin cuenta en la nube available es false y todo queda apagado', () => {
    expect(ReminderPrefsSchema.parse(UNAVAILABLE_REMINDER_PREFS)).toEqual(
      UNAVAILABLE_REMINDER_PREFS,
    );
    expect(UNAVAILABLE_REMINDER_PREFS).toMatchObject({ available: false, enabled: false });
  });

  it('la frecuencia sale de los días y viceversa, con el domingo en 0', () => {
    expect(frequencyOf([0, 1, 2, 3, 4, 5, 6])).toBe('daily');
    expect(frequencyOf([6, 5, 4, 3, 2, 1, 0])).toBe('daily');
    expect(frequencyOf([1, 2, 3, 4, 5])).toBe('weekdays');
    expect(frequencyOf([5, 4, 3, 2, 1, 1])).toBe('weekdays');
    expect(frequencyOf([1, 3])).toBe('custom');
    expect(frequencyOf([0, 6])).toBe('custom');
    expect(daysOfFrequency('daily')).toEqual([...ALL_WEEK_DAYS]);
    expect(daysOfFrequency('weekdays')).toEqual([...WEEKDAYS]);
    expect(daysOfFrequency('custom', [5, 1, 5, 3])).toEqual([1, 3, 5]);
    for (const frequency of REMINDER_FREQUENCIES) {
      const days = daysOfFrequency(frequency, [2, 4]);
      expect(days.length).toBeGreaterThan(0);
    }
  });

  it('la foto de vencidas lleva solo fechas y números, hasta 14 días', () => {
    const sample = {
      computedAt: '2026-10-20T15:00:00.000Z',
      timeZone: 'America/Merida',
      days: [
        { day: '2026-10-20', due: 37 },
        { day: '2026-10-21', due: 52 },
      ],
      newAvailable: 10,
    };
    expect(DueSnapshotSchema.parse(sample)).toEqual(sample);
    const day = (index: number) => ({
      day: `2026-11-${String(index + 1).padStart(2, '0')}`,
      due: 1,
    });
    expect(
      DueSnapshotSchema.safeParse({ ...sample, days: Array.from({ length: 14 }, (_, i) => day(i)) })
        .success,
    ).toBe(true);
    expect(
      DueSnapshotSchema.safeParse({ ...sample, days: Array.from({ length: 15 }, (_, i) => day(i)) })
        .success,
    ).toBe(false);
    // Nada que no sea de la lista viaja, ni una tarjeta ni un texto
    expect(DueSnapshotSchema.safeParse({ ...sample, cards: ['abc'] }).success).toBe(false);
    expect(
      DueSnapshotSchema.safeParse({ ...sample, days: [{ day: '2026-10-20', due: 1, title: 'x' }] })
        .success,
    ).toBe(false);
    expect(DueSnapshotSchema.safeParse({ ...sample, newAvailable: -1 }).success).toBe(false);
  });

  it('los datos del correo del recordatorio traen el conteo o null, sin arroba', () => {
    const withCount = { due: 37, newAvailable: 10, day: '2026-10-20' };
    expect(ReminderEmailDataSchema.parse(withCount)).toEqual(withCount);
    expect(ReminderEmailDataSchema.parse({ ...withCount, due: null }).due).toBeNull();
    expect(JSON.stringify(withCount)).not.toContain('@');
    expect(ReminderEmailDataSchema.safeParse({ ...withCount, alias: 'Ana' }).success).toBe(false);
  });
});

describe('baja de un clic', () => {
  it('la ficha son 18 bytes en hexadecimal, 36 caracteres', () => {
    expect(UNSUBSCRIBE_TOKEN.test('0123456789abcdef0123456789abcdef0123')).toBe(true);
    expect(UNSUBSCRIBE_TOKEN.test('0123456789abcdef0123456789abcdef')).toBe(false);
    expect(UNSUBSCRIBE_TOKEN.test('0123456789ABCDEF0123456789ABCDEF0123')).toBe(false);
    expect(UNSUBSCRIBE_TOKEN.test('x'.repeat(36))).toBe(false);
  });

  it('la respuesta para la página es done, already o invalid', () => {
    for (const result of ['done', 'already', 'invalid']) {
      expect(EmailUnsubscribeReplySchema.parse({ result })).toEqual({ result });
    }
    expect(EmailUnsubscribeReplySchema.safeParse({ result: 'ok' }).success).toBe(false);
  });
});

describe('identidad de la analítica', () => {
  it('analytics_identity y set_analytics_consent devuelven un uuid y el permiso', () => {
    const sample = { analyticsId: '3f1d4c52-9f1e-4a0e-8d52-6d1c9a2b7e10', consent: true };
    expect(AnalyticsIdentitySchema.parse(sample)).toEqual(sample);
    expect(
      AnalyticsIdentitySchema.safeParse({ analyticsId: 'ana@ejemplo.mx', consent: true }).success,
    ).toBe(false);
    expect(AnalyticsIdentitySchema.safeParse({ analyticsId: sample.analyticsId }).success).toBe(
      false,
    );
  });
});

describe('interruptores, conteos y error de prueba', () => {
  it('el envío de correos nace apagado y un valor inválido cuenta como apagado', () => {
    expect(EMAIL_DELIVERY_OFF).toEqual({ enabled: false, paused: [] });
    expect(EmailDeliverySchema.parse({ enabled: true })).toEqual({ enabled: true, paused: [] });
    expect(
      EmailDeliverySchema.parse({ enabled: true, paused: ['daily_review_reminder'] }).paused,
    ).toEqual(['daily_review_reminder']);
    expect(EmailDeliverySchema.safeParse({ enabled: 'yes' }).success).toBe(false);
  });

  it('el resumen del admin cuenta por tipo y estado, sin destinatarios', () => {
    const sample = {
      days: 7,
      kinds: [{ kind: 'daily_review_reminder', queued: 0, sent: 12, skipped: 3, failed: 1 }],
    };
    expect(EmailOverviewSchema.parse(sample)).toEqual(sample);
    expect(EMAIL_STATUSES).toEqual(['queued', 'sent', 'skipped', 'failed']);
  });

  it('el error de prueba trae un mensaje fijo por lado y la función contesta sent o missing_dsn', () => {
    expect(MONITORING_TEST_MESSAGES.browser).toBe('Prueba de alertas de Studiare, navegador');
    expect(MONITORING_TEST_MESSAGES.functions).toBe('Prueba de alertas de Studiare, funciones');
    expect(MonitoringTestReplySchema.parse({ result: 'missing_dsn' }).result).toBe('missing_dsn');
    expect(MonitoringTestReplySchema.safeParse({ result: 'queued' }).success).toBe(false);
  });
});
