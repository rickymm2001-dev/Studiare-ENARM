// Lectura de los archivos SQL del repo para la herramienta de despliegue (docs/DESPLIEGUE.md). Sin red
// ni base. Saca de un archivo
//   - Las funciones que crea, con su cuerpo tal como Postgres lo guarda en pg_proc.prosrc
//   - Su huella, la misma que calcula la base con md5 del cuerpo sin comentarios ni espacios
//   - Las funciones que el archivo abre a anon (grant execute ... to anon o to public)
//   - La consulta de comprobación del final de un archivo de supabase/manual
// Entiende comentarios, cadenas, identificadores entre comillas y cuerpos entre $$, así que un punto y
// coma o un create function dentro de una cadena no cuentan.
import { createHash } from 'node:crypto';

type TokenKind = 'word' | 'string' | 'dollar' | 'quoted' | 'punct';

interface Token {
  kind: TokenKind;
  /** El texto tal cual aparece en el archivo */
  raw: string;
  /** Las palabras en minúsculas, el contenido de una cadena o de un $$ y el nombre entre comillas */
  value: string;
  start: number;
  end: number;
}

export class SqlParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SqlParseError';
  }
}

const WORD_START = /[A-Za-z_\u0080-￿]/;
const WORD_PART = /[A-Za-z0-9_$\u0080-￿]/;
const DOLLAR_TAG = /^\$(?:[A-Za-z_\u0080-￿][A-Za-z0-9_\u0080-￿]*)?\$/;

function lineOf(text: string, offset: number): number {
  let line = 1;
  for (let index = 0; index < offset; index += 1) if (text.charCodeAt(index) === 10) line += 1;
  return line;
}

/** Parte el SQL en piezas. Se salta los comentarios, que Postgres deja anidar con barra y asterisco */
function tokenize(sql: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;
  const fail = (what: string, at: number): never => {
    throw new SqlParseError(`${what} sin cerrar en la línea ${lineOf(sql, at)}`);
  };
  while (index < sql.length) {
    const char = sql.charAt(index);
    const next = sql.charAt(index + 1);
    if (/\s/.test(char)) {
      index += 1;
    } else if (char === '-' && next === '-') {
      const newline = sql.indexOf('\n', index);
      index = newline === -1 ? sql.length : newline + 1;
    } else if (char === '/' && next === '*') {
      const start = index;
      let depth = 0;
      do {
        if (sql.startsWith('/*', index)) {
          depth += 1;
          index += 2;
        } else if (sql.startsWith('*/', index)) {
          depth -= 1;
          index += 2;
        } else if (index >= sql.length) {
          fail('Un comentario', start);
        } else {
          index += 1;
        }
      } while (depth > 0);
    } else if (char === "'") {
      // Una cadena E'...' acepta escapes con barra invertida. La E queda como la palabra de antes
      const previous = tokens.at(-1);
      const escapes = previous?.kind === 'word' && previous.value === 'e' && previous.end === index;
      const start = index;
      let value = '';
      index += 1;
      for (;;) {
        if (index >= sql.length) fail('Una cadena', start);
        const current = sql.charAt(index);
        if (escapes && current === '\\') {
          value += sql.charAt(index + 1);
          index += 2;
        } else if (current === "'" && sql.charAt(index + 1) === "'") {
          value += "'";
          index += 2;
        } else if (current === "'") {
          index += 1;
          break;
        } else {
          value += current;
          index += 1;
        }
      }
      tokens.push({ kind: 'string', raw: sql.slice(start, index), value, start, end: index });
    } else if (char === '"') {
      const start = index;
      let value = '';
      index += 1;
      for (;;) {
        if (index >= sql.length) fail('Un nombre entre comillas', start);
        const current = sql.charAt(index);
        if (current === '"' && sql.charAt(index + 1) === '"') {
          value += '"';
          index += 2;
        } else if (current === '"') {
          index += 1;
          break;
        } else {
          value += current;
          index += 1;
        }
      }
      tokens.push({ kind: 'quoted', raw: sql.slice(start, index), value, start, end: index });
    } else if (char === '$' && DOLLAR_TAG.test(sql.slice(index, index + 64))) {
      const tag = DOLLAR_TAG.exec(sql.slice(index, index + 64))?.[0] ?? '$$';
      const start = index;
      const close = sql.indexOf(tag, index + tag.length);
      if (close === -1) fail(`Un cuerpo entre ${tag}`, start);
      const value = sql.slice(index + tag.length, close);
      index = close + tag.length;
      tokens.push({ kind: 'dollar', raw: sql.slice(start, index), value, start, end: index });
    } else if (WORD_START.test(char)) {
      const start = index;
      while (index < sql.length && WORD_PART.test(sql.charAt(index))) index += 1;
      const raw = sql.slice(start, index);
      tokens.push({ kind: 'word', raw, value: raw.toLowerCase(), start, end: index });
    } else {
      tokens.push({ kind: 'punct', raw: char, value: char, start: index, end: index + 1 });
      index += 1;
    }
  }
  return tokens;
}

/** Las sentencias de primer nivel, partidas en cada punto y coma que no va dentro de una cadena */
function statements(tokens: Token[]): Token[][] {
  const result: Token[][] = [];
  let current: Token[] = [];
  for (const token of tokens) {
    if (token.kind === 'punct' && token.value === ';') {
      if (current.length > 0) result.push(current);
      current = [];
    } else {
      current.push(token);
    }
  }
  if (current.length > 0) result.push(current);
  return result;
}

const isWord = (token: Token | undefined, ...words: string[]) =>
  token?.kind === 'word' && words.includes(token.value);
const isPunct = (token: Token | undefined, value: string) =>
  token?.kind === 'punct' && token.value === value;
const nameOf = (token: Token | undefined): string | null =>
  token && (token.kind === 'word' || token.kind === 'quoted') ? token.value : null;

/** Un nombre como public.foo o foo a partir de la posición dada. Sin esquema se toma public */
function qualifiedName(
  tokens: Token[],
  at: number,
): { schema: string; name: string; next: number } | null {
  const first = nameOf(tokens[at]);
  if (first === null) return null;
  if (isPunct(tokens[at + 1], '.')) {
    const second = nameOf(tokens[at + 2]);
    if (second === null) return null;
    return { schema: first, name: second, next: at + 3 };
  }
  return { schema: 'public', name: first, next: at + 1 };
}

/** El índice del paréntesis que cierra al que está en open */
function closingParen(tokens: Token[], open: number): number {
  let depth = 0;
  for (let index = open; index < tokens.length; index += 1) {
    if (isPunct(tokens[index], '(')) depth += 1;
    if (isPunct(tokens[index], ')')) {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

/** Lo que se compara de una función entre el repo y la base */
export interface FunctionDef {
  /** El cuerpo como lo guarda Postgres en prosrc. null si es un begin atomic, que no tiene prosrc */
  body: string | null;
  /** prosecdef, security definer en el encabezado */
  securityDefiner: boolean;
  /**
   * proconfig como lo guarda Postgres, por ejemplo search_path=public, pg_temp. null si el encabezado
   * trae un set que no se puede leer con seguridad, como set ... from current, y entonces no se compara
   */
  config: string[] | null;
}

export interface SqlFunction extends FunctionDef {
  schema: string;
  name: string;
  /** Lo que va entre los paréntesis, tal cual */
  args: string;
  /** Línea donde empieza la sentencia, desde 1 */
  line: number;
}

/** Un valor de set que Postgres guarda sin comillas. Si no, va entre comillas dobles */
const PLAIN_IDENTIFIER = /^[a-z_][a-z0-9_]*$/;

/**
 * Lee set nombre = valores desde at, que apunta a la palabra set. Devuelve la entrada como la guarda
 * proconfig, o null si trae algo que no se puede reproducir con seguridad, y el índice que sigue
 */
function readSet(tokens: Token[], at: number): { entry: string | null; next: number } {
  let index = at + 1;
  const parts: string[] = [];
  while (tokens[index]?.kind === 'word') {
    parts.push(tokens[index]?.value ?? '');
    index += 1;
    if (!isPunct(tokens[index], '.')) break;
    index += 1;
  }
  const name = parts.join('.');
  if (name === '') return { entry: null, next: index };
  if (isWord(tokens[index], 'from')) return { entry: null, next: index + 2 };
  if (!isPunct(tokens[index], '=') && !isWord(tokens[index], 'to'))
    return { entry: null, next: index };
  index += 1;
  const values: string[] = [];
  for (;;) {
    const token = tokens[index];
    if (!token || !['word', 'quoted', 'string'].includes(token.kind)) {
      return { entry: null, next: index + 1 };
    }
    // Un nombre sin comillas ya viene en minúsculas, como lo deja Postgres
    values.push(
      name === 'search_path' && !PLAIN_IDENTIFIER.test(token.value)
        ? `"${token.value.replace(/"/g, '""')}"`
        : token.value,
    );
    index += 1;
    if (!isPunct(tokens[index], ',')) break;
    index += 1;
  }
  return { entry: `${name}=${values.join(', ')}`, next: index };
}

/** El nombre de la variable de una entrada de proconfig */
const configName = (entry: string) => entry.slice(0, entry.indexOf('='));

/** Pone o cambia una entrada de proconfig, como alter function ... set */
function setConfig(config: string[] | null, entry: string | null): string[] | null {
  if (config === null || entry === null) return null;
  const name = configName(entry);
  const index = config.findIndex((current) => configName(current) === name);
  if (index === -1) return [...config, entry];
  return config.map((current, at) => (at === index ? entry : current));
}

/** Lee el encabezado de un create function, del paréntesis que cierra los argumentos al cuerpo */
function readHeader(tokens: Token[], from: number): FunctionDef {
  const def: FunctionDef = { body: null, securityDefiner: false, config: [] };
  let index = from;
  while (index < tokens.length) {
    const token = tokens[index];
    const following = tokens[index + 1];
    if (isWord(token, 'as') && (following?.kind === 'dollar' || following?.kind === 'string')) {
      def.body = following.value;
      break;
    }
    if (isWord(token, 'begin') && isWord(following, 'atomic')) break;
    if (isWord(token, 'security') && isWord(following, 'definer', 'invoker')) {
      def.securityDefiner = following?.value === 'definer';
      index += 2;
      continue;
    }
    if (isWord(token, 'set')) {
      const { entry, next } = readSet(tokens, index);
      def.config = setConfig(def.config, entry);
      index = next;
      continue;
    }
    index += 1;
  }
  return def;
}

/** Las funciones y procedimientos que crea el archivo, en el orden en que aparecen */
export function extractFunctions(sql: string): SqlFunction[] {
  const found: SqlFunction[] = [];
  for (const statement of statements(tokenize(sql))) {
    let at = 0;
    if (!isWord(statement[at], 'create')) continue;
    at += 1;
    if (isWord(statement[at], 'or') && isWord(statement[at + 1], 'replace')) at += 2;
    if (!isWord(statement[at], 'function', 'procedure')) continue;
    const qualified = qualifiedName(statement, at + 1);
    if (!qualified || !isPunct(statement[qualified.next], '(')) continue;
    const open = qualified.next;
    const close = closingParen(statement, open);
    const first = statement[0];
    const openToken = statement[open];
    const closeToken = statement[close];
    if (close === -1 || !first || !openToken || !closeToken) {
      throw new SqlParseError(`La función ${qualified.name} no cierra sus paréntesis`);
    }
    found.push({
      schema: qualified.schema,
      name: qualified.name,
      args: sql.slice(openToken.end, closeToken.start).trim(),
      ...readHeader(statement, close + 1),
      line: lineOf(sql, first.start),
    });
  }
  return found;
}

/**
 * Aplica sobre state, en orden, lo que el SQL hace con las funciones de public. create function las
 * pone y alter function cambia su security o su set de las que ya están en state. Devuelve los nombres
 * que tocó. Las sobrecargas cuentan como una sola función, por su nombre
 */
export function applyFunctionSql(sql: string, state: Map<string, FunctionDef>): string[] {
  const touched: string[] = [];
  const created = new Map(extractFunctions(sql).map((fn) => [fn.line, fn] as const));
  for (const statement of statements(tokenize(sql))) {
    const first = statement[0];
    if (!first) continue;
    const fn = created.get(lineOf(sql, first.start));
    if (fn && isWord(first, 'create')) {
      if (fn.schema !== 'public') continue;
      state.set(fn.name, { body: fn.body, securityDefiner: fn.securityDefiner, config: fn.config });
      touched.push(fn.name);
      continue;
    }
    if (!isWord(first, 'alter') || !isWord(statement[1], 'function', 'procedure', 'routine')) {
      continue;
    }
    const qualified = qualifiedName(statement, 2);
    const current = qualified ? state.get(qualified.name) : undefined;
    if (qualified?.schema !== 'public' || !current) continue;
    let index = qualified.next;
    if (isPunct(statement[index], '(')) index = closingParen(statement, index) + 1;
    const next: FunctionDef = { ...current };
    while (index > 0 && index < statement.length) {
      const token = statement[index];
      const following = statement[index + 1];
      if (isWord(token, 'security') && isWord(following, 'definer', 'invoker')) {
        next.securityDefiner = following?.value === 'definer';
        index += 2;
      } else if (isWord(token, 'set')) {
        const read = readSet(statement, index);
        next.config = setConfig(next.config, read.entry);
        index = read.next;
      } else if (isWord(token, 'reset')) {
        const target = statement[index + 1]?.value ?? '';
        next.config =
          next.config === null
            ? null
            : target === 'all'
              ? []
              : next.config.filter((entry) => configName(entry) !== target);
        index += 2;
      } else {
        index += 1;
      }
    }
    state.set(qualified.name, next);
    touched.push(qualified.name);
  }
  return touched;
}

/** Sentencias que puede traer un archivo para reconocerlo por la huella de sus funciones */
const FUNCTION_ONLY_STATEMENTS = ['grant', 'revoke', 'comment'];

/**
 * true si cada sentencia del archivo es create function o create procedure, grant, revoke o comment.
 * Solo un archivo así se puede dar por aplicado viendo sus funciones. Con otras sentencias, como una
 * tabla o una llave, que las funciones estén no dice nada de lo demás
 */
export function onlyFunctionStatements(sql: string): boolean {
  return statements(tokenize(sql)).every((statement) => {
    const [first, second, third, fourth] = statement;
    if (isWord(first, ...FUNCTION_ONLY_STATEMENTS)) return true;
    if (!isWord(first, 'create')) return false;
    if (isWord(second, 'or') && isWord(third, 'replace')) {
      return isWord(fourth, 'function', 'procedure');
    }
    return isWord(second, 'function', 'procedure');
  });
}

/**
 * true si la definición del repo es la misma que la de la base. Compara la huella del cuerpo,
 * security definer y el set de su encabezado, salvo que el set no se pudiera leer
 */
export function sameAsDb(
  def: FunctionDef,
  row: { fingerprint: string; securityDefiner: boolean; config: string },
): boolean {
  return (
    def.body !== null &&
    fingerprint(def.body) === row.fingerprint &&
    def.securityDefiner === row.securityDefiner &&
    (def.config === null || def.config.join('\n') === row.config)
  );
}

/** true si dos definiciones del repo son la misma, con la misma regla que sameAsDb */
export function sameDef(a: FunctionDef, b: FunctionDef): boolean {
  return (
    a.body !== null &&
    b.body !== null &&
    fingerprint(a.body) === fingerprint(b.body) &&
    a.securityDefiner === b.securityDefiner &&
    (a.config === null || b.config === null || a.config.join('\n') === b.config.join('\n'))
  );
}

/**
 * La huella de un cuerpo. Es la misma cuenta que hace la base con
 * md5(regexp_replace(regexp_replace(prosrc, '--[^\n]*', '', 'g'), '\s+', '', 'g')), así que no cambia
 * por comentarios de línea ni por espacios. \s de Postgres son los espacios de ASCII
 */
export function fingerprint(body: string): string {
  const stripped = body.replace(/--[^\n]*/g, '').replace(/[ \t\n\r\f\v]+/g, '');
  return createHash('md5').update(stripped, 'utf8').digest('hex');
}

/** La consulta que da la huella y el permiso de anon de las funciones de public con esos nombres */
export function fingerprintQuery(names: readonly string[]): string {
  for (const name of names) {
    if (!/^[a-z_][a-z0-9_]*$/.test(name)) {
      throw new SqlParseError(`El nombre de función ${name} no es uno simple de Postgres`);
    }
  }
  const list = names.map((name) => `'${name}'`).join(', ');
  return [
    '-- studiare-deploy huellas',
    'select p.proname::text as name,',
    "  md5(regexp_replace(regexp_replace(p.prosrc, '--[^\\n]*', '', 'g'), '\\s+', '', 'g')) as fingerprint,",
    '  p.prosecdef as security_definer,',
    "  coalesce(array_to_string(p.proconfig, chr(10)), '') as config,",
    "  has_function_privilege('anon', p.oid, 'execute') as anon",
    'from pg_catalog.pg_proc p',
    'join pg_catalog.pg_namespace n on n.oid = p.pronamespace',
    `where n.nspname = 'public' and p.proname = any (array[${list}]::text[])`,
    'order by 1, 2',
  ].join('\n');
}

export interface AnonGrants {
  /** Funciones de public que el archivo abre a anon, directo o por public */
  functions: Set<string>;
  /** El archivo abre a anon todas las funciones de public */
  all: boolean;
}

/** Lo que el archivo concede a anon. Las sentencias dentro de un do o de un execute no cuentan */
export function anonGrants(sql: string): AnonGrants {
  const result: AnonGrants = { functions: new Set(), all: false };
  for (const statement of statements(tokenize(sql))) {
    if (!isWord(statement[0], 'grant')) continue;
    const on = statement.findIndex((token) => isWord(token, 'on'));
    const to = statement.findIndex((token) => isWord(token, 'to'));
    if (on === -1 || to === -1 || to < on) continue;
    const privileges = statement.slice(1, on);
    if (!privileges.some((token) => isWord(token, 'execute', 'all'))) continue;
    const grantees = statement.slice(to + 1);
    if (!grantees.some((token) => isWord(token, 'anon', 'public'))) continue;
    if (isWord(statement[on + 1], 'all') && isWord(statement[on + 2], 'functions', 'routines')) {
      result.all = true;
      continue;
    }
    if (!isWord(statement[on + 1], 'function', 'routine', 'procedure')) continue;
    // Uno o varios nombres separados por coma, cada uno con o sin sus argumentos
    let at = on + 2;
    while (at < to) {
      const qualified = qualifiedName(statement, at);
      if (!qualified) break;
      if (qualified.schema === 'public') result.functions.add(qualified.name);
      at = qualified.next;
      if (isPunct(statement[at], '(')) at = closingParen(statement, at) + 1;
      if (isPunct(statement[at], ',')) at += 1;
      else break;
    }
  }
  return result;
}

/** Línea que abre la consulta de comprobación al final de un archivo de supabase/manual */
const CHECK_MARKER = /^\s*--.*comprobaci[oó]n/i;

/**
 * La consulta de comprobación de un archivo manual, el select que va después de la última línea de
 * comentario que dice Comprobación. null si el archivo no la trae
 */
export function checkQuery(sql: string): string | null {
  const lines = sql.split('\n');
  let marker = -1;
  lines.forEach((line, index) => {
    if (CHECK_MARKER.test(line)) marker = index;
  });
  if (marker === -1) return null;
  const tail = lines.slice(marker + 1).join('\n');
  const parts = statements(tokenize(tail));
  const [only] = parts;
  const first = only?.[0];
  const last = only?.at(-1);
  // Solo select. Un with puede llevar un insert, un update o un delete
  if (parts.length !== 1 || !first || !last || !isWord(first, 'select')) {
    throw new SqlParseError('Después de la línea de Comprobación debe ir un solo select');
  }
  return tail.slice(first.start, last.end);
}

/**
 * Los nombres de las columnas de un select, los que van con as en su primer nivel, sin los de las
 * subconsultas. null si alguna columna no lleva as y no se puede saber su nombre
 */
export function checkColumns(query: string): string[] | null {
  const [statement] = statements(tokenize(query));
  if (!statement || !isWord(statement[0], 'select')) return null;
  const columns: string[] = [];
  let depth = 0;
  let item: Token[] = [];
  const close = () => {
    const alias = item.at(-1);
    if (item.length < 3 || !isWord(item.at(-2), 'as') || !alias || alias.kind === 'punct') {
      return false;
    }
    columns.push(alias.value);
    item = [];
    return true;
  };
  for (const token of statement.slice(1)) {
    if (isPunct(token, '(')) depth += 1;
    if (isPunct(token, ')')) depth -= 1;
    if (depth === 0 && isWord(token, 'from')) break;
    if (depth === 0 && isPunct(token, ',')) {
      if (!close()) return null;
      continue;
    }
    item.push(token);
  }
  return close() ? columns : null;
}
