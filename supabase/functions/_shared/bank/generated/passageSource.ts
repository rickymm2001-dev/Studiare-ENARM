// Generado por scripts/content/sync-bank-shared.ts desde src/data/content/passageSource.ts. No lo edites a mano. Cambia el
// original y corre npm run bank:shared.
// Fuente del texto de un caso de lectura en inglés (B13, 1.4 y 8.14 del plan de B13). Cada texto en
// inglés lleva su fuente y su licencia a la vista, y una pregunta en inglés sin fuente válida no se
// aprueba. La fuente viaja como la primera referencia de la pregunta, con una forma fija de texto, para
// que llegue sin cambios al alumno, al editor, a la huella y a la sincronización sin redefinir las
// funciones del contenido de B11. Por eso una sola función la arma y otra la lee, y la función SQL
// bank_passage_source_issue (20261027000001_english_section.sql) es su espejo. Una prueba compara las
// dos sobre tests/fixtures/passage-sources.json (EN9)
//
//   Fuente del texto. {título}. {licencia}. {enlace}
//   Fuente del texto. Heart Attack, MedlinePlus.gov (NLM). Dominio público. https://medlineplus.gov/heartattack.html
//   Fuente del texto. Texto propio del equipo Studiare.
//
// La lectura es de derecha a izquierda. El último pedazo que empieza con http es el enlace, antes va la
// licencia, que se reconoce solo por su nombre exacto (sin importar mayúsculas y con o sin el acento de público),
// y todo lo anterior es el título, que puede traer puntos. El prefijo se reconoce sin importar mayúsculas
// ni espacios de más. Lo comparte la función bank-sync con una copia generada
// (scripts/content/sync-bank-shared.ts). Funciones puras, sin Node ni React.
import { normalizeText } from './bankColumns.ts';

/** Las licencias que acepta Studiare para el texto de un caso de lectura (8.8). Cualquier otra no entra */
export const PASSAGE_LICENSES = ['team', 'public_domain', 'cc0', 'cc_by', 'cc_by_sa'] as const;
export type PassageLicense = (typeof PASSAGE_LICENSES)[number];

/** Así empieza la referencia que es la fuente. Es lo que busca el servidor */
export const PASSAGE_SOURCE_PREFIX = 'Fuente del texto. ';

/** El largo máximo de una referencia, el de GpcReferenceSchema y el de la base */
export const PASSAGE_SOURCE_MAX_LENGTH = 300;

export interface PassageSource {
  title: string;
  license: PassageLicense;
  /** Dirección https de donde sale el texto. null en el texto propio del equipo */
  url: string | null;
}

/** Lo que falta o sobra en una fuente. Son los pendientes del servidor (1.6) */
export type PassageSourceIssue = 'passage_source_missing' | 'license_not_allowed';

/** Cómo se escribe cada licencia en el Sheet, en la referencia y en la app */
export const LICENSE_LABELS: Record<PassageLicense, string> = {
  team: 'Texto propio del equipo Studiare',
  public_domain: 'Dominio público',
  cc0: 'CC0',
  cc_by: 'CC BY',
  cc_by_sa: 'CC BY-SA',
};

/** Todas piden enlace, menos el texto propio del equipo, que no cita nada de afuera */
export function licenseNeedsUrl(license: PassageLicense): boolean {
  return license !== 'team';
}

const PREFIX_WORD = 'Fuente del texto.';
/**
 * Minúsculas, la ú de público sin acento y espacios simples, para reconocer el nombre de la licencia.
 * Es lo que reconoce también la función SQL con sus expresiones, así que las dos aceptan lo mismo. Un
 * acento en cualquier otra letra no se perdona
 */
function fold(text: string): string {
  return text.toLowerCase().replace(/ú/g, 'u').replace(/\s+/g, ' ').trim();
}

/** Una dirección https con host con punto, sin espacios. Pedir más sería pedir de más */
export function isHttpsUrl(value: string): boolean {
  return /^https:\/\/[a-z0-9-]+(?:\.[a-z0-9-]+)+(?::[0-9]+)?(?:[/?#]\S*)?$/i.test(value);
}

/** Si esta referencia es la fuente del texto, o sea, si empieza con Fuente del texto. */
export function isPassageSourceRef(title: string): boolean {
  return /^fuente del texto\.(?: |$)/i.test(title.replace(/\s+/g, ' ').trim());
}

const LABEL_KEYS: readonly (readonly [string, PassageLicense])[] = PASSAGE_LICENSES.map(
  (license) => [fold(LICENSE_LABELS[license]), license] as const,
);

/** La licencia cuyo nombre exacto es este texto, o null. Es lo que reconocen la lectura y el servidor */
function labelLicense(text: string): PassageLicense | null {
  const folded = fold(text);
  return LABEL_KEYS.find(([label]) => label === folded)?.[1] ?? null;
}

/** Lo que dice una referencia de fuente, ya separado en sus tres partes y sin interpretar */
export interface PassageSourceParts {
  title: string;
  /** El texto de la licencia tal como está en la referencia. Vacío si no hay */
  licenseText: string;
  /** El último pedazo que empieza con http, sea https o no. Vacío si no hay */
  url: string;
}

/**
 * Separa la referencia de fuente de derecha a izquierda. El enlace es el último pedazo que empieza con
 * http, la licencia es lo que sigue al último punto con espacio (o todo, si es el nombre exacto de una
 * licencia) y el título es lo anterior. Sirve al editor para mostrar lo que hay aunque la fuente esté
 * incompleta. null si la referencia no es la fuente
 */
export function splitPassageSource(reference: string): PassageSourceParts | null {
  if (!isPassageSourceRef(reference)) return null;
  const collapsed = reference.replace(/\s+/g, ' ').trim();
  let rest = collapsed.slice(PREFIX_WORD.length).trim();
  let url = '';
  const lastSpace = rest.lastIndexOf(' ');
  const last = rest.slice(lastSpace + 1);
  if (/^https?:\/\//i.test(last)) {
    url = last;
    rest = lastSpace < 0 ? '' : rest.slice(0, lastSpace).trim();
  }
  rest = rest.replace(/\.$/, '').trim();
  if (rest === '') return { title: '', licenseText: '', url };
  const cut = /^(.*)\. (.*)$/.exec(rest);
  if (!cut) {
    // Un solo pedazo. Si es el nombre de una licencia, no hay título. Si no, es el título sin licencia
    return labelLicense(rest) === null
      ? { title: rest, licenseText: '', url }
      : { title: '', licenseText: rest, url };
  }
  return { title: (cut[1] ?? '').trim(), licenseText: (cut[2] ?? '').trim(), url };
}

/** Un texto de una sola línea, sin puntos al final, para que la referencia no repita el punto */
function tidy(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.\s]+$/, '');
}

/**
 * Lo más que se lee de la celda del título. Una referencia mide 300 caracteres como máximo, así que un
 * título de más de unos 500 no cabe ni con el prefijo y la licencia más cortos, y leer el resto solo cuesta
 * tiempo. El bank-sync arma una referencia por cada renglón de un caso, y el editor del médico la arma en
 * cada render, con una celda de hasta 50,000 caracteres
 */
export const PASSAGE_TITLE_READ_MAX = 500;

/**
 * Los primeros caracteres de un texto, hasta count puntos de código o hasta units unidades de largo, lo
 * que llegue primero. Recorre solo lo que toma, así el costo no depende de lo largo que sea el texto, y
 * nunca parte un carácter fuera del plano básico, que ocupa dos unidades
 */
function takeChars(text: string, count: number, units: number): string {
  let end = 0;
  let taken = 0;
  for (const char of text) {
    if (taken === count || end + char.length > units) break;
    end += char.length;
    taken += 1;
  }
  return text.slice(0, end);
}

/**
 * Arma la referencia con lo que haya, aunque la licencia no sea de la lista o falte, para que el
 * Sheet conserve lo que escribió el médico y el pendiente salga de leer la referencia con
 * parsePassageSource. Un enlace que no empieza con http o https, o que trae espacios, no es un enlace y
 * se deja fuera, así la fuente queda sin enlace y el pendiente es passage_source_missing. null si no
 * hay nada. Si pasa de 300 caracteres recorta el título y nunca el enlace. El recorte se calcula de una
 * vez, con lo que sobra de los 300 después del prefijo, la licencia y el enlace, y no quitando letras
 * una por una, que costaba más con cada letra de más (30 segundos con un título de 50,000)
 */
export function composePassageSource(parts: {
  title: string;
  license: string;
  url: string;
}): string | null {
  const license = tidy(parts.license);
  const written = parts.url.trim();
  const url = /^https?:\/\/\S+$/i.test(written) ? written : '';
  let title = tidy(takeChars(parts.title, PASSAGE_TITLE_READ_MAX, Infinity));
  if (title === '' && license === '' && url === '') return null;
  const build = (shownTitle: string) => {
    const body = [shownTitle, license].filter((part) => part !== '').join('. ');
    const sentence = body === '' ? '' : `${body}.`;
    return `${PASSAGE_SOURCE_PREFIX}${[sentence, url].filter((part) => part !== '').join(' ')}`;
  };
  let reference = build(title);
  if (reference.length > PASSAGE_SOURCE_MAX_LENGTH && title !== '') {
    // Cada unidad del título suma una al largo de la referencia. build('…') ya cuenta los puntos suspensivos
    // y todo lo demás, así que lo que cabe del título es lo que le falta a eso para los 300
    const room = PASSAGE_SOURCE_MAX_LENGTH - build('…').length;
    const kept = takeChars(title, Infinity, room);
    title = kept === '' ? '' : `${tidy(kept)}…`;
    reference = build(title);
  }
  return reference;
}

/** La referencia de una fuente válida, hasta 300 caracteres. El título se recorta si hace falta */
export function formatPassageSource(source: PassageSource): string {
  return (
    composePassageSource({
      title: source.title,
      license: LICENSE_LABELS[source.license],
      url: source.url ?? '',
    }) ?? PASSAGE_SOURCE_PREFIX.trim()
  );
}

/**
 * Lee la fuente del texto de las referencias de una pregunta y dice si está bien. Toma la primera
 * referencia que empieza con Fuente del texto. Sin ella, o sin licencia, o sin título o sin enlace https
 * cuando la licencia lo pide, es passage_source_missing. Con una licencia fuera de la lista, como CC BY-NC
 * o CC BY-ND, es license_not_allowed. El texto propio del equipo no pide título ni enlace
 */
export function parsePassageSource(
  refs: readonly { title: string }[],
): { ok: true; source: PassageSource } | { ok: false; issue: PassageSourceIssue } {
  const reference = refs.find((ref) => isPassageSourceRef(ref.title));
  const parts = reference ? splitPassageSource(reference.title) : null;
  if (!parts || parts.licenseText === '') return { ok: false, issue: 'passage_source_missing' };
  const license = labelLicense(parts.licenseText);
  if (license === null) return { ok: false, issue: 'license_not_allowed' };
  if (licenseNeedsUrl(license) && (parts.title === '' || !isHttpsUrl(parts.url)))
    return { ok: false, issue: 'passage_source_missing' };
  return {
    ok: true,
    source: {
      title: parts.title,
      license,
      url: isHttpsUrl(parts.url) ? parts.url : null,
    },
  };
}

/**
 * La licencia que el médico escribió en el Sheet. Acepta el nombre de la lista, la clave interna y
 * variantes sin acentos, con guion o con la versión (CC BY 4.0). null si la celda viene vacía y
 * not_allowed si trae otra cosa, como CC BY-NC. En la referencia siempre se guarda el nombre exacto
 */
export function licenseFromSheet(value: string): PassageLicense | 'not_allowed' | null {
  const text = normalizeText(value).replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (text === '') return null;
  const version = '(?: [0-9](?:\\.[0-9])?)?';
  const patterns: readonly (readonly [PassageLicense, RegExp])[] = [
    ['team', /^(?:team|(?:texto )?propio(?: del equipo(?: studiare)?)?)$/],
    ['public_domain', /^(?:dominio publico|public domain)$/],
    ['cc0', new RegExp(`^cc ?0${version}$`)],
    ['cc_by', new RegExp(`^cc by${version}$`)],
    ['cc_by_sa', new RegExp(`^cc by sa${version}$`)],
  ];
  return patterns.find(([, pattern]) => pattern.test(text))?.[0] ?? 'not_allowed';
}
