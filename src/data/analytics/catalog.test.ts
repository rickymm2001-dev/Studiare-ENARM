// El catálogo de eventos de la analítica (B15, paso 0). Comprueba que la lista es cerrada, que ninguna
// propiedad admite un texto libre y que sin permiso track no entrega ni junta nada (1.1 y 1.9 del plan de B15)
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PLANS } from '@/config/billing';
import { REMINDER_FREQUENCIES, REMINDER_HOURS } from '@/data/cloud/engagementContracts';
import { TOUR_STEPS } from '@/features/tour/steps';
import {
  ANALYTICS_EVENTS,
  EXAM_SIZES,
  HOUR_BANDS,
  ITEM_BANDS,
  MINUTE_BANDS,
  PAID_PLANS,
  RESULT_BANDS,
  SERVER_ANALYTICS_EVENTS,
  analyticsConsent,
  hourBandOf,
  itemBandOf,
  minuteBandOf,
  resetAnalytics,
  resultBandOf,
  sanitizeEvent,
  setAnalyticsConsent,
  setAnalyticsSink,
  track,
  type AnalyticsRecord,
} from './catalog';

afterEach(() => {
  resetAnalytics();
});

/** Todas las propiedades de todos los eventos, con sus valores */
const everyProperty = [
  ...Object.entries(ANALYTICS_EVENTS),
  ...Object.entries(SERVER_ANALYTICS_EVENTS),
].flatMap(([event, shape]) =>
  Object.entries(shape as Record<string, readonly (string | number | boolean)[]>).map(
    ([name, values]) => ({ event, name, values }),
  ),
);

describe('la lista de eventos es cerrada', () => {
  it('trae los eventos de la tabla 1.5 de la app, los tres de la encuesta de B18 y los ocho de dinero del servidor', () => {
    expect(Object.keys(ANALYTICS_EVENTS).sort()).toEqual(
      [
        'signup_completed',
        'review_session_completed',
        'practice_session_completed',
        'exam_started',
        'exam_completed',
        'question_card_created',
        'outline_created',
        'outline_line_to_card',
        'outline_search_used',
        'pomodoro_completed',
        'duel_started',
        'duel_completed',
        'party_group_joined',
        'official_score_captured',
        'deck_imported',
        'paywall_viewed',
        'checkout_started',
        'reminder_prefs_saved',
        'tour_started',
        'tour_step_viewed',
        'tour_completed',
        'tour_skipped',
        'survey_shown',
        'survey_dismissed',
        'survey_completed',
      ].sort(),
    );
    expect(Object.keys(SERVER_ANALYTICS_EVENTS)).toEqual([
      'trial_started',
      'trial_converted',
      'trial_canceled',
      'payment_succeeded',
      'subscription_cancel_scheduled',
      'subscription_canceled',
      'plan_changed',
      'refund_issued',
    ]);
  });

  it('cada propiedad admite una lista corta de valores y ninguno es un texto libre', () => {
    for (const { event, name, values } of everyProperty) {
      expect(values.length, `${event}.${name}`).toBeGreaterThan(0);
      expect(values.length, `${event}.${name} es una lista corta`).toBeLessThanOrEqual(12);
      for (const value of values) {
        expect(['string', 'number', 'boolean'], `${event}.${name}`).toContain(typeof value);
        if (typeof value === 'string') {
          // Nada que se parezca a un correo, una dirección, un id o una frase
          expect(value, `${event}.${name}`).toMatch(/^[A-Za-z0-9_+-]{1,24}$/);
        }
      }
    }
  });

  it('los tres eventos de la encuesta solo dicen que se ofreció, cómo se escondió y cuántas preguntas se contestaron', () => {
    // Nunca una respuesta ni el comentario (B18, 3 del diseño). Si alguien suma una propiedad, esta prueba lo avisa
    expect(ANALYTICS_EVENTS.survey_shown).toEqual({});
    expect(ANALYTICS_EVENTS.survey_dismissed).toEqual({ how: ['later', 'never'] });
    expect(ANALYTICS_EVENTS.survey_completed).toEqual({ answered: [7, 8] });
  });

  it('ninguna propiedad se llama como un dato de la persona', () => {
    const forbidden =
      /^(email|correo|name|nombre|alias|user|user_id|userid|account|id|text|texto|query|search|specialty|score|puntaje|answer|code|group|deck|question|card)$/i;
    for (const { event, name } of everyProperty) {
      expect(name, event).not.toMatch(forbidden);
    }
  });

  it('signup_completed no lleva cómo nos conociste ni el código de influencer (D-132)', () => {
    const names = Object.keys(ANALYTICS_EVENTS.signup_completed);
    expect(names).not.toContain('heard_from');
    expect(names).not.toContain('has_code');
    expect(names.sort()).toEqual(['method', 'target_specialty_set']);
  });

  it('repite sin cambio las listas de otros archivos, que la compilación revisa y esta prueba completa', () => {
    expect([...ANALYTICS_EVENTS.reminder_prefs_saved.frequency]).toEqual([...REMINDER_FREQUENCIES]);
    expect([...ANALYTICS_EVENTS.tour_step_viewed.step]).toEqual([...TOUR_STEPS]);
    expect([...ANALYTICS_EVENTS.tour_skipped.step]).toEqual([...TOUR_STEPS]);
    expect([...ANALYTICS_EVENTS.tour_completed.step]).toEqual([...TOUR_STEPS]);
    // Los planes de pago son todos los de la tabla de planes menos Gratis
    expect([...PAID_PLANS].sort()).toEqual(
      Object.keys(PLANS)
        .filter((plan) => plan !== 'free')
        .sort(),
    );
    expect([...ANALYTICS_EVENTS.exam_started.size]).toEqual([...EXAM_SIZES]);
  });
});

describe('sanitizeEvent', () => {
  it('deja pasar solo las propiedades de la lista y devuelve una copia', () => {
    const props = { items: '10-49', minutes: '5-14' };
    const clean = sanitizeEvent('review_session_completed', props);
    expect(clean).toEqual(props);
    expect(clean).not.toBe(props);
  });

  it('acepta eventos sin propiedades, booleanos y números de la lista', () => {
    expect(sanitizeEvent('duel_started', {})).toEqual({});
    expect(sanitizeEvent('exam_started', { size: 280, english_included: true })).toEqual({
      size: 280,
      english_included: true,
    });
    expect(sanitizeEvent('pomodoro_completed', { focus_minutes: 'other' })).toEqual({
      focus_minutes: 'other',
    });
  });

  it('descarta el evento completo si sobra, falta o no es de la lista alguna propiedad', () => {
    expect(sanitizeEvent('review_session_completed', { items: '10-49' })).toBeNull();
    expect(
      sanitizeEvent('review_session_completed', { items: '10-49', minutes: '5-14', alias: 'Ana' }),
    ).toBeNull();
    expect(sanitizeEvent('review_session_completed', { items: '12', minutes: '5-14' })).toBeNull();
    expect(sanitizeEvent('exam_started', { size: 30, english_included: true })).toBeNull();
    expect(sanitizeEvent('exam_started', { size: '280', english_included: true })).toBeNull();
    expect(sanitizeEvent('exam_started', { size: 280, english_included: 'true' })).toBeNull();
    // Un correo, una frase o un id no caben, ni donde se espera un texto
    expect(sanitizeEvent('paywall_viewed', { feature: 'ana@ejemplo.mx' })).toBeNull();
    expect(sanitizeEvent('paywall_viewed', { feature: 'Quiero comprar Apuntes' })).toBeNull();
    // Un evento con la misma cantidad de propiedades pero otro nombre tampoco pasa
    expect(sanitizeEvent('paywall_viewed', { screen: 'outlines' })).toBeNull();
  });

  it('descarta lo que no es un evento de la lista o no es un objeto', () => {
    expect(sanitizeEvent('consent_changed', {})).toBeNull();
    expect(sanitizeEvent('trial_started', { plan: 'monthly' })).toBeNull();
    expect(sanitizeEvent('__proto__', {})).toBeNull();
    expect(sanitizeEvent('toString', {})).toBeNull();
    expect(sanitizeEvent('duel_started', null)).toBeNull();
    expect(sanitizeEvent('duel_started', 'x')).toBeNull();
    expect(sanitizeEvent('duel_started', [])).toBeNull();
  });
});

describe('track', () => {
  const record = (): AnalyticsRecord[] => {
    const seen: AnalyticsRecord[] = [];
    setAnalyticsSink((item) => seen.push(item));
    return seen;
  };

  it('sin saber el permiso no entrega ni junta nada', () => {
    const seen = record();
    expect(analyticsConsent()).toBeNull();
    track('duel_started', {});
    // Aunque después llegue el permiso, lo de antes no se acumuló en ningún lado
    setAnalyticsConsent(true);
    expect(seen).toEqual([]);
  });

  it('con el permiso apagado no entrega nada, y apagarlo corta lo que sigue', () => {
    const seen = record();
    setAnalyticsConsent(false);
    track('duel_started', {});
    expect(seen).toEqual([]);
    setAnalyticsConsent(true);
    track('duel_started', {});
    setAnalyticsConsent(false);
    track('party_group_joined', {});
    expect(seen.map((item) => item.event)).toEqual(['duel_started']);
  });

  it('con el permiso valida y entrega el evento con sus propiedades y su hora', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-20T15:00:00.000Z'));
    try {
      const seen = record();
      setAnalyticsConsent(true);
      track('checkout_started', { plan: 'monthly', method: 'oxxo', with_trial: false });
      expect(seen).toEqual([
        {
          event: 'checkout_started',
          properties: { plan: 'monthly', method: 'oxxo', with_trial: false },
          at: Date.parse('2026-10-20T15:00:00.000Z'),
        },
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('descarta lo que no cumple la lista, aunque llegue por un camino sin tipos', () => {
    const seen = record();
    setAnalyticsConsent(true);
    const loose = track as (event: string, props: unknown) => void;
    loose('review_session_completed', { items: '10-49', minutes: '5-14', alias: 'Ana' });
    loose('review_session_completed', { items: 'veinte', minutes: '5-14' });
    loose('no_existe', {});
    expect(seen).toEqual([]);
  });

  it('sin quien reciba no hace nada, y si quien recibe falla, no rompe a quien mide', () => {
    setAnalyticsConsent(true);
    expect(() => {
      track('duel_started', {});
    }).not.toThrow();
    setAnalyticsSink(() => {
      throw new Error('falla de la cola');
    });
    expect(() => {
      track('duel_started', {});
    }).not.toThrow();
  });

  it('los tipos no dejan pasar un texto libre', () => {
    setAnalyticsConsent(false);
    // @ts-expect-error alias no es una propiedad de review_session_completed
    track('review_session_completed', { items: '10-49', minutes: '5-14', alias: 'Ana' });
    // @ts-expect-error un texto cualquiera no es un rango de tarjetas
    track('review_session_completed', { items: 'muchas', minutes: '5-14' });
    // @ts-expect-error trial_started es del servidor y no pasa por track
    track('trial_started', { plan: 'monthly' });
  });
});

describe('los rangos', () => {
  it('cuentan tarjetas y preguntas en cuatro rangos, sin el número exacto', () => {
    expect([0, 1, 9, 10, 49, 50, 199, 200, 5000].map(itemBandOf)).toEqual([
      '1-9',
      '1-9',
      '1-9',
      '10-49',
      '10-49',
      '50-199',
      '50-199',
      '200+',
      '200+',
    ]);
    expect(new Set(ITEM_BANDS).size).toBe(4);
  });

  it('cuentan los minutos de un repaso', () => {
    expect([0, 4, 5, 14, 15, 29, 30, 59, 60, 300].map(minuteBandOf)).toEqual([
      '1-4',
      '1-4',
      '5-14',
      '5-14',
      '15-29',
      '15-29',
      '30-59',
      '30-59',
      '60+',
      '60+',
    ]);
    expect(MINUTE_BANDS).toHaveLength(5);
  });

  it('cuentan los resultados de una búsqueda y el cero es su propio rango', () => {
    expect([0, 1, 4, 5, 19, 20, 200].map(resultBandOf)).toEqual([
      '0',
      '1-4',
      '1-4',
      '5-19',
      '5-19',
      '20+',
      '20+',
    ]);
    expect(RESULT_BANDS).toHaveLength(4);
  });

  it('dan una parte del día a cada hora que se puede elegir para el recordatorio', () => {
    const hours = Array.from(
      { length: REMINDER_HOURS.max - REMINDER_HOURS.min + 1 },
      (_, index) => REMINDER_HOURS.min + index,
    );
    expect(hours).toHaveLength(19);
    for (const hour of hours) expect(HOUR_BANDS).toContain(hourBandOf(hour));
    expect([5, 11, 12, 18, 19, 23].map(hourBandOf)).toEqual([
      'morning',
      'morning',
      'afternoon',
      'afternoon',
      'night',
      'night',
    ]);
  });
});
