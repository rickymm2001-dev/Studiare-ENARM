import { describe, expect, it } from 'vitest';
import { DEFAULT_THRESHOLDS } from '@/config/thresholds';
import { computeAgreement, selectDoubleLabelSample, type LabelRecord } from './agreement';
import { createRng } from './random';

const thresholds = DEFAULT_THRESHOLDS.bias;

/** Dos médicos etiquetan las mismas opciones. Con agreeRate coinciden, si no eligen al azar */
function labels(options: number, agreeRate: number, seed: string): LabelRecord[] {
  const rng = createRng(seed);
  const tags = ['anchoring', 'premature_closure', 'availability', 'base_rate_fallacy'];
  return Array.from({ length: options }, (_, index) => {
    const first = rng.pick(tags);
    const second = rng.chance(agreeRate) ? first : rng.pick(tags);
    return [
      { optionId: `o${index}`, physicianId: 'medico-a', tag: first },
      { optionId: `o${index}`, physicianId: 'medico-b', tag: second },
    ];
  }).flat();
}

describe('acuerdo del etiquetado (7.11)', () => {
  it('elige el 20% de las preguntas al azar y de forma reproducible', () => {
    const ids = Array.from({ length: 300 }, (_, index) => `q${index}`);
    const sample = selectDoubleLabelSample(ids, 0.2, 'doble');
    expect(sample).toHaveLength(60);
    expect(new Set(sample).size).toBe(60);
    expect(selectDoubleLabelSample(ids, 0.2, 'doble')).toEqual(sample);
    expect(selectDoubleLabelSample(ids, 0.2, 'otra')).not.toEqual(sample);
    expect(selectDoubleLabelSample(['a', 'b', 'c'], 0.2, 's')).toHaveLength(1);
    expect(() => selectDoubleLabelSample(ids, 1.5, 's')).toThrow(RangeError);
  });

  it('con buen acuerdo habla de sesgos', () => {
    const report = computeAgreement(labels(200, 0.85, 'alto'), thresholds);
    expect(report.pairs).toBe(200);
    expect(report.global?.kappa).toBeGreaterThan(0.6);
    expect(report.vocabulary).toBe('bias');
    expect(Object.keys(report.byTag)).toHaveLength(4);
  });

  it('con kappa menor a 0.4 habla de trampas', () => {
    const report = computeAgreement(labels(200, 0.2, 'bajo'), thresholds);
    expect(report.global?.kappa).toBeLessThan(0.4);
    expect(report.vocabulary).toBe('trap');
  });

  it('sin doble etiquetado sigue calibrando y habla de trampas', () => {
    const report = computeAgreement(
      [{ optionId: 'o1', physicianId: 'medico-a', tag: 'anchoring' }],
      thresholds,
    );
    expect(report).toMatchObject({ pairs: 0, global: null, calibrating: true, vocabulary: 'trap' });
  });

  it('usa los dos primeros médicos por ID e ignora etiquetas repetidas del mismo médico', () => {
    const report = computeAgreement(
      [
        { optionId: 'o1', physicianId: 'b', tag: 'x' },
        { optionId: 'o1', physicianId: 'a', tag: 'x' },
        { optionId: 'o1', physicianId: 'a', tag: 'x' },
        { optionId: 'o1', physicianId: 'c', tag: 'y' },
        { optionId: 'o2', physicianId: 'a', tag: 'y' },
        { optionId: 'o2', physicianId: 'b', tag: 'y' },
      ],
      thresholds,
    );
    expect(report.pairs).toBe(2);
    expect(report.global?.kappa).toBeCloseTo(1, 12);
  });
});
