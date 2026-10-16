// Despliegue a Supabase desde los archivos del repo (docs/DESPLIEGUE.md). Lee un plan de deploy/,
// averigua qué ya está en el proyecto, aplica solo lo que falta, publica las Edge Functions y comprueba
// el resultado. Con --secrets-from pasa al paso de secretos de secrets.ts.
//
// Cómo decide si un SQL ya está aplicado, para nunca repetirlo a ciegas
//   - Registrado. La historia de migraciones tiene su versión, su nombre o uno de los nombres que el plan
//     declara en recordedAs, como los trozos del conector (billing_plans_1 a billing_plans_5). Se salta
//   - Sin registro, pero cada función que crea ya está en la base igual que en el archivo, y el archivo
//     solo trae funciones, grant, revoke o comment, o su comprobación sale en verde. Se salta
//   - Lo demás se aplica. Todo SQL del repo es idempotente, pero si aplicarlo dejaría una función en una
//     versión más vieja que la del repo, o si uno registrado quedó distinto y nadie lo corrige, no se
//     escribe nada y se explica por qué
// Una función es igual si coinciden la huella de su cuerpo, security definer y su set. La versión
// esperada de cada función es la de la última migración del repo que la crea o la cambia. Si solo vive
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
  loadPlan,
  repoMigrations,
  type CheckExpectation,
  type Plan,
  type SqlStep,
} from './plan.ts';
import { runSecrets } from './secrets.ts';
import {
  anonGrants,
  applyFunctionSql,
  checkQuery,
  fingerprintQuery,
  onlyFunctionStatements,
  sameAsDb,
  sameDef,
  type FunctionDef,
} from './sql.ts';

export type { DeployOptions, Io } from './output.ts';

// ---------------------------------------------------------------------------------------------
// Huellas esperadas

export interface Expected {
  def: FunctionDef;
  /** El último archivo que la crea o la cambia */
  file: string;
}

interface StepFunction {
  name: string;
  own: FunctionDef;
}

/** Las funciones de public que crea un SQL, como quedan al final del archivo */
function stepFunctions(sql: string): StepFunction[] {
  const own = new Map<string, FunctionDef>();
  applyFunctionSql(sql, own);
  return [...own].filter(([, def]) => def.body !== null).map(([name, def]) => ({ name, own: def }));
}

/**
 * La versión esperada de cada función que toca el plan, y los archivos manuales que traen una versión
 * distinta de la última migración, que aplicarlos regresaría
 */
export function expectedFunctions(
  plan: Plan,
  migrations: readonly { file: string; sql: string }[],
): { expected: Map<string, Expected>; conflicts: string[] } {
  // Las migraciones en orden de versión, con lo que cada una crea o cambia, como alter function ... set
  const defs = new Map<string, FunctionDef>();
  const files = new Map<string, string>();
  for (const migration of migrations) {
    for (const name of applyFunctionSql(migration.sql, defs)) files.set(name, migration.file);
  }
  const latest = new Map<string, Expected>();
  for (const [name, def] of defs) {
    if (def.body !== null) latest.set(name, { def, file: files.get(name) ?? '' });
  }
  const manual = new Map<string, Expected>();
  const conflicts: string[] = [];
  for (const step of plan.migrations) {
    if (step.kind !== 'manual') continue;
    for (const fn of stepFunctions(step.sql)) {
      const fromMigration = latest.get(fn.name);
      if (fromMigration && !sameDef(fromMigration.def, fn.own)) {
        conflicts.push(
          `${step.file} trae ${fn.name} distinta de ${fromMigration.file}, la última migración que la define. Aplicarlo la regresaría`,
        );
      }
      manual.set(fn.name, { def: fn.own, file: step.file });
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
  securityDefiner: boolean;
  /** proconfig con sus entradas separadas por salto de línea */
  config: string;
  anon: boolean;
}

const truthy = (value: unknown) => value === true || value === 't' || value === 'true';

export function parseFunctionRows(rows: readonly Row[]): Map<string, DbFunction[]> {
  const result = new Map<string, DbFunction[]>();
  for (const row of rows) {
    if (typeof row.name !== 'string' || typeof row.fingerprint !== 'string') continue;
    const list = result.get(row.name) ?? [];
    list.push({
      fingerprint: row.fingerprint,
      securityDefiner: truthy(row.security_definer),
      config: typeof row.config === 'string' ? row.config : '',
      anon: truthy(row.anon),
    });
    result.set(row.name, list);
  }
  return result;
}

/**
 * Las filas de la historia que corresponden a un paso, por versión, por nombre o por los nombres que el
 * plan declara en recordedAs. Los trozos del conector no se deducen, se declaran
 */
export function recordedMatches(
  step: SqlStep,
  history: readonly MigrationRecord[],
): MigrationRecord[] {
  return history.filter(
    (record) =>
      (step.version !== null && record.version === step.version) ||
      record.name === step.name ||
      step.recordedAs.includes(record.name),
  );
}

function sameValue(actual: unknown, expected: CheckExpectation[string]): boolean {
  if (typeof expected === 'boolean') {
    return expected ? truthy(actual) : actual === false || actual === 'f' || actual === 'false';
  }
  if (expected === null) return actual === null;
  return String(actual) === String(expected);
}

/**
 * Las columnas de la comprobación que no dieron lo esperado. Vacío es que salió en verde. Una fila que
 * no llega o una columna que no viene nunca cuentan como verde
 */
export function checkDifferences(row: Row | undefined, expected: CheckExpectation): string[] {
  return Object.entries(expected).flatMap(([column, value]) => {
    if (!row) return [`${column} no llegó, la consulta no devolvió filas`];
    if (!(column in row)) return [`${column} no viene en el resultado`];
    if (sameValue(row[column], value)) return [];
    return [`${column} dio ${JSON.stringify(row[column])} y debía dar ${JSON.stringify(value)}`];
  });
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
  const rowsOf = (name: string) => state.functions.get(name) ?? [];
  /** La base ya tiene la función como la deja este archivo */
  const asInFile = (fn: StepFunction) => rowsOf(fn.name).some((row) => sameAsDb(fn.own, row));
  /** La base tiene la versión esperada, la de la última migración que la define */
  const asExpected = (name: string) => {
    const want = expected.get(name);
    return want !== undefined && rowsOf(name).some((row) => sameAsDb(want.def, row));
  };
  const decisions: StepDecision[] = plan.migrations.map((step, index) => {
    const functions = stepFunctions(step.sql);
    const recorded = recordedMatches(step, state.history);
    const checkProblems = step.check ? (state.checks.get(step.file) ?? []) : [];
    const differing = functions.filter((fn) => !asInFile(fn)).map((fn) => fn.name);
    if (recorded.length > 0) {
      // Las funciones que quedaron distintas se revisan abajo, cuando ya se sabe qué pasos se aplican.
      // Una comprobación en rojo no la corrige nadie, porque lo registrado no se vuelve a aplicar
      return {
        step,
        index,
        action: 'skip',
        reason: `ya aplicada, registrada como ${describeRecords(recorded)}`,
        notes: [],
        problems:
          checkProblems.length > 0
            ? [
                `${step.file} está registrada, pero su comprobación sale en rojo (${checkProblems.join(', ')}). Revisa la base antes de seguir`,
              ]
            : [],
      };
    }
    // Las funciones solo dicen algo del archivo si es todo funciones. Con otras sentencias hace falta su
    // comprobación en verde o que esté registrado
    const functionsOnly = onlyFunctionStatements(step.sql);
    const byFingerprint = functionsOnly && functions.length > 0 && differing.length === 0;
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
      differing.length === 0 && checkProblems.length === 0 && !functionsOnly && step.check === null
        ? 'trae más que funciones, sin registro ni comprobación'
        : '',
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
          (fn) => fn.name === name && sameDef(fn.own, want.def),
        ),
    );
  };
  for (const decision of decisions) {
    for (const fn of stepFunctions(decision.step.sql)) {
      const want = expected.get(fn.name);
      if (!want) continue;
      if (decision.action === 'skip' && !asExpected(fn.name)) {
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
        !sameDef(fn.own, want.def) &&
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
    const match = rows.find((row) => sameAsDb(want.def, row));
    if (rows.length > 1) {
      // Una sobrecarga vieja puede seguir abierta o tomar las llamadas. Solo pasa si el plan la anota
      const reason = plan.overloads[name];
      const text = `${name} tiene ${rows.length} versiones en la base`;
      if (reason) notes.push(`${text}. ${reason}`);
      else problems.push(`${text}. Si es a propósito, anótala en overloads del plan`);
    }
    if (!match) {
      problems.push(
        rows.length === 0
          ? `${name} no existe en la base`
          : `${name} quedó distinta de ${want.file}`,
      );
      continue;
    }
    same += 1;
    // anon se revisa en todas las versiones con ese nombre, no solo en la del repo
    if (!rows.some((row) => row.anon)) continue;
    const reason = plan.anonExecutable[name];
    if (reason) notes.push(`${name} sigue abierta a anon a propósito. ${reason}`);
    else if (!granted.has(name) && !grantsAll) {
      problems.push(
        match.anon
          ? `anon puede ejecutar ${name} y ningún archivo del plan se lo concede`
          : `anon puede ejecutar una versión de ${name} que no es la del repo`,
      );
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
  fallback: boolean,
): Promise<ProjectState> {
  // Primero la historia, que es un GET. Con un token malo se detiene ahí, antes de cualquier consulta
  const history = withHistory ? await client.listMigrations() : [];
  const names = [...local.expected.keys()].sort();
  const functions =
    names.length > 0
      ? parseFunctionRows(await client.readQuery(fingerprintQuery(names), { fallback }))
      : new Map<string, DbFunction[]>();
  const checks = new Map<string, string[]>();
  for (const step of local.plan.migrations) {
    if (!step.check) continue;
    try {
      checks.set(step.file, await runCheck(client, step, fallback));
    } catch (error) {
      // Antes de aplicar es normal que la consulta falle porque falta un objeto, y Supabase contesta
      // 400 con el error de SQL. Eso cuenta como comprobación en rojo. Una falla de red, un 5xx o
      // cualquier otra cosa no dice nada de la base, así que se detiene sin escribir
      if (!(error instanceof ManagementApiError && error.status === 400)) throw error;
      checks.set(step.file, [`la consulta falló, ${errorText(error)}`]);
    }
  }
  return { history, functions, checks };
}

/** Corre la consulta de comprobación de un archivo. Vacío es que salió en verde */
async function runCheck(
  client: ManagementClient,
  step: SqlStep,
  fallback: boolean,
): Promise<string[]> {
  const query = checkQuery(step.sql);
  if (!step.check || query === null) return [];
  return checkDifferences((await client.readQuery(query, { fallback }))[0], step.check);
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
      // La simulación no usa el respaldo, que va por la ruta general de SQL
      const state = await readState(client, local, true, !options.dryRun);
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

  const summary: string[] = [];
  /** Imprime los problemas y lo que ya no se hizo. Siempre termina en 1 */
  const stop = (problems: readonly string[], rest: string) => {
    for (const problem of problems) io.err(`  ${problem}`);
    io.err(rest);
    return 1;
  };

  // SQL en orden. Se detiene en el primero que falle o que deje su comprobación en rojo
  if (doSql) {
    io.out('');
    for (const decision of toApply) {
      const { step } = decision;
      io.out(`Aplicando ${decision.index + 1}. ${step.file}`);
      try {
        await client.applyMigration({ name: step.name, query: step.sql });
        // Lo aplicado debe quedar registrado, o la siguiente corrida no lo reconocería
        const history = await client.listMigrations();
        if (!history.some((record) => record.name === step.name)) {
          return stop(
            [`${step.name} no aparece en la historia de migraciones después de aplicarlo`],
            'Se detiene aquí. Lo que sigue en el plan no se aplicó y no se publicó ninguna función.',
          );
        }
        if (step.check) {
          const differences = await runCheck(client, step, true);
          if (differences.length > 0) {
            return stop(
              [`${step.file} quedó con la comprobación en rojo, ${differences.join(', ')}`],
              'Se detiene aquí. Lo que sigue en el plan no se aplicó y no se publicó ninguna función.',
            );
          }
          io.out('  comprobación en verde');
        }
      } catch (error) {
        reportError(io, `Falló ${step.file}`, error);
        io.err('Lo que sigue en el plan no se aplicó y no se publicó ninguna función.');
        return 1;
      }
    }
    summary.push(`SQL aplicado ${toApply.length}, ya estaba ${decisions.length - toApply.length}`);

    // Comprobación con huellas, permisos de anon y las consultas de los archivos manuales
    io.out('');
    io.out('Comprobación de la base');
    const problems: string[] = [];
    try {
      const after = await readState(client, local, false, true);
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
      io.err('No se publicó ninguna función.');
      return 1;
    }
    if (problems.length > 0) {
      return stop(
        problems,
        'La base quedó distinta de lo que dice el repo. No se publicó ninguna función. Revisa lo de arriba antes de seguir.',
      );
    }
  }

  // Edge Functions. Se detiene en la primera que no quede como dice el plan
  if (doFunctions) {
    io.out('');
    const deployed: string[] = [];
    for (const step of plan.functions) {
      const closure = local.closures.get(step.slug);
      if (!closure) continue;
      io.out(`Publicando ${step.slug}`);
      let after: FunctionInfo | null;
      try {
        await client.deployFunction({
          slug: step.slug,
          entrypointPath: closure.entrypointPath,
          verifyJwt: step.verifyJwt,
          files: closure.files.map((file) => ({ path: file.path, content: file.content })),
          importMapPath: closure.importMapPath,
        });
        after = await client.getFunction(step.slug);
      } catch (error) {
        reportError(io, `Falló la publicación de ${step.slug}`, error);
        io.err('Las funciones que siguen no se publicaron.');
        return 1;
      }
      const previous = before.get(step.slug)?.version ?? 0;
      const problems = publishedProblems(step, previous, after);
      if (after) {
        io.out(`  versión ${previous} a ${after.version}, verify_jwt ${String(after.verifyJwt)}`);
      }
      if (problems.length > 0) {
        return stop(problems, 'Se detiene aquí. Las funciones que siguen no se publicaron.');
      }
      deployed.push(`${step.slug} v${after?.version ?? 0}`);
    }
    summary.push(`Funciones publicadas ${deployed.length > 0 ? deployed.join(', ') : 'ninguna'}`);
  }

  io.out('');
  io.out('Resumen');
  for (const line of summary) io.out(`  ${line}`);
  io.out('Todo en verde.');
  return 0;
}

/** Lo que no quedó como dice el plan después de publicar una función */
function publishedProblems(
  step: Plan['functions'][number],
  previous: number,
  after: FunctionInfo | null,
): string[] {
  if (!after) return [`${step.slug} no aparece después de publicarla`];
  const problems: string[] = [];
  if (after.version <= previous) {
    problems.push(`${step.slug} sigue en la versión ${after.version}, no subió`);
  }
  if (after.verifyJwt !== step.verifyJwt) {
    problems.push(
      `${step.slug} quedó con verify_jwt ${String(after.verifyJwt)} y el plan dice ${String(step.verifyJwt)}`,
    );
  }
  if (after.status !== 'ACTIVE') problems.push(`${step.slug} quedó en estado ${after.status}`);
  return problems;
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
