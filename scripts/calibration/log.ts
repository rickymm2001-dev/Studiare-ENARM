// Registro de la calibración nocturna (B14, 3.11 del plan de B14).
//
// El repositorio es público hasta B17 y cualquiera con una cuenta de GitHub puede leer los registros de
// un workflow. Por eso el proceso no imprime nada que no haya pasado por aquí. Escribe solo líneas JSON
// con un código de una lista cerrada y campos cuyos valores son números, booleanos o códigos con forma
// [a-z][a-z0-9_]. Cualquier otro valor se descarta y la línea lleva dropped_field con cuántos fueron.
// Los errores salen con su clase y su código, el SQLSTATE de Postgres o el estado HTTP, nunca con su
// mensaje, que puede traer valores. Este archivo no importa nada de la app ni de Supabase.

/** Los únicos códigos que escribe el proceso. Agregar uno nuevo es una decisión, no un descuido */
export const LOG_CODES = [
  'start',
  'not_configured',
  'skipped',
  'run_begin',
  'bank_read',
  'people_read',
  'page_read',
  'computed',
  'published',
  'finish',
  'done',
  'error',
  'selftest_start',
  'selftest_step',
  'selftest_goal',
  'selftest_done',
] as const;

export type LogCode = (typeof LOG_CODES)[number];

/**
 * Los únicos textos que pueden salir en un campo. Es una lista cerrada y no una forma, porque una forma
 * como [a-z_] también deja pasar una llave o un nombre escritos en minúsculas. Agregar uno es una
 * decisión que se revisa en esta lista
 */
export const CODE_WORDS: ReadonlySet<string> = new Set([
  // disparadores, modos y estados de una corrida
  'schedule',
  'manual',
  'selftest',
  'dry_run',
  'apply',
  'running',
  'skipped',
  'ok',
  'partial',
  'failed',
  'interrupted',
  // motivos de una corrida que no se hizo o no terminó
  'disabled',
  'not_configured',
  'timeout',
  'kappa_mismatch',
  'invalid_page',
  'store_error',
  'compute_error',
  'publish_error',
  'unexpected',
  'bad_log_code',
  'network',
  // lecturas y publicaciones
  'bank',
  'people',
  'answers',
  'exposures',
  'activity',
  'motives',
  'pairs',
  'items',
  'options',
  'population',
  'comparison',
  'agreement',
  // estado del detector de fatiga
  'calibrating',
  'validated',
  'not_valid',
  // pasos y escenarios del autotest
  'seed',
  'checks',
  'full',
  'small',
  'dry',
  'repeat',
  'forgers',
]);

/** Las clases de error que se nombran en un registro. Cualquier otra sale como Error */
export const ERROR_CLASSES: ReadonlySet<string> = new Set([
  'Error',
  'StoreError',
  'ZodError',
  'TypeError',
  'RangeError',
  'SyntaxError',
]);

const SQLSTATE = /^(?=(?:[a-z]*[0-9]){2})[0-9a-z]{5}$/;
const HTTP_CODE = /^http_[1-5][0-9]{2}$/;
const GATEWAY_CODE = /^pgrst[0-9]{3}$/;
const FIELD_NAME = /^[a-z][A-Za-z0-9_]{0,40}$/;
/** Campos que admite una línea del registro. Los conteos de una corrida admiten más */
const MAX_FIELDS = 40;
const MAX_COUNTS = 200;

export type LogValue = number | boolean | string;
export type LogFields = Readonly<Record<string, unknown>>;

/** true si un valor puede imprimirse: un número finito, un booleano o una palabra de la lista cerrada */
export function isSafeValue(value: unknown): value is LogValue {
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'boolean') return true;
  return (
    typeof value === 'string' &&
    (CODE_WORDS.has(value) ||
      ERROR_CLASSES.has(value) ||
      SQLSTATE.test(value) ||
      HTTP_CODE.test(value) ||
      GATEWAY_CODE.test(value))
  );
}

/**
 * Deja solo los campos seguros. dropped cuenta los que se descartaron, por su valor o por el nombre de
 * su campo. Un campo llamado code o dropped_field no pasa, porque son del propio registro
 */
export function safeFields(
  fields: LogFields | undefined,
  max: number = MAX_FIELDS,
): {
  kept: Record<string, LogValue>;
  dropped: number;
} {
  const kept: Record<string, LogValue> = {};
  let dropped = 0;
  let seen = 0;
  for (const [name, value] of Object.entries(fields ?? {})) {
    seen += 1;
    if (
      seen > max ||
      !FIELD_NAME.test(name) ||
      name === 'code' ||
      name === 'dropped_field' ||
      !isSafeValue(value)
    ) {
      dropped += 1;
      continue;
    }
    kept[name] = value;
  }
  return { kept, dropped };
}

/** Los conteos de una corrida como se mandan a calibration_finish, solo números y códigos */
export function safeCounts(counts: LogFields): Record<string, number | string | boolean> {
  return safeFields(counts, MAX_COUNTS).kept;
}

export interface ErrorSummary {
  errorClass: string;
  errorCode: string;
}

/**
 * Lo que se puede decir de un error. Su clase, si es de la lista, y su código, que es el SQLSTATE de
 * Postgres, http_ y el estado HTTP, o unknown. Nunca el mensaje ni la pila
 */
export function describeError(error: unknown): ErrorSummary {
  const name =
    typeof error === 'object' && error !== null && 'name' in error ? String(error.name) : '';
  const errorClass = ERROR_CLASSES.has(name) ? name : 'Error';
  if (typeof error === 'object' && error !== null) {
    const code = 'code' in error ? error.code : null;
    if (typeof code === 'string' && /^(?:[0-9A-Z]{5}|PGRST[0-9]{3})$/.test(code)) {
      return { errorClass, errorCode: code.toLowerCase() };
    }
    const status = 'status' in error ? error.status : null;
    if (typeof status === 'number' && Number.isInteger(status) && status > 0 && status < 600) {
      return { errorClass, errorCode: `http_${status}` };
    }
    if (name === 'StoreError' && 'kind' in error && typeof error.kind === 'string') {
      const kind = error.kind;
      if (CODE_WORDS.has(kind)) return { errorClass, errorCode: kind };
    }
  }
  return { errorClass, errorCode: 'unknown' };
}

export interface Logger {
  /** Escribe una línea JSON con el código y los campos seguros */
  log(code: LogCode, fields?: LogFields): void;
  /** Un aviso amarillo de GitHub con un código de la lista. No lleva texto libre */
  warning(code: string): void;
}

export function createLogger(write: (line: string) => void): Logger {
  return {
    log(code, fields) {
      if (!LOG_CODES.includes(code)) {
        write(JSON.stringify({ code: 'error', errorClass: 'Error', errorCode: 'bad_log_code' }));
        return;
      }
      const { kept, dropped } = safeFields(fields);
      write(JSON.stringify({ code, ...kept, ...(dropped > 0 ? { dropped_field: dropped } : {}) }));
    },
    warning(code) {
      if ((LOG_CODES as readonly string[]).includes(code) || CODE_WORDS.has(code)) {
        write(`::warning title=calibration::${code}`);
      }
    },
  };
}

/** El registro de la corrida real, a la salida estándar */
export const stdoutLogger: Logger = createLogger((line) => {
  console.log(line);
});
