import { describe, expect, it } from 'vitest';
import { BiasTipOutputSchema } from '../../src/engines/aiContracts.ts';
import {
  createAnthropicProvider,
  type MessagesApi,
} from '../../supabase/functions/_shared/ai/provider.ts';
import { fakeApi, fakeMessage } from '../../supabase/functions/_shared/ai/testing/fakes.ts';
import { DEFAULT_CONFIG } from '../../supabase/functions/_shared/ai/config.ts';
import { newProbe } from './budget.ts';
import { ALL_LADDER_CANDIDATES, CANDIDATES } from './candidates.ts';
import {
  anthropicProviderFor,
  checkCandidateParams,
  credentialProblem,
  parseCli,
} from './runtime.ts';

const credentials = (anthropic: string | null, openai: string | null) => ({
  anthropicKey: anthropic,
  openaiKey: openai,
  sources: {
    anthropic: anthropic ? ('env' as const) : null,
    openai: openai ? ('env' as const) : null,
  },
});

describe('banderas', () => {
  it('lee banderas, valores y números, y avisa de las desconocidas', () => {
    const cli = parseCli(['--real', '--max-cost=20', '--engine=forgetting', '--matriz']);
    expect(cli.flag('real')).toBe(true);
    expect(cli.flag('matrix')).toBe(false);
    expect(cli.value('engine')).toBe('forgetting');
    expect(cli.number('max-cost', 1)).toBe(20);
    expect(cli.number('repeat', 3)).toBe(3);
    expect(cli.unknown(['real', 'max-cost', 'engine'])).toEqual(['--matriz']);
    expect(() => parseCli(['--repeat=0']).number('repeat', 1)).toThrow('mayor que cero');
    expect(() => parseCli(['--limit=dos']).number('limit', 1)).toThrow('mayor que cero');
  });
});

describe('--real sin clave', () => {
  it('se detiene antes de crear un cliente si falta la clave que pide el modo', () => {
    expect(
      credentialProblem({
        provider: 'anthropic',
        judge: false,
        credentials: credentials(null, null),
      }),
    ).toContain('No se llamó a ningún modelo');
    expect(
      credentialProblem({ provider: 'openai', judge: false, credentials: credentials(null, 'o') }),
    ).toBeNull();
    // El juez es Claude, así que la comparación con juez pide las dos
    expect(
      credentialProblem({ provider: 'openai', judge: true, credentials: credentials(null, 'o') }),
    ).toContain('ENARM_ANTHROPIC_KEY');
    expect(
      credentialProblem({ provider: 'openai', judge: true, credentials: credentials('a', null) }),
    ).toContain('ENARM_OPENAI_KEY');
    expect(
      credentialProblem({
        provider: 'anthropic',
        judge: true,
        credentials: credentials('a', null),
      }),
    ).toBeNull();
  });
});

describe('revisión previa del razonamiento', () => {
  const current = (api: MessagesApi) =>
    createAnthropicProvider(api, () => ({ timeoutMs: 1000, maxRetries: 0 }));

  it('detecta que el proveedor no apaga el razonamiento que pide un candidato', async () => {
    const mismatches = await checkCandidateParams(ALL_LADDER_CANDIDATES, current);
    expect(mismatches.map((item) => item.candidate)).toEqual(['haiku55-off']);
    expect(mismatches[0]?.problem).toBe('manda razonamiento ninguno y el candidato pide disabled');
  });

  it('pasa con un proveedor que manda el razonamiento de cada modelo', async () => {
    const honoring = (api: MessagesApi) =>
      current({
        create(params, options) {
          // Apaga el razonamiento de Haiku 5.5 siempre, como haría un proveedor a medias
          return api.create(
            params.model === 'claude-haiku-5-5'
              ? { ...params, thinking: { type: 'disabled' } }
              : params,
            options,
          );
        },
      });
    const offOnly = await checkCandidateParams([CANDIDATES['haiku55-off']], honoring);
    expect(offOnly).toEqual([]);
    // Y si apaga el razonamiento donde el candidato lo pide adaptativo, también lo dice
    expect(
      (await checkCandidateParams([CANDIDATES['haiku55-low']], honoring)).map((m) => m.problem),
    ).toEqual(['manda razonamiento disabled y el candidato pide adaptive']);
  });

  it('el proveedor por caso deja su registro en la sonda', async () => {
    const probe = newProbe();
    const api = fakeApi([fakeMessage('{}', { usage: { input_tokens: 1000, output_tokens: 100 } })]);
    const provider = anthropicProviderFor(api, () => DEFAULT_CONFIG)(probe);
    await provider.call({
      engine: 'bias_tips',
      model: DEFAULT_CONFIG.models.bias_tips,
      system: 's',
      user: 'u',
      input: null,
      schema: BiasTipOutputSchema,
    });
    expect(probe.calls).toHaveLength(1);
    expect(probe.calls[0]?.costUsd).toBeCloseTo((1000 * 1 + 100 * 5) / 1e6, 8);
    expect(api.calls[0]?.options).toEqual({ timeout: 120_000, maxRetries: 2 });
  });
});
