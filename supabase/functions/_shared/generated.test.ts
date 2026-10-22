// La copia de la limpieza del navegador para las funciones tiene que ser igual a lo que produce
// npm run functions:scrub (B15, 2.2 del plan de B15). Si alguien cambia src/data/telemetry/clientErrors.ts y no
// corre el script, esta prueba falla. Sin ella un error de una función podría salir a Sentry con una regla
// de limpieza más vieja que la del navegador.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  SCRUB_SOURCE,
  SCRUB_TARGET,
  generateScrub,
} from '../../../scripts/telemetry/sync-scrub.ts';
import * as copy from './generated/scrub.ts';
import * as original from '../../../src/data/telemetry/clientErrors.ts';

const ROOT = resolve(import.meta.dirname, '../../..');

describe('copia generada de la limpieza para las funciones', () => {
  it('el archivo en disco es igual al que se genera', async () => {
    const files = await generateScrub(ROOT);
    expect([...files.keys()]).toEqual([SCRUB_TARGET]);
    for (const [path, text] of files) {
      expect(readFileSync(resolve(ROOT, path), 'utf8'), path).toBe(text);
    }
  });

  it('dice de dónde sale y no importa nada', () => {
    const text = readFileSync(resolve(ROOT, SCRUB_TARGET), 'utf8');
    expect(text).toMatch(/^\/\/ Generado por scripts\/telemetry\/sync-scrub\.ts desde /);
    expect(text).toContain(SCRUB_SOURCE);
    expect(text).not.toMatch(/^\s*import\s/m);
  });

  it('limpia igual que la del navegador, con los mismos textos', () => {
    const samples = [
      'falló para alumna@ejemplo.mx',
      'id 3f1d4c52-9f1e-4a0e-8d52-6d1c9a2b7e10 y 01ARZ3NDEKTSV4RRFFQ69G5FAV',
      'token eyJhbGciOiJI.eyJzdWIiOiIx.firma y sk_live_' + 'abcdefghijkl',
      'https://x.mx/ruta?t=secreto#frag y 12345678901234',
      '"texto del alumno" is not valid JSON',
    ];
    for (const sample of samples) {
      expect(copy.scrub(sample, 300)).toBe(original.scrub(sample, 300));
    }
    expect(copy.screenOf('/medico/3f1d4c52-9f1e-4a0e-8d52-6d1c9a2b7e10/reportes')).toBe(
      original.screenOf('/medico/3f1d4c52-9f1e-4a0e-8d52-6d1c9a2b7e10/reportes'),
    );
    expect(copy.hashText('hola')).toBe(original.hashText('hola'));
  });

  it('quita un correo, que es lo que más importa', () => {
    expect(copy.scrub('mandó alumna@ejemplo.mx un pago', 200)).toBe('mandó [correo] un pago');
  });
});
