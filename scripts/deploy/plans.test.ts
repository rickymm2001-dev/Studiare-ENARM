import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  PORTAL_SPECS,
  PRICE_SPECS,
  idsRecord,
  writeIdsFile,
  type SetupResult,
} from '../stripe/setup-test.ts';
import { expectedFunctions, runDeploy, type Io } from './deploy.ts';
import { readSecretsFile } from './secrets.ts';
import { createManagementClient } from './managementApi.ts';
import { loadPlan, repoMigrations } from './plan.ts';
import { applyFunctionSql, sameDef, type FunctionDef } from './sql.ts';
import { STUDIARE_PROJECT_REF, main, parseArgs, resolveToken } from './supabase.ts';
import { fakeSupabase, type FakeOptions } from './testing/fakeSupabase.ts';

const ROOT = join(import.meta.dirname, '../..');
// Un token falso. No tiene la forma de uno real para que ningún escáner de secretos lo confunda
const TOKEN = 'token-falso-de-prueba-que-no-debe-salir-en-pantalla';

/** La historia del proyecto real el 2026-10-15, como la dejó el conector */
const REAL_HISTORY = [
  ['20261014100836', 'party_cloud'],
  ['20261014100941', 'referral_first_charge'],
  ['20261014143028', 'free_plan_locks'],
  ['20261014143110', 'free_plan_party_moderation'],
  ['20261014190300', 'accounts_access'],
  ['20261015010236', 'billing_emails'],
  ['20261015010327', 'billing_plans_1'],
  ['20261015010417', 'billing_plans_2'],
  ['20261015010457', 'billing_plans_3'],
  ['20261015010555', 'billing_plans_4'],
  ['20261015010649', 'billing_plans_5'],
  ['20261015010729', 'invoice_requests'],
].map(([version = '', name = '']) => ({ version, name }));

/**
 * La base real del 2026-10-15. Todas las funciones de las migraciones como en el repo, salvo
 * delete_my_account, que sigue en su versión de antes de B10 porque la Sección con delete no se aplicó,
 * y sin la función de Party de supabase/manual
 */
function realFunctions(): Record<string, FunctionDef> {
  const defs = new Map<string, FunctionDef>();
  for (const migration of repoMigrations(ROOT)) applyFunctionSql(migration.sql, defs);
  const privacy = new Map<string, FunctionDef>();
  applyFunctionSql(
    readFileSync(join(ROOT, 'supabase/migrations/20261009000001_privacy.sql'), 'utf8'),
    privacy,
  );
  const old = privacy.get('delete_my_account');
  if (old) defs.set('delete_my_account', old);
  return Object.fromEntries(defs);
}

/** La base con B11 aplicado y B12 sin aplicar. Todas las funciones de las migraciones hasta 20261023000006 */
function beforeB12Functions(): Record<string, FunctionDef> {
  const defs = new Map<string, FunctionDef>();
  for (const migration of repoMigrations(ROOT)) {
    if (migration.version <= '20261023000006') applyFunctionSql(migration.sql, defs);
  }
  return Object.fromEntries(defs);
}

const REAL_STATE: FakeOptions = {
  ref: STUDIARE_PROJECT_REF,
  history: REAL_HISTORY,
  functions: realFunctions(),
  anon: ['current_app_role', 'is_admin'],
  edge: {
    'create-checkout': { version: 16, verifyJwt: true },
    'admin-reset-mfa': { version: 1, verifyJwt: true },
  },
  checkRow: (applied, query) =>
    query.includes('regla_al_borrar')
      ? {
          regla_al_borrar: applied.has('manual_party_dueno_al_borrar_cuenta') ? 'n' : 'c',
          owner_id_opcional: applied.has('manual_party_dueno_al_borrar_cuenta'),
          disparador_activo: applied.has('manual_party_dueno_al_borrar_cuenta'),
        }
      : {
          plan_fundador_anual: applied.has('manual_pagos_b10'),
          estado_prueba: applied.has('manual_pagos_b10'),
          borrar_cuenta_b10: applied.has('manual_pagos_b10'),
          borra_la_invitacion: applied.has('manual_pagos_b10'),
        },
};

function collectIo(): { io: Io; text: () => string } {
  const lines: string[] = [];
  return {
    io: {
      out: (line) => lines.push(line),
      err: (line) => lines.push(line),
      confirm: () => Promise.resolve(true),
    },
    text: () => lines.join('\n'),
  };
}

async function runReal(fake: ReturnType<typeof fakeSupabase>, plan: string, dryRun = false) {
  const output = collectIo();
  const code = await runDeploy({
    root: ROOT,
    plan,
    dryRun,
    only: null,
    yes: true,
    secretsFrom: null,
    client: createManagementClient({ ref: fake.ref, token: TOKEN, fetch: fake.fetch }),
    io: output.io,
    authNote: 'prueba',
  });
  return { code, text: output.text() };
}

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('los planes del repo', () => {
  it('b10 lleva lo que falta de B10 y la pieza de Party, y publica cancel-subscription', () => {
    const plan = loadPlan(ROOT, 'b10');
    expect(plan.migrations.map((step) => step.name)).toEqual([
      'billing_emails',
      'billing_plans',
      'invoice_requests',
      'manual_pagos_b10',
      'manual_party_dueno_al_borrar_cuenta',
    ]);
    expect(plan.functions).toEqual([
      { slug: 'cancel-subscription', verifyJwt: true, note: expect.any(String) as string },
    ]);
    expect(expectedFunctions(plan, repoMigrations(ROOT)).conflicts).toEqual([]);
  });

  it('b11 lleva las seis migraciones del banco, la de inglés, Borrar mis datos y bank-sync sin verificar JWT', () => {
    const plan = loadPlan(ROOT, 'b11');
    expect(plan.migrations.map((step) => step.name)).toEqual([
      'bank_taxonomy',
      'bank_core',
      'bank_editorial',
      'bank_sync',
      'deck_catalog',
      'bank_sync_cron',
      'english_section',
      'manual_banco_b11',
    ]);
    expect(plan.functions).toEqual([
      { slug: 'bank-sync', verifyJwt: false, note: expect.any(String) as string },
    ]);
    expect(expectedFunctions(plan, repoMigrations(ROOT)).conflicts).toEqual([]);
    // La cuenta de servicio de Google es una credencial y la pone Ricardo, no este plan
    expect(Object.keys(plan.secrets ?? {})).toEqual(['GOOGLE_BANK_SHEET_ID']);
  });

  it('b12 lleva las cuatro migraciones de IA, la pieza de Borrar mis datos y las dos funciones sin verificar JWT', () => {
    const plan = loadPlan(ROOT, 'b12');
    expect(plan.migrations.map((step) => step.name)).toEqual([
      'ai_proxy_v2',
      'ai_jobs',
      'ai_gate',
      'ai_delete_my_data',
      'manual_ia_b12',
    ]);
    expect(plan.migrations.at(-1)?.check).toEqual({ borrar_mis_datos_b12: true });
    expect(plan.functions).toEqual([
      { slug: 'ai-proxy', verifyJwt: false, note: expect.any(String) as string },
      { slug: 'ai-batch', verifyJwt: false, note: expect.any(String) as string },
    ]);
    expect(expectedFunctions(plan, repoMigrations(ROOT)).conflicts).toEqual([]);
  });

  it('los secretos de b12 son los dos que pone la sesión, y la clave de Anthropic no pasa por el plan', () => {
    const plan = loadPlan(ROOT, 'b12');
    expect(Object.keys(plan.secrets ?? {})).toEqual(['APP_ORIGINS', 'AI_ALLOW_MOCK']);
    const origins = plan.secrets?.APP_ORIGINS?.pattern;
    expect(origins?.test('https://rickymm2001-dev.github.io')).toBe(true);
    expect(origins?.test('https://app.studiare.mx,https://localhost:5173')).toBe(true);
    for (const bad of [
      'http://studiare.mx',
      'https://studiare.mx/',
      'https://*.studiare.mx',
      '*',
      '',
    ]) {
      expect(origins?.test(bad), bad).toBe(false);
    }
    const mock = plan.secrets?.AI_ALLOW_MOCK?.pattern;
    for (const good of ['0', '1']) expect(mock?.test(good), good).toBe(true);
    for (const bad of ['2', 'true', '']) expect(mock?.test(bad), bad).toBe(false);
  });

  it('Borrar mis datos v3 es la misma en la última migración y en las tres piezas manuales', () => {
    const latest = new Map<string, FunctionDef>();
    for (const migration of repoMigrations(ROOT)) applyFunctionSql(migration.sql, latest);
    const want = latest.get('delete_my_data');
    expect(want?.body).toContain('ai_jobs');
    for (const file of [
      'supabase/manual/ia-b12.sql',
      'supabase/manual/banco-b11.sql',
      'supabase/manual/ejecutar-en-sql-editor.sql',
    ]) {
      const defs = new Map<string, FunctionDef>();
      applyFunctionSql(readFileSync(join(ROOT, file), 'utf8'), defs);
      const own = defs.get('delete_my_data');
      expect(own && want && sameDef(own, want), file).toBe(true);
    }
  });

  it('los secretos de b10 son los ocho IDs que crea setup-test.ts, con su prefijo', () => {
    const plan = loadPlan(ROOT, 'b10');
    const names = [...PRICE_SPECS.map((spec) => spec.env), ...PORTAL_SPECS.map((spec) => spec.env)];
    expect(Object.keys(plan.secrets ?? {}).sort()).toEqual([...names].sort());
    for (const spec of PRICE_SPECS) {
      expect(plan.secrets?.[spec.env]?.pattern.source).toBe('^price_[A-Za-z0-9]+$');
    }
    for (const spec of PORTAL_SPECS) {
      expect(plan.secrets?.[spec.env]?.pattern.source).toBe('^bpc_[A-Za-z0-9]+$');
    }
  });

  it('verify_jwt de cada plan coincide con lo que dice el index.ts de la función', () => {
    for (const file of readdirSync(join(ROOT, 'deploy')).filter((name) => name.endsWith('.json'))) {
      for (const step of loadPlan(ROOT, `deploy/${file}`).functions) {
        const source = readFileSync(
          join(ROOT, 'supabase/functions', step.slug, 'index.ts'),
          'utf8',
        );
        expect(step.verifyJwt, `${file} ${step.slug}`).toBe(!source.includes('--no-verify-jwt'));
      }
    }
  });

  it('b10 contra el estado real aplica solo las dos piezas manuales y deja todo en verde', async () => {
    const fake = fakeSupabase(REAL_STATE);
    const first = await runReal(fake, 'b10');
    expect(first.text).toContain('Todo en verde.');
    expect(first.code).toBe(0);
    const applied = fake
      .writes()
      .filter((request) => request.path === '/database/migrations')
      .map((request) => (request.json as { name: string }).name);
    expect(applied).toEqual(['manual_pagos_b10', 'manual_party_dueno_al_borrar_cuenta']);
    expect(first.text).toContain(
      'delete_my_account está distinta del repo en la base. La corrige el paso 4 (supabase/manual/pagos-b10.sql)',
    );
    expect(first.text).toContain('46 funciones iguales al repo de 46');
    expect(fake.edge.get('cancel-subscription')).toMatchObject({ version: 1, verifyJwt: true });

    // Correrlo otra vez no repite SQL. Las piezas manuales ya quedaron registradas con su nombre
    const before = fake.writes().length;
    const second = await runReal(fake, 'b10');
    expect(second.code).toBe(0);
    expect(
      fake
        .writes()
        .slice(before)
        .filter((request) => request.path === '/database/migrations'),
    ).toEqual([]);
    expect(second.text).toContain(
      'manual_pagos_b10  ya aplicada, registrada como manual_pagos_b10',
    );
  });

  it('b12 contra un proyecto con B11 aplica las cuatro migraciones y la pieza, y publica las dos funciones', async () => {
    const fake = fakeSupabase({
      ref: STUDIARE_PROJECT_REF,
      functions: beforeB12Functions(),
      checkRow: (applied) => ({ borrar_mis_datos_b12: applied.has('manual_ia_b12') }),
    });
    const first = await runReal(fake, 'b12');
    expect(first.text).toContain('Todo en verde.');
    expect(first.code).toBe(0);
    const applied = fake
      .writes()
      .filter((request) => request.path === '/database/migrations')
      .map((request) => (request.json as { name: string }).name);
    expect(applied).toEqual([
      'ai_proxy_v2',
      'ai_jobs',
      'ai_gate',
      'ai_delete_my_data',
      'manual_ia_b12',
    ]);
    // Borrar mis datos v3 quedó en la base con los trabajos de IA
    expect(fake.functions.get('delete_my_data')?.body).toContain('ai_jobs');
    expect(fake.edge.get('ai-proxy')).toMatchObject({ version: 1, verifyJwt: false });
    expect(fake.edge.get('ai-batch')).toMatchObject({ version: 1, verifyJwt: false });
    // Las dos suben su deno.json y lo señalan, porque importan zod, hono y el SDK por su nombre
    for (const slug of ['ai-proxy', 'ai-batch']) {
      const published = fake.edge.get(slug);
      expect(published?.metadata.import_map_path, slug).toBe(
        `supabase/functions/${slug}/deno.json`,
      );
      expect(
        published?.files.map((file) => file.name),
        slug,
      ).toContain(`supabase/functions/${slug}/deno.json`);
    }

    // Otra corrida no repite SQL, porque todo quedó registrado con su nombre
    const before = fake.writes().length;
    const second = await runReal(fake, 'b12');
    expect(second.code).toBe(0);
    expect(
      fake
        .writes()
        .slice(before)
        .filter((request) => request.path === '/database/migrations'),
    ).toEqual([]);
  });

  it('b9 se salta la migración ya registrada y acepta current_app_role abierta a propósito', async () => {
    const fake = fakeSupabase(REAL_STATE);
    const result = await runReal(fake, 'b9');
    expect(result.code).toBe(0);
    expect(result.text).toContain('accounts_access  ya aplicada, registrada como accounts_access');
    expect(result.text).toContain('current_app_role sigue abierta a anon a propósito');
    expect(fake.edge.get('admin-reset-mfa')?.version).toBe(2);
  });
});

describe('IDs de setup-test.ts hacia los secretos', () => {
  it('el JSON que escribe --write-ids lo acepta --secrets-from con el plan b10', () => {
    const result: SetupResult = {
      ids: [
        ...PRICE_SPECS.map((spec, index) => ({
          env: spec.env,
          id: `price_${index}abc`,
          status: 'created' as const,
        })),
        ...PORTAL_SPECS.map((spec, index) => ({
          env: spec.env,
          id: `bpc_${index}abc`,
          status: 'reused' as const,
        })),
      ],
      coupon: { id: 'PRUEBA10', created: false },
      promotionCode: { id: 'promo_1', code: 'PRUEBA10', created: false },
      replacedPrices: [],
      archivedPrices: [],
    };
    expect(Object.keys(idsRecord(result))).toHaveLength(8);
    const dir = mkdtempSync(join(tmpdir(), 'studiare-ids-'));
    dirs.push(dir);
    const path = join(dir, 'private/stripe-test-ids.json');
    writeIdsFile(path, result);
    expect(readSecretsFile(path)).toEqual(idsRecord(result));
  });
});

describe('línea de comandos', () => {
  it('lee las opciones', () => {
    expect(parseArgs(['--plan', 'b10', '--dry-run', '--only=functions', '--yes'])).toMatchObject({
      plan: 'b10',
      dryRun: true,
      only: 'functions',
      yes: true,
      projectRef: STUDIARE_PROJECT_REF,
    });
    expect(() => parseArgs(['--only', 'todo'])).toThrow(/migrations o functions/);
    expect(() => parseArgs(['--secrets-from', 'private/ids.json'])).toThrow(/--plan/);
    expect(() => parseArgs(['--plan'])).toThrow(/necesita un valor/);
    expect(() => parseArgs(['--plan', 'b10', TOKEN])).toThrow(/No conozco la opción número 3/);
    expect(() => parseArgs([TOKEN])).not.toThrow(new RegExp(TOKEN));
  });

  it('el token sale del entorno o del proxy y nunca se repite', () => {
    const fromEnv = resolveToken({ SUPABASE_ACCESS_TOKEN: TOKEN });
    expect(fromEnv).toEqual({ token: TOKEN, note: 'con el token de SUPABASE_ACCESS_TOKEN' });
    expect(resolveToken({ HTTPS_PROXY: 'http://127.0.0.1:1' })).toMatchObject({ token: null });
    for (const bad of [`${TOKEN}\n`, `${TOKEN}\r`, `Bearer ${TOKEN}`, `${TOKEN}\t`]) {
      const result = resolveToken({ SUPABASE_ACCESS_TOKEN: bad });
      expect(result).toMatchObject({ error: expect.stringContaining('caracteres') as string });
      expect(JSON.stringify(result)).not.toContain(TOKEN);
    }
    expect(resolveToken({})).toMatchObject({
      error: expect.stringContaining('Falta SUPABASE_ACCESS_TOKEN') as string,
    });
  });

  it('ni el token ni los valores de los secretos salen en la consola', async () => {
    const printed: string[] = [];
    const keep = (...args: unknown[]) => {
      printed.push(args.map(String).join(' '));
    };
    for (const method of ['log', 'error', 'warn', 'info'] as const) {
      vi.spyOn(console, method).mockImplementation(keep);
    }
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      printed.push(String(chunk));
      return true;
    });
    const env = { SUPABASE_ACCESS_TOKEN: TOKEN };

    // Un token con un retorno de carro al final no llega a fetch ni sale en pantalla
    vi.stubGlobal('fetch', fakeSupabase({ ref: STUDIARE_PROJECT_REF }).fetch);
    expect(
      await main(['--plan', 'b10', '--dry-run'], { SUPABASE_ACCESS_TOKEN: `${TOKEN}\r` }),
    ).toBe(2);

    // Un plan con el token rechazado
    vi.stubGlobal(
      'fetch',
      fakeSupabase({
        ref: STUDIARE_PROJECT_REF,
        failWith: { status: 401, message: 'JWT could not be decoded' },
      }).fetch,
    );
    expect(await main(['--plan', 'b10', '--dry-run'], env)).toBe(1);

    // Los secretos, bien y con una API que repite lo que recibe en su error
    const dir = mkdtempSync(join(tmpdir(), 'studiare-secrets-'));
    dirs.push(dir);
    const result: SetupResult = {
      ids: [
        ...PRICE_SPECS.map((spec, index) => ({
          env: spec.env,
          id: `price_SECRETO${index}x`,
          status: 'created' as const,
        })),
        ...PORTAL_SPECS.map((spec, index) => ({
          env: spec.env,
          id: `bpc_SECRETO${index}y`,
          status: 'created' as const,
        })),
      ],
      coupon: { id: 'PRUEBA10', created: false },
      promotionCode: { id: 'promo_1', code: 'PRUEBA10', created: false },
      replacedPrices: [],
      archivedPrices: [],
    };
    const path = join(dir, 'ids.json');
    writeIdsFile(path, result);
    const fake = fakeSupabase({ ref: STUDIARE_PROJECT_REF });
    vi.stubGlobal('fetch', fake.fetch);
    expect(await main(['--secrets-from', path, '--plan', 'b10', '--yes'], env)).toBe(0);
    expect(fake.secrets.size).toBe(8);
    vi.stubGlobal(
      'fetch',
      fakeSupabase({ ref: STUDIARE_PROJECT_REF, echoSecretsError: true }).fetch,
    );
    expect(await main(['--secrets-from', path, '--plan', 'b10', '--yes'], env)).toBe(1);
    vi.unstubAllGlobals();
    stdout.mockRestore();

    const all = printed.join('\n');
    expect(all).toContain('STRIPE_PRICE_FOUNDER');
    expect(all).toContain('[oculto]');
    expect(all.includes(TOKEN)).toBe(false);
    expect(all.includes('SECRETO')).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------
// B11, B12 y B13 desde un proyecto con solo B10 aplicado (docs/DESPLIEGUE.md, B11, B12 y B13)

/** La última migración de B10. Un proyecto con solo B10 llega hasta aquí */
const LAST_B10 = '20261022000003';
/** La última de B11, la del ciclo de Cron del banco */
const LAST_B11 = '20261023000006';

/** Lo que registra el plan b11 de B11 sin la migración de B13, en el orden del plan */
const B11_STEPS = [
  'bank_taxonomy',
  'bank_core',
  'bank_editorial',
  'bank_sync',
  'deck_catalog',
  'bank_sync_cron',
  'manual_banco_b11',
] as const;

/**
 * Los planes en el orden en que se corren desde un proyecto con solo B10, con el SQL que aplica cada uno y
 * las funciones que publica. Dos cosas que se ven aquí y no son errores
 *   - b11 lleva la migración de B13, así que b13 ya no aplica SQL y solo vuelve a publicar bank-sync con la
 *     copia nueva del convertidor
 *   - b12 no aplica ai_delete_my_data. banco-b11.sql, que corrió en b11, ya dejó Borrar mis datos v3 igual
 *     a la de esa migración, y la herramienta la da por aplicada por la huella de su función, sin registrarla
 * Cuando llegue el plan de un bloque nuevo va al final de esta lista con su SQL y sus funciones, y el resto
 * de las pruebas de esta sección corre con él sin cambios
 */
const FROM_B10: readonly { plan: string; sql: readonly string[]; functions: readonly string[] }[] =
  [
    {
      plan: 'b11',
      sql: [
        'bank_taxonomy',
        'bank_core',
        'bank_editorial',
        'bank_sync',
        'deck_catalog',
        'bank_sync_cron',
        'english_section',
        'manual_banco_b11',
      ],
      functions: ['bank-sync'],
    },
    {
      plan: 'b12',
      sql: ['ai_proxy_v2', 'ai_jobs', 'ai_gate', 'manual_ia_b12'],
      functions: ['ai-proxy', 'ai-batch'],
    },
    { plan: 'b13', sql: [], functions: ['bank-sync'] },
  ];

/** Las funciones de las migraciones del repo hasta una versión, como las deja un proyecto que llegó ahí */
function functionsUpTo(version: string): Record<string, FunctionDef> {
  const defs = new Map<string, FunctionDef>();
  for (const migration of repoMigrations(ROOT)) {
    if (migration.version <= version) applyFunctionSql(migration.sql, defs);
  }
  return Object.fromEntries(defs);
}

/**
 * La fila de cada consulta de comprobación según lo que se aplicó. Una columna que el plan no pide no estorba,
 * así que trae la de B11 y la de B12 para cualquier plan de FROM_B10
 */
const checkRows = (applied: ReadonlySet<string>) => ({
  borrar_mis_datos_b11: applied.has('manual_banco_b11'),
  borrar_mis_datos_b12: applied.has('manual_ia_b12'),
});

/** La base con B10 aplicado y nada del banco */
function onlyB10(): ReturnType<typeof fakeSupabase> {
  return fakeSupabase({
    ref: STUDIARE_PROJECT_REF,
    history: REAL_HISTORY,
    functions: functionsUpTo(LAST_B10),
    anon: ['current_app_role', 'is_admin'],
    checkRow: checkRows,
  });
}

/**
 * La base como la dejó el plan b11 de antes de B13, cuando la migración de inglés todavía no existía. Las
 * funciones de las migraciones hasta la del Cron del banco y la de Borrar mis datos de banco-b11.sql
 */
function withB11BeforeEnglish(): ReturnType<typeof fakeSupabase> {
  const functions = new Map(Object.entries(functionsUpTo(LAST_B11)));
  applyFunctionSql(readFileSync(join(ROOT, 'supabase/manual/banco-b11.sql'), 'utf8'), functions);
  return fakeSupabase({
    ref: STUDIARE_PROJECT_REF,
    history: [
      ...REAL_HISTORY,
      ...B11_STEPS.map((name, index) => ({
        version: `2026101700${String(index).padStart(4, '0')}`,
        name,
      })),
    ],
    functions: Object.fromEntries(functions),
    anon: ['current_app_role', 'is_admin'],
    edge: { 'bank-sync': { version: 1, verifyJwt: false } },
    checkRow: (applied) => ({ ...checkRows(applied), borrar_mis_datos_b11: true }),
  });
}

/** Los nombres con los que quedó registrado el SQL que aplicó una corrida, en orden */
function appliedSince(fake: ReturnType<typeof fakeSupabase>, from: number): string[] {
  return fake
    .writes()
    .slice(from)
    .filter((request) => request.path === '/database/migrations')
    .map((request) => (request.json as { name: string }).name);
}

// Cada corrida lee y parte todo el SQL del repo. Con la cobertura de npm run check, o en un equipo lento, una
// prueba de varias corridas pasa de los 5 s de Vitest, así que esta sección pide más
describe('B11, B12 y B13 desde un proyecto con solo B10', { timeout: 60_000 }, () => {
  it('b13 lleva la migración de inglés y bank-sync sin verificar JWT, y sin SQL manual', () => {
    const plan = loadPlan(ROOT, 'b13');
    expect(plan.migrations.map((step) => step.name)).toEqual(['english_section']);
    expect(plan.migrations.map((step) => step.kind)).toEqual(['migration']);
    expect(plan.functions).toEqual([
      { slug: 'bank-sync', verifyJwt: false, note: expect.any(String) as string },
    ]);
    expect(expectedFunctions(plan, repoMigrations(ROOT)).conflicts).toEqual([]);
    // Los secretos de bank-sync los puso el plan b11. Este no espera ninguno
    expect(plan.secrets).toBeNull();
    // Es idempotente y no lleva delete ni drop, así que el conector también puede aplicarla
    const sql = plan.migrations[0]?.sql ?? '';
    expect(sql).not.toMatch(/^\s*(delete|drop)\b/im);
  });

  it('la migración de inglés redefine las dos funciones de B11 que el plan b11 trae en bank_core', () => {
    const plan = loadPlan(ROOT, 'b11');
    const english = loadPlan(ROOT, 'b13').migrations[0];
    const core = plan.migrations.find((step) => step.name === 'bank_core');
    if (!english || !core) throw new Error('Faltan los pasos del plan');
    const redefined = ['bank_version_issues', 'bank_incomplete_of'];
    const coreDefs = new Map<string, FunctionDef>();
    const englishDefs = new Map<string, FunctionDef>();
    applyFunctionSql(core.sql, coreDefs);
    applyFunctionSql(english.sql, englishDefs);
    for (const name of redefined) {
      const before = coreDefs.get(name);
      const after = englishDefs.get(name);
      expect(before && after && !sameDef(before, after), name).toBe(true);
    }
    // Y en el plan b11 la migración de inglés va después de bank_core, para que la corrija
    const names = plan.migrations.map((step) => step.name);
    expect(names.indexOf('english_section')).toBeGreaterThan(names.indexOf('bank_core'));
  });

  it('sin la migración de inglés el plan b11 se detiene antes de escribir, que es por lo que la lleva', async () => {
    const plan = JSON.parse(readFileSync(join(ROOT, 'deploy/b11.json'), 'utf8')) as {
      migrations: { file: string }[];
    };
    plan.migrations = plan.migrations.filter((step) => !step.file.endsWith('_english_section.sql'));
    expect(plan.migrations).toHaveLength(B11_STEPS.length);
    const dir = mkdtempSync(join(tmpdir(), 'studiare-plan-'));
    dirs.push(dir);
    const path = join(dir, 'b11-sin-ingles.json');
    writeFileSync(path, JSON.stringify(plan));

    const fake = onlyB10();
    const run = await runReal(fake, path);
    expect(run.code).toBe(1);
    for (const name of ['bank_version_issues', 'bank_incomplete_of']) {
      expect(run.text).toContain(
        `Aplicarla dejaría ${name} más vieja que supabase/migrations/20261027000001_english_section.sql`,
      );
    }
    expect(fake.writes()).toEqual([]);
  });

  it('b11, b12 y b13 en ese orden corren completos, la base queda como el repo y volver a correrlos no repite SQL', async () => {
    const fake = onlyB10();
    const versions = new Map<string, number>();
    /** Lo que sube una corrida de cada función que publica, con el verify_jwt que dice su plan */
    const expectPublished = (plan: string, label: string) => {
      const jwt = new Map(loadPlan(ROOT, plan).functions.map((fn) => [fn.slug, fn.verifyJwt]));
      for (const slug of jwt.keys()) {
        versions.set(slug, (versions.get(slug) ?? 0) + 1);
        expect(fake.edge.get(slug), `${label} ${slug}`).toMatchObject({
          version: versions.get(slug),
          verifyJwt: jwt.get(slug),
        });
      }
    };
    for (const step of FROM_B10) {
      const before = fake.writes().length;
      const run = await runReal(fake, step.plan);
      expect(run.text, step.plan).toContain('Todo en verde.');
      expect(run.code, step.plan).toBe(0);
      expect(appliedSince(fake, before), step.plan).toEqual(step.sql);
      expectPublished(step.plan, step.plan);
    }

    // Las funciones que B13 redefine y Borrar mis datos v3 de B12 quedaron en su versión
    expect(fake.functions.get('bank_version_issues')?.body).toContain('language_branch_mismatch');
    expect(fake.functions.get('bank_incomplete_of')?.body).toContain('language_branch_mismatch');
    expect(fake.functions.get('bank_passage_source_issue')).toBeDefined();
    expect(fake.functions.get('delete_my_data')?.body).toContain('bank_reads');
    expect(fake.functions.get('delete_my_data')?.body).toContain('ai_jobs');
    // bank-sync subió la copia generada del convertidor que lee la fuente del texto, igual a la del repo
    const generated = 'supabase/functions/_shared/bank/generated/passageSource.ts';
    const published = fake.edge.get('bank-sync')?.files.find((file) => file.name === generated);
    expect(published?.content).toBe(readFileSync(join(ROOT, generated), 'utf8'));

    // Cualquiera de los planes se puede volver a correr, en cualquier orden, sin repetir SQL
    for (const step of [...FROM_B10].reverse()) {
      const before = fake.writes().length;
      const again = await runReal(fake, step.plan);
      expect(again.code, step.plan).toBe(0);
      expect(appliedSince(fake, before), step.plan).toEqual([]);
      expectPublished(step.plan, `otra vez ${step.plan}`);
    }
  });

  it('b13 antes que b12 da lo mismo, porque los dos no comparten ninguna función', async () => {
    const fake = onlyB10();
    const byPlan = new Map(FROM_B10.map((step) => [step.plan, step]));
    for (const plan of ['b11', 'b13', 'b12']) {
      const before = fake.writes().length;
      const run = await runReal(fake, plan);
      expect(run.text, plan).toContain('Todo en verde.');
      expect(run.code, plan).toBe(0);
      expect(appliedSince(fake, before), plan).toEqual(byPlan.get(plan)?.sql);
    }
    expect(fake.functions.get('bank_version_issues')?.body).toContain('language_branch_mismatch');
    expect(fake.functions.get('delete_my_data')?.body).toContain('ai_jobs');
  });

  it('cada plan corre solo sobre un proyecto con B11 aplicado, sin los otros dos', async () => {
    // Lo que aplica cada uno con la base de B11 de antes de B13. b11 y b13 la completan con la migración de
    // inglés, y b12 con los suyos
    const expected: Record<string, readonly string[]> = {
      b11: ['english_section'],
      b12: ['ai_proxy_v2', 'ai_jobs', 'ai_gate', 'manual_ia_b12'],
      b13: ['english_section'],
    };
    for (const [plan, sql] of Object.entries(expected)) {
      const fake = withB11BeforeEnglish();
      const run = await runReal(fake, plan);
      expect(run.text, plan).toContain('Todo en verde.');
      expect(run.code, plan).toBe(0);
      expect(appliedSince(fake, 0), plan).toEqual(sql);
    }
  });

  it('un proyecto con B11 de antes de B13 recibe la migración de inglés con b13, o con b11 si se corre otra vez', async () => {
    const withB13 = withB11BeforeEnglish();
    const first = await runReal(withB13, 'b13');
    expect(first.text).toContain('Todo en verde.');
    expect(first.code).toBe(0);
    expect(appliedSince(withB13, 0)).toEqual(['english_section']);
    expect(withB13.edge.get('bank-sync')?.version).toBe(2);
    expect(withB13.functions.get('bank_version_issues')?.body).toContain(
      'language_branch_mismatch',
    );

    // b11 sobre el mismo proyecto de antes dice que la migración de inglés corrige las dos funciones y la aplica
    const withB11 = withB11BeforeEnglish();
    const second = await runReal(withB11, 'b11');
    expect(second.code).toBe(0);
    expect(appliedSince(withB11, 0)).toEqual(['english_section']);
    expect(second.text).toContain('bank_version_issues está distinta del repo en la base');
    expect(second.text).toContain(
      'La corrige el paso 7 (supabase/migrations/20261027000001_english_section.sql)',
    );
    expect(withB11.edge.get('bank-sync')?.version).toBe(2);
  });
});
