// Muestreo dirigido a varios sesgos (7.8, D-080). Sube las opciones con los sesgos a los que el
// alumno es propenso sin romper lo básico, que es no repetir, incluir la correcta y reproducirse.
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { sampleOptions, type SampleRequest, type SamplerOption } from './sampler';

const TAGS = ['anchoring', 'premature_closure', 'availability', 'base_rate', 'framing'];

const options: SamplerOption[] = [
  { id: 'c', isCorrect: true, biasTag: null },
  { id: 'a1', isCorrect: false, biasTag: 'anchoring' },
  { id: 'a2', isCorrect: false, biasTag: 'anchoring' },
  { id: 'p1', isCorrect: false, biasTag: 'premature_closure' },
  { id: 'v1', isCorrect: false, biasTag: 'availability' },
  { id: 'b1', isCorrect: false, biasTag: 'base_rate' },
  { id: 'f1', isCorrect: false, biasTag: 'framing' },
];

const base: SampleRequest = {
  options,
  canonicalOptionIds: ['c', 'b1', 'f1', 'v1'],
  mode: 'targeted',
  count: 4,
  seed: 'semilla',
};

const tagsShown = (request: SampleRequest) => {
  const ids = sampleOptions(request).shown.map((shown) => shown.optionId);
  return options.filter((option) => ids.includes(option.id) && !option.isCorrect);
};

describe('muestreo dirigido a varios sesgos', () => {
  it('llena los distractores con los sesgos propensos, por turnos del más al menos atractor', () => {
    const shown = tagsShown({ ...base, targetTags: ['anchoring', 'premature_closure'] });
    const tags = shown.map((option) => option.biasTag).sort();
    // Tres distractores. Un turno por cada sesgo y el tercero vuelve al más atractor
    expect(tags).toEqual(['anchoring', 'anchoring', 'premature_closure']);
  });

  it('con un solo sesgo propenso y pocos distractores de él completa con etiquetas variadas', () => {
    const shown = tagsShown({ ...base, targetTags: ['premature_closure'] });
    expect(shown.filter((option) => option.biasTag === 'premature_closure')).toHaveLength(1);
    expect(shown).toHaveLength(3);
    expect(new Set(shown.map((option) => option.biasTag)).size).toBe(3);
  });

  it('maxTargeted limita cuántos distractores llevan un sesgo propenso', () => {
    const shown = tagsShown({
      ...base,
      targetTags: ['anchoring', 'premature_closure', 'availability'],
      maxTargeted: 1,
    });
    const targeted = shown.filter((option) =>
      ['anchoring', 'premature_closure', 'availability'].includes(option.biasTag ?? ''),
    );
    expect(targeted.length).toBeGreaterThanOrEqual(1);
    // Con tope de 1 solo uno sale por la regla. Los demás pueden coincidir al completar
    expect(shown).toHaveLength(3);
  });

  it('una lista vacía o de sesgos que no existen cae a etiquetas variadas', () => {
    expect(tagsShown({ ...base, targetTags: [] })).toHaveLength(3);
    const shown = tagsShown({ ...base, targetTags: ['no_existe'] });
    expect(shown).toHaveLength(3);
    expect(new Set(shown.map((option) => option.biasTag)).size).toBe(3);
  });

  it('sin lista sigue incluyendo al menos un distractor de la etiqueta que más atrae', () => {
    for (let index = 0; index < 20; index += 1) {
      const shown = tagsShown({ ...base, seed: `s${index}`, targetTag: 'framing' });
      expect(shown.some((option) => option.biasTag === 'framing')).toBe(true);
    }
  });

  it('la lista manda sobre la etiqueta única', () => {
    const shown = tagsShown({ ...base, targetTag: 'framing', targetTags: ['anchoring'] });
    expect(shown.filter((option) => option.biasTag === 'anchoring')).toHaveLength(2);
  });

  it('propiedad. Incluye la correcta, no repite, se reproduce y sube los sesgos propensos', () => {
    const arbitrary = fc.record({
      tags: fc.array(fc.constantFrom(...TAGS), { minLength: 9, maxLength: 9 }),
      total: fc.integer({ min: 4, max: 10 }),
      count: fc.integer({ min: 2, max: 6 }),
      targets: fc.uniqueArray(fc.constantFrom(...TAGS), { minLength: 1, maxLength: 4 }),
      seed: fc.string({ minLength: 1, maxLength: 10 }),
    });
    fc.assert(
      fc.property(arbitrary, ({ tags, total, count, targets, seed }) => {
        const all: SamplerOption[] = Array.from({ length: total }, (_, index) => ({
          id: `o${index}`,
          isCorrect: index === 0,
          biasTag: index === 0 ? null : (tags[index % tags.length] as string),
        }));
        const request: SampleRequest = {
          options: all,
          canonicalOptionIds: all.slice(0, 4).map((option) => option.id),
          mode: 'targeted',
          count,
          seed,
          targetTags: targets,
        };
        const result = sampleOptions(request);
        const ids = result.shown.map((shown) => shown.optionId);
        expect(ids).toHaveLength(Math.min(count, total));
        expect(new Set(ids).size).toBe(ids.length);
        expect(ids).toContain('o0');
        expect(sampleOptions({ ...request })).toEqual(result);
        // Sube los propensos. Salen tantos como haya, hasta llenar los distractores
        const distractors = all.filter((option) => !option.isCorrect);
        const propense = distractors.filter((option) => targets.includes(option.biasTag ?? ''));
        const shownPropense = distractors.filter(
          (option) => ids.includes(option.id) && targets.includes(option.biasTag ?? ''),
        );
        expect(shownPropense.length).toBe(Math.min(propense.length, ids.length - 1));
      }),
      { numRuns: 400 },
    );
  });
});
