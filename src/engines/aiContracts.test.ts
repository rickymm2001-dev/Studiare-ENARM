import { describe, expect, it } from 'vitest';
import {
  AI_ENGINES,
  AI_INPUT_LIMITS,
  AiErrorSchema,
  AiRequestSchema,
  ENGINE_ARTIFACT_KIND,
  ENGINE_CONTRACTS,
  HypothesisOutputSchema,
  inputChars,
} from './aiContracts';
import {
  biasTipInput,
  flashcardsInput,
  hypothesisInput,
  restructureInput,
  weeklyReportInput,
} from '@/ai/testing/aiSamples';

describe('entradas', () => {
  it('aceptan los ejemplos de cada motor y rechazan campos de más', () => {
    const samples = {
      forgetting: hypothesisInput(),
      weekly_report: weeklyReportInput(),
      flashcards: flashcardsInput(),
      bias_tips: biasTipInput(),
      restructure: restructureInput(),
    };
    for (const engine of AI_ENGINES) {
      const schema = ENGINE_CONTRACTS[engine].input;
      expect(schema.safeParse(samples[engine]).success, engine).toBe(true);
      expect(schema.safeParse({ ...samples[engine], nombre: 'Ana' }).success, engine).toBe(false);
    }
  });

  it('cada ejemplo cabe en el tamaño máximo de su motor', () => {
    expect(inputChars(hypothesisInput())).toBeLessThanOrEqual(AI_INPUT_LIMITS.forgetting);
    expect(inputChars(weeklyReportInput())).toBeLessThanOrEqual(AI_INPUT_LIMITS.weekly_report);
    expect(inputChars(flashcardsInput())).toBeLessThanOrEqual(AI_INPUT_LIMITS.flashcards);
    expect(inputChars(biasTipInput())).toBeLessThanOrEqual(AI_INPUT_LIMITS.bias_tips);
    expect(inputChars(restructureInput())).toBeLessThanOrEqual(AI_INPUT_LIMITS.restructure);
  });

  it('piden de dos a tres ejemplos en un consejo y referencias sin espacios', () => {
    const one = biasTipInput().examples.slice(0, 1);
    expect(
      ENGINE_CONTRACTS.bias_tips.input.safeParse(biasTipInput({ examples: one })).success,
    ).toBe(false);
    const spaced = hypothesisInput({
      evidence: [{ ref: 'Ana Pérez', kind: 'question', text: 'Texto' }],
    });
    expect(ENGINE_CONTRACTS.forgetting.input.safeParse(spaced).success).toBe(false);
  });

  it('el olvido esperado nunca forma una hipótesis', () => {
    const input = { ...hypothesisInput(), rule: 'expected_forgetting' };
    expect(ENGINE_CONTRACTS.forgetting.input.safeParse(input).success).toBe(false);
  });
});

describe('salidas', () => {
  it('la confianza de una hipótesis nunca es alta', () => {
    const base = {
      hypothesis: null,
      evidence: [],
      confidence: 'high',
      actions: [],
      studentMessage: null,
    };
    expect(HypothesisOutputSchema.safeParse(base).success).toBe(false);
    expect(HypothesisOutputSchema.safeParse({ ...base, confidence: 'medium' }).success).toBe(true);
  });

  it('las acciones son solo las de la lista cerrada', () => {
    const base = {
      hypothesis: 'Una frase.',
      evidence: ['q-01'],
      confidence: 'low',
      actions: ['borrar_cuenta'],
      studentMessage: 'Uno. Dos.',
    };
    expect(HypothesisOutputSchema.safeParse(base).success).toBe(false);
  });
});

describe('envoltura', () => {
  const request = {
    studentRef: '01HZX0000000000000000000AA',
    promptVersion: 'forgetting.mock.v1',
    input: {},
  };

  it('acepta un alumno seudónimo y rechaza un correo o un nombre en su lugar', () => {
    expect(AiRequestSchema.safeParse(request).success).toBe(true);
    expect(AiRequestSchema.safeParse({ ...request, studentRef: 'ana@correo.com' }).success).toBe(
      false,
    );
    expect(AiRequestSchema.safeParse({ ...request, studentRef: 'Ana Pérez' }).success).toBe(false);
  });

  it('limita la lista de nombres bloqueados y la versión del prompt', () => {
    const names = Array.from({ length: 6 }, (_, index) => `Nombre ${index}`);
    expect(AiRequestSchema.safeParse({ ...request, blockedNames: names }).success).toBe(false);
    expect(AiRequestSchema.safeParse({ ...request, promptVersion: 'cualquier cosa' }).success).toBe(
      false,
    );
  });

  it('los errores llevan un código conocido y un mensaje', () => {
    expect(AiErrorSchema.safeParse({ error: 'pii_blocked', message: 'No.' }).success).toBe(true);
    expect(AiErrorSchema.safeParse({ error: 'otro', message: 'No.' }).success).toBe(false);
  });

  it('cada motor tiene su tipo de artefacto', () => {
    expect(Object.keys(ENGINE_ARTIFACT_KIND).sort()).toEqual([...AI_ENGINES].sort());
  });
});

describe('tamaño de una entrada', () => {
  it('suma el texto de todos los campos anidados', () => {
    expect(inputChars({ a: 'hola', b: ['ab', { c: 'xyz' }], d: 5, e: null })).toBe(9);
    expect(inputChars('abc')).toBe(3);
    expect(inputChars(42)).toBe(0);
  });
});
