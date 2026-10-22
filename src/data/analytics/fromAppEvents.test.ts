// El puente de la bitácora a la analítica (B15, 1.6 y 6.3): la tabla de traducción, que sin permiso no hace
// nada y que lo que baja de otros dispositivos no se mide. Solo prueba la traducción, el cliente completo se
// prueba aparte
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createEvent } from '../events/createEvent';
import { newId } from '../testing/fixtures';
import type { AppEvent } from '../schemas/events';
import {
  resetAnalytics,
  setAnalyticsConsent,
  setAnalyticsSink,
  type AnalyticsRecord,
} from './catalog';
import { createAppEventBridge, MAX_SESSIONS_IN_MEMORY } from './fromAppEvents';

const USER = newId();
const SESSION = newId();
const ctx = { userId: USER, tz: 'America/Merida', sessionId: SESSION };

let seen: AnalyticsRecord[];
let feedbackCalls: string[];
let bridge: ReturnType<typeof createAppEventBridge>;
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  seen = [];
  feedbackCalls = [];
  setAnalyticsSink((record) => seen.push(record));
  setAnalyticsConsent(true);
  bridge = createAppEventBridge({
    practiceFeedback: (userId) => {
      feedbackCalls.push(userId);
      return Promise.resolve('each');
    },
  });
});
afterEach(() => {
  resetAnalytics();
});

const send = async (...events: AppEvent[]) => {
  for (const event of events) bridge.onRecorded(event);
  await flush();
};
const names = () => seen.map((record) => record.event);
const last = () => seen.at(-1);

describe('repaso', () => {
  it('session_ended de repaso mide las tarjetas y los minutos en rangos', async () => {
    await send(
      createEvent(
        'session_ended',
        {
          kind: 'review',
          reason: 'completed',
          items: 37,
          correct: null,
          durationMs: 12 * 60_000,
          xp: 80,
        },
        ctx,
      ),
    );
    expect(last()).toMatchObject({
      event: 'review_session_completed',
      properties: { items: '10-49', minutes: '5-14' },
    });
  });

  it('un repaso abandonado con tarjetas repasadas también cuenta, y uno sin tarjetas no', async () => {
    const ended = (items: number) =>
      createEvent(
        'session_ended',
        {
          kind: 'review',
          reason: 'abandoned',
          items,
          correct: null,
          durationMs: 40_000,
          xp: 0,
        },
        ctx,
      );
    await send(ended(0));
    expect(seen).toEqual([]);
    await send(ended(3));
    expect(last()).toMatchObject({ properties: { items: '1-9', minutes: '1-4' } });
  });
});

describe('práctica', () => {
  const started = (config: Record<string, string | number | boolean>) =>
    createEvent('session_started', { kind: 'practice', config }, ctx);
  const ended = (items: number) =>
    createEvent(
      'session_ended',
      {
        kind: 'practice',
        reason: 'completed',
        items,
        correct: 5,
        durationMs: 600_000,
        xp: 50,
      },
      ctx,
    );

  it('en español, sin dirigir, con la retroalimentación que tenía el alumno al empezar', async () => {
    await send(started({ count: 20, sampling: 'diverse' }), ended(20));
    expect(last()).toMatchObject({
      event: 'practice_session_completed',
      properties: { section: 'es', items: '10-49', feedback: 'each', targeted: false },
    });
    expect(feedbackCalls).toEqual([USER]);
  });

  it('la práctica en inglés y la dirigida se distinguen por su configuración', async () => {
    await send(started({ section: 'english', targeted: true, sampling: 'targeted' }), ended(8));
    expect(last()).toMatchObject({
      properties: { section: 'en', items: '1-9', targeted: true },
    });
    await send(started({ count: 10, sampling: 'targeted' }), ended(10));
    expect(last()).toMatchObject({ properties: { section: 'es', targeted: true } });
  });

  it('sin session_started en memoria se mide como español sin dirigir, y sin respuestas no se mide', async () => {
    await send(ended(12));
    expect(last()).toMatchObject({ properties: { section: 'es', targeted: false } });
    await send(ended(0));
    expect(seen).toHaveLength(1);
  });

  it('no deja pasar nada de la configuración que no sea de las listas cerradas', async () => {
    await send(
      started({ topics: 'cardiologia', difficulty: 'alta', secret: 'ana@correo.mx' }),
      ended(5),
    );
    expect(JSON.stringify(seen)).not.toMatch(/cardiologia|ana@|alta|secret/);
  });
});

describe('examen', () => {
  const started = (config: Record<string, string | number | boolean>) =>
    createEvent('session_started', { kind: 'exam', config }, ctx);
  const ended = (reason: 'completed' | 'abandoned', durationMs: number) =>
    createEvent(
      'session_ended',
      { kind: 'exam', reason, items: 100, correct: 60, durationMs, xp: 10 },
      ctx,
    );

  it('exam_started lleva el tamaño y si traía inglés', async () => {
    await send(started({ requested: 280, englishPicked: 40, totalMs: 1000 }));
    expect(last()).toMatchObject({
      event: 'exam_started',
      properties: { size: 280, english_included: true },
    });
    await send(started({ requested: 50, englishPicked: 0, totalMs: 1000 }));
    expect(last()).toMatchObject({ properties: { size: 50, english_included: false } });
  });

  it('exam_completed dice completed, time_up o abandoned', async () => {
    const config = { requested: 100, englishPicked: 0, totalMs: 7_200_000 };
    await send(started(config), ended('completed', 3_000_000));
    expect(last()).toMatchObject({ event: 'exam_completed', properties: { reason: 'completed' } });
    await send(started(config), ended('completed', 7_200_000));
    expect(last()).toMatchObject({ properties: { reason: 'time_up' } });
    await send(started(config), ended('abandoned', 600_000));
    expect(last()).toMatchObject({ properties: { reason: 'abandoned', size: 100 } });
  });

  it('un tamaño que no está en la lista, o un examen sin su configuración, no se mide', async () => {
    await send(started({ requested: 33, totalMs: 1 }));
    expect(seen).toEqual([]);
    await send(ended('completed', 1000));
    expect(seen).toEqual([]);
  });
});

describe('lo demás de la bitácora', () => {
  it('question_card_created mide el origen y si lo propuso la IA, sin ids', async () => {
    const created = (from: 'exam_review' | 'practice_review', source: 'bank' | 'ai') =>
      createEvent(
        'question_card_created',
        {
          questionId: newId(),
          questionVersionId: newId(),
          version: 1,
          deckId: newId(),
          noteDeckId: newId(),
          noteId: newId(),
          source,
          artifactId: source === 'ai' ? newId() : null,
          from,
        },
        ctx,
      );
    await send(created('exam_review', 'ai'), created('practice_review', 'bank'));
    expect(seen.map((record) => record.properties)).toEqual([
      { origin: 'exam_review', ai_suggested: true },
      { origin: 'practice_feedback', ai_suggested: false },
    ]);
  });

  it('pomodoro_completed solo cuenta la fase de enfoque y agrupa los minutos raros en other', async () => {
    const done = (phase: 'focus' | 'short_break', plannedMinutes: number) =>
      createEvent(
        'pomodoro_completed',
        { phase, plannedMinutes, actualMinutes: plannedMinutes },
        ctx,
      );
    await send(
      done('short_break', 5),
      done('focus', 25),
      done('focus', 50),
      done('focus', 33),
      done('focus', 15),
    );
    expect(seen.map((record) => record.properties.focus_minutes)).toEqual([25, 50, 'other', 15]);
  });

  it('party_joined y official_score_submitted salen sin ninguna propiedad, nunca el puntaje ni el grupo', async () => {
    await send(
      createEvent('party_joined', { groupId: newId() }, ctx),
      createEvent('official_score_submitted', { year: 2026 }, ctx),
    );
    expect(seen.map((record) => [record.event, record.properties])).toEqual([
      ['party_group_joined', {}],
      ['official_score_captured', {}],
    ]);
    expect(JSON.stringify(seen.map((record) => record.properties))).not.toMatch(/2026/);
  });

  it('deck_imported mide apkg y csv, y no xlsx ni docx, que el catálogo no tiene', async () => {
    const imported = (format: 'apkg_legacy' | 'apkg_new' | 'csv' | 'xlsx' | 'docx') =>
      createEvent(
        'deck_imported',
        { deckId: newId(), format, notes: 1, cards: 1, media: 0, warnings: [] },
        ctx,
      );
    await send(
      imported('apkg_legacy'),
      imported('apkg_new'),
      imported('csv'),
      imported('xlsx'),
      imported('docx'),
    );
    expect(seen.map((record) => record.properties.format)).toEqual(['apkg', 'apkg', 'csv']);
  });

  it('los duelos miden que empezaron, pero duel_completed no sale sin el resultado del rival', async () => {
    await send(
      createEvent(
        'session_started',
        { kind: 'challenge', config: { duelId: newId(), count: 5 } },
        ctx,
      ),
      createEvent(
        'session_ended',
        {
          kind: 'challenge',
          reason: 'completed',
          items: 5,
          correct: 3,
          durationMs: 1000,
          xp: 1,
        },
        ctx,
      ),
    );
    expect(names()).toEqual(['duel_started']);
  });

  it('un evento que no se mide no hace nada', async () => {
    await send(
      createEvent('visibility_changed', { hidden: true, awayMs: null }, ctx),
      createEvent(
        'consent_changed',
        { purpose: 'party', status: 'granted', noticeVersion: 'x' },
        ctx,
      ),
      createEvent('pomodoro_started', { phase: 'focus', plannedMinutes: 25, cycle: 1 }, ctx),
    );
    expect(seen).toEqual([]);
  });
});

describe('permiso y memoria', () => {
  it('sin permiso no mide nada ni guarda la configuración de las sesiones', async () => {
    setAnalyticsConsent(false);
    await send(
      createEvent(
        'session_started',
        { kind: 'exam', config: { requested: 20, englishPicked: 0, totalMs: 9 } },
        ctx,
      ),
    );
    // Se vuelve a dar el permiso: el examen que empezó sin permiso no deja un exam_completed a medias
    setAnalyticsConsent(true);
    await send(
      createEvent(
        'session_ended',
        { kind: 'exam', reason: 'completed', items: 20, correct: 10, durationMs: 1, xp: 0 },
        ctx,
      ),
    );
    expect(seen).toEqual([]);
    expect(feedbackCalls).toEqual([]);
  });

  it('sin saber el permiso tampoco', async () => {
    setAnalyticsConsent(null);
    await send(createEvent('party_joined', { groupId: newId() }, ctx));
    expect(seen).toEqual([]);
  });

  it('guarda a lo mucho 20 sesiones abiertas y suelta la más vieja', async () => {
    const config = { requested: 20, englishPicked: 0, totalMs: 9 };
    const ids = Array.from({ length: MAX_SESSIONS_IN_MEMORY + 1 }, () => newId());
    for (const sessionId of ids) {
      await send(createEvent('session_started', { kind: 'exam', config }, { ...ctx, sessionId }));
    }
    seen = [];
    const finish = (id: string) =>
      createEvent(
        'session_ended',
        { kind: 'exam', reason: 'completed', items: 1, correct: 1, durationMs: 1, xp: 0 },
        { ...ctx, sessionId: id },
      );
    await send(finish(ids[0] as string));
    expect(seen).toEqual([]);
    await send(finish(ids[1] as string));
    expect(names()).toEqual(['exam_completed']);
  });

  it('un error al traducir no sale de onRecorded', () => {
    const broken = createAppEventBridge({ practiceFeedback: () => Promise.reject(new Error('x')) });
    expect(() => {
      broken.onRecorded(createEvent('session_started', { kind: 'practice', config: {} }, ctx));
      broken.onRecorded(
        createEvent(
          'session_ended',
          { kind: 'practice', reason: 'completed', items: 2, correct: 1, durationMs: 1, xp: 0 },
          ctx,
        ),
      );
    }).not.toThrow();
  });
});
