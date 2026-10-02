// Busca secretos en una carpeta de build (14.3). Lo usan npm run build y
// tests/security/no-secrets.test.ts. Nunca imprime el valor de la clave, solo dónde apareció.
// Uso: node scripts/secrets.ts dist
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { ENV_FILE, KEY_VARIABLE } from '../server/src/config.ts';
import { loadAiCredentials } from '../server/src/env.ts';

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
