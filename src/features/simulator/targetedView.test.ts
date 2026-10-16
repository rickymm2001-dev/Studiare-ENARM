import { describe, expect, it } from 'vitest';
import { DEFAULT_THRESHOLDS } from '@/config/thresholds';
import type { StudentModel } from '@/data/model/contracts';
import type { Insight, InsightReport } from '@/engines/insights';
import { targetedFromModel, targetedFromReport } from './targetedView';

const NEED = DEFAULT_THRESHOLDS.bias.minTaggedErrors;
const modelWith = (bias: Partial<StudentModel['bias']>): StudentModel =>
  ({
    bias: { vocabulary: 'trap', prone: [], baseline: 'chance', byTag: {}, ...bias },
  }) as unknown as StudentModel;

describe('opción de dirigir las opciones desde el modelo (B14, 4.3)', () => {
  it('sin una sola trampa vista pide todos los errores con trampa etiquetada', () => {
    expect(targetedFromModel(modelWith({}))).toEqual({ kind: 'calibrating', have: 0, need: NEED });
  });

  it('con trampas vistas pero pocos errores dice cuántos lleva', () => {
    const model = modelWith({
      byTag: {
        anchoring: { state: 'calibrating', have: 12, need: NEED },
        premature_closure: { state: 'calibrating', have: 12, need: NEED },
      },
    });
    expect(targetedFromModel(model)).toEqual({ kind: 'calibrating', have: 12, need: NEED });
  });

  it('con errores suficientes y sin trampa propensa no ofrece nada', () => {
    const model = modelWith({ byTag: { anchoring: { state: 'ready', value: 0.2 } }, prone: [] });
    expect(targetedFromModel(model)).toEqual({ kind: 'none' });
  });

  it('con trampas propensas las ofrece por su nombre, de la que más atrapa a la que menos', () => {
    const model = modelWith({
      byTag: {
        anchoring: { state: 'ready', value: 0.6 },
        premature_closure: { state: 'ready', value: 0.4 },
      },
      prone: ['anchoring', 'premature_closure'],
    });
    const view = targetedFromModel(model);
    expect(view).toMatchObject({ kind: 'ready', tags: ['anchoring', 'premature_closure'] });
    expect(view.kind === 'ready' ? view.names : []).toHaveLength(2);
    // Una etiqueta que no está en la taxonomía se queda con su clave
    expect(
      targetedFromModel(
        modelWith({ byTag: { rara: { state: 'ready', value: 0.5 } }, prone: ['rara'] }),
      ),
    ).toMatchObject({ kind: 'ready', names: ['rara'] });
  });
});

describe('la misma opción desde el informe de Conócete', () => {
  const insight = (id: string, state: Insight['state']): Insight => ({
    id,
    area: 'traps',
    weight: 1,
    state,
  });
  const reportOf = (...insights: Insight[]): InsightReport => ({
    insights,
    strengths: [],
    focus: [],
    totals: { answers: 0, reviews: 0, taggedErrors: 0, sessions: 0 },
  });

  it('calibrando dice cuánto lleva y cuánto pide', () => {
    expect(
      targetedFromReport(
        reportOf(
          insight('biases', { kind: 'calibrating', have: 3, need: 40, unit: 'tagged_errors' }),
        ),
      ),
    ).toEqual({ kind: 'calibrating', have: 3, need: 40 });
  });

  it('con perfil ofrece sus trampas y sin perfil no ofrece nada', () => {
    const profile = insight('bias_profile', {
      kind: 'ready',
      level: 'watch',
      values: { share0: 0.6 },
      refs: { tag0: 'anchoring' },
    });
    expect(targetedFromReport(reportOf(profile))).toMatchObject({
      kind: 'ready',
      tags: ['anchoring'],
    });
    expect(targetedFromReport(reportOf())).toEqual({ kind: 'none' });
  });
});
