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
import { applyFunctionSql, checkQuery, sameDef, type FunctionDef } from './sql.ts';
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

  it('b11 lleva las seis migraciones del banco, la de F2, la de inglés, las tres de B14, la del nivel cognitivo, Borrar mis datos y bank-sync sin verificar JWT', () => {
    const plan = loadPlan(ROOT, 'b11');
    expect(plan.migrations.map((step) => step.name)).toEqual([
      'bank_taxonomy',
      'bank_core',
      'bank_editorial',
      'bank_sync',
      'deck_catalog',
      'bank_sync_cron',
      'catalog_free_access_and_caps',
      'english_section',
      'model_core',
      'calibration_job',
      'model_reads',
      'cognitive_level',
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

  it('b14 lleva las tres migraciones del modelo del alumno y la del nivel cognitivo en orden, sin SQL manual ni Edge Functions', () => {
    const plan = loadPlan(ROOT, 'b14');
    expect(plan.migrations.map((step) => step.name)).toEqual([
      'model_core',
      'calibration_job',
      'model_reads',
      'cognitive_level',
    ]);
    expect(plan.migrations.map((step) => step.kind)).toEqual([
      'migration',
      'migration',
      'migration',
      'migration',
    ]);
    // La calibración corre en GitHub Actions y su llave la pone Ricardo, así que no hay funciones ni secretos
    expect(plan.functions).toEqual([]);
    expect(plan.secrets).toBeNull();
    expect(expectedFunctions(plan, repoMigrations(ROOT)).conflicts).toEqual([]);
    // Ninguna lleva delete ni drop, así que el conector también puede aplicarlas
    for (const step of plan.migrations) {
      expect(step.sql, step.file).not.toMatch(/^\s*(delete|drop)\b/im);
    }
  });

  it('la comprobación de b14 va en la tercera migración, es la de docs/SUPABASE.md y no depende de lo que cambia', () => {
    const plan = loadPlan(ROOT, 'b14');
    const [core, job, reads, level] = plan.migrations;
    expect(core?.check).toBeNull();
    expect(job?.check).toBeNull();
    expect(level?.check).toBeNull();
    const check = reads?.check ?? {};
    // Solo hechos de la estructura. Si la calibración está encendida y en qué modo cambian con el tiempo, y
    // con ellos en la comprobación el plan no se podría volver a correr después de encenderla
    expect(Object.keys(check)).not.toContain('calibracion_encendida');
    expect(Object.keys(check)).not.toContain('modo');
    expect(check).toMatchObject({ tablas_nuevas: 7, indices_nuevos: 4, modelo_sembrado: true });
    // La consulta de la migración y el primer bloque de SQL de la sección B14 de docs/SUPABASE.md son la misma
    const docs = readFileSync(join(ROOT, 'docs/SUPABASE.md'), 'utf8');
    const section = docs.slice(docs.indexOf('## Datos y modelo del alumno (B14)'));
    const block = /```sql\n([\s\S]*?)```/.exec(section)?.[1] ?? '';
    const squash = (sql: string) => sql.replace(/\s+/g, ' ').replace(/;\s*$/, '').trim();
    expect(block).not.toBe('');
    expect(squash(block)).toBe(squash(checkQuery(reads?.sql ?? '') ?? ''));
  });

  it('b15 lleva las cuatro migraciones del servidor en orden y las funciones de correos, analítica y alertas, con las de siempre envueltas', () => {
    const plan = loadPlan(ROOT, 'b15');
    expect(plan.migrations.map((step) => step.name)).toEqual([
      'email_reminders',
      'product_analytics',
      'engagement_cron',
      'delete_my_data_v4',
    ]);
    expect(plan.migrations.map((step) => step.kind)).toEqual([
      'migration',
      'migration',
      'migration',
      'migration',
    ]);
    const jwt = Object.fromEntries(plan.functions.map((fn) => [fn.slug, fn.verifyJwt]));
    // Las tres que llaman Cron o el correo no llevan sesión y se identifican por su cuenta. monitoring-test sí
    expect(jwt).toMatchObject({
      'send-emails': false,
      'email-unsubscribe': false,
      'analytics-flush': false,
      'monitoring-test': true,
    });
    // Las nueve que ya existían se vuelven a publicar con el verify_jwt de siempre, porque ahora van con withMonitoring
    const wrapped = [
      'create-checkout',
      'create-portal-session',
      'cancel-subscription',
      'admin-reset-mfa',
      'payment-webhook-stripe',
      'payment-webhook-mercadopago',
      'bank-sync',
      'ai-proxy',
      'ai-batch',
    ];
    for (const slug of wrapped) {
      const index = readFileSync(join(ROOT, 'supabase/functions', slug, 'index.ts'), 'utf8');
      expect(index, slug).toMatch(/withMonitoring/);
      // El verify_jwt de siempre es el que dice su index.ts (otra prueba lo revisa en todos los planes)
      expect(jwt[slug], slug).toBe(!index.includes('--no-verify-jwt'));
    }
    // Todas las funciones del repo que usan withMonitoring están en el plan, ni una menos
    const withMonitoringSlugs = readdirSync(join(ROOT, 'supabase/functions'), {
      withFileTypes: true,
    })
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith('_'))
      .map((entry) => entry.name)
      .filter((slug) =>
        readFileSync(join(ROOT, 'supabase/functions', slug, 'index.ts'), 'utf8').includes(
          'withMonitoring',
        ),
      );
    expect(plan.functions.map((fn) => fn.slug).toSorted()).toEqual(withMonitoringSlugs.toSorted());
    // Las llaves de Resend, PostHog y Sentry las pone Ricardo directo en Supabase y no pasan por el plan
    expect(plan.secrets).toBeNull();
    expect(expectedFunctions(plan, repoMigrations(ROOT)).conflicts).toEqual([]);
  });

  it('la comprobación de b15 va en la última migración, es la de docs/SUPABASE.md y no depende de lo que cambia', () => {
    const plan = loadPlan(ROOT, 'b15');
    for (const step of plan.migrations.slice(0, -1)) expect(step.check, step.name).toBeNull();
    const last = plan.migrations.at(-1);
    const check = last?.check ?? {};
    // Solo hechos de la estructura. Si el envío de correos y la analítica están encendidos cambia con el tiempo, y
    // los trabajos de Cron y las fichas de Vault no existen en toda base, así que no entran
    for (const column of ['correos_encendidos', 'analitica_encendida', 'trabajos_de_cron']) {
      expect(Object.keys(check)).not.toContain(column);
    }
    expect(check).toMatchObject({ tablas_de_b15: 4, borrar_mis_datos_b15: true });
    // La consulta de la migración y el primer bloque de SQL de la sección B15 de docs/SUPABASE.md son la misma
    const docs = readFileSync(join(ROOT, 'docs/SUPABASE.md'), 'utf8');
    const section = docs.slice(docs.indexOf('## Recordatorios, analítica y alertas (B15)'));
    const block = /```sql\n([\s\S]*?)```/.exec(section)?.[1] ?? '';
    const squash = (sql: string) => sql.replace(/\s+/g, ' ').replace(/;\s*$/, '').trim();
    expect(block).not.toBe('');
    expect(squash(block)).toBe(squash(checkQuery(last?.sql ?? '') ?? ''));
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

  it('Borrar mis datos v4 es la misma en la última migración, en banco-b11, en ia-b12 y en la pieza 4, y suma lo de B15 a la v3', () => {
    const latest = new Map<string, FunctionDef>();
    for (const migration of repoMigrations(ROOT)) applyFunctionSql(migration.sql, latest);
    const want = latest.get('delete_my_data');
    expect(want?.body).toContain('ai_jobs');
    expect(want?.body).toContain('review_reminder_prefs');
    // La herramienta exige que un archivo manual traiga cada función igual a la última migración que la
    // define, así que los tres archivos manuales siguen a la migración de B15
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
    // La v4 es la v3 de B12 más lo de los recordatorios y la analítica, sin quitar ni cambiar una sola línea de la v3
    const v3Defs = new Map<string, FunctionDef>();
    applyFunctionSql(
      readFileSync(join(ROOT, 'supabase/migrations/20261026000004_ai_delete_my_data.sql'), 'utf8'),
      v3Defs,
    );
    const v3 = v3Defs.get('delete_my_data');
    expect(v3?.body).not.toContain('review_reminder_prefs');
    expect(want?.securityDefiner).toBe(v3?.securityDefiner);
    expect(want?.config?.join()).toBe(v3?.config?.join());
    const lines = (body: string | null) =>
      (body ?? '')
        .split('\n')
        .map((line) => line.replace(/--.*$/, '').trim())
        .filter((line) => line !== '');
    const v4Lines = new Set(lines(want?.body ?? null));
    for (const line of lines(v3?.body ?? null)) {
      if (line.startsWith("'ai_generations', v_generations")) continue;
      expect(v4Lines.has(line), `la v4 perdió esta línea de la v3, ${line}`).toBe(true);
    }
    for (const table of [
      'review_reminder_prefs',
      'review_due_snapshots',
      'analytics_subjects',
      'analytics_outbox',
      'email_outbox',
    ]) {
      expect(want?.body, table).toContain(`public.${table}`);
    }
    // Lleva delete, así que es la única migración de B15 con uno. Las otras tres las aplica también el conector
    const b15 = loadPlan(ROOT, 'b15').migrations;
    for (const step of b15.slice(0, -1)) {
      expect(step.sql, step.file).not.toMatch(/^\s*(delete|drop)\b/im);
    }
    expect(b15.at(-1)?.sql).toMatch(/^\s*delete\b/im);
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
// B11 a B18 desde un proyecto con solo B10 aplicado (docs/DESPLIEGUE.md, B11, B12, B13, B14, B15, B17 y B18)

/** La última migración de B10. Un proyecto con solo B10 llega hasta aquí */
const LAST_B10 = '20261022000003';
/** La última de B11, la del ciclo de Cron del banco */
const LAST_B11 = '20261023000006';
/** La última de B13, la de Inglés médico. Un proyecto con B11, B12 y B13 y sin B14 llega hasta aquí */
const LAST_B13 = '20261027000001';
/** La última de B14, la que lee la app y el equipo. Un proyecto con B11 a B14 y sin B15 llega hasta aquí */
const LAST_B14 = '20261028000003';

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
 * las funciones que publica. Tres cosas que se ven aquí y no son errores
 *   - b11 lleva la migración de B13 y las tres de B14, así que b13 ya no aplica SQL y solo vuelve a publicar
 *     bank-sync con la copia nueva del convertidor, y b14 no aplica ni publica nada
 *   - Con B15, banco-b11.sql, ia-b12.sql y la pieza 4 de ejecutar-en-sql-editor.sql traen Borrar mis datos v4,
 *     igual a la de 20261029000004_delete_my_data_v4.sql, así que b12 sí aplica su migración ai_delete_my_data (la v3,
 *     que la v4 de banco-b11.sql ya pasó) y la pieza ia-b12.sql la deja otra vez en v4 en el mismo plan
 *   - b15 vuelve a publicar bank-sync, ai-proxy y ai-batch, porque ahora van envueltas con withMonitoring
 *   - b17 no aplica SQL y vuelve a publicar las trece funciones, porque todas empaquetan las llaves y el CORS nuevos
 *   - b18 aplica las dos migraciones de la encuesta de los primeros días y no publica nada. No comparte ninguna
 *     función con los demás, y por eso va al final
 *   - b11 lleva también la migración de F2 (acceso gratis por mazo y topes), porque redefine funciones del catálogo
 *     de deck_catalog, así que f2 ya no aplica SQL ni publica nada, como b14
 *   - b11 lleva también la migración del nivel cognitivo (V4-B5), que va después de las tres de B14 porque
 *     redefine bank_catalog_json con la llave calibration, y por eso no tiene plan propio
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
        'catalog_free_access_and_caps',
        'english_section',
        'model_core',
        'calibration_job',
        'model_reads',
        'cognitive_level',
        'manual_banco_b11',
      ],
      functions: ['bank-sync'],
    },
    {
      plan: 'b12',
      sql: ['ai_proxy_v2', 'ai_jobs', 'ai_gate', 'ai_delete_my_data', 'manual_ia_b12'],
      functions: ['ai-proxy', 'ai-batch'],
    },
    { plan: 'b13', sql: [], functions: ['bank-sync'] },
    { plan: 'b14', sql: [], functions: [] },
    {
      plan: 'b15',
      sql: ['email_reminders', 'product_analytics', 'engagement_cron', 'delete_my_data_v4'],
      functions: [
        'send-emails',
        'email-unsubscribe',
        'analytics-flush',
        'monitoring-test',
        'create-checkout',
        'create-portal-session',
        'cancel-subscription',
        'admin-reset-mfa',
        'payment-webhook-stripe',
        'payment-webhook-mercadopago',
        'bank-sync',
        'ai-proxy',
        'ai-batch',
      ],
    },
    {
      plan: 'b17',
      sql: [],
      functions: [
        'send-emails',
        'email-unsubscribe',
        'analytics-flush',
        'monitoring-test',
        'create-checkout',
        'create-portal-session',
        'cancel-subscription',
        'admin-reset-mfa',
        'payment-webhook-stripe',
        'payment-webhook-mercadopago',
        'bank-sync',
        'ai-proxy',
        'ai-batch',
      ],
    },
    { plan: 'b18', sql: ['first_week_survey', 'survey_erase'], functions: [] },
    { plan: 'f2', sql: [], functions: [] },
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
 * La fila de la comprobación de b14 según lo que se aplicó: lo que pide el propio plan cuando las tres
 * migraciones están, y lo contrario (ceros y falsos) cuando falta alguna
 */
let modelCheck: Record<string, unknown> | undefined;
function modelCheckRow(applied: ReadonlySet<string>): Record<string, unknown> {
  modelCheck ??=
    loadPlan(ROOT, 'b14').migrations.find((step) => step.name === 'model_reads')?.check ?? {};
  const expected = modelCheck;
  const done = ['model_core', 'calibration_job', 'model_reads'].every((name) => applied.has(name));
  return Object.fromEntries(
    Object.entries(expected).map(([column, value]) => [
      column,
      done ? value : typeof value === 'boolean' ? !value : 0,
    ]),
  );
}

/**
 * La fila de la comprobación de b15 según lo que se aplicó, como la de b14: lo que pide el plan cuando las cuatro
 * migraciones están, y lo contrario (ceros y falsos) cuando falta alguna
 */
let engagementCheck: Record<string, unknown> | undefined;
function engagementCheckRow(applied: ReadonlySet<string>): Record<string, unknown> {
  engagementCheck ??= loadPlan(ROOT, 'b15').migrations.at(-1)?.check ?? {};
  const expected = engagementCheck;
  const done = [
    'email_reminders',
    'product_analytics',
    'engagement_cron',
    'delete_my_data_v4',
  ].every((name) => applied.has(name));
  return Object.fromEntries(
    Object.entries(expected).map(([column, value]) => [
      column,
      done ? value : typeof value === 'boolean' ? !value : 0,
    ]),
  );
}

/**
 * La fila de la comprobación de b18 según lo que se aplicó, como la de b15: lo que pide el plan cuando las dos
 * migraciones de la encuesta están, y lo contrario (ceros y falsos) cuando falta alguna
 */
let surveyCheck: Record<string, unknown> | undefined;
function surveyCheckRow(applied: ReadonlySet<string>): Record<string, unknown> {
  surveyCheck ??= loadPlan(ROOT, 'b18').migrations.at(-1)?.check ?? {};
  const expected = surveyCheck;
  const done = ['first_week_survey', 'survey_erase'].every((name) => applied.has(name));
  return Object.fromEntries(
    Object.entries(expected).map(([column, value]) => [
      column,
      done ? value : typeof value === 'boolean' ? !value : 0,
    ]),
  );
}

/**
 * La fila de la comprobación de f2 según lo que se aplicó, como la de b18: lo que pide el plan cuando su migración
 * está, y lo contrario (ceros y falsos) cuando falta
 */
let freeAccessCheck: Record<string, unknown> | undefined;
function freeAccessCheckRow(applied: ReadonlySet<string>): Record<string, unknown> {
  freeAccessCheck ??= loadPlan(ROOT, 'f2').migrations.at(-1)?.check ?? {};
  const expected = freeAccessCheck;
  const done = applied.has('catalog_free_access_and_caps');
  return Object.fromEntries(
    Object.entries(expected).map(([column, value]) => [
      column,
      done ? value : typeof value === 'boolean' ? !value : 0,
    ]),
  );
}

/**
 * La fila de cada consulta de comprobación según lo que se aplicó. Una columna que el plan no pide no estorba,
 * así que trae la de B11, la de B12, la de B14, la de B15, la de B18 y la de F2 para cualquier plan de FROM_B10
 */
const checkRows = (applied: ReadonlySet<string>) => ({
  borrar_mis_datos_b11: applied.has('manual_banco_b11'),
  borrar_mis_datos_b12: applied.has('manual_ia_b12'),
  ...modelCheckRow(applied),
  ...engagementCheckRow(applied),
  ...surveyCheckRow(applied),
  ...freeAccessCheckRow(applied),
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

/**
 * La base como la dejan b11, b12 y b13 de antes de B14, cuando las tres migraciones del modelo del alumno
 * todavía no existían. Las funciones de las migraciones hasta la de Inglés médico y la de Borrar mis datos de
 * banco-b11.sql, con todo lo de B11, B12 y B13 registrado
 */
function withB13BeforeB14(): ReturnType<typeof fakeSupabase> {
  const functions = new Map(Object.entries(functionsUpTo(LAST_B13)));
  applyFunctionSql(readFileSync(join(ROOT, 'supabase/manual/banco-b11.sql'), 'utf8'), functions);
  const done = [
    ...B11_STEPS.slice(0, -1),
    'catalog_free_access_and_caps',
    'english_section',
    'ai_proxy_v2',
    'ai_jobs',
    'ai_gate',
    'ai_delete_my_data',
    'manual_banco_b11',
    'manual_ia_b12',
  ];
  return fakeSupabase({
    ref: STUDIARE_PROJECT_REF,
    history: [
      ...REAL_HISTORY,
      ...done.map((name, index) => ({
        version: `2026101700${String(index).padStart(4, '0')}`,
        name,
      })),
    ],
    functions: Object.fromEntries(functions),
    anon: ['current_app_role', 'is_admin'],
    edge: {
      'bank-sync': { version: 2, verifyJwt: false },
      'ai-proxy': { version: 1, verifyJwt: false },
      'ai-batch': { version: 1, verifyJwt: false },
    },
    checkRow: (applied) => ({
      ...checkRows(applied),
      borrar_mis_datos_b11: true,
      borrar_mis_datos_b12: true,
    }),
  });
}

/**
 * La base como la dejan b11, b12, b13 y b14 de antes de B15, cuando las cuatro migraciones del servidor todavía no
 * existían. Las funciones de las migraciones hasta la de Borrar mis datos de B12 y las del modelo del alumno, con Borrar
 * mis datos en la v3, todo lo de B11 a B14 registrado y las funciones de Edge de esos planes publicadas
 */
function withB14BeforeB15(): ReturnType<typeof fakeSupabase> {
  // Con la del nivel cognitivo, que b11 y b14 llevan después de las tres del modelo del alumno
  const functions = new Map(Object.entries(functionsUpTo(LAST_B14)));
  applyFunctionSql(
    readFileSync(join(ROOT, 'supabase/migrations/20261031000001_cognitive_level.sql'), 'utf8'),
    functions,
  );
  const done = [
    ...B11_STEPS.slice(0, -1),
    'catalog_free_access_and_caps',
    'english_section',
    'ai_proxy_v2',
    'ai_jobs',
    'ai_gate',
    'ai_delete_my_data',
    'model_core',
    'calibration_job',
    'model_reads',
    'cognitive_level',
    'manual_banco_b11',
    'manual_ia_b12',
  ];
  return fakeSupabase({
    ref: STUDIARE_PROJECT_REF,
    history: [
      ...REAL_HISTORY,
      ...done.map((name, index) => ({
        version: `2026101700${String(index).padStart(4, '0')}`,
        name,
      })),
    ],
    functions: Object.fromEntries(functions),
    anon: ['current_app_role', 'is_admin'],
    edge: {
      'bank-sync': { version: 3, verifyJwt: false },
      'ai-proxy': { version: 1, verifyJwt: false },
      'ai-batch': { version: 1, verifyJwt: false },
      'create-checkout': { version: 16, verifyJwt: true },
      'create-portal-session': { version: 5, verifyJwt: true },
      'cancel-subscription': { version: 1, verifyJwt: true },
      'admin-reset-mfa': { version: 2, verifyJwt: true },
      'payment-webhook-stripe': { version: 9, verifyJwt: false },
      'payment-webhook-mercadopago': { version: 4, verifyJwt: false },
    },
    checkRow: (applied) => ({
      ...checkRows(applied),
      borrar_mis_datos_b11: true,
      borrar_mis_datos_b12: true,
    }),
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
describe('B11 a B18 desde un proyecto con solo B10', { timeout: 60_000 }, () => {
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
    // Los siete de antes más la de F2, las tres migraciones de B14 y la del nivel cognitivo
    expect(plan.migrations).toHaveLength(B11_STEPS.length + 5);
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

  it('la migración 3 de B14 redefine bank_catalog_json de B11, y el plan b11 la trae después de bank_core y de las otras dos', () => {
    const plan = loadPlan(ROOT, 'b11');
    const reads = loadPlan(ROOT, 'b14').migrations.find((step) => step.name === 'model_reads');
    const core = plan.migrations.find((step) => step.name === 'bank_core');
    if (!reads || !core) throw new Error('Faltan los pasos del plan');
    const coreDefs = new Map<string, FunctionDef>();
    const readsDefs = new Map<string, FunctionDef>();
    applyFunctionSql(core.sql, coreDefs);
    applyFunctionSql(reads.sql, readsDefs);
    const before = coreDefs.get('bank_catalog_json');
    const after = readsDefs.get('bank_catalog_json');
    expect(before && after && !sameDef(before, after)).toBe(true);
    // Y en el plan b11 las tres van en orden, una tras otra, después de bank_core y de la de inglés
    const names = plan.migrations.map((step) => step.name);
    expect(names.slice(names.indexOf('english_section'))).toEqual([
      'english_section',
      'model_core',
      'calibration_job',
      'model_reads',
      'cognitive_level',
      'manual_banco_b11',
    ]);
    expect(names.indexOf('model_reads')).toBeGreaterThan(names.indexOf('bank_core'));
  });

  it('sin las migraciones de B14 el plan b11 se detiene antes de escribir, que es por lo que las lleva', async () => {
    const plan = JSON.parse(readFileSync(join(ROOT, 'deploy/b11.json'), 'utf8')) as {
      migrations: { file: string }[];
    };
    // También sin la del nivel cognitivo, que redefine bank_catalog_json después de la de B14. Con ella el plan ya
    // no se detiene por esta función, porque la última versión del repo es la suya
    plan.migrations = plan.migrations.filter(
      (step) =>
        !/\/202610280000\d\d_/.test(step.file) && !step.file.endsWith('_cognitive_level.sql'),
    );
    // Los siete de antes más la de F2 y la de inglés
    expect(plan.migrations).toHaveLength(B11_STEPS.length + 2);
    const dir = mkdtempSync(join(tmpdir(), 'studiare-plan-'));
    dirs.push(dir);
    const path = join(dir, 'b11-sin-modelo.json');
    writeFileSync(path, JSON.stringify(plan));

    const fake = onlyB10();
    const run = await runReal(fake, path);
    expect(run.code).toBe(1);
    expect(run.text).toContain(
      'Aplicarla dejaría bank_catalog_json más vieja que supabase/migrations/20261031000001_cognitive_level.sql',
    );
    expect(fake.writes()).toEqual([]);
  });

  it('la migración del nivel cognitivo redefine nueve funciones del banco, y sin ella el plan b11 se detiene antes de escribir', async () => {
    const plan = JSON.parse(readFileSync(join(ROOT, 'deploy/b11.json'), 'utf8')) as {
      migrations: { file: string }[];
    };
    plan.migrations = plan.migrations.filter((step) => !step.file.endsWith('_cognitive_level.sql'));
    // Los siete de antes más la de F2, la de inglés y las tres migraciones de B14
    expect(plan.migrations).toHaveLength(B11_STEPS.length + 5);
    const dir = mkdtempSync(join(tmpdir(), 'studiare-plan-'));
    dirs.push(dir);
    const path = join(dir, 'b11-sin-nivel-cognitivo.json');
    writeFileSync(path, JSON.stringify(plan));

    const fake = onlyB10();
    const run = await runReal(fake, path);
    expect(run.code).toBe(1);
    for (const name of [
      'bank_check_content',
      'bank_insert_version',
      'bank_draft_content',
      'bank_version_json',
      'bank_publish',
      'bank_catalog_json',
      'bank_body_json',
      'bank_sheet_content',
      'bank_sync_versions_content',
    ]) {
      expect(run.text).toContain(
        `Aplicarla dejaría ${name} más vieja que supabase/migrations/20261031000001_cognitive_level.sql`,
      );
    }
    expect(fake.writes()).toEqual([]);
  });

  it('b11, b12, b13, b14, b15, b17 y b18 en ese orden corren completos, la base queda como el repo y volver a correrlos no repite SQL', async () => {
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

    // Las funciones que B13 redefine y Borrar mis datos v4 de B15 (con lo de B11 y B12) quedaron en su versión
    expect(fake.functions.get('bank_version_issues')?.body).toContain('language_branch_mismatch');
    expect(fake.functions.get('bank_incomplete_of')?.body).toContain('language_branch_mismatch');
    expect(fake.functions.get('bank_passage_source_issue')).toBeDefined();
    expect(fake.functions.get('delete_my_data')?.body).toContain('bank_reads');
    expect(fake.functions.get('delete_my_data')?.body).toContain('ai_jobs');
    expect(fake.functions.get('delete_my_data')?.body).toContain('review_reminder_prefs');
    // Lo que B15 agrega en la base: el interruptor de correos, los recordatorios, la analítica y su cola
    for (const name of [
      'enqueue_review_reminders',
      'email_unsubscribe',
      'analytics_identity',
      'claim_analytics_batch',
      'admin_email_overview',
    ]) {
      expect(fake.functions.get(name), name).toBeDefined();
    }
    // El catálogo de B11 con la llave calibration, y lo que lee la app y el equipo de B14, en la base
    expect(fake.functions.get('bank_catalog_json')?.body).toContain("'calibration'");
    for (const name of ['comparison_snapshot', 'population_baselines', 'admin_calibration_runs']) {
      expect(fake.functions.get(name), name).toBeDefined();
    }
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

  it('b13 antes que b12 da lo mismo, porque los dos no comparten ninguna función, y b14 y b15 van al final', async () => {
    const fake = onlyB10();
    const byPlan = new Map(FROM_B10.map((step) => [step.plan, step]));
    for (const plan of ['b11', 'b13', 'b12', 'b14', 'b15']) {
      const before = fake.writes().length;
      const run = await runReal(fake, plan);
      expect(run.text, plan).toContain('Todo en verde.');
      expect(run.code, plan).toBe(0);
      expect(appliedSince(fake, before), plan).toEqual(byPlan.get(plan)?.sql);
    }
    expect(fake.functions.get('bank_version_issues')?.body).toContain('language_branch_mismatch');
    expect(fake.functions.get('delete_my_data')?.body).toContain('ai_jobs');
    expect(fake.functions.get('delete_my_data')?.body).toContain('review_reminder_prefs');
  });

  it('cada plan corre solo sobre un proyecto con B11 aplicado, sin los otros dos', async () => {
    // Lo que aplica cada uno con la base de B11 de antes de B13. b11 y b13 la completan con la migración de
    // inglés, b11 y b14 con las tres del modelo del alumno y la del nivel cognitivo, b11 y f2 con la del acceso
    // gratis, y b12 con los suyos
    const modelo = ['model_core', 'calibration_job', 'model_reads', 'cognitive_level'];
    const expected: Record<string, readonly string[]> = {
      b11: ['catalog_free_access_and_caps', 'english_section', ...modelo],
      b12: ['ai_proxy_v2', 'ai_jobs', 'ai_gate', 'ai_delete_my_data', 'manual_ia_b12'],
      b13: ['english_section'],
      b14: modelo,
      b15: ['email_reminders', 'product_analytics', 'engagement_cron', 'delete_my_data_v4'],
      b18: ['first_week_survey', 'survey_erase'],
      f2: ['catalog_free_access_and_caps'],
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
    expect(appliedSince(withB11, 0)).toEqual([
      'catalog_free_access_and_caps',
      'english_section',
      'model_core',
      'calibration_job',
      'model_reads',
      'cognitive_level',
    ]);
    expect(second.text).toContain('bank_version_issues está distinta del repo en la base');
    expect(second.text).toContain(
      'La corrige el paso 8 (supabase/migrations/20261027000001_english_section.sql)',
    );
    expect(withB11.edge.get('bank-sync')?.version).toBe(2);
  });

  it('un proyecto con B11, B12 y B13 de antes de B14 recibe las tres migraciones con b14, o con b11 si se corre otra vez', async () => {
    const withB14 = withB13BeforeB14();
    const first = await runReal(withB14, 'b14');
    expect(first.text).toContain('Todo en verde.');
    expect(first.code).toBe(0);
    expect(appliedSince(withB14, 0)).toEqual([
      'model_core',
      'calibration_job',
      'model_reads',
      'cognitive_level',
    ]);
    // La comprobación de la última migración corre justo después de aplicarla, y de nuevo al final
    expect(first.text).toContain('comprobación en verde');
    expect(first.text).toContain(
      'supabase/migrations/20261028000003_model_reads.sql comprobación en verde',
    );
    // El plan no publica funciones de Edge, así que ninguna cambia de versión
    expect(withB14.edge.get('bank-sync')?.version).toBe(2);
    expect(withB14.edge.get('ai-proxy')?.version).toBe(1);
    expect(withB14.functions.get('bank_catalog_json')?.body).toContain("'calibration'");

    // Volver a correrlo no repite SQL, con la comprobación en verde de lo ya registrado
    const before = withB14.writes().length;
    const again = await runReal(withB14, 'b14');
    expect(again.code).toBe(0);
    expect(appliedSince(withB14, before)).toEqual([]);
    expect(again.text).toContain('ya aplicada, registrada como model_reads');

    // b11 sobre el mismo proyecto de antes dice que la tercera migración corrige bank_catalog_json y aplica las tres
    const withB11 = withB13BeforeB14();
    const second = await runReal(withB11, 'b11');
    expect(second.code).toBe(0);
    expect(appliedSince(withB11, 0)).toEqual([
      'model_core',
      'calibration_job',
      'model_reads',
      'cognitive_level',
    ]);
    expect(second.text).toContain('bank_catalog_json está distinta del repo en la base');
    // La última definición de bank_catalog_json es la de la migración del nivel cognitivo, el paso 12 del plan b11
    expect(second.text).toContain(
      'La corrige el paso 12 (supabase/migrations/20261031000001_cognitive_level.sql)',
    );
    expect(withB11.edge.get('bank-sync')?.version).toBe(3);
  });

  it('b14 con --dry-run solo lee: dice qué aplicaría y no escribe nada', async () => {
    const fake = withB13BeforeB14();
    const dry = await runReal(fake, 'b14', true);
    expect(dry.code).toBe(0);
    expect(fake.writes()).toEqual([]);
    for (const name of ['model_core', 'calibration_job', 'model_reads', 'cognitive_level']) {
      expect(dry.text).toContain(`${name}  se aplica`);
    }
    // El plan no publica funciones de Edge, y la simulación tampoco lo anuncia
    expect(dry.text).not.toContain('Publicando');
  });

  it('una comprobación de b14 en rojo detiene el plan sin aplicar nada, aunque las migraciones ya estén registradas', async () => {
    // Las tres registradas por el conector, pero sin las tablas: la base dice otra cosa que la historia
    const fake = withB13BeforeB14();
    for (const [index, name] of ['model_core', 'calibration_job', 'model_reads'].entries()) {
      fake.history.push({ version: `2026102800${String(index).padStart(4, '0')}`, name });
    }
    const run = await runReal(fake, 'b14');
    expect(run.code).toBe(1);
    expect(run.text).toContain('su comprobación sale en rojo');
    expect(run.text).toContain('tablas_nuevas dio 0 y debía dar 7');
    expect(fake.writes()).toEqual([]);
  });
  it('un proyecto con B11 a B14 de antes de B15 recibe las cuatro migraciones con b15 y publica las trece funciones', async () => {
    const fake = withB14BeforeB15();
    const first = await runReal(fake, 'b15');
    expect(first.text).toContain('Todo en verde.');
    expect(first.code).toBe(0);
    expect(appliedSince(fake, 0)).toEqual([
      'email_reminders',
      'product_analytics',
      'engagement_cron',
      'delete_my_data_v4',
    ]);
    // La comprobación de la última migración corre justo después de aplicarla, y de nuevo al final
    expect(first.text).toContain(
      'supabase/migrations/20261029000004_delete_my_data_v4.sql comprobación en verde',
    );
    // Borrar mis datos pasó de la v3 a la v4, y claim_email_batch de B10 a su segunda versión
    expect(fake.functions.get('delete_my_data')?.body).toContain('review_reminder_prefs');
    expect(fake.functions.get('claim_email_batch')?.body).toContain('stale');
    // Las funciones de siempre subieron de versión con el verify_jwt que tenían, y las nuevas nacen en 1
    const wanted = new Map(loadPlan(ROOT, 'b15').functions.map((fn) => [fn.slug, fn.verifyJwt]));
    expect(wanted.size).toBe(13);
    for (const [slug, verifyJwt] of wanted) {
      expect(fake.edge.get(slug), slug).toMatchObject({ status: 'ACTIVE', verifyJwt });
    }
    expect(fake.edge.get('create-checkout')?.version).toBe(17);
    expect(fake.edge.get('bank-sync')?.version).toBe(4);
    expect(fake.edge.get('send-emails')?.version).toBe(1);
    expect(fake.edge.get('monitoring-test')).toMatchObject({ version: 1, verifyJwt: true });

    // Volver a correrlo no repite SQL, con la comprobación en verde de lo ya registrado
    const before = fake.writes().length;
    const again = await runReal(fake, 'b15');
    expect(again.code).toBe(0);
    expect(appliedSince(fake, before)).toEqual([]);
    expect(again.text).toContain('ya aplicada, registrada como delete_my_data_v4');
  });

  it('b15 con --dry-run solo lee: dice qué aplicaría y qué publicaría, y no escribe nada', async () => {
    const fake = withB14BeforeB15();
    const dry = await runReal(fake, 'b15', true);
    expect(dry.code).toBe(0);
    expect(fake.writes()).toEqual([]);
    for (const name of [
      'email_reminders',
      'product_analytics',
      'engagement_cron',
      'delete_my_data_v4',
    ]) {
      expect(dry.text).toContain(`${name}  se aplica`);
    }
    expect(dry.text).toContain('send-emails');
    expect(dry.text).toContain('monitoring-test');
    expect(dry.text).not.toContain('Publicando');
    expect(fake.edge.get('send-emails')).toBeUndefined();
  });

  it('una comprobación de b15 en rojo detiene el plan sin aplicar nada, aunque las migraciones ya estén registradas', async () => {
    // Las cuatro registradas por el conector, pero sin las tablas: la base dice otra cosa que la historia
    const fake = withB14BeforeB15();
    for (const [index, name] of [
      'email_reminders',
      'product_analytics',
      'engagement_cron',
      'delete_my_data_v4',
    ].entries()) {
      fake.history.push({ version: `2026102900${String(index).padStart(4, '0')}`, name });
    }
    const run = await runReal(fake, 'b15');
    expect(run.code).toBe(1);
    expect(run.text).toContain('su comprobación sale en rojo');
    expect(run.text).toContain('tablas_de_b15 dio 0 y debía dar 4');
    expect(fake.writes()).toEqual([]);
  });

  it('b18 lleva las dos migraciones de la encuesta en orden, sin SQL manual, Edge Functions ni secretos', () => {
    const plan = loadPlan(ROOT, 'b18');
    expect(plan.migrations.map((step) => step.name)).toEqual(['first_week_survey', 'survey_erase']);
    expect(plan.migrations.map((step) => step.kind)).toEqual(['migration', 'migration']);
    expect(plan.functions).toEqual([]);
    expect(plan.secrets).toBeNull();
    expect(expectedFunctions(plan, repoMigrations(ROOT)).conflicts).toEqual([]);
    // La primera no lleva delete ni drop, así que el conector también la puede aplicar (D-113). El borrado de la
    // respuesta, que es lo único que los necesita, va solo en la segunda
    const [first, second] = plan.migrations;
    expect(first?.sql).not.toMatch(/^\s*(delete|drop)\b/im);
    const code = (sql = '') => sql.replace(/--.*$/gm, '');
    expect(code(first?.sql)).not.toMatch(/\bdelete\s+from\b|\bdrop\b/i);
    expect(code(second?.sql)).toMatch(/^\s*delete\s+from\s+public\.survey_responses\b/im);
    expect(code(second?.sql)).not.toMatch(/\bdrop\b/i);
    // Ninguna otra migración del repo toca la tabla de la encuesta ni Borrar mis datos
    for (const migration of repoMigrations(ROOT)) {
      if (migration.version < '20261030000001') continue;
      expect(migration.sql, migration.file).not.toMatch(
        /create or replace function public\.delete_my_data\(/,
      );
    }
  });

  it('la comprobación de b18 va en la última migración, es la de docs/SUPABASE.md y no depende de lo que cambia', () => {
    const plan = loadPlan(ROOT, 'b18');
    expect(plan.migrations[0]?.check).toBeNull();
    const last = plan.migrations.at(-1);
    const check = last?.check ?? {};
    // Solo hechos de la estructura. Si la encuesta está prendida, cuántos días espera o hasta qué fecha cambia con el
    // tiempo, y con ello en la comprobación el plan no se podría volver a correr después de prenderla
    for (const column of [
      'encuesta_prendida',
      'dias_de_espera',
      'fecha_limite',
      'ajuste_prendido',
    ]) {
      expect(Object.keys(check)).not.toContain(column);
    }
    expect(check).toMatchObject({
      tabla_de_encuesta: 1,
      tabla_sin_permisos_directos: true,
      solo_se_agrega: 1,
      anonimo_entra: false,
      llave_lee_respuestas: false,
    });
    // La consulta de la migración y el primer bloque de SQL de la sección B18 de docs/SUPABASE.md son la misma
    const docs = readFileSync(join(ROOT, 'docs/SUPABASE.md'), 'utf8');
    const start = docs.indexOf('## Primeros alumnos y encuesta (B18)');
    const section = docs.slice(start, docs.indexOf('\n## ', start + 1));
    const block = /```sql\n([\s\S]*?)```/.exec(section)?.[1] ?? '';
    const squash = (sql: string) => sql.replace(/\s+/g, ' ').replace(/;\s*$/, '').trim();
    expect(block).not.toBe('');
    expect(squash(block)).toBe(squash(checkQuery(last?.sql ?? '') ?? ''));
    // Ninguna consulta de esa sección lee comentarios ni respuestas una por una (la sesión no los lee, 8.5)
    for (const query of section.match(/```sql\n[\s\S]*?```/g) ?? []) {
      expect(query).not.toMatch(
        /\bcomment\b|\banswers\b|from\s+public\.survey_responses|respondent_code|user_id/i,
      );
    }
  });

  it('un proyecto con B11 a B17 recibe las dos migraciones con b18, no publica nada y volver a correrlo no repite SQL', async () => {
    const fake = withB14BeforeB15();
    // Con b15 aplicado, como un proyecto que ya llegó a B17
    expect((await runReal(fake, 'b15')).code).toBe(0);
    const edgeBefore = JSON.stringify(
      [...fake.edge.entries()].map(([slug, fn]) => [slug, fn.version]),
    );
    const first = await runReal(fake, 'b18');
    expect(first.text).toContain('Todo en verde.');
    expect(first.code).toBe(0);
    expect(appliedSince(fake, 0).slice(-2)).toEqual(['first_week_survey', 'survey_erase']);
    // La comprobación de la última migración corre justo después de aplicarla, y de nuevo al final
    expect(first.text).toContain(
      'supabase/migrations/20261030000002_survey_erase.sql comprobación en verde',
    );
    // El plan no publica funciones de Edge, así que ninguna cambia de versión
    expect(first.text).not.toContain('Publicando');
    expect(JSON.stringify([...fake.edge.entries()].map(([slug, fn]) => [slug, fn.version]))).toBe(
      edgeBefore,
    );
    // Las seis funciones de la encuesta quedaron en la base y Borrar mis datos no cambió
    for (const name of [
      'my_survey_status',
      'submit_survey',
      'my_survey_response',
      'delete_my_survey_response',
      'admin_survey_summary',
      'admin_survey_responses',
    ]) {
      expect(fake.functions.get(name), name).toBeDefined();
    }
    expect(fake.functions.get('delete_my_data')?.body).not.toContain('survey');

    const before = fake.writes().length;
    const again = await runReal(fake, 'b18');
    expect(again.code).toBe(0);
    expect(appliedSince(fake, before)).toEqual([]);
    expect(again.text).toContain('ya aplicada, registrada como survey_erase');
  });

  it('b18 con --dry-run solo lee: dice qué aplicaría y no escribe nada', async () => {
    const fake = withB14BeforeB15();
    const dry = await runReal(fake, 'b18', true);
    expect(dry.code).toBe(0);
    expect(fake.writes()).toEqual([]);
    for (const name of ['first_week_survey', 'survey_erase']) {
      expect(dry.text).toContain(`${name}  se aplica`);
    }
    expect(dry.text).not.toContain('Publicando');
  });

  it('una comprobación de b18 en rojo detiene el plan sin aplicar nada, aunque las migraciones ya estén registradas', async () => {
    // Las dos registradas por el conector, pero sin la tabla: la base dice otra cosa que la historia
    const fake = withB14BeforeB15();
    for (const [index, name] of ['first_week_survey', 'survey_erase'].entries()) {
      fake.history.push({ version: `2026103000${String(index).padStart(4, '0')}`, name });
    }
    const run = await runReal(fake, 'b18');
    expect(run.code).toBe(1);
    expect(run.text).toContain('su comprobación sale en rojo');
    expect(run.text).toContain('tabla_de_encuesta dio 0 y debía dar 1');
    expect(fake.writes()).toEqual([]);
  });

  it('f2 lleva la migración del acceso gratis por mazo y los topes, sin SQL manual, Edge Functions ni secretos', () => {
    const plan = loadPlan(ROOT, 'f2');
    expect(plan.migrations.map((step) => step.name)).toEqual(['catalog_free_access_and_caps']);
    expect(plan.migrations.map((step) => step.kind)).toEqual(['migration']);
    expect(plan.functions).toEqual([]);
    expect(plan.secrets).toBeNull();
    expect(expectedFunctions(plan, repoMigrations(ROOT)).conflicts).toEqual([]);
    // No lleva delete ni drop, así que el conector también la puede aplicar (D-113)
    const code = (plan.migrations[0]?.sql ?? '').replace(/--.*$/gm, '');
    expect(code).not.toMatch(/\bdrop\b|\bdelete\s+from\b/i);
  });

  it('la comprobación de f2 va en su migración y solo mira la estructura, no lo que el admin cambia', () => {
    const last = loadPlan(ROOT, 'f2').migrations.at(-1);
    const check = last?.check ?? {};
    // Qué mazos están abiertos en Gratis y cuánto vale cada tope los cambia el admin, así que no entran. El plan se
    // podría volver a correr después de que los mueva
    for (const column of ['mazos_abiertos', 'tope_de_bajadas', 'tope_de_registros']) {
      expect(Object.keys(check)).not.toContain(column);
    }
    expect(check).toMatchObject({
      columnas_del_catalogo: 5,
      topes_sembrados: 4,
      topes_sin_permisos_directos: true,
      admin_abre_mazos: true,
      anonimo_abre_mazos: false,
      api_decide_por_mazo: false,
      api_lee_topes: false,
      dueno_confirma_con_version: true,
      alumno_sube_registros: true,
      alumno_sube_eventos: true,
    });
    // Son las columnas de la consulta con la que cierra la migración, ni una más ni una menos
    const query = checkQuery(last?.sql ?? '') ?? '';
    for (const column of Object.keys(check)) expect(query, column).toContain(` as ${column}`);
  });

  it('la migración de F2 redefine siete funciones de deck_catalog, y en b11 va después de ella y antes de la de inglés', () => {
    const plan = loadPlan(ROOT, 'b11');
    const catalog = plan.migrations.find((step) => step.name === 'deck_catalog');
    const freeAccess = loadPlan(ROOT, 'f2').migrations[0];
    if (!catalog || !freeAccess) throw new Error('Faltan los pasos del plan');
    const catalogDefs = new Map<string, FunctionDef>();
    const freeDefs = new Map<string, FunctionDef>();
    applyFunctionSql(catalog.sql, catalogDefs);
    applyFunctionSql(freeAccess.sql, freeDefs);
    for (const name of [
      'deck_catalog_can_read',
      'deck_catalog_list',
      'record_deck_download',
      'admin_deck_catalog_retire',
      'admin_deck_catalog_publish',
      'owner_confirm_deck_authorization',
      'admin_deck_catalog_overview',
    ]) {
      const before = catalogDefs.get(name);
      const after = freeDefs.get(name);
      expect(before && after && !sameDef(before, after), name).toBe(true);
    }
    const names = plan.migrations.map((step) => step.name);
    expect(names.indexOf('catalog_free_access_and_caps')).toBe(names.indexOf('deck_catalog') + 2);
    expect(names.indexOf('english_section')).toBe(
      names.indexOf('catalog_free_access_and_caps') + 1,
    );
  });

  it('sin la migración de F2 el plan b11 se detiene antes de escribir, que es por lo que la lleva', async () => {
    const plan = JSON.parse(readFileSync(join(ROOT, 'deploy/b11.json'), 'utf8')) as {
      migrations: { file: string }[];
    };
    plan.migrations = plan.migrations.filter(
      (step) => !step.file.endsWith('_catalog_free_access_and_caps.sql'),
    );
    const dir = mkdtempSync(join(tmpdir(), 'studiare-plan-'));
    dirs.push(dir);
    const path = join(dir, 'b11-sin-f2.json');
    writeFileSync(path, JSON.stringify(plan));

    const fake = onlyB10();
    const run = await runReal(fake, path);
    expect(run.code).toBe(1);
    for (const name of ['deck_catalog_list', 'record_deck_download']) {
      expect(run.text).toContain(
        `Aplicarla dejaría ${name} más vieja que supabase/migrations/20261024000001_catalog_free_access_and_caps.sql`,
      );
    }
    expect(fake.writes()).toEqual([]);
  });

  it('un proyecto con B11 de antes de F2 recibe la migración con f2, no publica nada y volver a correrlo no repite SQL', async () => {
    const fake = withB11BeforeEnglish();
    const edgeBefore = JSON.stringify(
      [...fake.edge.entries()].map(([slug, fn]) => [slug, fn.version]),
    );
    const first = await runReal(fake, 'f2');
    expect(first.text).toContain('Todo en verde.');
    expect(first.code).toBe(0);
    expect(appliedSince(fake, 0)).toEqual(['catalog_free_access_and_caps']);
    // La comprobación corre justo después de aplicarla, y de nuevo al final
    expect(first.text).toContain(
      'supabase/migrations/20261024000001_catalog_free_access_and_caps.sql comprobación en verde',
    );
    expect(first.text).not.toContain('Publicando');
    expect(JSON.stringify([...fake.edge.entries()].map(([slug, fn]) => [slug, fn.version]))).toBe(
      edgeBefore,
    );
    for (const name of [
      'admin_deck_catalog_set_free_access',
      'deck_catalog_can_download_deck',
      'owner_confirm_deck_version',
    ]) {
      expect(fake.functions.get(name), name).toBeDefined();
    }
    // platform_quota es la lectura de los topes y ningún rol la llama, así que la base la trae con sus permisos cerrados
    expect(fake.functions.get('platform_quota')?.body).toContain('deck_downloads_per_day');
    expect(fake.functions.get('sync_push_records')?.body).toContain('SY003');
    expect(fake.functions.get('sync_push_events')?.body).toContain('sync_events');

    const before = fake.writes().length;
    const again = await runReal(fake, 'f2');
    expect(again.code).toBe(0);
    expect(appliedSince(fake, before)).toEqual([]);
    expect(again.text).toContain('ya aplicada, registrada como catalog_free_access_and_caps');
  });

  it('f2 con --dry-run solo lee: dice qué aplicaría y no escribe nada', async () => {
    const fake = withB11BeforeEnglish();
    const dry = await runReal(fake, 'f2', true);
    expect(dry.code).toBe(0);
    expect(fake.writes()).toEqual([]);
    expect(dry.text).toContain('catalog_free_access_and_caps  se aplica');
    expect(dry.text).not.toContain('Publicando');
  });

  it('una comprobación de f2 en rojo detiene el plan sin aplicar nada, aunque la migración ya esté registrada', async () => {
    // Registrada por el conector, pero sin la tabla de topes: la base dice otra cosa que la historia
    const fake = withB11BeforeEnglish();
    fake.history.push({ version: '20261024000001', name: 'catalog_free_access_and_caps' });
    const run = await runReal(fake, 'f2');
    expect(run.code).toBe(1);
    expect(run.text).toContain('su comprobación sale en rojo');
    expect(run.text).toContain('topes_sembrados dio 0 y debía dar 4');
    expect(fake.writes()).toEqual([]);
  });

  it('b11 y b12 no llevan la migración de Borrar mis datos v4, porque sus archivos manuales ya traen la v4 y la dejan igual a ella', () => {
    // b11 y b12 no publican ni esperan nada más de B15. Solo sus archivos manuales traen la v4 de Borrar mis datos
    for (const plan of ['b11', 'b12']) {
      const loaded = loadPlan(ROOT, plan);
      expect(loaded.migrations.map((step) => step.file)).not.toContain(
        'supabase/migrations/20261029000004_delete_my_data_v4.sql',
      );
      expect(expectedFunctions(loaded, repoMigrations(ROOT)).conflicts, plan).toEqual([]);
    }
  });

  it('b11 y b12 sobre un proyecto de antes de B15 se detienen sin escribir, y después de b15 ya se pueden repetir', async () => {
    // Registrados desde antes, banco-b11.sql y ia-b12.sql no se vuelven a aplicar, y Borrar mis datos sigue en la
    // v3 en la base. La herramienta lo dice y no escribe nada hasta que b15 la deje en la v4
    for (const plan of ['b11', 'b12']) {
      const fake = withB14BeforeB15();
      const run = await runReal(fake, plan);
      expect(run.code, plan).toBe(1);
      expect(run.text, plan).toContain(
        'delete_my_data está distinta del repo en la base y ningún paso del plan la deja como supabase/migrations/20261029000004_delete_my_data_v4.sql',
      );
      expect(fake.writes(), plan).toEqual([]);
    }
    const fake = withB14BeforeB15();
    expect((await runReal(fake, 'b15')).code).toBe(0);
    for (const plan of ['b11', 'b12']) {
      const before = fake.writes().length;
      const again = await runReal(fake, plan);
      expect(again.code, plan).toBe(0);
      expect(appliedSince(fake, before), plan).toEqual([]);
    }
  });
});
