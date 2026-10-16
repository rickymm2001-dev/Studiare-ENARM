// Lo que escriben los scripts de Inglés médico no entra al repositorio (B13, hallazgo 12 de la revisión
// independiente). npm run english:passages y npm run english:vocabulary escriben por omisión en
// content-drafts/ingles, que sí está en git, y el Excel de los textos con licencia y el paquete del mazo son
// para subir a mano al Sheet y al catálogo, no para guardar. La lista que eligen los médicos y el mazo de la
// demostración, en cambio, sí se guardan.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '../..');

/** Si git ignora la ruta. --no-index mira solo las reglas y no si el archivo ya está en el índice */
function ignored(path: string): boolean {
  const result = spawnSync('git', ['check-ignore', '--quiet', '--no-index', '--', path], {
    cwd: ROOT,
  });
  // 0 es ignorada y 1 no lo es. Cualquier otro número es que git no pudo contestar
  expect(result.error, 'git no corrió').toBeUndefined();
  expect([0, 1], `git check-ignore falló con ${String(result.status)}`).toContain(result.status);
  return result.status === 0;
}

describe('.gitignore y los archivos de los scripts de Inglés médico', () => {
  it('el Excel de los textos y el paquete del mazo, que escriben por omisión, no entran', () => {
    expect(ignored('content-drafts/ingles/Studiare-ingles-textos.xlsx')).toBe(true);
    expect(ignored('content-drafts/ingles/Vocabulario-ingles.apkg')).toBe(true);
    // Con otro nombre, en la misma carpeta, tampoco
    expect(ignored('content-drafts/ingles/otro-nombre.xlsx')).toBe(true);
    expect(ignored('content-drafts/ingles/Otro Mazo.apkg')).toBe(true);
  });

  it('la lista de textos de los médicos y el mazo de la demostración sí se pueden guardar', () => {
    expect(ignored('content-drafts/ingles/textos.json')).toBe(false);
    expect(ignored('content-drafts/ingles/README.md')).toBe(false);
    expect(ignored('src/demo/content/decks/vocabulario-ingles.json')).toBe(false);
  });

  it('no ignora los borradores de contenido de las demás carpetas', () => {
    expect(ignored('content-drafts/bank-plantilla/Studiare-banco.xlsx')).toBe(false);
    expect(ignored('content-drafts/b5/borrador.xlsx')).toBe(false);
    expect(ignored('content-drafts/README.md')).toBe(false);
  });

  it('los scripts escriben por omisión donde el .gitignore los ignora', () => {
    const passages = readFileSync(resolve(ROOT, 'scripts/content/english-passages.ts'), 'utf8');
    const vocabulary = readFileSync(resolve(ROOT, 'scripts/content/english-vocabulary.ts'), 'utf8');
    expect(passages).toContain("'content-drafts/ingles/Studiare-ingles-textos.xlsx'");
    expect(vocabulary).toContain("'content-drafts/ingles/Vocabulario-ingles.apkg'");
  });
});
