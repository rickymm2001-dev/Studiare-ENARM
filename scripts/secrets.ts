// Busca secretos en una carpeta de build (14.3). Lo usan npm run build y
// tests/security/no-secrets.test.ts. Nunca imprime el valor de la clave, solo dónde apareció.
// Uso: node scripts/secrets.ts dist
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { jwtRole } from '../src/data/cloud/keyRole.ts';
import { ENV_FILE, KEY_VARIABLE } from '../server/src/config.ts';
import { loadAiCredentials } from '../server/src/env.ts';

/** Nombre de la clave de OpenAI de las evaluaciones (server/evals). Nunca va al build ni a Supabase */
export const OPENAI_KEY_VARIABLE = 'ENARM_OPENAI_KEY';

export interface Needle {
  /** Nombre que se puede mostrar. Nunca el valor de la clave */
  label: string;
  value: string;
}

/** Lo que nunca debe aparecer en el build del cliente */
export function defaultNeedles(): Needle[] {
  // El nombre prohibido se arma por partes para no escribirlo completo en el código (4.10)
  const forbiddenName = ['ANTHROPIC', 'API', 'KEY'].join('_');
  const needles: Needle[] = [
    { label: 'nombre de la variable de la clave', value: KEY_VARIABLE },
    { label: 'nombre de variable prohibido', value: forbiddenName },
    { label: 'prefijo de claves de Anthropic', value: 'sk-ant-' },
    // La clave de OpenAI solo existe para comparar en npm run eval-ai y nunca llega a producción (B12, 4.5)
    { label: 'nombre de la clave de OpenAI de evaluaciones', value: OPENAI_KEY_VARIABLE },
  ];
  const { apiKey } = loadAiCredentials({ envFile: ENV_FILE });
  if (apiKey && apiKey.length >= 8) {
    needles.push({ label: 'valor de la clave de server/.env.local', value: apiKey });
  }
  return needles;
}

function listFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? listFiles(path) : [path];
  });
}

export interface SecretFinding {
  file: string;
  needle: string;
}

/** Llave secreta nueva de Supabase. Se busca con la forma de una llave real, no solo el prefijo */
const SECRET_KEY_SHAPE = /sb_secret_[A-Za-z0-9_-]{16,}/;
/**
 * Llave secreta o restringida de Stripe, de prueba o reales. La publicable (pk_) es pública por diseño
 * y puede ir en el build. Se busca con la forma de una llave real y no solo el prefijo
 */
const STRIPE_SECRET_SHAPE = /\b[sr]k_(?:test|live)_[A-Za-z0-9]{20,}/;
/**
 * Llave de OpenAI. Las de proyecto, de cuenta de servicio y de admin llevan sk-proj-, sk-svcacct- o
 * sk-admin-, y las anteriores son sk- con letras y números seguidos. Se busca con la forma de una llave
 * real, así que sk-ant- de Anthropic y el prefijo solo no cuentan
 */
const OPENAI_KEY_SHAPE = /\bsk-(?:(?:proj|svcacct|admin)-[A-Za-z0-9_-]{20,}|[A-Za-z0-9]{32,})/;
/**
 * Tokens de Sentry (B15, 2.3). El de organización para subir mapas de código empieza con sntrys_ y el de usuario
 * con sntryu_. Son secretos de GitHub y nunca van al bundle. El DSN no es un token, es público por diseño y
 * puede ir en el build
 */
const SENTRY_TOKEN_SHAPE = /\bsntry[su]_[A-Za-z0-9+/=_-]{20,}/;
/**
 * Llave personal de PostHog (B15, 1.4). Lee y borra datos, y la app no la usa nunca. La llave de proyecto
 * (phc_) es pública por diseño y sí puede ir en el build, así que solo se busca la personal
 */
const POSTHOG_PERSONAL_SHAPE = /\bphx_[A-Za-z0-9]{20,}/;
/** Llave de la API de Resend (B15, 3.5). Va en los secretos de las funciones, nunca en el cliente */
const RESEND_KEY_SHAPE = /\bre_(?:[A-Za-z0-9]{6,}_[A-Za-z0-9]{16,}|[A-Za-z0-9]{32,})/;
/** Un JWT. Encabezado y datos empiezan en eyJ porque son JSON en base64 */
const JWT_SHAPE = /eyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g;

/**
 * Llaves de Supabase con permiso de servicio, llaves secretas de Stripe, llaves de OpenAI, tokens de Sentry y llaves
 * personales de PostHog o de Resend, dentro del contenido de un archivo. La llave pública
 * anterior es un JWT con rol anon y puede ir en el build, así que solo se marcan los JWT con otro
 * rol, como service_role, que se saltan los permisos por fila. Devuelve la etiqueta de cada una
 */
export function findServiceKeys(content: string): string[] {
  const labels: string[] = [];
  if (SECRET_KEY_SHAPE.test(content)) labels.push('llave secreta de Supabase (sb_secret_)');
  if (STRIPE_SECRET_SHAPE.test(content)) labels.push('llave secreta de Stripe (sk_ o rk_)');
  if (OPENAI_KEY_SHAPE.test(content)) labels.push('llave de OpenAI (sk-)');
  if (SENTRY_TOKEN_SHAPE.test(content)) labels.push('token de Sentry (sntrys_ o sntryu_)');
  if (POSTHOG_PERSONAL_SHAPE.test(content)) labels.push('llave personal de PostHog (phx_)');
  if (RESEND_KEY_SHAPE.test(content)) labels.push('llave de Resend (re_)');
  for (const match of content.matchAll(JWT_SHAPE)) {
    const role = jwtRole(match[0]);
    if (role !== null && role !== 'anon') labels.push(`llave JWT con rol ${role}`);
  }
  return labels;
}

export function findSecrets(dir: string, needles: readonly Needle[]): SecretFinding[] {
  const findings: SecretFinding[] = [];
  for (const file of listFiles(dir)) {
    const name = relative(dir, file);
    if (/(^|[\\/])\.env/.test(name)) {
      findings.push({ file: name, needle: 'archivo .env dentro del build' });
    }
    const content = readFileSync(file).toString('latin1');
    for (const needle of needles) {
      if (content.includes(needle.value)) findings.push({ file: name, needle: needle.label });
    }
    for (const label of findServiceKeys(content)) findings.push({ file: name, needle: label });
  }
  return findings;
}

// Uso desde la línea de comandos, por ejemplo al final de npm run build
if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  const dir = resolve(process.argv[2] ?? 'dist');
  const findings = findSecrets(dir, defaultNeedles());
  if (findings.length > 0) {
    for (const finding of findings) console.error(`Secreto en ${finding.file}: ${finding.needle}`);
    process.exit(1);
  }
  console.log(`Sin secretos en ${relative(process.cwd(), dir) || dir}`);
}
