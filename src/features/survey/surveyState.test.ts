// @vitest-environment jsdom
// Lo que este dispositivo recuerda de la encuesta (B18). El calendario de la franja es puro y se prueba con fechas fijas.
// Ahora no la esconde 2 días y, tras tres veces, ya no sale sola. No quiero contestarla la esconde para siempre. El
// borrador sobrevive a una recarga, es por cuenta y se descarta lo que ya no cabe en las preguntas.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  EMPTY_DRAFT,
  FRESH_HIDING,
  MAX_LATER,
  SNOOZE_DAYS,
  SURVEY_DRAFT_STORAGE_KEY,
  SURVEY_STORAGE_KEY,
  clearDraft,
  isHiddenNow,
  markShown,
  neverAsk,
  readDraft,
  readHiding,
  resetShown,
  snooze,
  writeDraft,
  writeHiding,
} from './surveyState';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 10, 2, 12, 0, 0);

describe('el calendario de la franja', () => {
  it('se ofrece al principio', () => {
    expect(isHiddenNow(FRESH_HIDING, NOW)).toBe(false);
  });

  it('Ahora no la esconde 2 días y después vuelve', () => {
    const hiding = snooze(FRESH_HIDING, NOW);
    expect(hiding.laterCount).toBe(1);
    expect(isHiddenNow(hiding, NOW)).toBe(true);
    expect(isHiddenNow(hiding, NOW + SNOOZE_DAYS * DAY - 1)).toBe(true);
    expect(isHiddenNow(hiding, NOW + SNOOZE_DAYS * DAY)).toBe(false);
    expect(SNOOZE_DAYS).toBe(2);
  });

  it('a la tercera vez de Ahora no ya no sale sola', () => {
    let hiding = FRESH_HIDING;
    let now = NOW;
    for (let times = 1; times <= MAX_LATER; times += 1) {
      hiding = snooze(hiding, now);
      now += SNOOZE_DAYS * DAY + 1;
      // Tras la primera y la segunda vuelve a salir al pasar los dos días. Tras la tercera, nunca
      expect(isHiddenNow(hiding, now), `vez ${String(times)}`).toBe(times === MAX_LATER);
    }
    expect(isHiddenNow(hiding, now + 365 * DAY)).toBe(true);
    expect(MAX_LATER).toBe(3);
  });

  it('No quiero contestarla la esconde para siempre', () => {
    const hiding = neverAsk(FRESH_HIDING);
    expect(isHiddenNow(hiding, NOW)).toBe(true);
    expect(isHiddenNow(hiding, NOW + 400 * DAY)).toBe(true);
  });
});

describe('lo que se recuerda en el dispositivo', () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sobrevive a una recarga y es por cuenta', () => {
    writeHiding('ana', snooze(FRESH_HIDING, NOW));
    writeHiding('beto', neverAsk(FRESH_HIDING));
    expect(readHiding('ana')).toEqual({ laterCount: 1, hiddenUntil: NOW + 2 * DAY, never: false });
    expect(readHiding('beto').never).toBe(true);
    expect(readHiding('carla')).toEqual(FRESH_HIDING);
    expect(
      Object.keys(JSON.parse(localStorage.getItem(SURVEY_STORAGE_KEY) ?? '{}') as object),
    ).toEqual(['ana', 'beto']);
  });

  it('un valor dañado o con otro tipo se ignora', () => {
    localStorage.setItem(SURVEY_STORAGE_KEY, '{no es json');
    expect(readHiding('ana')).toEqual(FRESH_HIDING);
    localStorage.setItem(SURVEY_STORAGE_KEY, JSON.stringify(['x']));
    expect(readHiding('ana')).toEqual(FRESH_HIDING);
    localStorage.setItem(
      SURVEY_STORAGE_KEY,
      JSON.stringify({ ana: { laterCount: -2, hiddenUntil: 'mañana', never: 'sí' } }),
    );
    expect(readHiding('ana')).toEqual(FRESH_HIDING);
  });

  it('sin almacenamiento todo sigue funcionando', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('bloqueado');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('bloqueado');
    });
    expect(readHiding('ana')).toEqual(FRESH_HIDING);
    expect(() => {
      writeHiding('ana', neverAsk(FRESH_HIDING));
    }).not.toThrow();
    expect(readDraft('ana')).toEqual(EMPTY_DRAFT);
    expect(() => {
      writeDraft('ana', { answers: { days_used: 'd0' }, comment: 'hola' });
      clearDraft('ana');
    }).not.toThrow();
  });
});

describe('el borrador', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('guarda las respuestas a medias y el comentario por cuenta, y se borra', () => {
    const draft = {
      answers: { days_used: 'd3_4' as const, used: ['review' as const], clarity: 4 as const },
      comment: 'Algo que cambiaría',
    };
    writeDraft('ana', draft);
    expect(readDraft('ana')).toEqual(draft);
    expect(readDraft('beto')).toEqual(EMPTY_DRAFT);
    clearDraft('ana');
    expect(readDraft('ana')).toEqual(EMPTY_DRAFT);
    expect(localStorage.getItem(SURVEY_DRAFT_STORAGE_KEY)).toBe('{}');
  });

  it('descarta lo que ya no cabe en las preguntas', () => {
    localStorage.setItem(
      SURVEY_DRAFT_STORAGE_KEY,
      JSON.stringify({
        ana: {
          answers: {
            days_used: 'd9',
            used: ['review', 'none'],
            clarity: 9,
            ease: 5,
            useful: '4',
            blockers: ['slow', 'error', 'unclear_start', 'few_questions'],
            recommend: 'quizá',
            otra: 1,
          },
          comment: 12,
        },
      }),
    );
    expect(readDraft('ana')).toEqual({ answers: { ease: 5 }, comment: '' });
  });

  it('Nada todavía y Nada me frenó no se juntan con otras opciones', () => {
    localStorage.setItem(
      SURVEY_DRAFT_STORAGE_KEY,
      JSON.stringify({
        ana: { answers: { used: ['none'], blockers: ['nothing', 'slow'] }, comment: '' },
      }),
    );
    expect(readDraft('ana').answers).toEqual({ used: ['none'] });
  });
});

describe('la medición de la franja', () => {
  it('survey_shown sale una vez por cuenta y por carga de la app', () => {
    resetShown();
    expect(markShown('ana')).toBe(true);
    expect(markShown('ana')).toBe(false);
    expect(markShown('beto')).toBe(true);
    resetShown();
    expect(markShown('ana')).toBe(true);
  });
});
