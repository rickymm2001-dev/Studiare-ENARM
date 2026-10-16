import { describe, expect, it } from 'vitest';
import { modelTexts } from './model';

/** Lo que estos textos nunca dicen: ni una cifra de resultado, ni una probabilidad, ni un lugar en una lista */
const FORBIDDEN =
  /puntaje (estimado|esperado|probable)|probabilidad|\bplazas?\b|ranking|lugar n[uú]mero|posici[oó]n n[uú]mero/i;

/** Cada juego de argumentos con el que se prueban los textos que son funciones. Todos los números */
const ARGUMENT_SETS: readonly (readonly number[])[] = [
  [0, 0, 0],
  [1, 1, 1],
  [5, 12, 30],
  [70, 30, 20],
  [4, -0.15, 1],
  [3, 0.08, 1],
];

/** Los textos que reciben un nombre o una fecha en lugar de una cifra */
const NAMED_SENTENCES: readonly string[] = [
  modelTexts.reinforce.reviewCards('Apendicitis aguda'),
  modelTexts.comparison.specialtyFor('Cirugía General'),
  modelTexts.comparison.calculated('14 de octubre'),
];

/** Todas las frases de un árbol de textos, con las funciones llamadas con cada juego de argumentos */
function sentencesOf(node: unknown, path = 'modelTexts'): { path: string; text: string }[] {
  if (typeof node === 'string') return [{ path, text: node }];
  if (typeof node === 'function') {
    return ARGUMENT_SETS.flatMap((args, index) => {
      const result: unknown = (node as (...given: number[]) => unknown)(...args);
      return sentencesOf(result, `${path}(${index})`);
    });
  }
  if (typeof node === 'object' && node !== null) {
    return Object.entries(node).flatMap(([key, child]) => sentencesOf(child, `${path}.${key}`));
  }
  return [];
}

const sentences = [
  ...sentencesOf(modelTexts),
  ...NAMED_SENTENCES.map((text, index) => ({ path: `named[${index}]`, text })),
];

describe('textos del modelo del alumno y la comparación', () => {
  it('revisa un buen número de frases, con todas las funciones llamadas', () => {
    expect(sentences.length).toBeGreaterThan(60);
  });

  it('ninguno habla de puntaje estimado, probabilidad, plaza, ranking ni lugares en una lista', () => {
    const offenders = sentences.filter((sentence) => FORBIDDEN.test(sentence.text));
    expect(offenders).toEqual([]);
  });

  it('ninguno lleva signos de exclamación', () => {
    const offenders = sentences.filter((sentence) => /[!¡]/.test(sentence.text));
    expect(offenders).toEqual([]);
  });

  it('ninguno deja ver un valor sin resolver', () => {
    const offenders = sentences.filter((sentence) =>
      /\bundefined\b|\bNaN\b|\[object|\bnull\b/.test(sentence.text),
    );
    expect(offenders).toEqual([]);
  });

  it('el pie de la comparación dice que no es un pronóstico', () => {
    expect(modelTexts.comparison.footer).toMatch(/no es un pronóstico/i);
  });

  it('cada métrica de la comparación tiene sus tres frases', () => {
    for (const metric of ['sim_accuracy', 'reviews', 'consistency'] as const) {
      const sentence = modelTexts.comparison.sentence[metric];
      expect(sentence.mid(70, 30)).toContain('70%');
      expect(sentence.low(30)).toContain('95%');
      expect(sentence.high(30)).toContain('95%');
    }
  });

  it('cuenta alumnos en singular y en plural', () => {
    expect(modelTexts.comparison.groupCalibrating(1)).toBe(
      'Faltan 1 alumno con datos para comparar.',
    );
    expect(modelTexts.comparison.groupCalibrating(16)).toBe(
      'Faltan 16 alumnos con datos para comparar.',
    );
  });
});
