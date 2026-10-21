import { describe, expect, it } from 'vitest';
import { calibrationAdminTexts } from './calibrationAdmin';

/** Lo que estos textos nunca dicen: ni una cifra de resultado, ni una probabilidad, ni un lugar en una lista */
const FORBIDDEN =
  /puntaje (estimado|esperado|probable)|probabilidad|\bplazas?\b|ranking|lugar n[uú]mero|posici[oó]n n[uú]mero/i;

/** Cada juego de argumentos con el que se prueban los textos que son funciones. Todos números */
const ARGUMENT_SETS: readonly (readonly number[])[] = [
  [0, 0, 0],
  [1, 1, 1],
  [5, 12, 30],
  [0.58, 96, 20],
];

/** Los textos que reciben un nombre, una fecha o una lista en lugar de una cifra */
const NAMED_SENTENCES: readonly string[] = [
  calibrationAdminTexts.status.startedAt('15 oct 2026', 'hace 3 horas'),
  calibrationAdminTexts.status.lastGood('hace 3 días'),
  calibrationAdminTexts.status.publication.at('15 de octubre'),
  calibrationAdminTexts.runs.github('123456789'),
  calibrationAdminTexts.runs.fatigue('Calibrando'),
  calibrationAdminTexts.overview.motives.share('Conocimiento', 0.41),
  calibrationAdminTexts.overview.agreement.kappa('0.52'),
  calibrationAdminTexts.settings.factory('30'),
  calibrationAdminTexts.settings.noticeVersion('2026-10-15b'),
  calibrationAdminTexts.agreementHistory.nightOf('14 de octubre'),
  calibrationAdminTexts.distractors.flagged('14 de octubre'),
];

function sentencesOf(
  node: unknown,
  path = 'calibrationAdminTexts',
): { path: string; text: string }[] {
  if (typeof node === 'string') return [{ path, text: node }];
  if (typeof node === 'function') {
    return ARGUMENT_SETS.flatMap((args, index) => {
      const result: unknown = (node as (...given: number[]) => unknown)(...args);
      // Las funciones que esperan texto o una lista se prueban aparte, con NAMED_SENTENCES
      return typeof result === 'string' || typeof result === 'object'
        ? sentencesOf(result, `${path}(${index})`)
        : [];
    });
  }
  if (Array.isArray(node)) {
    return node.flatMap((child, index) => sentencesOf(child, `${path}[${index}]`));
  }
  if (typeof node === 'object' && node !== null) {
    return Object.entries(node).flatMap(([key, child]) => sentencesOf(child, `${path}.${key}`));
  }
  return [];
}

/** Las funciones que se llaman con texto dan resultados raros con cifras, por eso se prueban aparte */
const TEXT_ARGUMENT_FUNCTIONS = new Set([
  'startedAt',
  'lastGood',
  'at',
  'github',
  'fatigue',
  'share',
  'kappa',
  'factory',
  'noticeVersion',
  'nightOf',
  'calculated',
  'range',
]);

function withoutTextFunctions(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(withoutTextFunctions);
  if (typeof node === 'object' && node !== null) {
    return Object.fromEntries(
      Object.entries(node)
        .filter(
          ([key, child]) => !(typeof child === 'function' && TEXT_ARGUMENT_FUNCTIONS.has(key)),
        )
        .map(([key, child]) => [key, withoutTextFunctions(child)]),
    );
  }
  return node;
}

const sentences = [
  ...sentencesOf(withoutTextFunctions(calibrationAdminTexts)),
  ...NAMED_SENTENCES.map((text, index) => ({ path: `named[${index}]`, text })),
  {
    path: 'settings.errors.range',
    text: calibrationAdminTexts.settings.errors.range(0.05, 2),
  },
];

describe('textos de Calibración, Plataforma y el historial del acuerdo', () => {
  it('revisa un buen número de frases', () => {
    expect(sentences.length).toBeGreaterThan(120);
  });

  it('ninguno habla de puntaje estimado, probabilidad, plaza, ranking ni lugares en una lista', () => {
    expect(sentences.filter((sentence) => FORBIDDEN.test(sentence.text))).toEqual([]);
  });

  it('ninguno lleva signos de exclamación ni dos puntos', () => {
    expect(sentences.filter((sentence) => /[!¡:]/.test(sentence.text))).toEqual([]);
  });

  it('ninguno deja ver un valor sin resolver', () => {
    expect(
      sentences.filter((sentence) => /\bundefined\b|\bNaN\b|\[object|\bnull\b/.test(sentence.text)),
    ).toEqual([]);
  });

  it('cada paso para volver a prender el workflow es una frase completa', () => {
    for (const step of calibrationAdminTexts.status.stale.steps) {
      expect(step).toMatch(/\.$/);
    }
  });

  it('los códigos de motivo de una corrida que conoce el flujo tienen su frase', () => {
    for (const reason of [
      'disabled',
      'running',
      'not_configured',
      'timeout',
      'kappa_mismatch',
      'invalid_page',
      'store_error',
      'compute_error',
      'publish_error',
      'unexpected',
    ]) {
      expect(calibrationAdminTexts.reasons[reason], reason).toBeDefined();
    }
  });
});
