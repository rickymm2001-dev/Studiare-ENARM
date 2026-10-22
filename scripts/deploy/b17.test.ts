// El plan b17 (deploy/b17.json) contra la API de administración falsa (B17, 4.1, 4.2 y 4.6). No tiene
// migraciones. Vuelve a publicar las trece funciones, que ahora empaquetan las llaves nuevas de Supabase y el
// CORS con APP_ORIGINS, y espera dos secretos, APP_URL y APP_ORIGINS, que son direcciones públicas. Que corra
// completo después de b15 con todos los demás planes lo revisa plans.test.ts (FROM_B10). Aquí va lo propio de
// este plan.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { functionClosure } from './closure.ts';
import { expectedFunctions, runDeploy, type Io } from './deploy.ts';
import { createManagementClient } from './managementApi.ts';
import { loadPlan, repoMigrations } from './plan.ts';
import { STUDIARE_PROJECT_REF } from './supabase.ts';
import { fakeSupabase } from './testing/fakeSupabase.ts';

const ROOT = join(import.meta.dirname, '../..');
// Un token falso. No tiene la forma de uno real para que ningún escáner de secretos lo confunda
const TOKEN = 'token-falso-de-prueba-que-no-debe-salir-en-pantalla';

/** Las trece funciones de B15. Todas empaquetan las llaves (keys.ts) y la lectura de orígenes (origins.ts) */
const SLUGS = [
  'admin-reset-mfa',
  'ai-batch',
  'ai-proxy',
  'analytics-flush',
  'bank-sync',
  'cancel-subscription',
  'create-checkout',
  'create-portal-session',
  'email-unsubscribe',
  'monitoring-test',
  'payment-webhook-mercadopago',
  'payment-webhook-stripe',
  'send-emails',
];

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** Un proyecto con las trece funciones ya publicadas con su verify_jwt, como lo deja b15 */
function projectWithB15() {
  const plan = loadPlan(ROOT, 'b17');
  return fakeSupabase({
    ref: STUDIARE_PROJECT_REF,
    edge: Object.fromEntries(
      plan.functions.map((fn) => [fn.slug, { version: 4, verifyJwt: fn.verifyJwt }]),
    ),
  });
}

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

async function run(
  fake: ReturnType<typeof fakeSupabase>,
  options: { dryRun?: boolean; secretsFrom?: string } = {},
) {
  const output = collectIo();
  const code = await runDeploy({
    root: ROOT,
    plan: 'b17',
    dryRun: options.dryRun ?? false,
    only: null,
    yes: true,
    secretsFrom: options.secretsFrom ?? null,
    client: createManagementClient({ ref: fake.ref, token: TOKEN, fetch: fake.fetch }),
    io: output.io,
    authNote: 'prueba',
  });
  return { code, text: output.text() };
}

function secretsFile(values: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'studiare-b17-'));
  dirs.push(dir);
  const path = join(dir, 'b17-secretos.json');
  writeFileSync(path, JSON.stringify(values));
  return path;
}

const APP_URL = 'https://studiare.example.mx/';
const APP_ORIGINS = 'https://studiare.example.mx,https://rickymm2001-dev.github.io';

describe('el plan b17', () => {
  it('no lleva migraciones, vuelve a publicar las trece funciones y espera APP_URL y APP_ORIGINS', () => {
    const plan = loadPlan(ROOT, 'b17');
    expect(plan.migrations).toEqual([]);
    expect(plan.functions.map((fn) => fn.slug).toSorted()).toEqual(SLUGS);
    expect(Object.keys(plan.secrets ?? {})).toEqual(['APP_URL', 'APP_ORIGINS']);
    expect(plan.anonExecutable).toEqual({});
    expect(plan.overloads).toEqual({});
    expect(expectedFunctions(plan, repoMigrations(ROOT)).conflicts).toEqual([]);
  });

  it('cada función sale con el verify_jwt que dice su index.ts, como en todos los planes', () => {
    const plan = loadPlan(ROOT, 'b17');
    for (const fn of plan.functions) {
      const index = readFileSync(join(ROOT, 'supabase/functions', fn.slug, 'index.ts'), 'utf8');
      // Las que verifican la sesión lo dicen sin --no-verify-jwt en su comentario de despliegue
      expect(fn.verifyJwt, fn.slug).toBe(!index.includes('--no-verify-jwt'));
    }
    const jwt = Object.fromEntries(plan.functions.map((fn) => [fn.slug, fn.verifyJwt]));
    expect(jwt).toMatchObject({
      'create-checkout': true,
      'create-portal-session': true,
      'cancel-subscription': true,
      'admin-reset-mfa': true,
      'monitoring-test': true,
      'ai-proxy': false,
      'ai-batch': false,
      'bank-sync': false,
      'payment-webhook-stripe': false,
      'payment-webhook-mercadopago': false,
    });
  });

  it('todas las funciones del plan empaquetan los archivos que cambian, que es por lo que se vuelven a publicar', () => {
    for (const fn of loadPlan(ROOT, 'b17').functions) {
      const files = functionClosure(ROOT, fn.slug).files.map((file) => file.path);
      expect(files, fn.slug).toContain('supabase/functions/_shared/keys.ts');
      expect(files, fn.slug).toContain('supabase/functions/_shared/origins.ts');
    }
  });

  it('no trae ninguna llave ni dirección real, y los secretos que pide son direcciones públicas', () => {
    const text = readFileSync(join(ROOT, 'deploy/b17.json'), 'utf8');
    expect(text).not.toMatch(/sb_secret_|sb_publishable_|eyJ|sk_|rk_|whsec_|re_[A-Za-z0-9]{8}/);
    expect(text).not.toContain('ENARM_ANTHROPIC_KEY');
  });

  it('APP_URL acepta una dirección https con o sin ruta y rechaza lo demás', () => {
    const pattern = loadPlan(ROOT, 'b17').secrets?.APP_URL?.pattern;
    for (const good of [
      'https://studiare.example.mx/',
      'https://studiare.example.mx',
      'https://rickymm2001-dev.github.io/Studiare-ENARM/',
      'https://localhost.example.mx:8443/',
    ]) {
      expect(pattern?.test(good), good).toBe(true);
    }
    for (const bad of [
      'http://studiare.example.mx/',
      'https://*.example.mx/',
      'https://studiare.example.mx/ app',
      'studiare.example.mx',
      '',
      'https://Studiare.example.mx/',
    ]) {
      expect(pattern?.test(bad), bad).toBe(false);
    }
  });

  it('APP_ORIGINS acepta orígenes https separados por comas y nunca una dirección de pages.dev', () => {
    const pattern = loadPlan(ROOT, 'b17').secrets?.APP_ORIGINS?.pattern;
    for (const good of [
      'https://studiare.example.mx',
      APP_ORIGINS,
      'https://studiare.example.mx:8443',
      // Otro dominio que solo se parece a pages.dev
      'https://notpages.dev',
    ]) {
      expect(pattern?.test(good), good).toBe(true);
    }
    for (const bad of [
      '',
      'http://studiare.example.mx',
      'https://studiare.example.mx/',
      'https://studiare.example.mx/app',
      'https://*.example.mx',
      'https://studiare.example.mx,',
      'https://studiare.pages.dev',
      'https://abc123.studiare.pages.dev',
      'https://pages.dev',
      'https://studiare.example.mx,https://abc123.studiare.pages.dev',
      'https://studiare.pages.dev:8443,https://studiare.example.mx',
    ]) {
      expect(pattern?.test(bad), bad).toBe(false);
    }
  });
});

describe('el plan b17 contra la API falsa', () => {
  it('publica las trece funciones con su verify_jwt, sin aplicar SQL, y cada una lleva keys.ts y origins.ts', async () => {
    const fake = projectWithB15();
    const first = await run(fake);
    expect(first.text).toContain('Todo en verde.');
    expect(first.code).toBe(0);
    // Ni una migración ni una consulta de escritura de SQL
    expect(fake.writes().filter((request) => request.path === '/database/migrations')).toEqual([]);
    const plan = loadPlan(ROOT, 'b17');
    for (const fn of plan.functions) {
      const published = fake.edge.get(fn.slug);
      expect(published, fn.slug).toMatchObject({
        version: 5,
        verifyJwt: fn.verifyJwt,
        status: 'ACTIVE',
      });
      const names = published?.files.map((file) => file.name) ?? [];
      expect(names, fn.slug).toContain('supabase/functions/_shared/keys.ts');
      expect(names, fn.slug).toContain('supabase/functions/_shared/origins.ts');
    }
    // Lo que sube es el código del repo, no una copia
    const sent = fake.edge
      .get('ai-proxy')
      ?.files.find((file) => file.name === 'supabase/functions/_shared/keys.ts');
    expect(sent?.content).toBe(
      readFileSync(join(ROOT, 'supabase/functions/_shared/keys.ts'), 'utf8'),
    );
  });

  it('volver a correrlo vuelve a publicar y tampoco aplica SQL', async () => {
    const fake = projectWithB15();
    expect((await run(fake)).code).toBe(0);
    const before = fake.writes().length;
    const again = await run(fake);
    expect(again.code).toBe(0);
    expect(
      fake
        .writes()
        .slice(before)
        .filter((request) => request.path === '/database/migrations'),
    ).toEqual([]);
    expect(fake.edge.get('create-checkout')?.version).toBe(6);
  });

  it('con --dry-run solo lee: dice qué publicaría y no escribe nada', async () => {
    const fake = projectWithB15();
    const dry = await run(fake, { dryRun: true });
    expect(dry.code).toBe(0);
    expect(fake.writes()).toEqual([]);
    expect(dry.text).toContain('create-checkout');
    expect(dry.text).toContain('ai-proxy');
    expect(dry.text).not.toContain('Publicando');
    expect(fake.edge.get('create-checkout')?.version).toBe(4);
  });

  it('un proyecto sin las funciones de B15 las crea en la versión 1 con su verify_jwt', async () => {
    const fake = fakeSupabase({ ref: STUDIARE_PROJECT_REF });
    const result = await run(fake);
    expect(result.code).toBe(0);
    expect(fake.edge.get('send-emails')).toMatchObject({ version: 1, verifyJwt: false });
    expect(fake.edge.get('monitoring-test')).toMatchObject({ version: 1, verifyJwt: true });
  });

  it('pone APP_URL y APP_ORIGINS con --secrets-from sin mostrar los valores', async () => {
    const fake = projectWithB15();
    const path = secretsFile({ APP_URL, APP_ORIGINS });
    const dry = await run(fake, { secretsFrom: path, dryRun: true });
    expect(dry.code).toBe(0);
    expect(fake.secrets.size).toBe(0);
    const real = await run(fake, { secretsFrom: path });
    expect(real.code).toBe(0);
    expect([...fake.secrets.keys()].toSorted()).toEqual(['APP_ORIGINS', 'APP_URL']);
    expect(real.text).toContain('APP_ORIGINS');
    expect(real.text).not.toContain('studiare.example.mx');
    // Poner secretos no publica nada: las funciones los leen en su siguiente arranque
    expect(fake.edge.get('ai-proxy')?.version).toBe(4);
  });

  it('rechaza sin escribir un APP_ORIGINS con pages.dev, uno con ruta, y un archivo al que le falta algo', async () => {
    const cases: Record<string, Record<string, string>> = {
      'una vista previa de pages.dev': {
        APP_URL,
        APP_ORIGINS: 'https://studiare.example.mx,https://abc123.studiare.pages.dev',
      },
      'un origen con ruta': { APP_URL, APP_ORIGINS: 'https://studiare.example.mx/app' },
      'un APP_URL con comodín': { APP_URL: 'https://*.example.mx/', APP_ORIGINS },
      'sin APP_ORIGINS': { APP_URL },
      'sin APP_URL': { APP_ORIGINS },
      'un secreto que el plan no espera': {
        APP_URL,
        APP_ORIGINS,
        OTRO_SECRETO: 'valor-secreto-1234',
      },
    };
    for (const [label, values] of Object.entries(cases)) {
      const fake = projectWithB15();
      const result = await run(fake, { secretsFrom: secretsFile(values) });
      expect(result.code, label).toBe(1);
      expect(fake.secrets.size, label).toBe(0);
      expect(result.text, label).toContain('No se escribió nada');
      for (const value of Object.values(values)) {
        expect(result.text, label).not.toContain(value);
      }
    }
  });
});
