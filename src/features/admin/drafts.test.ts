// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { AdminConfig } from '@/ai/admin';
import { FACTORY_THRESHOLDS } from '@/config/thresholds';
import { DEMO_COHORT_MAX, DEMO_COHORT_MIN } from '@/demo/constants';
import { draftOf, patchOf, validateAiDraft } from './aiConfigDraft';
import { readAdjustments } from './demoAdjust';
import { initialDraft, patchFromDraft, validateDraft } from './thresholdDraft';
import { THRESHOLD_FIELDS, fieldId, readThreshold } from './thresholdFields';
import { currentDraft, factoryDraft, positive, weightsPatch } from './weightsDraft';

describe('umbrales', () => {
  it('cada campo editable existe en los umbrales y arranca con su valor', () => {
    const draft = initialDraft();
    for (const field of THRESHOLD_FIELDS) {
      expect(Number.isFinite(readThreshold(FACTORY_THRESHOLDS, field)), fieldId(field)).toBe(true);
      expect(draft[fieldId(field)]).toBe(String(readThreshold(FACTORY_THRESHOLDS, field)));
    }
    expect(validateDraft(draft)).toEqual({});
    expect(patchFromDraft(draft)).toEqual({});
  });

  it('el parche trae solo lo que cambió', () => {
    const draft = {
      ...initialDraft(),
      'bias.minTaggedErrors': '25',
      'fsrs.desiredRetention': '0.92',
    };
    expect(patchFromDraft(draft)).toEqual({
      bias: { minTaggedErrors: 25 },
      fsrs: { desiredRetention: 0.92 },
    });
  });

  it('señala lo que no es número, lo que no es entero y lo que rompe una regla', () => {
    const errors = validateDraft({
      ...initialDraft(),
      'bias.minTaggedErrors': '',
      'difficulty.provisionalResponses': '30.5',
      'fsrs.desiredRetention': 'abc',
    });
    expect(Object.keys(errors).sort()).toEqual([
      'bias.minTaggedErrors',
      'difficulty.provisionalResponses',
      'fsrs.desiredRetention',
    ]);
    const outOfRange = validateDraft({ ...initialDraft(), 'fsrs.desiredRetention': '0.5' });
    expect(Object.keys(outOfRange)).toEqual(['fsrs.desiredRetention']);
  });
});

describe('pesos del ENARM', () => {
  it('el borrador arranca igual a la taxonomía y no hay cambios', () => {
    expect(weightsPatch(currentDraft())).toEqual({ branches: {}, topics: {} });
    expect(currentDraft()).toEqual(factoryDraft());
  });

  it('el parche trae solo los pesos distintos de los de fábrica y ignora los inválidos', () => {
    const draft = currentDraft();
    const [branch] = Object.keys(draft.branches);
    const [topic] = Object.keys(draft.topics);
    if (!branch || !topic) throw new Error('Taxonomía vacía');
    draft.branches[branch] = '2';
    draft.topics[topic] = '0';
    expect(weightsPatch(draft)).toEqual({ branches: { [branch]: 2 }, topics: {} });
  });

  it('un peso es positivo y de hasta 100', () => {
    expect(positive('1.5')).toBe(true);
    for (const raw of ['', '0', '-1', 'x', '101']) expect(positive(raw), raw).toBe(false);
  });
});

describe('ajustes de la demo', () => {
  const ok = { cohortSize: '120', seed: 'prueba-1', examDate: '' };

  it('acepta los ajustes válidos y deja la fecha vacía como sin cambio', () => {
    expect(readAdjustments(ok)).toEqual({
      errors: {},
      adjust: { cohortSize: 120, seed: 'prueba-1' },
    });
    expect(readAdjustments({ ...ok, examDate: '2027-09-13' }).adjust.examDate).toBe('2027-09-13');
  });

  it('señala cada campo inválido', () => {
    const { errors } = readAdjustments({
      cohortSize: '5',
      seed: 'con espacio',
      examDate: '13/09/2027',
    });
    expect(Object.keys(errors).sort()).toEqual(['cohortSize', 'examDate', 'seed']);
    expect(readAdjustments({ ...ok, cohortSize: String(DEMO_COHORT_MIN) }).errors).toEqual({});
    expect(readAdjustments({ ...ok, cohortSize: String(DEMO_COHORT_MAX) }).errors).toEqual({});
    expect(
      readAdjustments({ ...ok, cohortSize: String(DEMO_COHORT_MAX + 1) }).errors.cohortSize,
    ).toBeDefined();
    expect(readAdjustments({ ...ok, cohortSize: '12.5' }).errors.cohortSize).toBeDefined();
    expect(readAdjustments({ ...ok, examDate: '2027-02-30' }).errors.examDate).toBeDefined();
  });
});

describe('configuración de IA', () => {
  const config: AdminConfig = {
    models: {
      forgetting: { id: 'claude-haiku-4-5', effort: null, maxTokens: 1500 },
      weekly_report: { id: 'claude-haiku-4-5', effort: null, maxTokens: 1500 },
      flashcards: { id: 'claude-sonnet-5-5', effort: 'low', maxTokens: 6000 },
      bias_tips: { id: 'claude-haiku-4-5', effort: null, maxTokens: 1000 },
      restructure: { id: 'claude-sonnet-5-5', effort: 'low', maxTokens: 4000 },
    },
    prices: {
      'claude-haiku-4-5': { input: 1, output: 5, cacheWrite: 1.25, cacheRead: 0.1 },
      'claude-sonnet-5-5': { input: 2, output: 10, cacheWrite: 2.5, cacheRead: 0.2 },
    },
    limits: {
      perStudentPerDay: {
        forgetting: 12,
        weekly_report: 4,
        flashcards: 240,
        bias_tips: 12,
        restructure: 20,
      },
      dailyBudgetUsd: 5,
      timeoutMs: 30000,
      maxRetries: 2,
    },
  };

  it('sin tocar nada no hay errores ni cambios', () => {
    const draft = draftOf(config);
    expect(validateAiDraft(draft, config)).toEqual({});
    expect(patchOf(draft, config)).toEqual({});
  });

  it('el parche trae solo lo que cambió', () => {
    const draft = draftOf(config);
    draft.models.bias_tips = { id: 'claude-sonnet-5-5', effort: 'medium', maxTokens: '900' };
    draft.limits.flashcards = '100';
    draft.budget = '2.5';
    expect(patchOf(draft, config)).toEqual({
      models: { bias_tips: { id: 'claude-sonnet-5-5', effort: 'medium', maxTokens: 900 } },
      limits: { perStudentPerDay: { flashcards: 100 }, dailyBudgetUsd: 2.5 },
    });
  });

  it('señala un modelo sin precio, topes y presupuesto fuera de rango', () => {
    const draft = draftOf(config);
    draft.models.forgetting = { id: 'claude-otro-1', effort: '', maxTokens: '10' };
    draft.limits.restructure = '0';
    draft.budget = '-1';
    expect(Object.keys(validateAiDraft(draft, config)).sort()).toEqual([
      'budget',
      'limit.restructure',
      'model.forgetting',
      'tokens.forgetting',
    ]);
  });

  it('agregar un modelo pide ID válido sin fecha y cuatro precios, y lo manda con sus precios', () => {
    const draft = draftOf(config);
    draft.newModel = {
      id: 'claude-haiku-4-5-20251001',
      input: '1',
      output: 'x',
      cacheWrite: '',
      cacheRead: '0',
    };
    expect(Object.keys(validateAiDraft(draft, config)).sort()).toEqual([
      'new.cacheWrite',
      'new.id',
      'new.output',
    ]);
    draft.newModel = {
      id: 'claude-nuevo-1',
      input: '1',
      output: '5',
      cacheWrite: '1.25',
      cacheRead: '0.1',
    };
    draft.models.forgetting = { id: 'claude-nuevo-1', effort: '', maxTokens: '1500' };
    expect(validateAiDraft(draft, config)).toEqual({});
    expect(patchOf(draft, config)).toEqual({
      models: { forgetting: { id: 'claude-nuevo-1', effort: null, maxTokens: 1500 } },
      prices: { 'claude-nuevo-1': { input: 1, output: 5, cacheWrite: 1.25, cacheRead: 0.1 } },
    });
  });
});
