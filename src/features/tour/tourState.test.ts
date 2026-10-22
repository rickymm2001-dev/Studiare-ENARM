// @vitest-environment jsdom
// Cuándo aparece el recorrido guiado solo (B15, 4.1, 4.6 y 8.15 del plan de B15)
import { describe, expect, it } from 'vitest';
import { RoleSchema } from '@/data/schemas/common';
import {
  TOUR_AUTO_OFFER_OFF,
  TOUR_STORAGE_KEY,
  markTourPending,
  readTourState,
  withPending,
  type TourStoredState,
} from './steps';
import { markTourHandled, shouldAutoStart, tourAvailable, tourIsForRole } from './tourState';

const FRESH: TourStoredState = { handled: [], autoOffer: true };

describe('cuándo empieza solo', () => {
  it('con una cuenta nueva, marcada por el registro, sí', () => {
    expect(shouldAutoStart(withPending(FRESH, 'nueva'), 'nueva')).toBe(true);
  });

  it('una cuenta que ya existía no está marcada, así que no lo ve solo', () => {
    expect(shouldAutoStart(FRESH, 'vieja')).toBe(false);
    expect(shouldAutoStart(withPending(FRESH, 'otra'), 'vieja')).toBe(false);
  });

  it('quien ya lo terminó o lo saltó en este navegador no lo vuelve a ver solo', () => {
    const seen = { ...withPending(FRESH, 'nueva'), handled: ['nueva'] };
    expect(shouldAutoStart(seen, 'nueva')).toBe(false);
  });

  it('con autoOffer en false no aparece solo aunque el alumno esté marcado', () => {
    // El estado que dejan las e2e que no son del recorrido, tal cual
    const state = withPending(TOUR_AUTO_OFFER_OFF, 'nueva');
    expect(shouldAutoStart(state, 'nueva')).toBe(false);
    expect(shouldAutoStart(TOUR_AUTO_OFFER_OFF, 'nueva')).toBe(false);
  });

  it('el registro, el lector y la decisión juntos, con el almacenamiento real', () => {
    localStorage.removeItem(TOUR_STORAGE_KEY);
    // Una cuenta de antes en este navegador
    expect(shouldAutoStart(readTourState(), 'vieja')).toBe(false);
    markTourPending('nueva');
    expect(shouldAutoStart(readTourState(), 'nueva')).toBe(true);
    expect(shouldAutoStart(readTourState(), 'vieja')).toBe(false);
    // Al terminar o saltar queda visto y no vuelve a aparecer, ni al recargar
    markTourHandled('nueva');
    expect(shouldAutoStart(readTourState(), 'nueva')).toBe(false);
    expect(readTourState()).toEqual({ handled: ['nueva'], autoOffer: true });
    // Ni aunque el registro lo vuelva a marcar
    markTourPending('nueva');
    expect(shouldAutoStart(readTourState(), 'nueva')).toBe(false);
  });

  it('marcar como visto a quien no estaba marcado también lo deja como visto', () => {
    localStorage.removeItem(TOUR_STORAGE_KEY);
    markTourHandled('desde-configuracion');
    expect(readTourState().handled).toEqual(['desde-configuracion']);
    expect(readTourState().pending).toBeUndefined();
  });
});

describe('quién ve el recorrido', () => {
  it('solo los alumnos, porque el menú del médico, del admin y del dueño es otro (8.18)', () => {
    expect(RoleSchema.options.filter(tourIsForRole)).toEqual(['student']);
  });

  it('necesita la bandera guidedTour prendida', () => {
    expect(tourAvailable('student', true)).toBe(true);
    expect(tourAvailable('student', false)).toBe(false);
    expect(tourAvailable('physician', true)).toBe(false);
    expect(tourAvailable('admin', true)).toBe(false);
    // Sin pasar la bandera lee la de hoy, que en las pruebas es la de desarrollo (prendida)
    expect(tourAvailable('student')).toBe(true);
  });
});
