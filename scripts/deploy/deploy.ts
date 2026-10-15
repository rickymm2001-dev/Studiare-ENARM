// Despliegue a Supabase desde los archivos del repo (docs/DESPLIEGUE.md). Lee un plan de deploy/,
// averigua qué ya está en el proyecto, aplica solo lo que falta, publica las Edge Functions y comprueba
// el resultado. Con --secrets-from pasa al paso de secretos de secrets.ts.
//
// Cómo decide si un SQL ya está aplicado, para nunca repetirlo a ciegas
//   - Registrado. La historia de migraciones tiene su versión, su nombre o un trozo de su nombre como
//     lo deja el conector (billing_plans_1 a billing_plans_5). Se salta
//   - Sin registro, pero cada función que crea ya está en la base con la huella del repo y, si es un
//     archivo manual con comprobación, la comprobación sale en verde. Se salta
//   - Lo demás se aplica. Todo SQL del repo es idempotente, pero si aplicarlo dejaría una función en una
//     versión más vieja que la del repo, o si uno registrado quedó distinto y nadie lo corrige, no se
//     escribe nada y se explica por qué
// La versión esperada de cada función es la de la última migración del repo que la define. Si solo vive
// en supabase/manual, la del último archivo manual del plan.
import { functionClosure, type FunctionClosure } from './closure.ts';
import {
  ManagementApiError,
  type FunctionInfo,
  type ManagementClient,
  type MigrationRecord,
  type Row,
} from './managementApi.ts';
import {
  confirmWrites,
  errorText,
  kb,
  plural,
  reportError,
  type DeployOptions,
  type Io,
} from './output.ts';
import {
  PlanError,
  loadPlan,
  repoMigrations,
  type CheckExpectation,
  type Plan,
  type SqlStep,
} from './plan.ts';
import { runSecrets } from './secrets.ts';
import { anonGrants, checkQuery, extractFunctions, fingerprint, fingerprintQuery } from './sql.ts';

export type { DeployOptions, Io } from './output.ts';

// ---------------------------------------------------------------------------------------------
// Huellas esperadas

export interface Expected {
  fingerprint: string;
  file: string;
}

interface StepFunction {
  name: string;
  own: string;
}

/** Las funciones de public que crea un SQL. Si se crea dos veces, cuenta la última */
function stepFunctions(sql: string): StepFunction[] {
  const byName = new Map<string, string>();
  for (const definition of extractFunctions(sql)) {
    if (definition.schema !== 'public' || definition.body === null) continue;
    byName.set(definition.name, fingerprint(definition.body));
  }
  return [...byName].map(([name, own]) => ({ name, own }));
}

/**
 * La versión esperada de cada función que toca el plan, y los archivos manuales que traen una versión
 * distinta de la última migración, que aplicarlos regresaría
 */
export function expectedFunctions(
  plan: Plan,
  migrations: readonly { file: string; sql: string }[],
): { expected: Map<string, Expected>; conflicts: string[] } {
  const latest = new Map<string, Expected>();
  for (const migration of migrations) {
    for (const fn of stepFunctions(migration.sql)) {
      latest.set(fn.name, { fingerprint: fn.own, file: migration.file });
    }
  }
  const manual = new Map<string, Expected>();
  const conflicts: string[] = [];
  for (const step of plan.migrations) {
    if (step.kind !== 'manual') continue;
    for (const fn of stepFunctions(step.sql)) {
      const fromMigration = latest.get(fn.name);
      if (fromMigration && fromMigration.fingerprint !== fn.own) {
        conflicts.push(
          `${step.file} trae ${fn.name} distinta de ${fromMigration.file}, la última migración que la define. Aplicarlo la regresaría`,
        );
      }
      manual.set(fn.name, { fingerprint: fn.own, file: step.file });
    }
  }
  const expected = new Map<string, Expected>();
  for (const step of plan.migrations) {
    for (const fn of stepFunctions(step.sql)) {
      const value = latest.get(fn.name) ?? manual.get(fn.name);
      if (value) expected.set(fn.name, value);
    }
  }
  return { expected, conflicts };
}

// ---------------------------------------------------------------------------------------------
// Estado del proyecto

export interface DbFunction {
  fingerprint: string;
  anon: boolean;
}

const truthy = (value: unknown) => value === true || value === 't' || value === 'true';

export function parseFunctionRows(rows: readonly Row[]): Map<string, DbFunction[]> {
  const result = new Map<string, DbFunction[]>();
  for (const row of rows) {
    if (typeof row.name !== 'string' || typeof row.fingerprint !== 'string') continue;
    const list = result.get(row.name) ?? [];
    list.push({ fingerprint: row.fingerprint, anon: truthy(row.anon) });
    result.set(row.name, list);
  }
  return result;
}

/** Un trozo como lo nombra el conector, por ejemplo billing_plans_1 o privacy_a_freno_bitacora */
function isChunkOf(recorded: string, base: string): boolean {
  if (!recorded.startsWith(`${base}_`)) return false;
  return /^(?:\d+|[a-z])(?:_|$)/.test(recorded.slice(base.length + 1));
}

/** Las filas de la historia que corresponden a un paso, por versión, por nombre o por trozo */
export function recordedMatches(
  step: SqlStep,
  history: readonly MigrationRecord[],
): MigrationRecord[] {
  return history.filter(
    (record) =>
      (step.version !== null && record.version === step.version) ||
      record.name === step.name ||
      step.recordedAs.includes(record.name) ||
      isChunkOf(record.name, step.name),
  );
}

function sameValue(actual: unknown, expected: CheckExpectation[string]): boolean {
  if (typeof expected === 'boolean') return truthy(actual) === expected && actual !== null;
  if (expected === null) return actual === null;
  return String(actual) === String(expected);
}

/** Las columnas de la comprobación que no dieron lo esperado. Vacío es que salió en verde */
export function checkDifferences(row: Row | undefined, expected: CheckExpectation): string[] {
  return Object.entries(expected)
    .filter(([column, value]) => !sameValue(row?.[column], value))
    .map(
      ([column, value]) =>
        `${column} dio ${JSON.stringify(row?.[column] ?? null)} y debía dar ${JSON.stringify(value)}`,
    );
}

export interface StepDecision {
  step: SqlStep;
  index: number;
  action: 'apply' | 'skip';
  reason: string;
  notes: string[];
  problems: string[];
}

export interface ProjectState {
  history: MigrationRecord[];
  functions: Map<string, DbFunction[]>;
  /** Lo que no salió de la comprobación de cada archivo manual, por archivo */
  checks: Map<string, string[]>;
}

function describeRecords(records: readonly MigrationRecord[]): string {
  return records.map((record) => `${record.name} (${record.version})`).join(', ');
}

/** Qué hacer con cada SQL del plan, con lo que hay hoy en el proyecto */
export function decideSteps(
  plan: Plan,
  expected: Map<string, Expected>,
  state: ProjectState,
): StepDecision[] {
  const inDb = (name: string) => {
    const want = expected.get(name);
    return (
      want !== undefined &&
      (state.functions.get(name) ?? []).some((row) => row.fingerprint === want.fingerprint)
    );
  };
  const decisions: StepDecision[] = plan.migrations.map((step, index) => {
    const functions = stepFunctions(step.sql);
    const recorded = recordedMatches(step, state.history);
    const checkProblems = step.check ? (state.checks.get(step.file) ?? []) : [];
    const differing = functions.filter((fn) => !inDb(fn.name)).map((fn) => fn.name);
    if (recorded.length > 0) {
      // Las funciones que quedaron distintas se revisan abajo, cuando ya se sabe qué pasos se aplican
      return {
        step,
        index,
        action: 'skip',
        reason: `ya aplicada, registrada como ${describeRecords(recorded)}`,
        notes: [],
        problems: [],
      };
    }
    const byFingerprint = functions.length > 0 && differing.length === 0;
    const byCheck = step.check !== null && checkProblems.length === 0;
    if ((byFingerprint || byCheck) && differing.length === 0 && checkProblems.length === 0) {
      const how = [
        byFingerprint
          ? `${plural(functions.length, 'función igual', 'funciones iguales')} al repo`
          : '',
        byCheck ? 'comprobación en verde' : '',
      ].filter((part) => part !== '');
      return {
        step,
        index,
        action: 'skip',
        reason: `ya estaba aplicada sin registro (${how.join(' y ')})`,
        notes: [],
        problems: [],
      };
    }
    const why = [
      differing.length > 0
        ? plural(differing.length, 'función distinta o faltante', 'funciones distintas o faltantes')
        : '',
      checkProblems.length > 0 ? `comprobación en rojo (${checkProblems.join(', ')})` : '',
    ].filter((part) => part !== '');
    return {
      step,
      index,
      action: 'apply',
      reason: why.length > 0 ? `se aplica, ${why.join(' y ')}` : 'se aplica, no está registrada',
      notes: [],
      problems: [],
    };
  });

  // Quién corrige qué. Solo cuenta un paso posterior que sí se aplica y deja la versión esperada
  const fixer = (after: number, name: string): StepDecision | undefined => {
    const want = expected.get(name);
    return decisions.find(
      (decision) =>
        decision.index > after &&
        decision.action === 'apply' &&
        want !== undefined &&
        stepFunctions(decision.step.sql).some(
          (fn) => fn.name === name && fn.own === want.fingerprint,
        ),
    );
  };
  for (const decision of decisions) {
    for (const fn of stepFunctions(decision.step.sql)) {
      const want = expected.get(fn.name);
      if (!want) continue;
      if (decision.action === 'skip' && !inDb(fn.name)) {
        const later = fixer(decision.index, fn.name);
        if (later) {
          decision.notes.push(
            `${fn.name} está distinta del repo en la base. La corrige el paso ${later.index + 1} (${later.step.file})`,
          );
        } else {
          decision.problems.push(
            `${fn.name} está distinta del repo en la base y ningún paso del plan la deja como ${want.file}`,
          );
        }
      }
      if (
        decision.action === 'apply' &&
        fn.own !== want.fingerprint &&
        !fixer(decision.index, fn.name)
      ) {
        decision.problems.push(
          `Aplicarla dejaría ${fn.name} más vieja que ${want.file}. Agrega ese archivo al plan después de este paso`,
        );
      }
    }
  }
  return decisions;
}

/** Lo que se comprueba después de aplicar. Cada línea es un problema */
export function verifyFunctions(
  plan: Plan,
  expected: Map<string, Expected>,
  functions: Map<string, DbFunction[]>,
): { problems: string[]; notes: string[]; same: number } {
  const granted = new Set<string>();
  let grantsAll = false;
  for (const step of plan.migrations) {
    const grants = anonGrants(step.sql);
    grantsAll ||= grants.all;
    for (const name of grants.functions) granted.add(name);
  }
  const problems: string[] = [];
  const notes: string[] = [];
  let same = 0;
  for (const [name, want] of [...expected].sort(([a], [b]) => a.localeCompare(b))) {
    const rows = functions.get(name) ?? [];
    const match = rows.find((row) => row.fingerprint === want.fingerprint);
    if (rows.length > 1)
      notes.push(`${name} tiene ${rows.length} versiones en la base (sobrecarga)`);
    if (!match) {
      problems.push(
        rows.length === 0
          ? `${name} no existe en la base`
          : `${name} quedó distinta de ${want.file}`,
      );
      continue;
    }
    same += 1;
    if (!match.anon) continue;
    const reason = plan.anonExecutable[name];
    if (reason) notes.push(`${name} sigue abierta a anon a propósito. ${reason}`);
    else if (!granted.has(name) && !grantsAll) {
      problems.push(`anon puede ejecutar ${name} y ningún archivo del plan se lo concede`);
    }
  }
  return { problems, notes, same };
}

// ---------------------------------------------------------------------------------------------
// Plan

interface LocalPlan {
  plan: Plan;
  closures: Map<string, FunctionClosure>;
  expected: Map<string, Expected>;
  conflicts: string[];
}

function loadLocal(root: string, name: string): LocalPlan {
  const plan = loadPlan(root, name);
  for (const step of plan.migrations) {
    if (step.check && checkQuery(step.sql) === null) {
      throw new PlanError(`${step.file} no trae la consulta de Comprobación que pide el plan`);
    }
  }
  const closures = new Map(
    plan.functions.map((step) => [step.slug, functionClosure(root, step.slug)] as const),
  );
  const { expected, conflicts } = expectedFunctions(plan, repoMigrations(root));
  return { plan, closures, expected, conflicts };
}

function printLocal(io: Io, local: LocalPlan, only: DeployOptions['only']) {
  const { plan } = local;
  if (only !== 'functions' && plan.migrations.length > 0) {
    io.out('SQL, en orden');
    plan.migrations.forEach((step, index) => {
      const count = stepFunctions(step.sql).length;
      const extras = [
        kb(step.bytes),
        plural(count, 'función', 'funciones'),
        step.check ? 'con comprobación' : '',
        `se registra como ${step.name}`,
      ].filter((part) => part !== '');
      io.out(`  ${index + 1}. ${step.file}  ${extras.join(', ')}`);
      if (step.note) io.out(`     ${step.note}`);
    });
  }
  if (only !== 'migrations' && plan.functions.length > 0) {
    io.out('Edge Functions');
    for (const step of plan.functions) {
      const closure = local.closures.get(step.slug);
      if (!closure) continue;
      const total = closure.files.reduce((sum, file) => sum + file.bytes, 0);
      io.out(
        `  ${step.slug}  verify_jwt ${String(step.verifyJwt)}, ${plural(closure.files.length, 'archivo', 'archivos')}, ${kb(total)}`,
      );
      for (const file of closure.files) io.out(`    ${file.path}  ${kb(file.bytes)}`);
      if (closure.external.length > 0) {
        io.out(`    Importaciones externas que baja el servidor ${closure.external.join(', ')}`);
      }
      if (step.note) io.out(`    ${step.note}`);
    }
  }
}

async function readState(
  client: ManagementClient,
  local: LocalPlan,
  withHistory: boolean,
): Promise<ProjectState> {
  // Primero la historia, que es un GET. Con un token malo se detiene ahí, antes de cualquier consulta
  const history = withHistory ? await client.listMigrations() : [];
  const names = [...local.expected.keys()].sort();
  const functions =
    names.length > 0
      ? parseFunctionRows(await client.readQuery(fingerprintQuery(names)))
      : new Map<string, DbFunction[]>();
  const checks = new Map<string, string[]>();
  for (const step of local.plan.migrations) {
    const query = step.check ? checkQuery(step.sql) : null;
    if (!step.check || query === null) continue;
    try {
      checks.set(step.file, checkDifferences((await client.readQuery(query))[0], step.check));
    } catch (error) {
      // Antes de aplicar es normal que falle si falta un objeto. Cuenta como comprobación en rojo
      if (error instanceof ManagementApiError && [401, 403, 429].includes(error.status))
        throw error;
      checks.set(step.file, [`la consulta falló, ${errorText(error)}`]);
    }
  }
  return { history, functions, checks };
}

async function runPlan(options: DeployOptions): Promise<number> {
  const { io, client } = options;
  let local: LocalPlan;
  try {
    local = loadLocal(options.root, options.plan ?? '');
  } catch (error) {
    reportError(io, 'El plan no sirve', error);
    return 1;
  }
  const { plan } = local;
  const doSql = options.only !== 'functions' && plan.migrations.length > 0;
  const doFunctions = options.only !== 'migrations' && plan.functions.length > 0;
  io.out(`Plan ${plan.id} en el proyecto ${client.ref}, ${options.authNote}`);
  io.out(plan.description);
  io.out('');
  printLocal(io, local, options.only);
  if (doSql && local.conflicts.length > 0) {
    for (const conflict of local.conflicts) io.err(conflict);
    return 1;
  }

  // Lo que hay hoy en el proyecto. Solo lecturas
  io.out('');
  io.out('Estado del proyecto');
  let decisions: StepDecision[] = [];
  const before = new Map<string, FunctionInfo | null>();
  try {
    if (doSql) {
      const state = await readState(client, local, true);
      decisions = decideSteps(plan, local.expected, state);
      for (const decision of decisions) {
        io.out(`  ${decision.index + 1}. ${decision.step.name}  ${decision.reason}`);
        for (const note of decision.notes) io.out(`     ${note}`);
        for (const problem of decision.problems) io.err(`     ${problem}`);
      }
    }
    if (doFunctions) {
      for (const step of plan.functions) {
        const current = await client.getFunction(step.slug);
        before.set(step.slug, current);
        io.out(
          current
            ? `  ${step.slug}  versión ${current.version}, verify_jwt ${String(current.verifyJwt)}. Se publica la del repo`
            : `  ${step.slug}  no existe todavía. Se crea`,
        );
      }
    }
  } catch (error) {
    reportError(io, 'No pude leer el estado del proyecto', error);
    io.err('Sin eso no sé qué ya está aplicado, así que no sigo.');
    return 1;
  }

  const blocking = decisions.flatMap((decision) => decision.problems);
  if (options.dryRun) {
    io.out('');
    io.out(
      blocking.length > 0
        ? 'Simulación. No se escribió nada. El plan tiene problemas que impiden aplicarlo.'
        : 'Simulación. No se escribió nada.',
    );
    return blocking.length > 0 ? 1 : 0;
  }
  if (blocking.length > 0) {
    io.err('No se escribió nada. Corrige el plan o la base y vuelve a correrlo.');
    return 1;
  }

  const toApply = decisions.filter((decision) => decision.action === 'apply');
  const writes = [
    ...toApply.map(
      (decision) => `SQL ${decision.index + 1}. ${decision.step.file} como ${decision.step.name}`,
    ),
    ...(doFunctions
      ? plan.functions.map(
          (step) => `Función ${step.slug} con verify_jwt ${String(step.verifyJwt)}`,
        )
      : []),
  ];
  if (writes.length > 0 && !(await confirmWrites(options, writes))) return 1;

  const problems: string[] = [];
  const summary: string[] = [];

  // SQL en orden. Se detiene en el primero que falle
  if (doSql) {
    io.out('');
    for (const decision of toApply) {
      io.out(`Aplicando ${decision.index + 1}. ${decision.step.file}`);
      try {
        await client.applyMigration({ name: decision.step.name, query: decision.step.sql });
      } catch (error) {
        reportError(io, `Falló ${decision.step.file}`, error);
        io.err('Lo que sigue en el plan no se aplicó.');
        return 1;
      }
    }
    summary.push(`SQL aplicado ${toApply.length}, ya estaba ${decisions.length - toApply.length}`);

    // Comprobación con huellas, permisos de anon y las consultas de los archivos manuales
    io.out('');
    io.out('Comprobación de la base');
    try {
      const after = await readState(client, local, false);
      const verified = verifyFunctions(plan, local.expected, after.functions);
      for (const note of verified.notes) io.out(`  ${note}`);
      problems.push(...verified.problems);
      for (const [file, differences] of after.checks) {
        if (differences.length === 0) io.out(`  ${file} comprobación en verde`);
        else problems.push(`${file} comprobación en rojo, ${differences.join(', ')}`);
      }
      io.out(
        `  ${plural(verified.same, 'función igual', 'funciones iguales')} al repo de ${local.expected.size}`,
      );
      summary.push(`Huellas ${verified.same} de ${local.expected.size} iguales al repo`);
    } catch (error) {
      reportError(io, 'No pude comprobar la base', error);
      return 1;
    }
  }

  // Edge Functions
  if (doFunctions) {
    io.out('');
    const deployed: string[] = [];
    for (const step of plan.functions) {
      const closure = local.closures.get(step.slug);
      if (!closure) continue;
      io.out(`Publicando ${step.slug}`);
      try {
        await client.deployFunction({
          slug: step.slug,
          entrypointPath: closure.entrypointPath,
          verifyJwt: step.verifyJwt,
          files: closure.files.map((file) => ({ path: file.path, content: file.content })),
        });
        const after = await client.getFunction(step.slug);
        const previous = before.get(step.slug)?.version ?? 0;
        if (!after) {
          problems.push(`${step.slug} no aparece después de publicarla`);
        } else {
          if (after.version <= previous) {
            problems.push(`${step.slug} sigue en la versión ${after.version}, no subió`);
          }
          if (after.verifyJwt !== step.verifyJwt) {
            problems.push(
              `${step.slug} quedó con verify_jwt ${String(after.verifyJwt)} y el plan dice ${String(step.verifyJwt)}`,
            );
          }
          if (after.status !== 'ACTIVE') {
            problems.push(`${step.slug} quedó en estado ${after.status}`);
          }
          io.out(`  versión ${previous} a ${after.version}, verify_jwt ${String(after.verifyJwt)}`);
          deployed.push(`${step.slug} v${after.version}`);
        }
      } catch (error) {
        reportError(io, `Falló la publicación de ${step.slug}`, error);
        return 1;
      }
    }
    summary.push(`Funciones publicadas ${deployed.length > 0 ? deployed.join(', ') : 'ninguna'}`);
  }

  io.out('');
  io.out('Resumen');
  for (const line of summary) io.out(`  ${line}`);
  if (problems.length > 0) {
    for (const problem of problems) io.err(`  ${problem}`);
    io.err('Quedó algo distinto de lo que dice el repo. Revisa lo de arriba antes de seguir.');
    return 1;
  }
  io.out('Todo en verde.');
  return 0;
}

/** Corre lo que piden las opciones y devuelve el código de salida */
export async function runDeploy(options: DeployOptions): Promise<number> {
  if (options.secretsFrom !== null) return runSecrets(options);
  if (options.plan === null) {
    options.io.err('Falta --plan o --secrets-from. Usa --help para ver cómo');
    return 2;
  }
  return runPlan(options);
}
