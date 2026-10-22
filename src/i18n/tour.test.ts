// Textos del recorrido guiado (B15, 4.2 a 4.6 del plan de B15)
import { describe, expect, it } from 'vitest';
import { TOUR_STEPS } from '@/features/tour/steps';
import { tourTexts } from './tour';

/** Todo el texto del recorrido, para revisar las reglas de redacción de una vez */
const prose = [
  ...TOUR_STEPS.flatMap((step) => [tourTexts.steps[step].title, tourTexts.steps[step].text]),
  tourTexts.counter(3, 8),
  tourTexts.skip,
  tourTexts.back,
  tourTexts.next,
  tourTexts.finish,
  ...Object.values(tourTexts.settings),
];

describe('textos del recorrido', () => {
  it('hay un título y un texto para cada uno de los ocho pasos, y no sobra ninguno', () => {
    expect(Object.keys(tourTexts.steps)).toEqual([...TOUR_STEPS]);
    for (const step of TOUR_STEPS) {
      expect(tourTexts.steps[step].title.length, step).toBeGreaterThan(2);
      expect(tourTexts.steps[step].text.length, step).toBeGreaterThan(20);
    }
  });

  it('no llevan dos puntos ni signos de exclamación', () => {
    for (const text of prose) expect(text).not.toMatch(/[:!¡]/);
  });

  it('hablan de tú, sin usted ni vosotros', () => {
    const all = prose.join(' ');
    expect(all).toMatch(/\b(tus|tu|puedes|ves|eliges|escribe)\b/);
    expect(all).not.toMatch(/\b(usted|ustedes|vosotros|vuestro|su cuenta)\b/i);
  });

  it('no prometen resultados médicos ni de puntaje', () => {
    expect(prose.join(' ')).not.toMatch(
      /garanti|asegur|aprob|pasar[áa]s|puntaje|calificaci|mejor[ae]rás/i,
    );
  });

  it('el contador se lee como parte del título', () => {
    expect(tourTexts.counter(1, 8)).toBe('Paso 1 de 8');
    expect(tourTexts.counter(8, 8)).toBe('Paso 8 de 8');
  });

  it('los botones y la línea de Perfil dicen lo del plan', () => {
    expect([tourTexts.skip, tourTexts.back, tourTexts.next, tourTexts.finish]).toEqual([
      'Saltar introducción',
      'Atrás',
      'Siguiente',
      'Terminar',
    ]);
    expect(tourTexts.settings.title).toBe('Recorrido por Studiare');
    expect(tourTexts.settings.button).toBe('Ver el recorrido');
  });

  it('en Gratis dicen que Apuntes y Party se ven con candado, sin vender nada', () => {
    expect(tourTexts.steps.outlines.text).toMatch(/En Gratis lo ves con candado/);
    expect(tourTexts.steps.party.text).toMatch(/En Gratis lo ves con candado/);
    expect(prose.join(' ')).not.toMatch(/compra|suscrib|prueba gratis|precio/i);
  });
});
