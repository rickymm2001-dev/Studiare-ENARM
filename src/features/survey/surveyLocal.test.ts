// @vitest-environment jsdom
// Lo que la encuesta recuerda en este dispositivo se quita al cerrar sesión, al Borrar mis datos y al Eliminar mi cuenta
// (B18, hallazgo 5 de la revisión). Aquí se prueba la función y que cerrar sesión de preferences.ts la llame. Que
// Configuración, Privacidad también la llame lo prueba la e2e first-week-survey.spec.ts.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePreferences } from '@/app/preferences';
import { SURVEY_DRAFT_STORAGE_KEY, SURVEY_STORAGE_KEY, forgetSurveyLocal } from './surveyLocal';
import { readDraft, readHiding, snooze, writeDraft, writeHiding } from './surveyState';

// Sin nube: cerrar sesión no baja el SDK de Supabase
vi.mock('@/data/cloud/client', () => ({
  cloudConfigured: () => false,
  forgetStoredCloudSession: () => undefined,
  loadCloud: () => Promise.resolve(null),
}));

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

/** Una cuenta con un borrador a medias y una franja con Ahora no, en las dos claves */
function leaveTraces(userId: string) {
  writeDraft(userId, { answers: { days_used: 'd3_4' }, comment: 'Medio comentario sin enviar' });
  writeHiding(userId, snooze({ laterCount: 0, hiddenUntil: null, never: false }, Date.now()));
}

describe('forgetSurveyLocal', () => {
  it('quita el borrador y el estado de la franja de todas las cuentas del dispositivo', () => {
    leaveTraces('ana');
    leaveTraces('beto');
    expect(readDraft('ana').comment).toBe('Medio comentario sin enviar');
    expect(readHiding('beto').laterCount).toBe(1);
    forgetSurveyLocal();
    expect(localStorage.getItem(SURVEY_DRAFT_STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem(SURVEY_STORAGE_KEY)).toBeNull();
    expect(readDraft('ana').comment).toBe('');
    expect(readHiding('beto').laterCount).toBe(0);
  });

  it('no toca otras cosas del dispositivo', () => {
    leaveTraces('ana');
    localStorage.setItem('enarm.preferences.v1', '{"theme":"dark"}');
    localStorage.setItem('enarm.exam.v1.ana', '{"x":1}');
    forgetSurveyLocal();
    expect(localStorage.getItem('enarm.preferences.v1')).toBe('{"theme":"dark"}');
    expect(localStorage.getItem('enarm.exam.v1.ana')).toBe('{"x":1}');
  });

  it('no lanza con el almacenamiento bloqueado, ni cuando no hay nada guardado', () => {
    expect(() => {
      forgetSurveyLocal();
    }).not.toThrow();
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new DOMException('bloqueado', 'SecurityError');
    });
    expect(() => {
      forgetSurveyLocal();
    }).not.toThrow();
  });
});

describe('cerrar sesión', () => {
  it('borra el borrador y el estado de la franja, y no las preferencias del dispositivo', () => {
    leaveTraces('ana');
    usePreferences.getState().setTheme('dark');
    usePreferences.getState().signIn('ana');
    usePreferences.getState().signOut();
    expect(localStorage.getItem(SURVEY_DRAFT_STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem(SURVEY_STORAGE_KEY)).toBeNull();
    expect(usePreferences.getState().sessionUserId).toBeNull();
    expect(usePreferences.getState().theme).toBe('dark');
  });
});
