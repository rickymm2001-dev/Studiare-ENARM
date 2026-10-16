// FSRS de fábrica (B14, 4.6, respuesta 90). Todos los alumnos usan los parámetros por defecto de ts-fsrs.
// schedulerFor acepta pesos como punto de extensión, pero nadie se los pasa, y la calibración de la noche
// calcula la dificultad de las preguntas y nunca parámetros de FSRS. Estas pruebas lo vigilan. Si algún día
// se optimizan los parámetros por alumno, es una decisión nueva y estas pruebas se cambian con ella.
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createEmptyCard, fsrs, Rating } from 'ts-fsrs';
import { describe, expect, it } from 'vitest';
import { DEFAULT_THRESHOLDS } from '@/config/thresholds';
import { FSRS_RATINGS, scheduleReview, type SchedulerConfig } from './fsrs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const NOW = new Date('2026-10-01T15:00:00.000Z');

const config: SchedulerConfig = {
  desiredRetention: 0.9,
  examDate: null,
  timeZone: 'America/Merida',
  thresholds: DEFAULT_THRESHOLDS.fsrs,
};

/** Los archivos de una carpeta que cumplen la regla, con su ruta desde la raíz del repositorio */
function filesUnder(folder: string, keep: (name: string) => boolean): string[] {
  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : walk(path);
      return keep(entry.name) ? [path] : [];
    });
  return walk(join(ROOT, folder)).map((path) => relative(ROOT, path).split(sep).join('/'));
}

const read = (file: string) => readFileSync(join(ROOT, file), 'utf8');

/** El archivo sin sus comentarios, para vigilar lo que el código hace y no lo que explica */
function code(file: string): string {
  const text = read(file);
  if (file.endsWith('.sql')) return text.replace(/--.*$/gm, '');
  if (file.endsWith('.yml')) return text.replace(/(^|\s)#.*$/gm, '$1');
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
}
const isCode = (name: string) => /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name);

const sourceCode = filesUnder('src', isCode);

describe('FSRS de fábrica (4.6, respuesta 90)', () => {
  it('un primer repaso sale igual que con los parámetros por defecto de ts-fsrs, con cada botón', () => {
    const factory = fsrs({ request_retention: 0.9, enable_fuzz: false, enable_short_term: true });
    const grades = [Rating.Again, Rating.Hard, Rating.Good, Rating.Easy] as const;
    FSRS_RATINGS.forEach((rating, index) => {
      const grade = grades[index] ?? Rating.Good;
      const direct = factory.next(createEmptyCard(NOW), NOW, grade).card;
      const ours = scheduleReview(null, rating, NOW, config).state;
      expect(ours.stability, rating).toBe(direct.stability);
      expect(ours.difficulty, rating).toBe(direct.difficulty);
      expect(ours.due, rating).toBe(direct.due.toISOString());
      expect(ours.scheduledDays, rating).toBe(direct.scheduled_days);
    });
  });

  it('solo el programador importa ts-fsrs y nadie arma otro con sus propios pesos', () => {
    const importers = sourceCode.filter((file) => /from\s+['"]ts-fsrs['"]/.test(code(file)));
    expect(importers).toEqual(['src/engines/fsrs.ts']);
    // Los pesos solo entran por config.weights, y nadie fuera del motor lo llena
    expect(read('src/engines/fsrs.ts')).toContain('weights?: readonly number[]');
  });

  it('ningún código de src que arma la configuración del programador le pasa pesos', () => {
    const builders = sourceCode.filter(
      (file) =>
        file !== 'src/engines/fsrs.ts' &&
        !file.startsWith('src/i18n/') &&
        /\b(SchedulerConfig|schedulerConfig|desiredRetention)\b/.test(code(file)),
    );
    // Que la búsqueda no pase en vacío
    expect(builders).toContain('src/features/review/schedulerConfig.ts');
    const withWeights = builders.filter((file) =>
      /\bweights\b|\bdefault_w\b|generatorParameters|\bw\s*:/.test(code(file)),
    );
    expect(withWeights).toEqual([]);
  });

  it('ningún motor ni código de datos lee optimizeAfterReviews, que se queda como punto de extensión', () => {
    const readers = sourceCode.filter(
      (file) =>
        (file.startsWith('src/engines/') ||
          file.startsWith('src/data/') ||
          file.startsWith('src/features/review/')) &&
        code(file).includes('optimizeAfterReviews'),
    );
    expect(readers).toEqual([]);
    // Sigue documentado en los umbrales, para quien algún día lo use
    expect(read('src/config/thresholds.ts')).toContain('optimizeAfterReviews');
  });

  it('la calibración de la noche no calcula parámetros de FSRS', () => {
    const night = [
      ...filesUnder('src/engines/calibration', isCode),
      ...filesUnder('scripts/calibration', (name) => /\.(ts|tsx|sql|json)$/.test(name)),
      ...filesUnder('supabase/migrations', (name) => /^20261028\d+_.*\.sql$/.test(name)),
      '.github/workflows/calibration.yml',
    ];
    // Que la búsqueda no pase en vacío
    expect(night.length).toBeGreaterThan(5);
    const offenders = night.filter((file) => /fsrs|optimi[sz]e/i.test(code(file)));
    expect(offenders).toEqual([]);
  });
});
