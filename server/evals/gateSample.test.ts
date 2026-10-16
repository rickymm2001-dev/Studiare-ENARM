import { describe, expect, it } from 'vitest';
import { AiGateSampleFileSchema, AI_ENGINES } from '../../src/engines/aiContracts.ts';
import { promptHash } from '../../supabase/functions/_shared/ai/prompts.ts';
import { createMockProvider } from '../../supabase/functions/_shared/ai/provider.ts';
import type { RunDeps } from '../../supabase/functions/_shared/ai/run.ts';
import { createAiDeps } from '../src/ai/index.ts';
import { loadDemoBank } from './bankCases.ts';
import { Budget } from './budget.ts';
import {
  buildGateSample,
  GATE_COUNTS,
  loadTeamFile,
  planGateInputs,
  stableUuid,
} from './gateSample.ts';
import { mockProviderFor } from './runtime.ts';

function deps(): RunDeps {
  const ai = createAiDeps({
    credentials: { mode: 'mock', apiKey: null },
    files: { config: null, ledger: null },
  });
  return {
    provider: ai.provider,
    prompts: ai.prompts,
    config: ai.config(),
    sourceKeys: ai.sourceKeys,
  };
}

const team = [
  {
    title: 'Resumen del equipo',
    text: 'La adrenalina intramuscular es el tratamiento de primera línea de la anafilaxia. Se aplica en la cara anterolateral del muslo y se puede repetir si no hay respuesta.',
  },
];

describe('entradas de la muestra', () => {
  const inputs = planGateInputs(loadDemoBank(), team);

  it('alcanzan para cada motor y dicen de dónde sale su fuente', () => {
    expect(inputs.forgetting.length).toBeGreaterThanOrEqual(GATE_COUNTS.forgetting);
    expect(inputs.bias_tips.length).toBeGreaterThanOrEqual(GATE_COUNTS.bias_tips);
    expect(inputs.weekly_report.every((input) => input.sourceKind === 'synthetic')).toBe(true);
    expect(inputs.restructure.every((input) => input.sourceKind === 'demo')).toBe(true);
    // Los textos del equipo van primero, marcados como del equipo
    expect(inputs.flashcards[0]?.sourceKind).toBe('team');
    expect(inputs.flashcards[0]?.golden.input).toEqual({
      title: 'Resumen del equipo',
      text: team[0]?.text,
    });
  });

  it('un UUID estable tiene forma de versión 4 y no se repite', () => {
    const id = stableUuid('b12-2026-10:flashcards:0');
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(stableUuid('b12-2026-10:flashcards:0')).toBe(id);
    expect(stableUuid('b12-2026-10:flashcards:1')).not.toBe(id);
  });
});

describe('muestra de 300 textos', () => {
  it('con las respuestas fijas da 300 textos válidos, sin repetir y con la huella de cada prompt', async () => {
    const base = deps();
    const result = await buildGateSample({
      deps: base,
      providerFor: mockProviderFor(),
      budget: new Budget(Number.POSITIVE_INFINITY),
      mode: 'mock',
      inputs: planGateInputs(loadDemoBank(), team),
      id: 'sim-b12-prueba',
      createdAt: '2026-10-15T00:00:00Z',
    });
    expect(result.shortfall).toEqual({});
    const file = AiGateSampleFileSchema.parse(result.file);
    expect(file.items).toHaveLength(300);
    for (const engine of AI_ENGINES) {
      const mine = file.items.filter((item) => item.engine === engine);
      expect(mine, engine).toHaveLength(GATE_COUNTS[engine]);
      expect(
        new Set(
          mine.map((item) =>
            JSON.stringify(item.engine === 'flashcards' ? item.output : item.input),
          ),
        ).size,
      ).toBe(mine.length);
      expect(mine[0]?.promptHash).toBe(await promptHash(base.prompts[engine]));
      expect(mine[0]?.promptVersion).toBe(base.prompts[engine].version);
    }
    expect(file.items.every((item) => item.model === 'respuestas-fijas-v1')).toBe(true);
    expect(file.items.some((item) => item.sourceKind === 'team')).toBe(true);
    // Revuelta, no agrupada por motor
    expect(file.items.slice(0, 20).map((item) => item.engine)).not.toEqual(
      Array.from({ length: 20 }, () => file.items[0]?.engine),
    );
  });

  it('con el modelo real anota el modelo, el esfuerzo y el razonamiento de la configuración', async () => {
    const base = deps();
    const mock = createMockProvider();
    const result = await buildGateSample({
      deps: base,
      providerFor: () => ({ mode: 'real', call: (call) => mock.call(call) }),
      budget: new Budget(Number.POSITIVE_INFINITY),
      mode: 'real',
      inputs: planGateInputs(loadDemoBank(), []),
      id: 'b12-2026-10',
      createdAt: '2026-10-15T00:00:00Z',
    });
    const flashcard = result.file?.items.find((item) => item.engine === 'flashcards');
    expect(flashcard).toMatchObject({
      model: base.config.models.flashcards.id,
      effort: base.config.models.flashcards.effort,
      thinking: base.config.models.flashcards.thinking,
      sourceKind: 'demo',
    });
  });

  it('si el tope no alcanza no hay muestra y dice cuántos faltan', async () => {
    const result = await buildGateSample({
      deps: deps(),
      providerFor: mockProviderFor(),
      budget: new Budget(0.01),
      mode: 'mock',
      inputs: planGateInputs(loadDemoBank(), []),
      id: 'sim-b12-corta',
      createdAt: '2026-10-15T00:00:00Z',
    });
    expect(result.file).toBeNull();
    expect(result.stoppedByBudget).toBe(true);
    expect(Object.keys(result.shortfall).length).toBeGreaterThan(0);
  });

  it('los textos del equipo solo se leen de private/', () => {
    expect(() => loadTeamFile('docs/textos.json')).toThrow('dentro de private/');
    expect(() => loadTeamFile('private/no-existe.json')).toThrow('No existe');
  });
});
