// Despliega a Supabase desde los archivos del repo, sin pasar el SQL ni las funciones por el conector
// (docs/DESPLIEGUE.md). Uso
//   npm run deploy:supabase -- --plan b10 [--dry-run] [--only migrations|functions] [--yes]
//   npm run deploy:supabase -- --secrets-from private/stripe-test-ids.json [--plan b10] [--dry-run] [--yes]
// El token sale de SUPABASE_ACCESS_TOKEN. En la sesión en la nube, sin esa variable, lo pone el proxy
// del entorno. Nunca se imprime, ni el token ni el valor de un secreto.
import { createInterface } from 'node:readline/promises';
import { resolve } from 'node:path';
import { runDeploy, type DeployOptions, type Io } from './deploy.ts';
import { createManagementClient } from './managementApi.ts';

/** El proyecto Studiare (D-113). Se puede cambiar con --project-ref */
export const STUDIARE_PROJECT_REF = 'bkjbcdwglyllizupokqm';

export const USAGE = [
  'Uso',
  '  npm run deploy:supabase -- --plan b10 [--dry-run] [--only migrations|functions] [--yes]',
  '  npm run deploy:supabase -- --secrets-from private/stripe-test-ids.json [--plan b10] [--dry-run] [--yes]',
  'Opciones',
  '  --plan b10          deploy/b10.json, o la ruta a otro plan',
  '  --dry-run           dice qué haría, con lecturas del proyecto y sin escribir nada',
  '  --only migrations   solo el SQL del plan',
  '  --only functions    solo las Edge Functions del plan',
  '  --yes               no pregunta antes de escribir',
  '  --secrets-from x    pone los secretos de ese JSON y nada más. Con --plan revisa sus nombres',
  `  --project-ref x     otro proyecto en lugar de ${STUDIARE_PROJECT_REF}`,
  'Token',
  '  SUPABASE_ACCESS_TOKEN en el entorno. En la sesión en la nube lo pone el proxy',
].join('\n');

export interface CliArgs {
  plan: string | null;
  dryRun: boolean;
  only: DeployOptions['only'];
  yes: boolean;
  secretsFrom: string | null;
  projectRef: string;
  help: boolean;
}

export class UsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UsageError';
  }
}

export function parseArgs(argv: readonly string[]): CliArgs {
  const args: CliArgs = {
    plan: null,
    dryRun: false,
    only: null,
    yes: false,
    secretsFrom: null,
    projectRef: STUDIARE_PROJECT_REF,
    help: false,
  };
  const valueOf = (index: number, flag: string): string => {
    const value = argv[index + 1];
    if (value === undefined || value.startsWith('--'))
      throw new UsageError(`${flag} necesita un valor`);
    return value;
  };
  for (let index = 0; index < argv.length; index += 1) {
    const raw = argv[index] ?? '';
    const [flag = '', inline] = raw.includes('=') ? raw.split(/=(.*)/s, 2) : [raw, undefined];
    const take = () => {
      if (inline !== undefined) return inline;
      const value = valueOf(index, flag);
      index += 1;
      return value;
    };
    switch (flag) {
      case '--plan':
        args.plan = take();
        break;
      case '--dry-run':
        args.dryRun = true;
        break;
      case '--yes':
        args.yes = true;
        break;
      case '--only': {
        const value = take();
        if (value !== 'migrations' && value !== 'functions') {
          throw new UsageError('--only acepta migrations o functions');
        }
        args.only = value;
        break;
      }
      case '--secrets-from':
        args.secretsFrom = take();
        break;
      case '--project-ref':
        args.projectRef = take();
        break;
      case '--help':
      case '-h':
        args.help = true;
        break;
      default:
        throw new UsageError(`No conozco ${flag}`);
    }
  }
  if (args.only !== null && args.secretsFrom !== null) {
    throw new UsageError('--only no va con --secrets-from');
  }
  return args;
}

/** De dónde sale el token, sin leerlo en voz alta */
export function resolveToken(
  env: Record<string, string | undefined>,
): { token: string | null; note: string } | { error: string } {
  const token = env.SUPABASE_ACCESS_TOKEN?.trim() ?? '';
  if (token !== '') return { token, note: 'con el token de SUPABASE_ACCESS_TOKEN' };
  if ((env.HTTPS_PROXY ?? env.https_proxy ?? '') !== '') {
    return {
      token: null,
      note: 'sin SUPABASE_ACCESS_TOKEN, con el token que pone el proxy del entorno',
    };
  }
  return {
    error:
      'Falta SUPABASE_ACCESS_TOKEN. Créalo en supabase.com, Account, Access Tokens, y ponlo solo en tu terminal, nunca en el repo ni en el chat',
  };
}

function consoleIo(): Io {
  return {
    out: (line) => {
      console.log(line);
    },
    err: (line) => {
      console.error(line);
    },
    async confirm(question) {
      if (!process.stdin.isTTY) {
        console.error('No hay terminal para confirmar. Corre otra vez con --yes si estás seguro');
        return false;
      }
      const prompt = createInterface({ input: process.stdin, output: process.stdout });
      try {
        const answer = await prompt.question(question);
        return /^s[ií]$/i.test(answer.trim());
      } finally {
        prompt.close();
      }
    },
  };
}

export async function main(argv: readonly string[], env: Record<string, string | undefined>) {
  let args: CliArgs;
  try {
    args = parseArgs(argv);
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Opciones inválidas');
    console.error(USAGE);
    return 2;
  }
  if (args.help) {
    console.log(USAGE);
    return 0;
  }
  const auth = resolveToken(env);
  if ('error' in auth) {
    console.error(auth.error);
    return 2;
  }
  let client;
  try {
    client = createManagementClient({ ref: args.projectRef, token: auth.token, fetch });
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'No pude preparar el cliente');
    return 2;
  }
  // Un plan por nombre vive en deploy/. Una ruta, como el JSON de secretos, es desde donde se corre
  const fromCwd = (path: string | null) => (path === null ? null : resolve(process.cwd(), path));
  return runDeploy({
    root: resolve(import.meta.dirname, '../..'),
    plan: args.plan !== null && /^[a-z0-9-]+$/.test(args.plan) ? args.plan : fromCwd(args.plan),
    dryRun: args.dryRun,
    only: args.only,
    yes: args.yes,
    secretsFrom: fromCwd(args.secretsFrom),
    client,
    io: consoleIo(),
    authNote: auth.note,
  });
}

// Uso desde la línea de comandos
if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  main(process.argv.slice(2), process.env).then(
    (code) => {
      process.exitCode = code;
    },
    (error: unknown) => {
      console.error(
        error instanceof Error ? `${error.name}. ${error.message}` : 'Falló el despliegue',
      );
      process.exitCode = 1;
    },
  );
}
