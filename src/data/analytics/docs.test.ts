// docs/ANALITICA.md es lo que lee Ricardo para armar el embudo y lo que dice qué nunca sale. Esta prueba lo
// amarra al catálogo: si un evento o una propiedad entra al código y no al documento, falla. Y revisa que lo
// que el documento promete que no sale (heard_from, has_code) siga sin salir.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ANALYTICS_EVENTS, SERVER_ANALYTICS_EVENTS } from './catalog';

const DOC = readFileSync(
  join(import.meta.dirname, '..', '..', '..', 'docs', 'ANALITICA.md'),
  'utf8',
);

/** Si alguna fila de una tabla del documento nombra el evento */
const mentions = (name: string) =>
  DOC.split('\n').some((line) => line.startsWith('|') && line.includes(name));

describe('docs/ANALITICA.md', () => {
  it.each(Object.keys(ANALYTICS_EVENTS))(
    'el evento de la app %s está en el catálogo del documento',
    (name) => {
      expect(mentions(name)).toBe(true);
    },
  );

  it.each(Object.keys(SERVER_ANALYTICS_EVENTS))(
    'el evento de dinero %s está en la tabla del servidor',
    (name) => {
      expect(mentions(name)).toBe(true);
    },
  );

  it('cada propiedad de cada evento aparece en el documento', () => {
    const names = new Set<string>();
    for (const shape of [
      ...Object.values(ANALYTICS_EVENTS),
      ...Object.values(SERVER_ANALYTICS_EVENTS),
    ]) {
      for (const property of Object.keys(shape)) names.add(property);
    }
    for (const property of names) expect(DOC, property).toContain(property);
  });

  it('dice qué nunca sale y cuáles son los interruptores', () => {
    expect(DOC).toContain('## Lo que nunca sale');
    expect(DOC).toContain('## Cómo funciona el permiso');
    expect(DOC).toContain('## Cómo probar sin ninguna cuenta');
    expect(DOC).toContain('## Cómo prenderlo');
    expect(DOC).toContain('## El embudo del registro al pago');
    for (const name of [
      'VITE_POSTHOG_KEY',
      'VITE_POSTHOG_HOST',
      'POSTHOG_PROJECT_KEY',
      'productAnalytics',
    ]) {
      expect(DOC).toContain(name);
    }
  });

  it('lo que promete que no sale no está en el catálogo', () => {
    const properties = Object.values(ANALYTICS_EVENTS).flatMap((shape) => Object.keys(shape));
    expect(properties).not.toContain('heard_from');
    expect(properties).not.toContain('has_code');
    expect(DOC).toContain('heard_from');
  });

  it('no usa el signo de dos puntos en la prosa', () => {
    // Fuera de los bloques de código y de las direcciones https://
    const prose = DOC.replace(/```[\s\S]*?```/g, '').replaceAll('https://', 'https//');
    const offenders = prose
      .split('\n')
      .filter((line) => !line.startsWith('|') && line.includes(':'));
    expect(offenders).toEqual([]);
  });
});
