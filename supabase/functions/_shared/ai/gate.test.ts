import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, type AiConfig } from './config.ts';
import { AiGateStateSchema, type AiGateState } from './engines/aiContracts.ts';
import {
  alwaysOpenGate,
  cachedGateReader,
  CLOSED_GATE,
  createRestGateReader,
  currentAudits,
  engineGate,
  engineGates,
  openGateState,
} from './gate.ts';
import { bundledPromptSets, promptHash } from './prompts.ts';
import { createFakeSupabaseRest } from './testing/fakeSupabaseRest.ts';
import { createMemoryAi } from './testing/memory.ts';

const prompts = bundledPromptSets();
const AT = '2026-10-15T15:00:00.000Z';

describe('compuerta por motor', () => {
  it('un motor solo está abierto con el modelo y el prompt auditados', async () => {
    const audits = await currentAudits(DEFAULT_CONFIG, prompts);
    expect(audits.forgetting.promptHash).toBe(await promptHash(prompts.forgetting));
    const state = openGateState(audits, AT, 'b12-2026-10');
    expect(AiGateStateSchema.safeParse(state).success).toBe(true);
    expect(engineGates(state, audits)).toEqual({
      forgetting: 'open',
      weekly_report: 'open',
      flashcards: 'open',
      bias_tips: 'open',
      restructure: 'open',
    });

    const changed: AiConfig = {
      ...DEFAULT_CONFIG,
      models: {
        ...DEFAULT_CONFIG.models,
        forgetting: { ...DEFAULT_CONFIG.models.forgetting, id: 'claude-haiku-5-5' },
        bias_tips: { ...DEFAULT_CONFIG.models.bias_tips, maxTokens: 900 },
      },
    };
    const after = await currentAudits(changed, prompts);
    expect(engineGate(state, 'forgetting', after.forgetting)).toBe('gated');
    // El tope de tokens no es parte de lo auditado
    expect(engineGate(state, 'bias_tips', after.bias_tips)).toBe('open');
    for (const field of ['effort', 'thinking', 'promptVersion', 'promptHash'] as const) {
      const other = { ...audits.weekly_report, [field]: field === 'effort' ? 'max' : 'otro' };
      expect(engineGate(state, 'weekly_report', other), field).toBe('gated');
    }
  });

  it('cerrado o ausente cuenta como cerrado', async () => {
    const audits = await currentAudits(DEFAULT_CONFIG, prompts);
    const forgetting = openGateState(audits, AT).engines.forgetting;
    if (!forgetting) throw new Error('falta el motor');
    const closed: AiGateState = {
      paused: false,
      engines: { forgetting: { ...forgetting, open: false } },
    };
    expect(engineGate(closed, 'forgetting', audits.forgetting)).toBe('gated');
    expect(engineGate(CLOSED_GATE, 'flashcards', audits.flashcards)).toBe('gated');
  });

  it('la compuerta de desarrollo sigue a la configuración del momento', async () => {
    let config = DEFAULT_CONFIG;
    const gate = alwaysOpenGate(
      () => config,
      prompts,
      () => Date.parse(AT),
    );
    config = {
      ...config,
      models: {
        ...config.models,
        flashcards: { ...config.models.flashcards, id: 'claude-opus-5-5' },
      },
    };
    const audits = await currentAudits(config, prompts);
    expect(engineGate(await gate.read(), 'flashcards', audits.flashcards)).toBe('open');
  });
});

describe('lectura de la bandera', () => {
  it('recuerda 60 s y una falla cierra todo sin recordarse', async () => {
    let now = 0;
    let reads = 0;
    let fail = false;
    const open: AiGateState = { paused: true, engines: {} };
    const reader = cachedGateReader(
      {
        read: () => {
          reads += 1;
          return fail ? Promise.reject(new Error('caída')) : Promise.resolve(open);
        },
      },
      60_000,
      () => now,
    );
    expect(await reader.read()).toEqual(open);
    now = 59_000;
    await reader.read();
    expect(reads).toBe(1);
    now = 61_000;
    fail = true;
    expect(await reader.read()).toEqual(CLOSED_GATE);
    fail = false;
    expect(await reader.read()).toEqual(open);
    expect(reads).toBe(3);
  });

  it('lee ai_gate de platform_settings con la llave de servicio y no abre con algo raro', async () => {
    const memory = createMemoryAi();
    const rest = createFakeSupabaseRest({ memory });
    const reader = createRestGateReader({
      url: rest.url,
      serviceKey: rest.serviceKey,
      fetchImpl: rest.fetch,
    });
    memory.gate.pause(true);
    expect(await reader.read()).toEqual({ paused: true, engines: {} });
    expect(rest.calls.at(-1)).toMatchObject({ path: '/rest/v1/platform_settings', key: 'service' });
    memory.gate.state = { paused: 'sí' } as never;
    expect(await reader.read()).toEqual(CLOSED_GATE);
    rest.down = true;
    await expect(reader.read()).rejects.toThrow();
  });

  it('la compuerta en memoria abre y cierra como admin_ai_gate_set', async () => {
    const memory = createMemoryAi();
    const current = { config: DEFAULT_CONFIG, prompts };
    expect(await memory.gate.gateOf('bias_tips', current)).toBe('gated');
    await memory.gate.open('bias_tips', current);
    expect(await memory.gate.gateOf('bias_tips', current)).toBe('open');
    memory.gate.close('bias_tips');
    expect(await memory.gate.gateOf('bias_tips', current)).toBe('gated');
  });
});
