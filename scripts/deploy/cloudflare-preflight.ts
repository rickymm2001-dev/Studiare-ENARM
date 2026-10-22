// Revisa, antes de publicar en Cloudflare Pages, que estén las credenciales y que los datos que llegan al flujo
// tengan la forma que se espera (B17, 1.3 y 1.4 del plan de B17). Lo corre .github/workflows/cloudflare.yml en su
// paso Revisar credenciales. Hace tres cosas
//   1. Dice qué falta, por nombre, y nunca imprime el valor de un secreto ni de una variable
//   2. Nunca falla en rojo. Si algo falta, el flujo termina en verde con un aviso y ready=false, porque el
//      despliegue está listo pero apagado hasta que Ricardo ponga sus datos en GitHub
//   3. Deja como salidas del paso solo valores ya validados (nombre del proyecto, dirección pública, modo de la
//      prueba de humo), para que el resto del flujo no interpole en un comando nada que venga de afuera
//
// Entrada, por variables de entorno
//   CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID   secretos de GitHub
//   PROJECT                                       variable CLOUDFLARE_PAGES_PROJECT. Por omisión studiare
//   SITE_URL                                      variable SITE_URL, la dirección pública del dominio
//   PRODUCTION                                    true si la publicación es la de main
// Salida, en GITHUB_OUTPUT. ready, project, site_url y smoke_mode. Y un resumen en GITHUB_STEP_SUMMARY
import { appendFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { siteUrlOf } from '../site-files.ts';

export const DEFAULT_PROJECT = 'studiare';

export interface PreflightResult {
  /** true si se puede publicar */
  ready: boolean;
  /** Nombre del proyecto de Pages ya validado. Vacío si no se pudo */
  project: string;
  /** La dirección pública ya validada y sin diagonal final. Vacía si no hay o no sirve */
  siteUrl: string;
  /** production si es la publicación de main y hay dirección pública, preview en cualquier otro caso */
  smokeMode: 'production' | 'preview';
  /** Lo que impide publicar. Cada renglón nombra lo que falta, nunca su valor */
  problems: string[];
  /** Avisos que no impiden publicar */
  notes: string[];
}

/** Nombre de proyecto de Cloudflare Pages: minúsculas, números y guiones, hasta 58 caracteres, sin guion en las puntas */
export const PROJECT_NAME = /^[a-z0-9](?:[a-z0-9-]{0,56}[a-z0-9])?$/;
/** El ID de una cuenta de Cloudflare son 32 caracteres hexadecimales */
const ACCOUNT_ID = /^[0-9a-f]{32}$/;

const clean = (value: string | undefined): string => (value ?? '').trim();

export function checkCloudflareEnv(
  env: Readonly<Record<string, string | undefined>>,
): PreflightResult {
  const problems: string[] = [];
  const notes: string[] = [];

  const token = clean(env.CLOUDFLARE_API_TOKEN);
  const account = clean(env.CLOUDFLARE_ACCOUNT_ID);
  if (token === '') problems.push('Falta el secreto CLOUDFLARE_API_TOKEN');
  else if (/\s/.test(token)) {
    problems.push(
      'El secreto CLOUDFLARE_API_TOKEN trae espacios o saltos de línea, pégalo de nuevo',
    );
  }
  if (account === '') problems.push('Falta el secreto CLOUDFLARE_ACCOUNT_ID');
  else if (!ACCOUNT_ID.test(account)) {
    problems.push(
      'El secreto CLOUDFLARE_ACCOUNT_ID no parece un ID de cuenta, que son 32 letras y números',
    );
  }

  const rawProject = clean(env.PROJECT);
  const project = rawProject === '' ? DEFAULT_PROJECT : rawProject;
  if (!PROJECT_NAME.test(project)) {
    problems.push(
      'La variable CLOUDFLARE_PAGES_PROJECT no es un nombre de proyecto válido (minúsculas, números y guiones)',
    );
  }

  const production = clean(env.PRODUCTION) === 'true';
  const rawSite = clean(env.SITE_URL);
  const siteUrl = siteUrlOf(rawSite);
  if (rawSite !== '' && !siteUrl?.startsWith('https://')) {
    notes.push(
      'La variable SITE_URL no es una dirección https válida (como https://tudominio.mx, sin diagonal ni ruta). Se ignora',
    );
  }
  const site = siteUrl?.startsWith('https://') === true ? siteUrl : '';
  if (production && site === '') {
    notes.push(
      'Sin la variable SITE_URL el sitio se publica sin canonical ni sitemap y pide no indexarse. Es lo correcto hasta que el dominio esté listo',
    );
  }

  return {
    ready: problems.length === 0,
    project: PROJECT_NAME.test(project) ? project : '',
    siteUrl: site,
    smokeMode: production && site !== '' ? 'production' : 'preview',
    problems,
    notes,
  };
}

/** Las líneas nombre=valor de GITHUB_OUTPUT. Todas ya validadas, sin saltos de línea */
export function outputLines(result: PreflightResult): string[] {
  return [
    `ready=${String(result.ready)}`,
    `project=${result.project}`,
    `site_url=${result.siteUrl}`,
    `smoke_mode=${result.smokeMode}`,
  ];
}

/** Lo que se imprime en el registro del paso. Avisos de GitHub (::warning::) que no ponen el flujo en rojo */
export function reportLines(result: PreflightResult): string[] {
  const lines: string[] = [];
  for (const problem of result.problems)
    lines.push(`::warning title=Cloudflare apagado::${problem}`);
  for (const note of result.notes) lines.push(`::notice title=Cloudflare::${note}`);
  lines.push(
    result.ready
      ? 'Credenciales de Cloudflare completas. Se publica.'
      : 'No se publica nada en Cloudflare todavía. Pon lo que falta en GitHub (Settings, Secrets and variables, Actions) y vuelve a correr el flujo. Está en docs/PUBLICACION.md.',
  );
  return lines;
}

/** El resumen que ve Ricardo en la página de la corrida */
export function summaryLines(result: PreflightResult): string[] {
  if (result.ready) return [];
  return [
    '### Cloudflare está listo pero apagado',
    '',
    ...result.problems.map((problem) => `- ${problem}`),
    '',
    'No se publicó nada, y el flujo termina en verde a propósito. Los pasos están en docs/PUBLICACION.md.',
  ];
}

// Uso desde el flujo
if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  const result = checkCloudflareEnv(process.env);
  for (const line of reportLines(result)) console.log(line);
  const output = process.env.GITHUB_OUTPUT;
  if (output) appendFileSync(output, `${outputLines(result).join('\n')}\n`);
  const summary = process.env.GITHUB_STEP_SUMMARY;
  const lines = summaryLines(result);
  if (summary && lines.length > 0) appendFileSync(summary, `${lines.join('\n')}\n`);
}
