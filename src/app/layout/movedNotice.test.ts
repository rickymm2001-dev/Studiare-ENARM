// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  MOVED_NOTICE_STORAGE_KEY,
  dayKey,
  dismissForToday,
  isDismissedToday,
  movedNoticeOf,
} from './movedNotice';

// Mediodía local, para que ningún huso horario cambie el día
const at = (year: number, month: number, day: number) => new Date(year, month - 1, day, 12);

describe('movedNoticeOf', () => {
  const env = { VITE_MOVED_TO: 'https://tudominio.mx', VITE_MOVED_ON: '2026-12-15' };

  it('antes del día dice la fecha en español de México', () => {
    expect(movedNoticeOf(env, at(2026, 12, 1))).toEqual({
      url: 'https://tudominio.mx',
      host: 'tudominio.mx',
      date: '2026-12-15',
      dateLabel: '15 de diciembre',
      arrived: false,
    });
  });

  it('desde el día de la mudanza ya llegó, también después', () => {
    expect(movedNoticeOf(env, at(2026, 12, 14))?.arrived).toBe(false);
    expect(movedNoticeOf(env, at(2026, 12, 15))?.arrived).toBe(true);
    expect(movedNoticeOf(env, at(2027, 1, 3))?.arrived).toBe(true);
  });

  it('si la fecha cae en otro año, lo dice', () => {
    expect(movedNoticeOf(env, at(2027, 1, 3))?.dateLabel).toBe('15 de diciembre de 2026');
  });

  it('acepta la dirección con diagonal final y se queda con el origen', () => {
    expect(
      movedNoticeOf({ ...env, VITE_MOVED_TO: ' https://tudominio.mx/ ' }, at(2026, 12, 1))?.url,
    ).toBe('https://tudominio.mx');
  });

  it.each([
    ['sin dirección', { VITE_MOVED_ON: '2026-12-15' }],
    ['sin fecha', { VITE_MOVED_TO: 'https://tudominio.mx' }],
    ['vacías', { VITE_MOVED_TO: '', VITE_MOVED_ON: '' }],
    ['dirección sin https', { ...env, VITE_MOVED_TO: 'http://tudominio.mx' }],
    ['dirección que no lo es', { ...env, VITE_MOVED_TO: 'tudominio.mx' }],
    ['dirección con ruta', { ...env, VITE_MOVED_TO: 'https://tudominio.mx/otra' }],
    ['dirección con usuario', { ...env, VITE_MOVED_TO: 'https://u:p@tudominio.mx' }],
    ['dirección con consulta', { ...env, VITE_MOVED_TO: 'https://tudominio.mx/?a=1' }],
    ['javascript', { ...env, VITE_MOVED_TO: 'javascript:alert(1)' }],
    ['fecha mal escrita', { ...env, VITE_MOVED_ON: '15/12/2026' }],
    ['fecha que no existe', { ...env, VITE_MOVED_ON: '2026-02-30' }],
    ['valores que no son texto', { VITE_MOVED_TO: true, VITE_MOVED_ON: 20261215 }],
  ])('%s no da aviso', (_label, input) => {
    expect(movedNoticeOf(input, at(2026, 12, 1))).toBeNull();
  });
});

describe('cerrar el aviso por el día', () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => {
    localStorage.clear();
  });

  it('dayKey usa la fecha de este navegador con ceros', () => {
    expect(dayKey(at(2026, 3, 7))).toBe('2026-03-07');
  });

  it('cerrado hoy no se ve hoy y vuelve mañana', () => {
    expect(isDismissedToday('2026-12-01')).toBe(false);
    dismissForToday('2026-12-01');
    expect(localStorage.getItem(MOVED_NOTICE_STORAGE_KEY)).toBe('2026-12-01');
    expect(isDismissedToday('2026-12-01')).toBe(true);
    expect(isDismissedToday('2026-12-02')).toBe(false);
  });
});
