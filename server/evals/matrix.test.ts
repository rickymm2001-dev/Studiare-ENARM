import { describe, expect, it } from 'vitest';
import { AI_ENGINES, type AiEngine } from '../../src/engines/aiContracts.ts';
import { mockOutput } from '../../src/engines/aiMock.ts';
import { DEFAULT_CONFIG } from '../../supabase/functions/_shared/ai/config.ts';
import {
  createAnthropicProvider,
  createMockProvider,
  type AiProvider,
} from '../../supabase/functions/_shared/ai/provider.ts';
import type { RunDeps } from '../../supabase/functions/_shared/ai/run.ts';
import { fakeApi, fakeMessage } from '../../supabase/functions/_shared/ai/testing/fakes.ts';
import { createAiDeps } from '../src/ai/index.ts';
import { Budget, budgetedProvider, newProbe, probedMessagesApi, worstCaseUsd } from './budget.ts';
import {
  ALL_LADDER_CANDIDATES,
  CANDIDATES,
  ENGINE_LADDERS,
  ladderFor,
  modelChoiceOf,
  parseCandidateNames,
} from './candidates.ts';
import { buildCases } from './cases.ts';
import {
  chooseForEngine,
  gateRun,
  runKey,
  type CandidateRun,
  type JudgeSummary,
} from './choice.ts';
import { runMatrix } from './matrix.ts';
import { projectCosts, STUDENT_PROFILES } from './projection.ts';
import { formatMatrixReport, replaceSection } from './report.ts';
import { evaluateCase, runCases, type CaseResult } from './run.ts';

function mockDeps(): RunDeps {
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

/** Un proveedor que contesta como el simulado, salvo en los modelos que se le digan */
function providerBreaking(
  broken: ReadonlySet<string>,
  spoil: (engine: AiEngine, output: Record<string, unknown>) => unknown,
): AiProvider {
  const mock = createMockProvider();
  return {
    mode: 'mock',
    async call(call) {
      const result = await mock.call(call);
      if (!broken.has(call.model.id)) return result;
      return { ...result, raw: spoil(call.engine, result.raw as Record<string, unknown>) };
    },
  };
}

const result = (overrides: Partial<CaseResult>): CaseResult => ({
  id: 'x',
  engine: 'bias_tips',
  set: 'synthetic',
  expect: 'answer',
  adversarial: null,
  schemaValid: true,
  schemaValidFinal: true,
  accepted: true,
  empty: false,
  retried: false,
  refused: false,
  refusalCategory: null,
  cutoff: false,
  forbiddenHit: false,
  passed: true,
  error: null,
  costUsd: 0.001,
  latencyMs: 1000,
  warmup: false,
  issues: [],
  output: null,
  ...overrides,
});

const run = (
  name: keyof typeof CANDIDATES,
  repeats: CaseResult[][],
  engine: AiEngine = 'bias_tips',
): CandidateRun => ({ engine, candidate: CANDIDATES[name], repeats, complete: true });

describe('candidatos', () => {
  it('cada motor tiene su escalera de 4.1 y Opus solo como respaldo', () => {
    expect(ENGINE_LADDERS.flashcards).toEqual([
      'haiku55-low',
      'haiku55-medium',
      'sonnet55-low',
      'opus55-low',
    ]);
    expect(ENGINE_LADDERS.restructure).toEqual(['haiku55-medium', 'sonnet55-low', 'opus55-low']);
    for (const engine of ['forgetting', 'weekly_report', 'bias_tips'] as const) {
      expect(ENGINE_LADDERS[engine]).toEqual([
        'haiku55-off',
        'haiku55-low',
        'haiku55-medium',
        'sonnet55-low',
        'haiku45',
      ]);
    }
    expect(CANDIDATES['opus55-low'].onlyIfNonePass).toBe(true);
    expect(ALL_LADDER_CANDIDATES.map((candidate) => candidate.name).sort()).toEqual(
      Object.keys(CANDIDATES).sort(),
    );
  });

  it('respeta las reglas de cada modelo. Haiku 4.5 sin esfuerzo, Opus sin apagar el razonamiento', () => {
    expect(CANDIDATES.haiku45).toMatchObject({ effort: null, thinking: null });
    expect(CANDIDATES['opus55-low'].thinking).toBe('adaptive');
    // Haiku 5.5 apaga el razonamiento solo con low, medium o high
    expect(CANDIDATES['haiku55-off']).toMatchObject({ effort: 'low', thinking: 'off' });
    for (const candidate of Object.values(CANDIDATES)) {
      expect(DEFAULT_CONFIG.prices[candidate.id], candidate.name).toBeDefined();
    }
  });

  it('lee --candidates y rechaza nombres que no existen', () => {
    expect(parseCandidateNames(undefined)).toHaveLength(6);
    expect(parseCandidateNames('haiku55-low, sonnet55-low')).toEqual([
      'haiku55-low',
      'sonnet55-low',
    ]);
    expect(() => parseCandidateNames('haiku55-low,gpt')).toThrow('Candidato desconocido gpt');
    expect(() => parseCandidateNames('')).toThrow('Candidato desconocido');
    expect(ladderFor('restructure', ['sonnet55-low', 'haiku55-off']).map((c) => c.name)).toEqual([
      'sonnet55-low',
    ]);
    expect(modelChoiceOf(CANDIDATES['sonnet55-low'], 'flashcards')).toEqual({
      id: 'claude-sonnet-5-5',
      effort: 'low',
      thinking: 'adaptive',
      maxTokens: 8000,
    });
  });
});

describe('tope de costo', () => {
  it('reserva el peor costo y solo deja salir lo que cabe', () => {
    const budget = new Budget(0.01);
    expect(budget.reserve(0.006)).toBe(true);
    expect(budget.reserve(0.006)).toBe(false);
    expect(budget.exhausted).toBe(true);
    budget.settle(0.006, 0.002);
    expect(budget.spentUsd).toBe(0.002);
    // Una vez agotado se queda así, para que la corrida se detenga limpia
    expect(budget.reserve(0.0001)).toBe(false);
  });

  it('el peor costo usa max_tokens y el lote cuesta la mitad', () => {
    const price = DEFAULT_CONFIG.prices['claude-sonnet-5-5'];
    if (!price) throw new Error('Falta el precio');
    const sync = worstCaseUsd(price, 2500, 1000);
    expect(sync).toBeCloseTo((1400 * 2 + 1000 * 10) / 1e6, 8);
    expect(worstCaseUsd(price, 2500, 1000, true)).toBeCloseTo(sync / 2, 8);
  });

  it('la llamada que no cabe no sale y el caso no se cuenta', async () => {
    const deps = mockDeps();
    const calls: string[] = [];
    const base: AiProvider = {
      mode: 'real',
      call: (call) => {
        calls.push(call.engine);
        return createMockProvider().call(call);
      },
    };
    const { results, stoppedByBudget } = await runCases(deps, buildCases().slice(0, 4), {
      budget: new Budget(0.000001),
      providerFor: () => base,
    });
    expect(calls).toEqual([]);
    expect(results).toEqual([]);
    expect(stoppedByBudget).toBe(true);
  });

  it('asienta el costo real que registra la sonda, también si el proveedor falla', async () => {
    const budget = new Budget(1);
    const probe = newProbe();
    const deps = mockDeps();
    const priceOf = (id: string) => deps.config.prices[id];
    const api = fakeApi([
      fakeMessage(null, { stop: 'refusal', usage: { input_tokens: 1000, output_tokens: 100 } }),
    ]);
    const provider = budgetedProvider(
      createAnthropicProvider(probedMessagesApi(api, probe, priceOf), () => ({
        timeoutMs: 1000,
        maxRetries: 0,
      })),
      budget,
      probe,
      priceOf,
    );
    const golden = buildCases().find((item) => item.engine === 'bias_tips');
    if (!golden) throw new Error('Falta el caso');
    const evaluated = await evaluateCase({ ...deps, provider }, golden, { probe });
    // Haiku 4.5 a 1 y 5 dólares por millón
    expect(budget.spentUsd).toBeCloseTo(0.0015, 6);
    expect(evaluated).toMatchObject({ refused: true, passed: false, costUsd: 0.0015 });
  });
});

describe('negativas y cortes', () => {
  it('un corte por max_tokens en la última llamada se cuenta y no pasa', async () => {
    const deps = mockDeps();
    const golden = buildCases().find((item) => item.engine === 'weekly_report');
    if (!golden) throw new Error('Falta el caso');
    const probe = newProbe();
    const api = fakeApi([fakeMessage('{"summary":', { stop: 'max_tokens' })]);
    const provider = createAnthropicProvider(
      probedMessagesApi(api, probe, (id) => deps.config.prices[id]),
      () => ({ timeoutMs: 1000, maxRetries: 0 }),
    );
    const evaluated = await evaluateCase({ ...deps, provider }, golden, { probe });
    expect(evaluated).toMatchObject({
      cutoff: true,
      schemaValid: false,
      schemaValidFinal: false,
      passed: false,
    });
  });
});

describe('compuertas automáticas', () => {
  const good = () => Array.from({ length: 10 }, (_, index) => result({ id: `c${index}` }));

  it('pasa quien cumple todo en cada repetición', () => {
    expect(gateRun(run('haiku55-low', [good(), good(), good()]))).toEqual({
      passed: true,
      failures: [],
    });
  });

  it('una sola repetición mala basta para no pasar', () => {
    const bad = good();
    bad[0] = result({ passed: false });
    const gate = gateRun(run('haiku55-low', [good(), bad, good()]));
    expect(gate.passed).toBe(false);
    expect(gate.failures).toEqual(['anclaje bajo 100%']);
  });

  it('pide 98% de esquema al primer intento y 100% después del reintento', () => {
    const many = Array.from({ length: 60 }, (_, index) => result({ id: `c${index}` }));
    many[0] = result({ schemaValid: false, retried: true });
    expect(gateRun(run('haiku55-low', [many])).passed).toBe(true);
    many[1] = result({ schemaValid: false, retried: true });
    expect(gateRun(run('haiku55-low', [many])).failures).toEqual([
      'esquema al primer intento bajo 98%',
    ]);
    const final = good();
    final[0] = result({ schemaValid: false, schemaValidFinal: false, passed: false });
    expect(gateRun(run('haiku55-low', [final])).failures).toEqual(
      expect.arrayContaining(['esquema después del reintento bajo 100%']),
    );
  });

  it('no pasa con negativas, cortes, adversarios fallidos ni latencia alta', () => {
    const cases = good();
    cases[0] = result({ refused: true, passed: false, expect: 'no_answer' });
    cases[1] = result({ cutoff: true });
    cases[2] = result({ adversarial: 'injection', passed: false });
    for (let index = 3; index < 10; index += 1) cases[index] = result({ latencyMs: 25_000 });
    expect(gateRun(run('haiku55-low', [cases])).failures).toEqual([
      'rechazos bajo 100%',
      'adversarios bajo 100%',
      'el modelo se negó en algún caso',
      'alguna respuesta se cortó por max_tokens',
      'latencia p95 arriba de 20 s',
    ]);
  });

  it('la latencia no aplica a lo que va por lote y no cuenta el calentamiento', () => {
    const slow = good().map((item) => ({
      ...item,
      engine: 'forgetting' as const,
      latencyMs: 90_000,
    }));
    expect(gateRun(run('haiku55-low', [slow], 'forgetting')).passed).toBe(true);
    const warm = good();
    warm[0] = result({ latencyMs: 60_000, warmup: true });
    expect(gateRun(run('haiku55-low', [warm])).passed).toBe(true);
  });

  it('un 429 o una falla de red se dicen aparte de la calidad', () => {
    const cases = good();
    cases[0] = result({ passed: false, accepted: false, error: 'rate_limited' });
    expect(gateRun(run('haiku55-low', [cases])).failures).toEqual([
      'anclaje bajo 100%',
      'errores del proveedor o del límite de la API, conviene repetir con menos --concurrency',
    ]);
  });

  it('un candidato que no terminó por el tope no pasa', () => {
    expect(gateRun({ ...run('haiku55-low', [good()]), complete: false }).failures).toEqual([
      'no terminó sus repeticiones por el tope de costo',
    ]);
  });
});

describe('regla de elección', () => {
  const cheap = (cost: number, latency = 1000) =>
    Array.from({ length: 10 }, (_, index) =>
      result({ id: `c${index}`, costUsd: cost, latencyMs: latency }),
    );
  const judge = (mean: number, critical = 0): JudgeSummary => ({
    judged: 10,
    unjudged: 0,
    mean,
    criteria: {},
    critical,
    passed: mean >= 3.3 && critical === 0,
  });

  it('elige el más barato que pasa las compuertas y el juez', () => {
    const runs = [
      run('sonnet55-low', [cheap(0.004)]),
      run('haiku55-low', [cheap(0.0002)]),
      run('haiku45', [cheap(0.0016)]),
    ];
    const judges = new Map([
      [runKey('bias_tips', 'haiku55-low'), judge(3.1)],
      [runKey('bias_tips', 'haiku45'), judge(3.6)],
      [runKey('bias_tips', 'sonnet55-low'), judge(3.9)],
    ]);
    const choice = chooseForEngine('bias_tips', runs, judges, { judged: true });
    expect(choice.chosen?.name).toBe('haiku45');
    expect(choice.ranked.map((item) => item.candidate.name)).toEqual([
      'haiku55-low',
      'haiku45',
      'sonnet55-low',
    ]);
    expect(choice.withoutJudge).toBe(false);
  });

  it('una marca crítica descarta aunque la media sea alta', () => {
    const runs = [run('haiku55-low', [cheap(0.0002)]), run('sonnet55-low', [cheap(0.004)])];
    const judges = new Map([
      [runKey('bias_tips', 'haiku55-low'), judge(3.9, 1)],
      [runKey('bias_tips', 'sonnet55-low'), judge(3.5)],
    ]);
    expect(chooseForEngine('bias_tips', runs, judges, { judged: true }).chosen?.name).toBe(
      'sonnet55-low',
    );
  });

  it('un empate de costo se rompe con la latencia p95', () => {
    const runs = [
      run('haiku55-off', [cheap(0.0002, 9000)]),
      run('haiku55-low', [cheap(0.000205, 3000)]),
      run('sonnet55-low', [cheap(0.004, 1000)]),
    ];
    const choice = chooseForEngine('bias_tips', runs, new Map(), { judged: false });
    expect(choice.chosen?.name).toBe('haiku55-low');
    expect(choice.reason).toContain('ganó por latencia p95');
    expect(choice.withoutJudge).toBe(true);
  });

  it('sin nadie que pase, el motor se queda con su plantilla y se pregunta a Ricardo', () => {
    const failing = cheap(0.0002);
    failing[0] = result({ passed: false });
    const choice = chooseForEngine('bias_tips', [run('haiku55-low', [failing])], new Map(), {
      judged: false,
    });
    expect(choice.chosen).toBeNull();
    expect(choice.reason).toContain('10.23');
  });
});

describe('matriz', () => {
  it('con las respuestas fijas todos pasan y Opus no hace falta', async () => {
    const lines: string[] = [];
    const matrix = await runMatrix(
      {
        deps: mockDeps(),
        cases: buildCases(),
        budget: new Budget(Number.POSITIVE_INFINITY),
        onProgress: (line) => lines.push(line),
      },
      { engines: ['flashcards'], only: null, repeat: 2, limitPerEngine: 3 },
    );
    expect(matrix.runs.map((entry) => entry.candidate.name)).toEqual([
      'haiku55-low',
      'haiku55-medium',
      'sonnet55-low',
    ]);
    expect(matrix.runs.every((entry) => entry.repeats.length === 2 && entry.complete)).toBe(true);
    expect(matrix.runs.every((entry) => gateRun(entry).passed)).toBe(true);
    expect(matrix.skipped.map((entry) => [entry.candidate.name, entry.reason])).toEqual([
      ['opus55-low', 'no hizo falta, porque un candidato más barato pasó las compuertas'],
    ]);
    expect(lines[0]).toBe('flashcards haiku55-low, repetición 1 de 2');
    const choice = chooseForEngine('flashcards', matrix.runs, new Map(), { judged: false });
    expect(choice.chosen?.id).toBe('claude-haiku-5-5');
  });

  it('cada candidato corre con su modelo, su esfuerzo y su razonamiento', async () => {
    const seen = new Set<string>();
    const mock = createMockProvider();
    await runMatrix(
      {
        deps: mockDeps(),
        cases: buildCases(),
        budget: new Budget(Number.POSITIVE_INFINITY),
        providerFor: () => ({
          mode: 'mock',
          call: (call) => {
            seen.add(`${call.model.id}|${call.model.effort}|${call.model.thinking}`);
            return mock.call(call);
          },
        }),
      },
      {
        engines: ['restructure'],
        only: ['haiku55-medium', 'opus55-low'],
        repeat: 1,
        limitPerEngine: 1,
      },
    );
    expect([...seen].sort()).toEqual([
      'claude-haiku-5-5|medium|adaptive',
      'claude-opus-5-5|low|adaptive',
    ]);
  });

  it('Opus corre cuando nada más barato pasa, y la elección lo dice', async () => {
    // Haiku y Sonnet citan una frase que la sección no trae, así que las guardas descartan todo
    const broken = new Set(['claude-haiku-5-5', 'claude-sonnet-5-5']);
    const provider = providerBreaking(broken, (_engine, output) => ({
      cards: (output.cards as { quote: string }[]).map((card) => ({
        ...card,
        quote: 'Una frase que no aparece en ninguna sección del texto.',
      })),
    }));
    const matrix = await runMatrix(
      {
        deps: mockDeps(),
        cases: buildCases(),
        budget: new Budget(Number.POSITIVE_INFINITY),
        providerFor: () => provider,
      },
      { engines: ['flashcards'], only: null, repeat: 1, limitPerEngine: 4 },
    );
    expect(matrix.runs.map((entry) => entry.candidate.name)).toEqual([
      'haiku55-low',
      'haiku55-medium',
      'sonnet55-low',
      'opus55-low',
    ]);
    const choice = chooseForEngine('flashcards', matrix.runs, new Map(), { judged: false });
    expect(choice.chosen?.name).toBe('opus55-low');
  });

  it('con el tope agotado lo que falta queda sin correr y lo dice', async () => {
    const matrix = await runMatrix(
      { deps: mockDeps(), cases: buildCases(), budget: new Budget(0.004) },
      { engines: ['bias_tips', 'weekly_report'], only: null, repeat: 1 },
    );
    expect(matrix.stoppedByBudget).toBe(true);
    expect(matrix.runs.some((entry) => !entry.complete)).toBe(true);
    expect(matrix.skipped.length).toBeGreaterThan(0);
    expect(matrix.skipped[0]?.reason).toBe('no corrió porque se llegó al tope de costo');
  });
});

describe('proyección por alumno', () => {
  it('suma el perfil típico con las hipótesis a mitad de precio por lote', () => {
    const projection = projectCosts(
      { forgetting: 0.0004, weekly_report: 0.0003, bias_tips: 0.0002, flashcards: 0.016 },
      { dailyBudgetUsd: 5, perUserDailyUsd: 0.3 },
    );
    const typical = projection.profiles.find((profile) => profile.profile === 'typical');
    const expected = 12 * 0.0002 + 4 * 0.0003 + 16 * 0.0002 + 40 * 0.016;
    expect(typical?.monthlyUsd).toBeCloseTo(expected, 4);
    expect(typical?.studentsPerDay).toBe(Math.floor(5 / (expected / 30)));
    expect(typical?.overDailyCap).toBe(false);
    expect(projection.missing).toEqual(['restructure']);
    expect(projection.restructureMonthlyUsd).toBeNull();
    expect(STUDENT_PROFILES.intense.flashcards).toBe(200);
  });

  it('avisa cuando un perfil pasa del tope por alumno al día y cuenta las reestructuradas por lote', () => {
    const projection = projectCosts(
      { forgetting: 0, weekly_report: 0, bias_tips: 0, flashcards: 0.06, restructure: 0.017 },
      { dailyBudgetUsd: 5, perUserDailyUsd: 0.3 },
    );
    expect(projection.profiles.find((p) => p.profile === 'intense')?.overDailyCap).toBe(true);
    expect(projection.restructureMonthlyUsd).toBeCloseTo(0.17, 4);
  });
});

describe('reporte de la matriz', () => {
  it('lleva métricas, lo elegido y la proyección, y nunca el texto de los casos', async () => {
    const cases = buildCases();
    const matrix = await runMatrix(
      { deps: mockDeps(), cases, budget: new Budget(Number.POSITIVE_INFINITY) },
      { engines: [...AI_ENGINES], only: null, repeat: 1, limitPerEngine: 2 },
    );
    const choices = AI_ENGINES.map((engine) =>
      chooseForEngine(engine, matrix.runs, new Map(), { judged: false }),
    );
    const report = formatMatrixReport({
      mode: 'mock',
      date: '2026-10-15',
      repeat: 1,
      matrix,
      choices,
      judge: null,
      projection: projectCosts(
        {
          forgetting: 0.0004,
          weekly_report: 0.0003,
          bias_tips: 0.0002,
          flashcards: 0.016,
          restructure: 0.017,
        },
        { dailyBudgetUsd: 5, perUserDailyUsd: 0.3 },
      ),
      spentUsd: 0,
      maxCostUsd: Number.POSITIVE_INFINITY,
      caseCounts: { synthetic: 10 },
    });
    expect(report).toContain('modo simulado');
    expect(report).toContain('### flashcards');
    expect(report).toContain("flashcards: { id: 'claude-haiku-5-5'");
    expect(report).toContain('| Típico | 12 | 4 | 16 | 40 |');
    expect(report).toContain('Sin juez.');
    for (const golden of cases) {
      const input = golden.input as Record<string, unknown>;
      for (const value of Object.values(input)) {
        if (typeof value === 'string' && value.length > 40) expect(report).not.toContain(value);
      }
    }
    // Con las respuestas fijas el costo de mismo modelo es igual, y la escalera dice quién se eligió
    expect(report).toContain('Elegido. haiku55-');
  });

  it('reemplaza una sección sin borrar las demás', () => {
    const document = '# Título\n\n## Uno\n\nA\n\n## Dos\n\nB\n';
    expect(replaceSection(document, 'Uno', 'nuevo')).toBe(
      '# Título\n\n## Uno\n\nnuevo\n\n## Dos\n\nB\n',
    );
    expect(replaceSection(document, 'Dos', 'otro')).toBe(
      '# Título\n\n## Uno\n\nA\n\n## Dos\n\notro\n',
    );
    expect(replaceSection(document, 'Tres', 'C')).toBe(`${document.trimEnd()}\n\n## Tres\n\nC\n`);
  });
});

describe('caso con el modelo de cada candidato', () => {
  it('el costo teórico cambia con el precio del modelo', async () => {
    const deps = mockDeps();
    const golden = buildCases().find((item) => item.engine === 'bias_tips');
    if (!golden) throw new Error('Falta el caso');
    const costOf = async (name: keyof typeof CANDIDATES) => {
      const config = {
        ...deps.config,
        models: { ...deps.config.models, bias_tips: modelChoiceOf(CANDIDATES[name], 'bias_tips') },
      };
      return (await evaluateCase({ ...deps, config }, golden)).costUsd;
    };
    expect(await costOf('haiku55-low')).toBeLessThan(await costOf('haiku45'));
    expect(await costOf('haiku45')).toBeLessThan(await costOf('sonnet55-low'));
    expect(mockOutput('bias_tips', golden.input as never)).toBeDefined();
  });
});
