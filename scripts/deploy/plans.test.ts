import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
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
import { applyFunctionSql, type FunctionDef } from './sql.ts';
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

  it('los secretos de b10 son los ocho IDs que crea setup-test.ts, con su prefijo', () => {
    const plan = loadPlan(ROOT, 'b10');
    const names = [...PRICE_SPECS.map((spec) => spec.env), ...PORTAL_SPECS.map((spec) => spec.env)];
    expect(Object.keys(plan.secrets ?? {}).sort()).toEqual([...names].sort());
    for (const spec of PRICE_SPECS) expect(plan.secrets?.[spec.env]?.prefix).toBe('price_');
    for (const spec of PORTAL_SPECS) expect(plan.secrets?.[spec.env]?.prefix).toBe('bpc_');
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
