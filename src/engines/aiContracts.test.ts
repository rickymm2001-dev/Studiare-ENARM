import { describe, expect, it } from 'vitest';
import {
  AI_ENGINES,
  AI_ERROR_CODES,
  AI_INPUT_LIMITS,
  AiErrorSchema,
  AiGateReviewSchema,
  AiGateSampleFileSchema,
  AiGateStateSchema,
  AiHealthSchema,
  AiJobRequestSchema,
  AiJobStatusRequestSchema,
  AiJobStatusResponseSchema,
  AiJobStatusSchema,
  AiRequestSchema,
  BATCH_ENGINES,
  BatchEngineSchema,
  DEFAULT_BIAS_VOCABULARY,
  ENGINE_ARTIFACT_KIND,
  ENGINE_CONTRACTS,
  HypothesisOutputSchema,
  inputChars,
  JobKeySchema,
  MAX_GATE_SAMPLE_ITEMS,
  MAX_GENERATION_SECTIONS,
} from './aiContracts';
import { mockOutput } from './aiMock';
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

describe('contratos de B12 (8.5, C1)', () => {
  const request = {
    studentRef: '01HZX0000000000000000000AA',
    promptVersion: 'flashcards.provisional.v1',
    input: {},
  };
  const at = '2026-10-14T18:00:00.000Z';
  const hash = 'a'.repeat(64);

  it('solo hipótesis y reestructuradas van por lote', () => {
    expect([...BATCH_ENGINES]).toEqual(['forgetting', 'restructure']);
    expect(BatchEngineSchema.safeParse('weekly_report').success).toBe(false);
  });

  it('suma los códigos de error nuevos', () => {
    for (const code of [
      'gate_closed',
      'staff_only',
      'refused',
      'generation_limit',
      'not_configured',
      'paused',
    ]) {
      expect(AI_ERROR_CODES, code).toContain(code);
      expect(AiErrorSchema.safeParse({ error: code, message: 'No.' }).success, code).toBe(true);
    }
  });

  it('la llave de un trabajo no deja pasar texto', () => {
    expect(JobKeySchema.safeParse(`fgt_${'0123456789abcdef'.repeat(2)}`).success).toBe(true);
    expect(JobKeySchema.safeParse('corta').success).toBe(false);
    expect(JobKeySchema.safeParse('Ana Pérez olvida').success).toBe(false);
    expect(JobKeySchema.safeParse('a'.repeat(65)).success).toBe(false);
  });

  it('la salud acepta el modo unavailable, la compuerta por motor y campos futuros', () => {
    expect(AiHealthSchema.safeParse({ status: 'ok', mode: 'mock', version: 1 }).success).toBe(true);
    const v2 = {
      status: 'ok',
      mode: 'unavailable',
      version: 2,
      engines: { forgetting: 'gated', flashcards: 'open' },
      region: 'us-east-1',
    };
    expect(AiHealthSchema.safeParse(v2).success).toBe(true);
    expect(AiHealthSchema.safeParse({ ...v2, mode: 'otro' }).success).toBe(false);
    expect(AiHealthSchema.safeParse({ ...v2, engines: { forgetting: 'abierto' } }).success).toBe(
      false,
    );
  });

  it('el sobre acepta la generación de tarjetas con su sección', () => {
    const generation = { ref: '01HZX0000000000000000000GG', section: 0 };
    expect(AiRequestSchema.safeParse({ ...request, generation }).success).toBe(true);
    const last = { ...generation, section: MAX_GENERATION_SECTIONS - 1 };
    expect(AiRequestSchema.safeParse({ ...request, generation: last }).success).toBe(true);
    for (const bad of [
      { ...generation, section: MAX_GENERATION_SECTIONS },
      { ...generation, section: -1 },
      { ...generation, ref: 'gen:01' },
      { ...generation, extra: true },
    ]) {
      expect(AiRequestSchema.safeParse({ ...request, generation: bad }).success).toBe(false);
    }
  });

  it('un trabajo lleva el sobre de siempre más su llave, y nada más', () => {
    const job = { ...request, promptVersion: 'forgetting.base.v1', jobKey: 'fgt_0123456789' };
    expect(AiJobRequestSchema.safeParse(job).success).toBe(true);
    expect(AiJobRequestSchema.safeParse({ ...job, jobKey: 'x' }).success).toBe(false);
    expect(AiJobRequestSchema.safeParse({ ...job, nombre: 'Ana' }).success).toBe(false);
  });

  it('se piden de 1 a 20 trabajos a la vez', () => {
    const keys = (count: number) =>
      Array.from({ length: count }, (_, index) => `fgt_${String(index).padStart(8, '0')}`);
    expect(AiJobStatusRequestSchema.safeParse({ jobKeys: keys(1) }).success).toBe(true);
    expect(AiJobStatusRequestSchema.safeParse({ jobKeys: keys(20) }).success).toBe(true);
    expect(AiJobStatusRequestSchema.safeParse({ jobKeys: [] }).success).toBe(false);
    expect(AiJobStatusRequestSchema.safeParse({ jobKeys: keys(21) }).success).toBe(false);
  });

  it('el estado de un trabajo dice si está en cola, en curso, listo o fallido', () => {
    const queued = {
      jobKey: 'fgt_0123456789',
      engine: 'forgetting',
      status: 'queued',
      queuedAt: at,
      readyAt: null,
    };
    expect(AiJobStatusSchema.safeParse(queued).success).toBe(true);
    const failed = { ...queued, status: 'failed', error: 'refused', message: 'No.', readyAt: at };
    expect(AiJobStatusSchema.safeParse(failed).success).toBe(true);
    expect(AiJobStatusSchema.safeParse({ ...queued, status: 'submitted' }).success).toBe(false);
    expect(AiJobStatusSchema.safeParse({ ...queued, input: {} }).success).toBe(false);
    expect(AiJobStatusResponseSchema.safeParse({ jobs: [queued, failed] }).success).toBe(true);
  });

  it('el consejo por sesgo acepta el vocabulario de la app y por omisión es trampa', () => {
    const schema = ENGINE_CONTRACTS.bias_tips.input;
    expect(schema.safeParse(biasTipInput({ vocabulary: 'sesgo' })).success).toBe(true);
    expect(schema.safeParse(biasTipInput({ vocabulary: 'trampa' })).success).toBe(true);
    expect(schema.safeParse({ ...biasTipInput(), vocabulary: 'bias' }).success).toBe(false);
    expect(schema.safeParse(biasTipInput()).success).toBe(true);
    expect(DEFAULT_BIAS_VOCABULARY).toBe('trampa');
  });

  it('el estado de la compuerta guarda lo auditado por motor', () => {
    const engine = {
      open: true,
      model: 'claude-haiku-5-5',
      effort: 'low',
      thinking: 'adaptive',
      promptVersion: 'bias_tips.base.v1',
      promptHash: hash,
      sampleId: 'b12-2026-10',
      at,
    };
    expect(AiGateStateSchema.safeParse({ paused: false, engines: {} }).success).toBe(true);
    expect(
      AiGateStateSchema.safeParse({ paused: true, engines: { bias_tips: engine } }).success,
    ).toBe(true);
    expect(
      AiGateStateSchema.safeParse({
        paused: false,
        engines: { bias_tips: { ...engine, promptHash: 'no-es-huella' } },
      }).success,
    ).toBe(false);
    expect(
      AiGateStateSchema.safeParse({ paused: false, engines: { chat_libre: engine } }).success,
    ).toBe(false);
  });

  it('la reseña del médico tiene los campos de la rúbrica y nada más', () => {
    const review = {
      accuracy: 'correct',
      grounded: true,
      safetyIssue: false,
      usefulness: 4,
      clarity: 3,
      verdict: 'approved',
      comment: null,
    };
    expect(AiGateReviewSchema.safeParse(review).success).toBe(true);
    expect(AiGateReviewSchema.safeParse({ ...review, comment: 'Bien.' }).success).toBe(true);
    expect(AiGateReviewSchema.safeParse({ ...review, comment: 'x'.repeat(501) }).success).toBe(
      false,
    );
    expect(AiGateReviewSchema.safeParse({ ...review, usefulness: 5 }).success).toBe(false);
    expect(AiGateReviewSchema.safeParse({ ...review, accuracy: 'grave' }).success).toBe(false);
    expect(AiGateReviewSchema.safeParse({ ...review, reviewer: 'Ana' }).success).toBe(false);
  });

  describe('archivo de muestra de la compuerta', () => {
    const item = (engine: (typeof AI_ENGINES)[number], index: number) => {
      const inputs = {
        forgetting: hypothesisInput(),
        weekly_report: weeklyReportInput(),
        flashcards: flashcardsInput(),
        bias_tips: biasTipInput({ vocabulary: 'trampa' }),
        restructure: restructureInput(),
      } as const;
      const input = inputs[engine];
      let output: unknown = mockOutput(engine, input as never);
      if (engine === 'flashcards') {
        const cards = (output as { cards: unknown[] }).cards;
        output = { cards: cards.slice(0, 1) };
      }
      return {
        id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
        engine,
        model: 'claude-haiku-5-5',
        effort: 'low',
        thinking: 'adaptive',
        promptVersion: `${engine}.base.v1`,
        promptHash: hash,
        sourceKind: engine === 'flashcards' ? 'team' : 'demo',
        input,
        output,
      };
    };
    const file = () => ({
      version: 1,
      id: 'b12-2026-10',
      createdAt: at,
      items: AI_ENGINES.map((engine, index) => item(engine, index)),
    });

    it('acepta un texto de cada motor con su fuente y lo que vería el alumno', () => {
      const parsed = AiGateSampleFileSchema.safeParse(file());
      expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
    });

    it('rechaza ids repetidos, más de una tarjeta por texto y salidas de otro motor', () => {
      const repeated = file();
      repeated.items[1] = { ...repeated.items[1], id: repeated.items[0]?.id } as never;
      expect(AiGateSampleFileSchema.safeParse(repeated).success).toBe(false);

      const twoCards = file();
      const cards = twoCards.items.find((entry) => entry.engine === 'flashcards');
      if (!cards) throw new Error('Falta la tarjeta');
      const card = (cards.output as { cards: unknown[] }).cards[0];
      cards.output = { cards: [card, card] };
      expect(AiGateSampleFileSchema.safeParse(twoCards).success).toBe(false);

      const swapped = file();
      const tip = swapped.items.find((entry) => entry.engine === 'bias_tips');
      if (!tip) throw new Error('Falta el consejo');
      tip.output = item('forgetting', 9).output;
      expect(AiGateSampleFileSchema.safeParse(swapped).success).toBe(false);
    });

    it('rechaza un archivo vacío, demasiado grande o con una fuente desconocida', () => {
      expect(AiGateSampleFileSchema.safeParse({ ...file(), items: [] }).success).toBe(false);
      const many = Array.from({ length: MAX_GATE_SAMPLE_ITEMS + 1 }, (_, index) =>
        item('weekly_report', index),
      );
      expect(AiGateSampleFileSchema.safeParse({ ...file(), items: many }).success).toBe(false);
      const unknown = file();
      unknown.items[0] = { ...unknown.items[0], sourceKind: 'alumno' } as never;
      expect(AiGateSampleFileSchema.safeParse(unknown).success).toBe(false);
    });
  });
});
