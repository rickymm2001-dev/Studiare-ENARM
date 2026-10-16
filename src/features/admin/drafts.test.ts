// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { AdminConfig } from '@/ai/admin';
import type { AiEngine } from '@/engines/aiContracts';
import { FACTORY_THRESHOLDS } from '@/config/thresholds';
import { DEMO_COHORT_MAX, DEMO_COHORT_MIN } from '@/demo/constants';
import { draftOf, enginesClosedBy, patchOf, validateAiDraft } from './aiConfigDraft';
import { readAdjustments } from './demoAdjust';
import { initialDraft, patchFromDraft, validateDraft } from './thresholdDraft';
import { THRESHOLD_FIELDS, fieldId, readThreshold } from './thresholdFields';
import {
  branchesBySection,
  currentDraft,
  factoryDraft,
  positive,
  weightsPatch,
  weightsProvisional,
  weightsToStore,
} from './weightsDraft';

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

  it('los de Inglés médico se editan, entran al parche y respetan su rango (B13)', () => {
    const fields = THRESHOLD_FIELDS.filter((field) => field.group === 'english').map(fieldId);
    expect(fields).toEqual([
      'english.secondsPerItem',
      'english.examMinItems',
      'english.practiceMinCases',
      'english.minAnswersForStats',
    ]);
    expect(
      patchFromDraft({
        ...initialDraft(),
        'english.secondsPerItem': '75',
        'english.examMinItems': '24',
      }),
    ).toEqual({ english: { secondsPerItem: 75, examMinItems: 24 } });
    // Entre 30 y 300 segundos y sin decimales
    expect(
      Object.keys(validateDraft({ ...initialDraft(), 'english.secondsPerItem': '29' })),
    ).toEqual(['english.secondsPerItem']);
    expect(
      Object.keys(validateDraft({ ...initialDraft(), 'english.secondsPerItem': '301' })),
    ).toEqual(['english.secondsPerItem']);
    expect(Object.keys(validateDraft({ ...initialDraft(), 'english.examMinItems': '0' }))).toEqual([
      'english.examMinItems',
    ]);
    expect(
      Object.keys(validateDraft({ ...initialDraft(), 'english.minAnswersForStats': '1.5' })),
    ).toEqual(['english.minAnswersForStats']);
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

  it('los pesos de fábrica son los de la sección 6 del plan del cambio, con Inglés médico aparte (B11)', () => {
    const { clinical, english } = branchesBySection();
    expect(clinical.reduce((total, branch) => total + branch.weight, 0)).toBe(250);
    expect(clinical.map((branch) => branch.key)).toContain('public_health');
    expect(english.map((branch) => [branch.key, branch.weight])).toEqual([['medical_english', 30]]);
  });

  it('los pesos siguen provisionales hasta que el admin apaga la marca, y solo se guarda lo que cambia', () => {
    expect(weightsProvisional(undefined)).toBe(true);
    expect(weightsProvisional({ provisional: false })).toBe(false);
    expect(weightsToStore(currentDraft(), true)).toBeNull();
    expect(weightsToStore(currentDraft(), false)).toEqual({
      branches: {},
      topics: {},
      provisional: false,
    });
    const draft = currentDraft();
    draft.branches.public_health = '20';
    expect(weightsToStore(draft, true)).toEqual({ branches: { public_health: 20 }, topics: {} });
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
    draft.models.bias_tips = {
      id: 'claude-sonnet-5-5',
      effort: 'medium',
      thinking: '',
      maxTokens: '900',
    };
    draft.limits.flashcards = '100';
    draft.budget = '2.5';
    expect(patchOf(draft, config)).toEqual({
      // Si el modelo cambia, se dice su razonamiento, que en el servicio depende de cada modelo
      models: {
        bias_tips: { id: 'claude-sonnet-5-5', effort: 'medium', thinking: null, maxTokens: 900 },
      },
      limits: { perStudentPerDay: { flashcards: 100 }, dailyBudgetUsd: 2.5 },
    });
  });

  it('señala un modelo sin precio, topes y presupuesto fuera de rango', () => {
    const draft = draftOf(config);
    draft.models.forgetting = { id: 'claude-otro-1', effort: '', thinking: '', maxTokens: '10' };
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
    draft.models.forgetting = {
      id: 'claude-nuevo-1',
      effort: '',
      thinking: '',
      maxTokens: '1500',
    };
    expect(validateAiDraft(draft, config)).toEqual({});
    expect(patchOf(draft, config)).toEqual({
      models: {
        forgetting: { id: 'claude-nuevo-1', effort: null, thinking: null, maxTokens: 1500 },
      },
      prices: { 'claude-nuevo-1': { input: 1, output: 5, cacheWrite: 1.25, cacheRead: 0.1 } },
    });
  });

  const cloudConfig: AdminConfig = {
    ...config,
    models: {
      ...config.models,
      flashcards: { id: 'claude-haiku-5-5', effort: 'low', thinking: 'adaptive', maxTokens: 8000 },
    },
    prices: {
      ...config.prices,
      'claude-haiku-5-5': { input: 0.1, output: 0.5, cacheWrite: 0.125, cacheRead: 0.01 },
      'claude-opus-5-5': { input: 4, output: 20, cacheWrite: 5, cacheRead: 0.2 },
    },
    limits: {
      ...config.limits,
      perUserDailyUsd: 0.3,
      cardGenerationsPerDay: 20,
      sectionsPerGeneration: 12,
      maxPendingJobs: 12,
      engineShare: {
        forgetting: 0.1,
        weekly_report: 0.1,
        flashcards: 0.55,
        bias_tips: 0.1,
        restructure: 0.15,
      },
    },
  };

  it('el razonamiento y los límites de la nube arrancan con lo del servicio, sin cambios ni errores', () => {
    const draft = draftOf(cloudConfig);
    expect(draft.models.flashcards).toMatchObject({ thinking: 'adaptive', effort: 'low' });
    expect(draft.models.forgetting.thinking).toBe('');
    expect(draft.cloud).toMatchObject({
      perUserDailyUsd: '0.3',
      cardGenerationsPerDay: '20',
      sectionsPerGeneration: '12',
      maxPendingJobs: '12',
    });
    // Las cuotas se ven en porcentaje, sin los ruidos del punto flotante
    expect(draft.cloud?.engineShare.flashcards).toBe('55');
    expect(validateAiDraft(draft, cloudConfig)).toEqual({});
    expect(patchOf(draft, cloudConfig)).toEqual({});
  });

  it('un servicio de desarrollo que no manda los límites de la nube no los muestra', () => {
    expect(draftOf(config).cloud).toBeNull();
  });

  it('cambiar solo el razonamiento lo manda, y cambiar solo el esfuerzo no lo toca', () => {
    const draft = draftOf(cloudConfig);
    draft.models.flashcards = { ...draft.models.flashcards, thinking: 'off' };
    expect(patchOf(draft, cloudConfig)).toEqual({
      models: {
        flashcards: { id: 'claude-haiku-5-5', effort: 'low', thinking: 'off', maxTokens: 8000 },
      },
    });
    const effort = draftOf(cloudConfig);
    effort.models.flashcards = { ...effort.models.flashcards, effort: 'max' };
    expect(patchOf(effort, cloudConfig)).toEqual({
      models: { flashcards: { id: 'claude-haiku-5-5', effort: 'max', maxTokens: 8000 } },
    });
  });

  it('los límites de la nube mandan solo lo que cambió, con las cuotas como fracción', () => {
    const draft = draftOf(cloudConfig);
    if (!draft.cloud) throw new Error('Sin límites de la nube');
    draft.cloud = {
      ...draft.cloud,
      perUserDailyUsd: '0.5',
      cardGenerationsPerDay: '10',
      engineShare: { ...draft.cloud.engineShare, flashcards: '60', restructure: '15' },
    };
    expect(patchOf(draft, cloudConfig)).toEqual({
      limits: {
        perUserDailyUsd: 0.5,
        cardGenerationsPerDay: 10,
        engineShare: { flashcards: 0.6 },
      },
    });
  });

  it('señala los límites de la nube fuera de rango', () => {
    const draft = draftOf(cloudConfig);
    if (!draft.cloud) throw new Error('Sin límites de la nube');
    draft.cloud = {
      perUserDailyUsd: '-1',
      cardGenerationsPerDay: '0',
      sectionsPerGeneration: '13',
      maxPendingJobs: '1.5',
      engineShare: { ...draft.cloud.engineShare, bias_tips: '101', forgetting: '' },
    };
    expect(Object.keys(validateAiDraft(draft, cloudConfig)).sort()).toEqual([
      'cardGenerationsPerDay',
      'maxPendingJobs',
      'perUserDailyUsd',
      'sectionsPerGeneration',
      'share.bias_tips',
      'share.forgetting',
    ]);
  });

  it('cambiar el modelo, el esfuerzo o el razonamiento de un motor abierto lo cierra para los alumnos', () => {
    const draft = draftOf(cloudConfig);
    draft.models.flashcards = { ...draft.models.flashcards, effort: 'medium' };
    draft.models.forgetting = { ...draft.models.forgetting, maxTokens: '1100' };
    draft.models.bias_tips = { ...draft.models.bias_tips, thinking: 'adaptive' };
    draft.limits.restructure = '10';
    const patch = patchOf(draft, cloudConfig);
    const open = new Set<AiEngine>(['flashcards', 'forgetting', 'bias_tips', 'restructure']);
    // El tope de tokens y los límites no cambian lo que se auditó, así que no cierran nada
    expect(enginesClosedBy(patch, cloudConfig, open)).toEqual(['flashcards', 'bias_tips']);
    // Un motor que ya está cerrado no se avisa
    expect(enginesClosedBy(patch, cloudConfig, new Set<AiEngine>(['restructure']))).toEqual([]);
    expect(enginesClosedBy({ limits: { dailyBudgetUsd: 2 } }, cloudConfig, open)).toEqual([]);
  });
});
