// Exposiciones y elecciones de cada opción y variantes listas (B14, 3.5 del plan de B14)
import { describe, expect, it } from 'vitest';
import { FACTORY_THRESHOLDS } from '@/config/thresholds';
import { bankItem, optionId } from '../../../tests/calibration/builders';
import { tallyExposures } from './options';
import type { BankItemRow, FirstAttempt } from './types';

function attempt(
  person: string,
  item: BankItemRow,
  letter: string,
  exposed: readonly string[] | null,
  seq: number,
): FirstAttempt {
  const key = item.versionId.slice(2);
  return {
    person,
    questionId: item.questionId,
    versionId: item.versionId,
    optionId: optionId(key, letter),
    correct: letter === 'A',
    daysBefore: 2,
    seq,
    exposed: exposed === null ? null : exposed.map((letterShown) => optionId(key, letterShown)),
  };
}

const tally = (attempts: FirstAttempt[], items: BankItemRow[], variantExposures?: number) =>
  tallyExposures({
    attempts,
    bank: new Map(items.map((item) => [item.versionId, item])),
    thresholds: {
      sampling: {
        ...FACTORY_THRESHOLDS.sampling,
        ...(variantExposures === undefined ? {} : { variantExposuresForExam: variantExposures }),
      },
    },
  });

describe('exposiciones y elecciones por opción', () => {
  const item = bankItem('o1', {}, 6);

  it('cada opción mostrada suma una exposición y la elegida suma una elección', () => {
    const { options } = tally(
      [
        attempt('a', item, 'B', ['A', 'B', 'C', 'D'], 1),
        attempt('b', item, 'A', ['A', 'C', 'E', 'F'], 2),
        attempt('c', item, 'E', ['B', 'C', 'E', 'D'], 3),
      ],
      [item],
    );
    const row = (letter: string) =>
      options.find((entry) => entry.optionId === optionId('o1', letter));
    expect(row('A')).toMatchObject({ exposures: 2, choices: 1 });
    expect(row('B')).toMatchObject({ exposures: 2, choices: 1 });
    expect(row('C')).toMatchObject({ exposures: 3, choices: 0 });
    expect(row('D')).toMatchObject({ exposures: 2, choices: 0 });
    expect(row('E')).toMatchObject({ exposures: 2, choices: 1 });
    expect(row('F')).toMatchObject({ exposures: 1, choices: 0 });
    // Las elecciones nunca superan las exposiciones
    for (const entry of options) expect(entry.choices).toBeLessThanOrEqual(entry.exposures);
  });

  it('un intento sin pantalla de opciones no cuenta y el orden de salida es estable', () => {
    const other = bankItem('o0');
    const { options } = tally(
      [attempt('a', item, 'B', null, 1), attempt('b', other, 'C', ['A', 'C'], 2)],
      [item, other],
    );
    expect(options.map((entry) => [entry.versionId, entry.optionId])).toEqual([
      ['v-o0', 'o-o0-A'],
      ['v-o0', 'o-o0-C'],
    ]);
  });
});

describe('variantes listas para el examen', () => {
  const variant = bankItem('var', { variantOf: 'q-original' });
  const plain = bankItem('plain');
  const many = (count: number, letters: readonly string[] = ['A', 'B', 'C', 'D']) =>
    Array.from({ length: count }, (_, index) => attempt(`p${index}`, variant, 'B', letters, index));

  it('con 200 exposiciones en cada distractor canónico está lista y con 199 no', () => {
    expect(tally(many(200), [variant, plain]).variantReady.get('v-var')).toBe(true);
    expect(tally(many(199), [variant, plain]).variantReady.get('v-var')).toBe(false);
  });

  it('un distractor canónico que se muestra menos frena a la variante', () => {
    const attempts = [...many(200, ['A', 'B', 'C']), ...many(150, ['A', 'B', 'C', 'D'])];
    // D tiene 150 exposiciones y A, B y C 350
    expect(tally(attempts, [variant]).variantReady.get('v-var')).toBe(false);
    expect(tally([...attempts, ...many(50, ['A', 'D'])], [variant]).variantReady.get('v-var')).toBe(
      true,
    );
  });

  it('la opción correcta no cuenta como distractor y una pregunta que no es variante no se evalúa', () => {
    const onlyDistractors = many(200, ['B', 'C', 'D']);
    expect(tally(onlyDistractors, [variant, plain]).variantReady.get('v-var')).toBe(true);
    expect(tally(onlyDistractors, [variant, plain]).variantReady.has('v-plain')).toBe(false);
  });

  it('el umbral lo manda el admin y una variante sin distractores canónicos nunca está lista', () => {
    expect(tally(many(5), [variant], 5).variantReady.get('v-var')).toBe(true);
    expect(tally(many(4), [variant], 5).variantReady.get('v-var')).toBe(false);
    const odd = bankItem('odd', { variantOf: 'q-x', canonical: ['o-odd-A', 'no-existe'] });
    expect(tally([], [odd], 1).variantReady.get('v-odd')).toBe(false);
    const empty = bankItem('empty', { variantOf: 'q-x', canonical: [] });
    expect(tally([], [empty], 1).variantReady.get('v-empty')).toBe(false);
  });
});
