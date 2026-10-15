// Paso de secretos de la herramienta de despliegue (docs/DESPLIEGUE.md). Pone en las Edge Functions los
// secretos de un JSON local, por ejemplo los ocho IDs de Stripe que escribe scripts/stripe/setup-test.ts.
// Solo muestra nombres. Cualquier línea que llegara a traer un valor sale con [oculto].
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { confirmWrites, plural, reportError, type DeployOptions, type Io } from './output.ts';
import { PlanError, SECRET_NAME, loadPlan, type Plan } from './plan.ts';

/** Los valores de un secreto que nunca deben salir en pantalla. Muy cortos no se buscan */
function redactor(values: readonly string[]): (line: string) => string {
  const hidden = values.filter((value) => value.length >= 4).sort((a, b) => b.length - a.length);
  return (line) => hidden.reduce((text, value) => text.split(value).join('[oculto]'), line);
}

export function readSecretsFile(path: string): Record<string, string> {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    throw new PlanError(`No pude leer ${path} como JSON`);
  }
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new PlanError(`${path} debe ser un objeto con NOMBRE y valor`);
  }
  const entries = Object.entries(raw as Record<string, unknown>);
  for (const [name, value] of entries) {
    // El mensaje lleva el nombre, nunca el valor
    if (!SECRET_NAME.test(name)) throw new PlanError(`${name} no es un nombre de secreto válido`);
    if (typeof value !== 'string' || value === '') {
      throw new PlanError(`${name} debe tener un valor de texto no vacío`);
    }
    if (value.length > 24576) throw new PlanError(`${name} pasa del límite de 24,576 caracteres`);
  }
  if (entries.length === 0) throw new PlanError(`${path} no trae ningún secreto`);
  if (entries.length > 100) throw new PlanError(`${path} trae más de 100 secretos`);
  return Object.fromEntries(entries) as Record<string, string>;
}

export async function runSecrets(options: DeployOptions): Promise<number> {
  const { client } = options;
  let secrets: Record<string, string>;
  let plan: Plan | null = null;
  try {
    secrets = readSecretsFile(resolve(options.root, options.secretsFrom ?? ''));
    if (options.plan) plan = loadPlan(options.root, options.plan);
  } catch (error) {
    reportError(options.io, 'No se pusieron secretos', error);
    return 1;
  }
  const hide = redactor(Object.values(secrets));
  const io: Io = {
    out: (line) => {
      options.io.out(hide(line));
    },
    err: (line) => {
      options.io.err(hide(line));
    },
    confirm: (question) => options.io.confirm(hide(question)),
  };
  const names = Object.keys(secrets).sort();
  io.out(`Secretos de las Edge Functions en el proyecto ${client.ref}, ${options.authNote}`);
  io.out(
    `Desde ${options.secretsFrom ?? ''}, ${plural(names.length, 'nombre', 'nombres')}. Los valores no se muestran`,
  );

  const problems: string[] = [];
  if (plan?.secrets) {
    const rules = plan.secrets;
    for (const name of Object.keys(rules)) {
      if (!(name in secrets)) problems.push(`Falta ${name}, que pide el plan ${plan.id}`);
    }
    for (const name of names) {
      const rule = rules[name];
      if (!rule) problems.push(`${name} no está en el plan ${plan.id}`);
      else if (rule.prefix !== null && !(secrets[name] ?? '').startsWith(rule.prefix)) {
        problems.push(`${name} debe empezar con ${rule.prefix}`);
      }
    }
  }
  if (problems.length > 0) {
    for (const problem of problems) io.err(problem);
    io.err('No se escribió nada.');
    return 1;
  }

  let existing: Set<string>;
  try {
    existing = new Set(await client.listSecretNames());
  } catch (error) {
    reportError(io, 'No pude leer los secretos del proyecto', error);
    return 1;
  }
  for (const name of names) {
    io.out(`  ${name}  ${existing.has(name) ? 'reemplaza el que ya hay' : 'nuevo'}`);
  }
  if (options.dryRun) {
    io.out('Simulación. No se escribió nada.');
    return 0;
  }
  if (!(await confirmWrites({ ...options, io }, [plural(names.length, 'secreto', 'secretos')]))) {
    return 1;
  }
  try {
    await client.setSecrets(names.map((name) => ({ name, value: secrets[name] ?? '' })));
    const after = new Set(await client.listSecretNames());
    const missing = names.filter((name) => !after.has(name));
    if (missing.length > 0) {
      io.err(`No aparecen después de ponerlos ${missing.join(', ')}`);
      return 1;
    }
  } catch (error) {
    reportError(io, 'No se pusieron los secretos', error);
    return 1;
  }
  io.out(
    `Listo. ${plural(names.length, 'secreto puesto', 'secretos puestos')}. Las funciones los leen en su siguiente arranque`,
  );
  return 0;
}

/** Corre lo que piden las opciones y devuelve el código de salida */
