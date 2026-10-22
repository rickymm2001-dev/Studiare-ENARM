// Ajustes del repaso se abren con ?ajustes (B3) y, desde B15, ?ajustes=recordatorios lleva a los recordatorios
import { describe, expect, it } from 'vitest';
import { focusFromParam, reviewSettingsPath } from './panelParam';

describe('?ajustes', () => {
  it('sin el parámetro el panel está cerrado', () => {
    expect(focusFromParam(null)).toBeNull();
  });

  it('cada valor lleva a su parte del panel, y uno desconocido abre todo', () => {
    expect(focusFromParam('1')).toBe('all');
    expect(focusFromParam('')).toBe('all');
    expect(focusFromParam('pomodoro')).toBe('pomodoro');
    expect(focusFromParam('recordatorios')).toBe('reminders');
    expect(focusFromParam('cualquier cosa')).toBe('all');
  });

  it('la dirección de cada parte es la que lee focusFromParam, así el enlace del correo funciona', () => {
    for (const focus of ['all', 'pomodoro', 'reminders'] as const) {
      const search = new URLSearchParams(reviewSettingsPath(focus).split('?')[1]);
      expect(focusFromParam(search.get('ajustes'))).toBe(focus);
    }
    expect(reviewSettingsPath('reminders')).toBe('/repasar?ajustes=recordatorios');
  });
});
