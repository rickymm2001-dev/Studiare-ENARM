// Los planes de despliegue de deploy/*.json (docs/DESPLIEGUE.md). Un plan dice, en orden, qué SQL del
// repo va al proyecto (migraciones completas y piezas de supabase/manual), qué Edge Functions se
// publican y con qué verify_jwt, y qué secretos espera. Esto solo lee y valida. No toca la red.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { z } from 'zod';
import { FUNCTIONS_DIR } from './closure.ts';

export const PLANS_DIR = 'deploy';
export const MIGRATIONS_DIR = 'supabase/migrations';
export const MANUAL_DIR = 'supabase/manual';

/** Nombre de un secreto de las Edge Functions. La API no deja que empiece con SUPABASE_ */
export const SECRET_NAME = /^(?!SUPABASE_)[A-Z][A-Z0-9_]*$/;

const MIGRATION_FILE = /^supabase\/migrations\/(\d{14})_([a-z0-9_]+)\.sql$/;
const MANUAL_FILE = /^supabase\/manual\/([a-z0-9-]+)\.sql$/;

const CheckValue = z.union([z.boolean(), z.string(), z.number(), z.null()]);

const SqlStepSchema = z.strictObject({
  /** Desde la raíz del repo, en supabase/migrations o en supabase/manual */
  file: z.string(),
  /** El nombre con el que queda en la historia. Por omisión, el del archivo sin la versión */
  name: z
    .string()
    .regex(/^[a-z0-9_]+$/)
    .optional(),
  /** Otros nombres con los que ya pudo quedar registrada, además de los que se deducen solos */
  recordedAs: z.array(z.string().min(1)).optional(),
  /** Lo que debe dar la consulta de comprobación del final del archivo, columna por columna */
  check: z.record(z.string(), CheckValue).optional(),
  note: z.string().optional(),
});

const FunctionStepSchema = z.strictObject({
  slug: z.string().regex(/^[a-z][a-z0-9-]*$/),
  verifyJwt: z.boolean(),
  note: z.string().optional(),
});

const SecretRuleSchema = z.strictObject({
  /** El valor debe empezar así, por ejemplo price_ para un precio de Stripe */
  prefix: z.string().optional(),
  note: z.string().optional(),
});

const PlanSchema = z.strictObject({
  description: z.string().min(1),
  migrations: z.array(SqlStepSchema).default([]),
  functions: z.array(FunctionStepSchema).default([]),
  secrets: z.record(z.string().regex(SECRET_NAME), SecretRuleSchema).optional(),
  /** Funciones que pueden quedar ejecutables por anon aunque el archivo no se lo conceda, con su porqué */
  anonExecutable: z.record(z.string(), z.string().min(1)).optional(),
});

export type CheckExpectation = Record<string, z.infer<typeof CheckValue>>;

export interface SqlStep {
  file: string;
  kind: 'migration' | 'manual';
  /** La versión del archivo, solo en las migraciones */
  version: string | null;
  /** El nombre con el que se registra al aplicarlo */
  name: string;
  recordedAs: string[];
  check: CheckExpectation | null;
  note: string | null;
  sql: string;
  bytes: number;
}

export interface FunctionStep {
  slug: string;
  verifyJwt: boolean;
  note: string | null;
}

export interface Plan {
  id: string;
  file: string;
  description: string;
  migrations: SqlStep[];
  functions: FunctionStep[];
  secrets: Record<string, { prefix: string | null }> | null;
  anonExecutable: Record<string, string>;
}

export class PlanError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PlanError';
  }
}

/** b10 es deploy/b10.json. También acepta una ruta a un .json */
export function planPath(nameOrPath: string): string {
  return /^[a-z0-9-]+$/.test(nameOrPath) ? `${PLANS_DIR}/${nameOrPath}.json` : nameOrPath;
}

/** El nombre de historia que toca a un archivo, como lo pone el conector de Supabase */
export function defaultStepName(file: string): string {
  const migration = MIGRATION_FILE.exec(file);
  if (migration?.[2]) return migration[2];
  const manual = MANUAL_FILE.exec(file);
  if (manual?.[1]) return `manual_${manual[1].replace(/-/g, '_')}`;
  throw new PlanError(`${file} no está en ${MIGRATIONS_DIR} ni en ${MANUAL_DIR}`);
}

export function loadPlan(root: string, nameOrPath: string): Plan {
  const file = planPath(nameOrPath);
  const full = resolve(root, file);
  if (!existsSync(full)) throw new PlanError(`No existe el plan ${file}`);
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(full, 'utf8'));
  } catch {
    throw new PlanError(`${file} no es JSON válido`);
  }
  const parsed = PlanSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || 'raíz'} ${issue.message}`)
      .join('. ');
    throw new PlanError(`${file} no tiene la forma de un plan. ${issues}`);
  }
  const data = parsed.data;

  const migrations = data.migrations.map((step): SqlStep => {
    const migration = MIGRATION_FILE.exec(step.file);
    if (!migration && !MANUAL_FILE.test(step.file)) {
      throw new PlanError(
        `${step.file} debe ser una migración de ${MIGRATIONS_DIR} (versión de 14 dígitos) o un archivo de ${MANUAL_DIR}`,
      );
    }
    const path = join(root, step.file);
    if (!existsSync(path)) throw new PlanError(`No existe ${step.file}`);
    const sql = readFileSync(path, 'utf8');
    return {
      file: step.file,
      kind: migration ? 'migration' : 'manual',
      version: migration?.[1] ?? null,
      name: step.name ?? defaultStepName(step.file),
      recordedAs: step.recordedAs ?? [],
      check: step.check ?? null,
      note: step.note ?? null,
      sql,
      bytes: Buffer.byteLength(sql, 'utf8'),
    };
  });
  const files = migrations.map((step) => step.file);
  const repeatedFile = files.find((value, index) => files.indexOf(value) !== index);
  if (repeatedFile) throw new PlanError(`${repeatedFile} aparece dos veces en el plan`);
  const names = migrations.map((step) => step.name);
  const repeatedName = names.find((value, index) => names.indexOf(value) !== index);
  if (repeatedName) throw new PlanError(`Dos pasos del plan se registrarían como ${repeatedName}`);

  const functions = data.functions.map((step): FunctionStep => {
    if (!existsSync(join(root, FUNCTIONS_DIR, step.slug, 'index.ts'))) {
      throw new PlanError(`No existe ${FUNCTIONS_DIR}/${step.slug}/index.ts`);
    }
    return { slug: step.slug, verifyJwt: step.verifyJwt, note: step.note ?? null };
  });
  const slugs = functions.map((step) => step.slug);
  const repeatedSlug = slugs.find((value, index) => slugs.indexOf(value) !== index);
  if (repeatedSlug) throw new PlanError(`La función ${repeatedSlug} aparece dos veces en el plan`);

  return {
    id: basename(file, '.json'),
    file,
    description: data.description,
    migrations,
    functions,
    secrets: data.secrets
      ? Object.fromEntries(
          Object.entries(data.secrets).map(([name, rule]) => [
            name,
            { prefix: rule.prefix ?? null },
          ]),
        )
      : null,
    anonExecutable: data.anonExecutable ?? {},
  };
}

/** Todas las migraciones del repo en orden de versión, con su texto */
export function repoMigrations(root: string): { file: string; version: string; sql: string }[] {
  return readdirSync(join(root, MIGRATIONS_DIR))
    .map((name) => `${MIGRATIONS_DIR}/${name}`)
    .filter((file) => MIGRATION_FILE.test(file))
    .sort()
    .map((file) => ({
      file,
      version: MIGRATION_FILE.exec(file)?.[1] ?? '',
      sql: readFileSync(join(root, file), 'utf8'),
    }));
}
