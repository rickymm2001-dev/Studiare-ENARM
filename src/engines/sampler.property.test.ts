// Muestreo de opciones (7.8). Ninguna muestra repite opción, siempre incluye la correcta,
// respeta el modo y se reproduce con la semilla.
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  countsForExamScore,
  sampleOptions,
  type SampleRequest,
  type SamplerOption,
  type SamplingMode,
} from './sampler';

const TAGS = [
  'anchoring',
  'premature_closure',
  'availability',
  'base_rate',
  'framing',
  'representativeness',
];

/** Pregunta de 4 a 10 opciones con una sola correcta y su set canónico de 4 */
const questionArbitrary = fc
  .record({
    total: fc.integer({ min: 4, max: 10 }),
    tags: fc.array(fc.constantFrom(...TAGS), { minLength: 9, maxLength: 9 }),
    correctIndex: fc.nat(),
  })
  .map(({ total, tags, correctIndex }) => {
    const correctAt = correctIndex % total;
    const options: SamplerOption[] = Array.from({ length: total }, (_, index) => ({
      id: `o${index}`,
      isCorrect: index === correctAt,
      biasTag: index === correctAt ? null : (tags[index % tags.length] as string),
    }));
    const correct = options.find((option) => option.isCorrect) as SamplerOption;
    const distractorIds = options.filter((option) => !option.isCorrect).map((option) => option.id);
    return { options, canonicalOptionIds: [correct.id, ...distractorIds.slice(0, 3)] };
  });

const requestArbitrary = fc
  .record({
    question: questionArbitrary,
    mode: fc.constantFrom<SamplingMode>('canonical', 'diverse', 'targeted', 'stratified'),
    count: fc.integer({ min: 2, max: 6 }),
    seed: fc.string({ minLength: 1, maxLength: 12 }),
    targetTag: fc.constantFrom(...TAGS),
    exposures: fc.array(fc.integer({ min: 0, max: 500 }), { minLength: 10, maxLength: 10 }),
  })
  .map(({ question, mode, count, seed, targetTag, exposures }): SampleRequest => ({
    ...question,
    mode,
    count,
    seed,
    targetTag,
    exposures: Object.fromEntries(
      question.options.map((option, index) => [option.id, exposures[index] ?? 0]),
    ),
  }));

describe('propiedades del muestreo', () => {
  it('no repite opciones, siempre incluye la correcta y numera las posiciones', () => {
    fc.assert(
      fc.property(requestArbitrary, (request) => {
        const result = sampleOptions(request);
        const ids = result.shown.map((shown) => shown.optionId);
        expect(ids).toHaveLength(Math.min(request.count, request.options.length));
        expect(new Set(ids).size).toBe(ids.length);
        const correct = request.options.find((option) => option.isCorrect)?.id;
        expect(ids).toContain(correct);
        expect(result.shown.map((shown) => shown.position)).toEqual(ids.map((_, index) => index));
        expect(ids[result.correctPosition]).toBe(correct);
      }),
      { numRuns: 500 },
    );
  });

  it('se reproduce con la misma semilla', () => {
    fc.assert(
      fc.property(requestArbitrary, (request) => {
        expect(sampleOptions(request)).toEqual(sampleOptions({ ...request }));
      }),
      { numRuns: 300 },
    );
  });

  it('respeta el modo', () => {
    fc.assert(
      fc.property(requestArbitrary, (request) => {
        const result = sampleOptions(request);
        const ids = result.shown.map((shown) => shown.optionId);
        const distractors = request.options.filter((option) => !option.isCorrect);
        const chosen = distractors.filter((option) => ids.includes(option.id));
        if (request.mode === 'canonical' && request.count === 4) {
          expect(new Set(ids)).toEqual(new Set(request.canonicalOptionIds));
          expect(result.isCanonicalSet).toBe(true);
        }
        if (
          request.mode === 'targeted' &&
          distractors.some((option) => option.biasTag === request.targetTag)
        ) {
          expect(chosen.some((option) => option.biasTag === request.targetTag)).toBe(true);
        }
        if (request.mode === 'stratified') {
          const exposures = request.exposures ?? {};
          const unchosen = distractors.filter((option) => !ids.includes(option.id));
          const maxChosen = Math.max(...chosen.map((option) => exposures[option.id] ?? 0));
          const minUnchosen = Math.min(...unchosen.map((option) => exposures[option.id] ?? 0));
          if (unchosen.length > 0) expect(maxChosen).toBeLessThanOrEqual(minUnchosen);
        }
        if (request.mode === 'diverse') {
          const distinctAvailable = new Set(distractors.map((option) => option.biasTag)).size;
          const distinctChosen = new Set(chosen.map((option) => option.biasTag)).size;
          expect(distinctChosen).toBe(Math.min(chosen.length, distinctAvailable));
        }
      }),
      { numRuns: 500 },
    );
  });
});

describe('detalles del muestreo', () => {
  const options: SamplerOption[] = [
    { id: 'c', isCorrect: true, biasTag: null },
    { id: 'a1', isCorrect: false, biasTag: 'anchoring' },
    { id: 'a2', isCorrect: false, biasTag: 'anchoring' },
    { id: 'b1', isCorrect: false, biasTag: 'base_rate' },
    { id: 'f1', isCorrect: false, biasTag: 'framing' },
    { id: 'r1', isCorrect: false, biasTag: 'representativeness' },
  ];
  const base: SampleRequest = {
    options,
    canonicalOptionIds: ['c', 'a1', 'a2', 'b1'],
    mode: 'diverse',
    count: 4,
    seed: 's',
  };

  it('la posición de la correcta queda balanceada en una sesión', () => {
    const counts = [0, 0, 0, 0];
    for (let index = 0; index < 400; index += 1) {
      const result = sampleOptions({ ...base, seed: `q${index}`, correctPositionCounts: counts });
      counts[result.correctPosition] = (counts[result.correctPosition] ?? 0) + 1;
    }
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
  });

  it('el modo diverso evita repetir un set ya visto', () => {
    const first = sampleOptions(base);
    const seen = [first.shown.map((shown) => shown.optionId)];
    const second = sampleOptions({ ...base, seed: 's', seenSets: seen });
    expect(new Set(second.shown.map((shown) => shown.optionId))).not.toEqual(new Set(seen[0]));
  });

  it('el dirigido sin distractores de la etiqueta cae a diverso', () => {
    const result = sampleOptions({ ...base, mode: 'targeted', targetTag: 'sunk_cost' });
    expect(result.shown).toHaveLength(4);
  });

  it('con menos opciones que las pedidas muestra todas', () => {
    const result = sampleOptions({
      ...base,
      options: options.slice(0, 3),
      canonicalOptionIds: ['c', 'a1', 'a2'],
      count: 4,
    });
    expect(result.shown).toHaveLength(3);
  });

  it('rechaza preguntas sin una sola correcta, opciones repetidas o conteos inválidos', () => {
    expect(() => sampleOptions({ ...base, options: options.slice(1) })).toThrow(RangeError);
    expect(() =>
      sampleOptions({ ...base, options: [...options, options[1] as SamplerOption] }),
    ).toThrow(RangeError);
    expect(() => sampleOptions({ ...base, count: 1 })).toThrow(RangeError);
  });

  it('una variante cuenta para el examen solo con 200 exposiciones por distractor', () => {
    const canonical = ['c', 'a1', 'a2', 'b1'];
    const variant = ['c', 'a1', 'f1', 'r1'];
    const exposures = { a1: 300, f1: 250, r1: 199 };
    const input = {
      canonicalOptionIds: canonical,
      correctOptionId: 'c',
      exposures,
      minExposuresPerDistractor: 200,
    };
    expect(countsForExamScore({ ...input, shownOptionIds: canonical })).toBe(true);
    expect(countsForExamScore({ ...input, shownOptionIds: variant })).toBe(false);
    expect(
      countsForExamScore({
        ...input,
        shownOptionIds: variant,
        exposures: { ...exposures, r1: 200 },
      }),
    ).toBe(true);
  });
});
