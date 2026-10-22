// Registra en Stripe, en modo prueba, el dominio donde vive la app, para que Apple Pay y Google Pay aparezcan en
// los botones de Suscripción (B17, 6.3). El Checkout hospedado de Stripe no pide esto. El Express Checkout Element
// sí, por dominio y por modo: una Payment Method Domain en modo prueba no registra el dominio en modo real.
//
// Qué hace, en este orden
//   1. Revisa que la llave sea de prueba. Con la llave de STRIPE_SECRET_KEY exige sk_test_ o rk_test_. Sin esa
//      variable y con el proxy del entorno, la pone el proxy y el script lo comprueba con el saldo, que dice
//      livemode, y si no es false no hace nada más. Todo lo que Stripe conteste con livemode true corta la corrida
//   2. Busca el dominio (GET /v1/payment_method_domains) y solo lo crea si no existe, así se puede correr las veces
//      que haga falta y nunca duplica
//   3. Con --validate vuelve a pedir a Stripe que revise las billeteras del dominio
//      (POST /v1/payment_method_domains/{id}/validate). Es lo que se corre después de publicar el archivo de Apple
//   4. Imprime el estado de apple_pay y google_pay con el mensaje de error de Stripe si lo hay, y dice qué sigue
//
// Apple Pay. Stripe intenta verificar el dominio solo al registrarlo. Si queda inactivo, el archivo se baja del
// panel de Stripe (Settings, Payment method domains, el dominio, Apple Pay) y no por la API. Se guarda sin
// extensión en public/.well-known/apple-developer-merchantid-domain-association, se publica y se vuelve a correr
// con --validate. El archivo es público y no es un secreto. Google Pay no pide archivo.
//
// Solo se registra el dominio real de la app (tudominio.mx, sin www). Las vistas previas, pages.dev y github.io no
// se registran, y localhost y las direcciones IP no los acepta Stripe. Solo modo prueba: el modo real lo agrega B19
// con su confirmación escrita, y --live aquí es un error. La llave nunca se imprime ni se guarda. Este script no
// corre solo en ninguna sesión, lo corre quien tiene el dominio
//
// Uso
//   STRIPE_SECRET_KEY=rk_test_... node scripts/stripe/register-domain.ts tudominio.mx [--validate]
//   node --use-env-proxy scripts/stripe/register-domain.ts tudominio.mx [--validate]   en la sesión en la nube
// La llave restringida de prueba necesita el permiso de lectura y escritura sobre Payment Method Domains.
// Código de salida. 0 si Apple Pay y Google Pay quedaron activos, 1 si algo falló, 2 si las opciones no sirven y
// 3 si el dominio quedó registrado pero alguna billetera sigue inactiva y falta un paso
import { resolve } from 'node:path';
import { STRIPE_API_VERSION } from '../../supabase/functions/_shared/billingTypes.ts';
import { APPLE_DOMAIN_FILE_PATH } from '../../src/config/csp.ts';
import { isTestKey } from './setup-test.ts';

export const REGISTER_EXIT = { ok: 0, failed: 1, usage: 2, pending: 3 } as const;

/** Dónde va el archivo de Apple dentro del repositorio, a partir de la ruta pública que le pone el _headers */
export const APPLE_FILE_IN_REPO = `public${APPLE_DOMAIN_FILE_PATH}`;

export class RegisterDomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RegisterDomainError';
  }
}

type Json = Record<string, unknown>;
const asRecord = (value: unknown): Json =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Json) : {};
const asString = (value: unknown): string | null =>
  typeof value === 'string' && value !== '' ? value : null;

// ---------------------------------------------------------------------------------------------
// El dominio

/** Lo que el script no registra aunque tenga forma de dominio, y por qué */
const REFUSED_SUFFIXES: readonly { suffix: string; why: string }[] = [
  {
    suffix: 'pages.dev',
    why: 'Las vistas previas y pages.dev no se registran. Se registra el dominio real de la app',
  },
  {
    suffix: 'github.io',
    why: 'La demo en github.io no se registra. Se registra el dominio real de la app',
  },
];

/**
 * El dominio que se va a registrar, sin esquema, ruta ni puerto, en minúsculas y con punto. Lanza si no sirve, con el
 * motivo. No repite lo que llegó más que cuando es un nombre de dominio, por si alguien pegó ahí la llave
 */
export function parseDomain(raw: string): string {
  const value = raw.trim().toLowerCase().replace(/\.$/, '');
  if (value === '') throw new RegisterDomainError('Falta el dominio, por ejemplo tudominio.mx');
  if (/[:/?#@\s*]/.test(value)) {
    throw new RegisterDomainError(
      'Escribe solo el dominio, sin https://, sin diagonales, sin puerto y sin comodines, por ejemplo tudominio.mx',
    );
  }
  const labels = value.split('.');
  const validLabel = (label: string) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label);
  if (labels.length < 2 || !labels.every(validLabel)) {
    throw new RegisterDomainError(
      'Eso no parece un dominio. Escríbelo como tudominio.mx, con letras minúsculas, números y guiones',
    );
  }
  // Una dirección IP, aunque sea con puntos, no es un dominio. Stripe no la acepta
  if (labels.every((label) => /^\d+$/.test(label))) {
    throw new RegisterDomainError(
      'Una dirección IP no sirve. Stripe pide un dominio, como tudominio.mx',
    );
  }
  if (labels.at(-1) === 'localhost' || labels.at(-1) === 'local' || labels.at(-1) === 'test') {
    throw new RegisterDomainError(
      'Stripe no acepta dominios locales. Se registra el dominio real de la app',
    );
  }
  for (const { suffix, why } of REFUSED_SUFFIXES) {
    if (value === suffix || value.endsWith(`.${suffix}`)) throw new RegisterDomainError(why);
  }
  return value;
}

// ---------------------------------------------------------------------------------------------
// Estado de las billeteras

export type WalletName = 'apple_pay' | 'google_pay';
export const WALLET_NAMES: readonly WalletName[] = ['apple_pay', 'google_pay'];
const WALLET_LABEL: Record<WalletName, string> = {
  apple_pay: 'Apple Pay',
  google_pay: 'Google Pay',
};

export interface WalletStatus {
  wallet: WalletName;
  /** active deja que el botón aparezca. Cualquier otro valor cuenta como inactivo */
  active: boolean;
  /** El mensaje de error que da Stripe cuando está inactivo, si lo da */
  message: string | null;
}

export interface DomainResult {
  id: string;
  domain: string;
  /** created si esta corrida lo registró y existing si ya estaba */
  origin: 'created' | 'existing';
  validated: boolean;
  enabled: boolean;
  wallets: WalletStatus[];
}

/** El estado de apple_pay y google_pay de un objeto payment_method_domain */
export function walletStatuses(domain: Json): WalletStatus[] {
  return WALLET_NAMES.map((wallet) => {
    const entry = asRecord(domain[wallet]);
    return {
      wallet,
      active: entry.status === 'active',
      message: asString(asRecord(entry.status_details).error_message),
    };
  });
}

// ---------------------------------------------------------------------------------------------
// Stripe

export interface RegisterInput {
  /** null cuando la llave la pone el proxy del entorno, como en la sesión en la nube */
  key: string | null;
  fetch: typeof fetch;
  domain: string;
  validate: boolean;
}

/** Tapa cualquier cosa con forma de llave de Stripe (sk_, rk_, pk_), también la enmascarada que a veces repite un mensaje */
function hideKeys(text: string): string {
  return text.replace(/\b(?:sk|rk|pk)_(?:test|live)_\S*/gi, '[llave]');
}

/** Registra el dominio, o lo encuentra si ya estaba, y lo valida si se pide. Lanza RegisterDomainError */
export async function registerPaymentMethodDomain(input: RegisterInput): Promise<DomainResult> {
  if (input.key === '') {
    throw new RegisterDomainError(
      'Falta la llave de prueba. Ponla en la variable STRIPE_SECRET_KEY (sk_test_ o rk_test_), o corre con node --use-env-proxy donde el entorno la pone',
    );
  }
  if (input.key !== null && !isTestKey(input.key)) {
    throw new RegisterDomainError(
      'Solo se aceptan llaves de prueba, que empiezan con sk_test_ o rk_test_. El modo real lo agrega B19',
    );
  }
  const domain = parseDomain(input.domain);

  /** Una llamada a Stripe con la versión fija. Cualquier error lanza sin la llave, y nada en modo real pasa */
  async function call(
    method: 'GET' | 'POST',
    path: string,
    params?: URLSearchParams,
    idempotencyKey?: string,
  ): Promise<Json> {
    const query = method === 'GET' && params ? `?${params.toString()}` : '';
    const reply = await input.fetch(`https://api.stripe.com${path}${query}`, {
      method,
      headers: {
        ...(input.key === null ? {} : { authorization: `Bearer ${input.key}` }),
        'stripe-version': STRIPE_API_VERSION,
        ...(method === 'POST' ? { 'content-type': 'application/x-www-form-urlencoded' } : {}),
        ...(idempotencyKey ? { 'idempotency-key': idempotencyKey } : {}),
      },
      ...(method === 'POST' ? { body: params ?? new URLSearchParams() } : {}),
    });
    const body = asRecord(await reply.json().catch(() => ({})));
    if (!reply.ok) {
      // Con 401 o 403 el mensaje de Stripe habla de la llave (Invalid API Key provided: rk_test_****abcd) y trae su
      // prefijo y sus últimos caracteres. Se dice con palabras propias y nunca se repite el de Stripe
      if (reply.status === 401 || reply.status === 403) {
        throw new RegisterDomainError(
          `Stripe rechazó la llave (${reply.status}) en ${method} ${path}. Revisa que esté completa, que sea de prueba (sk_test_ o rk_test_) y que tenga permiso para Payment Method Domains`,
        );
      }
      // Los demás mensajes hablan de la petición. Si alguno nombra una llave, se tapa
      const message = hideKeys(asString(asRecord(body.error).message) ?? '');
      throw new RegisterDomainError(
        `Stripe respondió ${reply.status} en ${method} ${path}. ${message}`.trim(),
      );
    }
    if (body.livemode === true) {
      throw new RegisterDomainError(
        `Stripe respondió en modo real en ${method} ${path}. Solo se trabaja en modo prueba. Revisa la llave`,
      );
    }
    return body;
  }

  // Con la llave del proxy no se ve su prefijo. El saldo dice si es de prueba antes de tocar nada
  if (input.key === null) {
    const balance = await call('GET', '/v1/balance');
    if (balance.livemode !== false) {
      throw new RegisterDomainError(
        'La llave que pone el proxy del entorno no es de prueba. No se registró nada. Pon una sk_test_ o rk_test_',
      );
    }
  }

  const listed = await call(
    'GET',
    '/v1/payment_method_domains',
    new URLSearchParams({ domain_name: domain, limit: '1' }),
  );
  const found = Array.isArray(listed.data) ? asRecord(listed.data[0]) : {};
  let current: Json;
  let origin: DomainResult['origin'];
  if (asString(found.id) && found.domain_name === domain) {
    current = found;
    origin = 'existing';
  } else {
    current = await call(
      'POST',
      '/v1/payment_method_domains',
      new URLSearchParams({ domain_name: domain }),
      `studiare-pmd-${domain}`,
    );
    origin = 'created';
  }
  const id = asString(current.id);
  if (!id) throw new RegisterDomainError('Stripe no devolvió el id del dominio registrado');

  let validated = false;
  if (input.validate) {
    current = await call('POST', `/v1/payment_method_domains/${encodeURIComponent(id)}/validate`);
    validated = true;
  }
  return {
    id,
    domain,
    origin,
    validated,
    enabled: current.enabled !== false,
    wallets: walletStatuses(current),
  };
}

// ---------------------------------------------------------------------------------------------
// Lo que se imprime

/** Si las dos billeteras quedaron activas, que es lo que cierra el trabajo */
export const allActive = (result: DomainResult): boolean =>
  result.enabled && result.wallets.every((wallet) => wallet.active);

/** Lo que dice el script al terminar, sin la llave. Incluye qué sigue si alguna billetera está inactiva */
export function reportLines(result: DomainResult): string[] {
  const lines = [
    `Dominio ${result.domain} ${result.origin === 'created' ? 'registrado en Stripe' : 'ya estaba registrado en Stripe'} (modo prueba, ${result.id})${result.validated ? ' y revisado de nuevo' : ''}`,
  ];
  for (const { wallet, active, message } of result.wallets) {
    lines.push(
      `${WALLET_LABEL[wallet]} ${active ? 'activo' : 'inactivo'}${!active && message ? `. Stripe dice ${message}` : ''}`,
    );
  }
  if (!result.enabled) {
    lines.push(
      'El dominio está desactivado en Stripe. Actívalo en Settings, Payment method domains',
    );
  }
  const apple = result.wallets.find((wallet) => wallet.wallet === 'apple_pay');
  const google = result.wallets.find((wallet) => wallet.wallet === 'google_pay');
  if (apple && !apple.active) {
    lines.push(
      `Falta el archivo de Apple. En Stripe abre Settings, Payment method domains, ${result.domain}, Apple Pay y baja el archivo. No es secreto. Guárdalo sin extensión como ${APPLE_FILE_IN_REPO}, publícalo y corre otra vez este script con --validate`,
    );
  }
  if (google && !google.active) {
    lines.push(
      'Google Pay no pide archivo. Si sigue inactivo, revisa que el dominio abra por https y vuelve a correr con --validate',
    );
  }
  if (allActive(result)) {
    lines.push(
      'Listo. Los botones de Apple Pay y Google Pay ya pueden aparecer en este dominio, en modo prueba',
    );
  }
  return lines;
}

// ---------------------------------------------------------------------------------------------
// Línea de comandos

export interface RegisterArgs {
  domain: string;
  validate: boolean;
}

/** Lee las opciones. Devuelve un error si falta el dominio, si sobra algo o si piden el modo real */
export function parseRegisterArgs(argv: readonly string[]): RegisterArgs | { error: string } {
  let domain: string | null = null;
  let validate = false;
  for (let index = 0; index < argv.length; index += 1) {
    const raw = argv[index] ?? '';
    if (raw === '--validate') {
      validate = true;
    } else if (raw === '--live') {
      return {
        error:
          'Este script solo trabaja en modo prueba. El registro en modo real lo agrega B19 con su confirmación escrita',
      };
    } else if (raw === '--domain' || raw.startsWith('--domain=')) {
      const inline = raw.startsWith('--domain=') ? raw.slice('--domain='.length) : undefined;
      const value = inline ?? argv[index + 1];
      if (inline === undefined) index += 1;
      if (!value || value.startsWith('--'))
        return { error: '--domain necesita un valor, por ejemplo --domain=tudominio.mx' };
      if (domain !== null) return { error: 'Solo se registra un dominio por corrida' };
      domain = value;
    } else if (raw.startsWith('--')) {
      // No se repite lo que llegó, por si alguien pegó ahí la llave
      return {
        error: `No conozco la opción número ${index + 1}. Las que hay son --validate y --domain`,
      };
    } else {
      if (domain !== null) return { error: 'Solo se registra un dominio por corrida' };
      domain = raw;
    }
  }
  if (domain === null)
    return {
      error:
        'Falta el dominio. Uso node scripts/stripe/register-domain.ts tudominio.mx [--validate]',
    };
  return { domain, validate };
}

export interface RegisterCliDeps {
  fetch: typeof fetch;
  log: (line: string) => void;
  error: (line: string) => void;
}

/**
 * La llave de STRIPE_SECRET_KEY o, sin ella y con el proxy del entorno, null, porque la pone el proxy. Sin las dos
 * queda vacía y registerPaymentMethodDomain la rechaza
 */
export function registerKey(env: Record<string, string | undefined>): string | null {
  const key = env.STRIPE_SECRET_KEY ?? '';
  if (key !== '') return key;
  return (env.HTTPS_PROXY ?? env.https_proxy ?? '') !== '' ? null : '';
}

/** La corrida desde la línea de comandos. Devuelve el código de salida */
export async function runRegisterCli(
  argv: readonly string[],
  env: Record<string, string | undefined>,
  deps: RegisterCliDeps,
): Promise<number> {
  const args = parseRegisterArgs(argv);
  if ('error' in args) {
    deps.error(args.error);
    return REGISTER_EXIT.usage;
  }
  let result: DomainResult;
  try {
    result = await registerPaymentMethodDomain({
      key: registerKey(env),
      fetch: deps.fetch,
      domain: args.domain,
      validate: args.validate,
    });
  } catch (error) {
    // Un error ajeno, como el de fetch con un encabezado inválido, podría traer la llave en su mensaje
    deps.error(
      error instanceof RegisterDomainError
        ? error.message
        : `Falló el registro del dominio (${error instanceof Error ? error.name : 'error'})`,
    );
    return REGISTER_EXIT.failed;
  }
  if (result.domain.startsWith('www.')) {
    deps.log(
      'Ojo. Normalmente se registra el dominio sin www, que es donde vive la app. Si la app vive en este, ignora este aviso',
    );
  }
  for (const line of reportLines(result)) deps.log(line);
  return allActive(result) ? REGISTER_EXIT.ok : REGISTER_EXIT.pending;
}

// Uso desde la línea de comandos
if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  runRegisterCli(process.argv.slice(2), process.env, {
    fetch,
    log: (line) => {
      console.log(line);
    },
    error: (line) => {
      console.error(line);
    },
  }).then(
    (code) => {
      process.exitCode = code;
    },
    () => {
      console.error('Falló el registro del dominio');
      process.exitCode = REGISTER_EXIT.failed;
    },
  );
}
