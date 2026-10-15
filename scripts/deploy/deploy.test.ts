import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { recordedMatches, runDeploy, type Io } from './deploy.ts';
import { createManagementClient } from './managementApi.ts';
import type { SqlStep } from './plan.ts';
import { fakeSupabase, type FakeOptions } from './testing/fakeSupabase.ts';

// Un repo de juguete. base crea alfa y beta, more cambia alfa y crea gamma, y arreglo.sql es la pieza de
// base que el conector no pudo correr, con la misma beta y una comprobación
const BASE = `create or replace function public.alfa() returns int language sql as $$ select 1 $$;
revoke all on function public.alfa() from public, anon, authenticated, service_role;
create or replace function public.beta() returns int language sql as $$ select 2 $$;
revoke all on function public.beta() from public, anon, authenticated, service_role;
`;
const MORE = `create or replace function public.alfa() returns int language sql as $$ select 10 $$;
create or replace function public.gamma() returns int language sql as $$ select 3 $$;
revoke all on function public.gamma() from public, anon, authenticated, service_role;
`;
const ARREGLO = `-- La pieza con drop de base
create or replace function public.beta() returns int language sql as $$
  -- el mismo cuerpo, con otro formato
  select   2
$$;
create table if not exists public.marca (id int);
-- Comprobación
select true as listo;
`;
const OTRO = `create table if not exists public.otra (id int);\n`;
const VIEJO = `create or replace function public.beta() returns int language sql as $$ select 20 $$;\n`;

const STEPS = {
  base: { file: 'supabase/migrations/20260101000001_base.sql' },
  more: { file: 'supabase/migrations/20260101000002_more.sql' },
  arreglo: { file: 'supabase/manual/arreglo.sql', check: { listo: true } },
};

const PLANS: Record<string, unknown> = {
  prueba: {
    description: 'Plan de prueba',
    migrations: [STEPS.base, STEPS.more, STEPS.arreglo],
    functions: [{ slug: 'hola', verifyJwt: false }],
    secrets: { STRIPE_PRICE_FOUNDER: { prefix: 'price_' }, STRIPE_PORTAL_CONFIG_REGULAR: {} },
  },
  'sin-arreglo': { description: 'Sin la pieza manual', migrations: [STEPS.base, STEPS.more] },
  'solo-base': { description: 'Solo base', migrations: [STEPS.base] },
  conflicto: {
    description: 'Con un archivo manual viejo',
    migrations: [STEPS.base, STEPS.more, { file: 'supabase/manual/viejo.sql' }],
  },
  'dos-manuales': {
    description: 'Dos archivos manuales seguidos',
    migrations: [STEPS.base, STEPS.more, STEPS.arreglo, { file: 'supabase/manual/otro.sql' }],
    functions: [{ slug: 'hola', verifyJwt: false }],
  },
  'dos-funciones': {
    description: 'Solo dos funciones',
    functions: [
      { slug: 'hola', verifyJwt: false },
      { slug: 'adios', verifyJwt: false },
    ],
  },
  'beta-abierta': {
    description: 'beta abierta a anon a propósito',
    migrations: [STEPS.base, STEPS.more, STEPS.arreglo],
    anonExecutable: { beta: 'Prueba' },
  },
};

const dirs: string[] = [];
let root = '';

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'studiare-deploy-'));
  dirs.push(root);
  const files: Record<string, string> = {
    'supabase/migrations/20260101000001_base.sql': BASE,
    'supabase/migrations/20260101000002_more.sql': MORE,
    'supabase/manual/arreglo.sql': ARREGLO,
    'supabase/manual/viejo.sql': VIEJO,
    'supabase/manual/otro.sql': OTRO,
    'supabase/functions/adios/index.ts': `import { hola } from '../_shared/util.ts';\nDeno.serve(hola);\n`,
    'supabase/functions/hola/index.ts': `import { hola } from '../_shared/util.ts';\nDeno.serve(hola);\n`,
    'supabase/functions/_shared/util.ts': `export const hola = () => new Response('hola');\n`,
    ...Object.fromEntries(
      Object.entries(PLANS).map(([name, plan]) => [`deploy/${name}.json`, JSON.stringify(plan)]),
    ),
  };
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
});

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** El estado de un proyecto como el real. base y more registradas, beta sin la pieza manual */
const REAL_LIKE: FakeOptions = {
  history: [
    { version: '20261014000001', name: 'base_1' },
    { version: '20261014000002', name: 'base_2' },
    { version: '20261014000003', name: 'more' },
  ],
  functions: { alfa: ' select 10 ', beta: ' select 1 + 1 ', gamma: ' select 3 ' },
  checkRow: (applied) => ({ listo: applied.has('manual_arreglo') }),
};

function collectIo(answer = true) {
  const out: string[] = [];
  const err: string[] = [];
  const asked: string[] = [];
  const io: Io = {
    out: (line) => out.push(line),
    err: (line) => err.push(line),
    confirm: (question) => {
      asked.push(question);
      return Promise.resolve(answer);
    },
  };
  return { io, out, err, asked, all: () => [...out, ...err].join('\n') };
}

async function run(
  fakeOptions: FakeOptions,
  options: Partial<{
    plan: string;
    dryRun: boolean;
    yes: boolean;
    only: 'migrations' | 'functions';
    secretsFrom: string;
    answer: boolean;
  }> = {},
) {
  const fake = fakeSupabase(fakeOptions);
  const output = collectIo(options.answer ?? true);
  const code = await runDeploy({
    root,
    plan: options.plan ?? 'prueba',
    dryRun: options.dryRun ?? false,
    only: options.only ?? null,
    yes: options.yes ?? true,
    secretsFrom: options.secretsFrom ?? null,
    client: createManagementClient({ ref: fake.ref, token: 'token-de-prueba', fetch: fake.fetch }),
    io: output.io,
    authNote: 'con un token de prueba',
  });
  return { code, fake, ...output };
}

const appliedNames = (fake: ReturnType<typeof fakeSupabase>) =>
  fake
    .writes()
    .filter((request) => request.path === '/database/migrations')
    .map((request) => (request.json as { name: string }).name);

describe('qué ya está aplicado', () => {
  const step = (name: string, version: string | null = null): SqlStep => ({
    file: 'x.sql',
    kind: version ? 'migration' : 'manual',
    version,
    name,
    recordedAs: [],
    check: null,
    note: null,
    sql: '',
    bytes: 0,
  });

  it('reconoce la versión, el nombre y los trozos del conector, sin confundir nombres parecidos', () => {
    const history = [
      { version: '20261015010327', name: 'billing_plans_1' },
      { version: '20261015010417', name: 'billing_plans_2' },
      { version: '20261010231117', name: 'privacy_a_freno_bitacora' },
      { version: '20261014143028', name: 'free_plan_locks' },
      { version: '20261022000003', name: 'otra' },
    ];
    expect(recordedMatches(step('billing_plans'), history).map((r) => r.name)).toEqual([
      'billing_plans_1',
      'billing_plans_2',
    ]);
    expect(recordedMatches(step('privacy'), history)).toHaveLength(1);
    expect(recordedMatches(step('billing'), history)).toEqual([]);
    expect(recordedMatches(step('free_plan'), history)).toEqual([]);
    expect(recordedMatches(step('invoice_requests', '20261022000003'), history)).toHaveLength(1);
  });
});

describe('aplicar un plan', () => {
  it('salta lo registrado, aplica solo la pieza que falta, publica y deja todo en verde', async () => {
    const result = await run(REAL_LIKE);
    expect(result.err).toEqual([]);
    expect(result.code).toBe(0);
    expect(appliedNames(result.fake)).toEqual(['manual_arreglo']);
    expect(result.all()).toContain(
      'registrada como base_1 (20261014000001), base_2 (20261014000002)',
    );
    expect(result.all()).toContain('beta está distinta del repo en la base. La corrige el paso 3');
    expect(result.all()).toContain('3 funciones iguales al repo de 3');
    expect(result.all()).toContain('supabase/manual/arreglo.sql comprobación en verde');
    expect(result.fake.edge.get('hola')).toMatchObject({ version: 1, verifyJwt: false });
    expect(result.fake.edge.get('hola')?.files.map((file) => file.name)).toEqual([
      'supabase/functions/hola/index.ts',
      'supabase/functions/_shared/util.ts',
    ]);
    expect(result.out.at(-1)).toBe('Todo en verde.');
  });

  it('sin registro pero con las huellas del repo tampoco repite el SQL', async () => {
    const result = await run({
      ...REAL_LIKE,
      history: [],
      functions: { alfa: 'select 10', beta: 'select 2', gamma: 'select 3' },
    });
    expect(result.code).toBe(0);
    expect(appliedNames(result.fake)).toEqual(['manual_arreglo']);
    expect(result.all()).toContain('ya estaba aplicada sin registro (2 funciones iguales al repo)');
  });

  it('un archivo manual con la comprobación en verde y huellas iguales se salta', async () => {
    const result = await run({
      ...REAL_LIKE,
      functions: { alfa: 'select 10', beta: 'select 2', gamma: 'select 3' },
      checkRow: () => ({ listo: true }),
    });
    expect(result.code).toBe(0);
    expect(appliedNames(result.fake)).toEqual([]);
    expect(result.all()).toContain('comprobación en verde)');
  });

  it('la simulación solo lee y dice qué haría', async () => {
    const result = await run(REAL_LIKE, { dryRun: true, yes: false });
    expect(result.code).toBe(0);
    expect(result.fake.writes()).toEqual([]);
    expect(result.asked).toEqual([]);
    expect(result.all()).toContain(
      '3. manual_arreglo  se aplica, 1 función distinta o faltante y comprobación en rojo (listo dio false y debía dar true)',
    );
    expect(result.all()).toContain('supabase/functions/_shared/util.ts');
    expect(result.all()).toContain('verify_jwt false');
    expect(result.out.at(-1)).toBe('Simulación. No se escribió nada.');
  });

  it('sin --yes pregunta y sin un si no escribe', async () => {
    const result = await run(REAL_LIKE, { yes: false, answer: false });
    expect(result.code).toBe(1);
    expect(result.asked).toHaveLength(1);
    expect(result.fake.writes()).toEqual([]);
  });

  it('falla si la base queda distinta del repo después de aplicar', async () => {
    const result = await run({ ...REAL_LIKE, tamper: (_name, body) => `${body} + 0` });
    expect(result.code).toBe(1);
    expect(result.all()).toContain(
      'beta quedó distinta de supabase/migrations/20260101000001_base.sql',
    );
  });

  it('falla si una función queda abierta a anon sin que un archivo lo conceda', async () => {
    const open = await run({ ...REAL_LIKE, anonOnApply: ['beta'] });
    expect(open.code).toBe(1);
    expect(open.all()).toContain(
      'anon puede ejecutar beta y ningún archivo del plan se lo concede',
    );
    const allowed = await run({ ...REAL_LIKE, anonOnApply: ['beta'] }, { plan: 'beta-abierta' });
    expect(allowed.code).toBe(0);
    expect(allowed.all()).toContain('beta sigue abierta a anon a propósito. Prueba');
  });

  it('no escribe nada si algo registrado quedó distinto y ningún paso lo corrige', async () => {
    const result = await run(REAL_LIKE, { plan: 'sin-arreglo' });
    expect(result.code).toBe(1);
    expect(result.fake.writes()).toEqual([]);
    expect(result.all()).toContain(
      'beta está distinta del repo en la base y ningún paso del plan la deja como supabase/migrations/20260101000001_base.sql',
    );
  });

  it('no aplica una migración que dejaría una función más vieja que el repo', async () => {
    const result = await run({ functions: {} }, { plan: 'solo-base' });
    expect(result.code).toBe(1);
    expect(result.fake.writes()).toEqual([]);
    expect(result.all()).toContain(
      'Aplicarla dejaría alfa más vieja que supabase/migrations/20260101000002_more.sql',
    );
  });

  it('no aplica un archivo manual que regresaría una función de una migración', async () => {
    const result = await run(REAL_LIKE, { plan: 'conflicto' });
    expect(result.code).toBe(1);
    expect(result.fake.requests).toEqual([]);
    expect(result.all()).toContain('supabase/manual/viejo.sql trae beta distinta de');
  });

  it('si la comprobación de la base sale en rojo no publica ninguna función', async () => {
    const result = await run({ ...REAL_LIKE, tamper: (_name, body) => `${body} + 0` });
    expect(result.code).toBe(1);
    expect(result.fake.edge.has('hola')).toBe(false);
    expect(result.all()).toContain('No se publicó ninguna función');
  });

  it('se detiene justo después de un archivo manual que queda con la comprobación en rojo', async () => {
    const result = await run(
      { ...REAL_LIKE, checkRow: () => ({ listo: false }) },
      { plan: 'dos-manuales' },
    );
    expect(result.code).toBe(1);
    expect(appliedNames(result.fake)).toEqual(['manual_arreglo']);
    expect(result.all()).toContain('supabase/manual/arreglo.sql quedó con la comprobación en rojo');
    expect(result.fake.edge.has('hola')).toBe(false);
  });

  it('se detiene en la función que queda con otro verify_jwt y no publica las que siguen', async () => {
    const result = await run({ forceVerifyJwt: true }, { plan: 'dos-funciones' });
    expect(result.code).toBe(1);
    expect(result.fake.edge.get('hola')?.verifyJwt).toBe(true);
    expect(result.fake.edge.has('adios')).toBe(false);
    expect(result.all()).toContain('hola quedó con verify_jwt true y el plan dice false');
  });

  it('un 5xx o una falla de red en la comprobación previa terminan sin escribir', async () => {
    for (const failure of [500, 502, 'network'] as const) {
      const result = await run({ ...REAL_LIKE, checkFailure: () => failure });
      expect(result.code, String(failure)).toBe(1);
      expect(result.fake.writes(), String(failure)).toEqual([]);
      expect(result.all()).toContain('No pude leer el estado del proyecto');
    }
  });

  it('un 400 de SQL en la comprobación previa cuenta como rojo, porque falta algo, y se aplica', async () => {
    const result = await run({
      ...REAL_LIKE,
      checkFailure: (applied) => (applied.has('manual_arreglo') ? null : 400),
    });
    expect(result.code).toBe(0);
    expect(appliedNames(result.fake)).toEqual(['manual_arreglo']);
    expect(result.all()).toContain('comprobación en rojo (la consulta falló');
  });

  it('se detiene en el primer SQL que falla y no publica', async () => {
    const result = await run({ ...REAL_LIKE, failApply: 'manual_arreglo' });
    expect(result.code).toBe(1);
    expect(result.all()).toContain('Falló supabase/manual/arreglo.sql. Supabase respondió 500');
    expect(result.fake.edge.has('hola')).toBe(false);
  });

  it('falla si la versión de la función no sube', async () => {
    const result = await run({
      ...REAL_LIKE,
      edge: { hola: { version: 3, verifyJwt: false } },
      keepVersion: true,
    });
    expect(result.code).toBe(1);
    expect(result.all()).toContain('hola sigue en la versión 3, no subió');
  });

  it('--only functions no toca la base y --only migrations no publica', async () => {
    const functions = await run(REAL_LIKE, { only: 'functions' });
    expect(functions.code).toBe(0);
    expect(functions.fake.requests.some((request) => request.path.startsWith('/database'))).toBe(
      false,
    );
    const migrations = await run(REAL_LIKE, { only: 'migrations' });
    expect(migrations.code).toBe(0);
    expect(migrations.fake.requests.some((request) => request.path.startsWith('/functions'))).toBe(
      false,
    );
  });

  it('con un 401 no sigue y explica qué revisar', async () => {
    const result = await run({ failWith: { status: 401, message: 'JWT could not be decoded' } });
    expect(result.code).toBe(1);
    expect(result.fake.requests).toHaveLength(1);
    expect(result.fake.requests[0]).toMatchObject({ method: 'GET', path: '/database/migrations' });
    expect(result.all()).toContain('El token no sirve');
  });
});

describe('secretos', () => {
  const VALUES = {
    STRIPE_PRICE_FOUNDER: 'price_valor_secreto_1',
    STRIPE_PORTAL_CONFIG_REGULAR: 'bpc_valor_secreto_2',
  };
  const writeSecrets = (values: Record<string, string>) => {
    const path = join(root, 'private/ids.json');
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(values));
    return path;
  };

  it('pone todos en una llamada, dice solo los nombres y confirma que quedaron', async () => {
    const result = await run(
      { secrets: { STRIPE_PRICE_FOUNDER: 'price_viejo' } },
      { secretsFrom: writeSecrets(VALUES) },
    );
    expect(result.code).toBe(0);
    const posts = result.fake.writes();
    expect(posts).toHaveLength(1);
    expect(posts[0]).toMatchObject({ method: 'POST', path: '/secrets' });
    expect(result.all()).toContain('STRIPE_PRICE_FOUNDER  reemplaza el que ya hay');
    expect(result.all()).toContain('STRIPE_PORTAL_CONFIG_REGULAR  nuevo');
    for (const value of Object.values(VALUES)) expect(result.all()).not.toContain(value);
  });

  it('la simulación no escribe', async () => {
    const result = await run({}, { secretsFrom: writeSecrets(VALUES), dryRun: true });
    expect(result.code).toBe(0);
    expect(result.fake.writes()).toEqual([]);
  });

  it('con el plan revisa nombres y prefijos sin mostrar valores', async () => {
    const result = await run(
      {},
      { secretsFrom: writeSecrets({ ...VALUES, STRIPE_PRICE_FOUNDER: 'prod_equivocado_1' }) },
    );
    expect(result.code).toBe(1);
    expect(result.fake.requests).toEqual([]);
    expect(result.all()).toContain('STRIPE_PRICE_FOUNDER debe empezar con price_');
    expect(result.all()).not.toContain('prod_equivocado_1');
    const extra = await run(
      {},
      { secretsFrom: writeSecrets({ ...VALUES, OTRO_SECRETO: 'valor_de_otro' }) },
    );
    expect(extra.code).toBe(1);
    expect(extra.all()).toContain('OTRO_SECRETO no está en el plan prueba');
  });

  it('oculta los valores aunque la API los repita en su error', async () => {
    const result = await run({ echoSecretsError: true }, { secretsFrom: writeSecrets(VALUES) });
    expect(result.code).toBe(1);
    expect(result.all()).toContain('[oculto]');
    for (const value of Object.values(VALUES)) expect(result.all()).not.toContain(value);
  });
});
