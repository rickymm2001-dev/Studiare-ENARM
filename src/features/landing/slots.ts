// Lugares de texto de la portada y reglas del texto que viene de fuera (B17, 5.2 y 5.3 del plan de B17).
// La agencia o el influencer escriben el texto de venta, y esta es la puerta por la que entra: cada
// lugar tiene un id y un largo máximo, y cada texto pasa por las mismas reglas antes de llegar a la
// pantalla (sin HTML, sin enlaces fuera de lista, sin promesas que el producto no puede cumplir, en
// español de México con trato de tú). Las revisa src/i18n/landing.test.ts con el texto que está en
// src/i18n/landing.ts, y la vista previa de preview.ts con lo que se pruebe en el navegador.
// Funciones puras, sin React. No cargan con la portada, solo las pruebas y la vista previa las usan.
import { BRAND } from '@/config/brand';
import type { LandingCreator, LandingTestimonial } from '@/i18n/landing';
import { slotId } from './slotId';

export { slotId };

/** La forma del texto de la portada que importa aquí. t.landing la cumple, con o sin bloques */
export interface LandingContent {
  documentTitle: string;
  badge: string;
  title: string;
  subtitle: string;
  cta: string;
  login: string;
  trust: string;
  featuresTitle: string;
  features: Readonly<Record<string, readonly [string, string]>>;
  personasTitle: string;
  personas: readonly (readonly [string, string])[];
  pricingTitle: string;
  bestValue: string;
  founderBadge: string;
  faqTitle: string;
  faq: readonly (readonly [string, string])[];
  finalTitle: string;
  testimonialsTitle: string;
  sampleLabel: string;
  creator: LandingCreator | null;
  testimonials: readonly LandingTestimonial[];
}

/** Lo que la portada pinta en los dos bloques opcionales. sample marca el contenido de prueba */
export interface LandingBlocks {
  creator: LandingCreator | null;
  testimonials: readonly LandingTestimonial[];
  sample: boolean;
}

/** Cuántos elementos tiene cada lista. Las funciones y los perfiles llevan un ícono fijo cada uno */
export const LANDING_COUNTS = {
  features: 6,
  personas: 6,
  faqMin: 3,
  testimonialsMax: 6,
} as const;

/** El id de un lugar con número lleva N en la familia y el número del elemento al usarlo */
export interface SlotFamily {
  id: string;
  /** Largo máximo en caracteres */
  max: number;
}

/**
 * Los lugares marcados de 5.2, en el orden de la página. Es la tabla que se le da a la agencia
 * (docs/PORTADA.md) y la prueba landing.test.ts revisa que el documento la traiga completa
 */
export const SLOT_FAMILIES: readonly SlotFamily[] = [
  { id: 'hero.badge', max: 60 },
  { id: 'hero.title', max: 70 },
  { id: 'hero.subtitle', max: 220 },
  { id: 'hero.cta', max: 30 },
  { id: 'hero.trust', max: 80 },
  { id: 'features.N.title', max: 40 },
  { id: 'features.N.text', max: 180 },
  { id: 'personas.N.who', max: 40 },
  { id: 'personas.N.text', max: 140 },
  { id: 'creator.name', max: 60 },
  { id: 'creator.role', max: 80 },
  { id: 'creator.quote', max: 240 },
  { id: 'creator.photoAlt', max: 120 },
  { id: 'testimonials.N.quote', max: 240 },
  { id: 'testimonials.N.who', max: 60 },
  { id: 'faq.N.question', max: 90 },
  { id: 'faq.N.answer', max: 300 },
  { id: 'final.title', max: 70 },
  { id: 'meta.title', max: 60 },
  { id: 'meta.description', max: 160 },
];

const MAX_BY_FAMILY = new Map(SLOT_FAMILIES.map((family) => [family.id, family.max]));

/** Un lugar con su texto actual y su largo máximo */
export interface LandingSlot {
  id: string;
  max: number;
  value: string;
}

function slot(family: string, value: string, position?: number): LandingSlot {
  const max = MAX_BY_FAMILY.get(family);
  if (max === undefined) throw new Error(`Familia de lugar desconocida, ${family}`);
  return { id: slotId(family, position), max, value };
}

/** Los textos de la portada que no son un lugar, sin largo máximo pero con las mismas reglas */
export function labelEntries(content: LandingContent): { id: string; value: string }[] {
  return [
    { id: 'label.documentTitle', value: content.documentTitle },
    { id: 'label.login', value: content.login },
    { id: 'label.featuresTitle', value: content.featuresTitle },
    { id: 'label.personasTitle', value: content.personasTitle },
    { id: 'label.pricingTitle', value: content.pricingTitle },
    { id: 'label.bestValue', value: content.bestValue },
    { id: 'label.founderBadge', value: content.founderBadge },
    { id: 'label.faqTitle', value: content.faqTitle },
    { id: 'label.testimonialsTitle', value: content.testimonialsTitle },
    { id: 'label.sampleLabel', value: content.sampleLabel },
  ];
}

/** Los lugares de los dos bloques opcionales. Vacíos no tienen ninguno */
export function blockSlots(
  creator: LandingCreator | null,
  testimonials: readonly LandingTestimonial[],
): LandingSlot[] {
  const slots: LandingSlot[] = [];
  if (creator) {
    slots.push(
      slot('creator.name', creator.name),
      slot('creator.role', creator.role),
      slot('creator.quote', creator.quote),
    );
    if (creator.photo) slots.push(slot('creator.photoAlt', creator.photo.alt));
  }
  testimonials.forEach((testimonial, index) => {
    slots.push(
      slot('testimonials.N.quote', testimonial.quote, index + 1),
      slot('testimonials.N.who', testimonial.who, index + 1),
    );
  });
  return slots;
}

/** Todos los lugares que hoy tienen texto, con el título y la descripción que salen de BRAND */
export function landingSlots(
  content: LandingContent,
  brand: { name: string; description: string } = BRAND,
): LandingSlot[] {
  const features = Object.values(content.features);
  return [
    slot('hero.badge', content.badge),
    slot('hero.title', content.title),
    slot('hero.subtitle', content.subtitle),
    slot('hero.cta', content.cta),
    slot('hero.trust', content.trust),
    ...features.flatMap(([title, text], index) => [
      slot('features.N.title', title, index + 1),
      slot('features.N.text', text, index + 1),
    ]),
    ...content.personas.flatMap(([who, text], index) => [
      slot('personas.N.who', who, index + 1),
      slot('personas.N.text', text, index + 1),
    ]),
    ...blockSlots(content.creator, content.testimonials),
    ...content.faq.flatMap(([question, answer], index) => [
      slot('faq.N.question', question, index + 1),
      slot('faq.N.answer', answer, index + 1),
    ]),
    slot('final.title', content.finalTitle),
    slot('meta.title', brand.name),
    slot('meta.description', brand.description),
  ];
}

// Enlaces ----------------------------------------------------------------------------------------

/**
 * Los sitios a los que un texto de la portada puede apuntar. Vacía a propósito. La portada enlaza
 * con rutas de la propia app desde el código, nunca desde un texto. Agregar un sitio aquí es una
 * decisión de Ricardo, con su porqué en un comentario
 */
export const ALLOWED_LINK_HOSTS: readonly string[] = [];

const SCHEME_LINK = /\b(?:(?:https?|ftp):\/\/|www\.)[^\s]+|\b(?:mailto|tel|sms|whatsapp):[^\s]+/giu;
const BARE_DOMAIN =
  /\b[\p{L}\d](?:[\p{L}\d-]*[\p{L}\d])?(?:\.[\p{L}\d](?:[\p{L}\d-]*[\p{L}\d])?)*\.(?:com|mx|org|net|io|co|app|dev|edu|gob|ly|me|tv|info|biz|es|us|ai|link|bio|shop|store|online|site|xyz)\b/giu;
const MENTION = /(?<![\p{L}\d])@[\p{L}\d_]{2,}/u;

/** El sitio de un enlace, sin esquema, usuario, puerto ni ruta, en minúsculas */
function hostOf(link: string): string {
  const withoutScheme = link.replace(/^[a-z]+:(?:\/\/)?/iu, '');
  const withoutUser = withoutScheme.slice(withoutScheme.lastIndexOf('@') + 1);
  return (withoutUser.split(/[/:?#]/u)[0] ?? '').replace(/^www\./iu, '').toLowerCase();
}

function linkProblems(value: string, allowedHosts: readonly string[]): string[] {
  const problems: string[] = [];
  const allowed = (host: string) =>
    allowedHosts.some((entry) => host === entry || host.endsWith(`.${entry}`));
  for (const match of [...value.matchAll(SCHEME_LINK), ...value.matchAll(BARE_DOMAIN)]) {
    const host = hostOf(match[0]);
    if (!allowed(host)) problems.push(`lleva un enlace a ${host} que no está en la lista`);
  }
  if (MENTION.test(value)) problems.push('menciona una cuenta con @, que no es un lugar permitido');
  return problems;
}

// Promesas y cifras -------------------------------------------------------------------------------

/** Una promesa que el producto no puede cumplir. Se rechaza salvo en una oración que la niega */
interface PromiseRule {
  name: string;
  pattern: RegExp;
}

// Piezas de las promesas de aprobar y de plaza. Verbos en futuro de segunda persona (aprobar + ás, obtendr + ás),
// en "vas a" + infinitivo, y lo que se promete conseguir: el examen o la plaza
const FUTURE_VERB =
  '(?:aprobar|pasar|ganar|lograr|sacar|superar|acreditar|conseguir|obtendr|saldr|tendr|quedar|entrar|llegar|alcanzar)[aá]s?';
const GOING_TO_VERB =
  '(?:aprobar|pasar|ganar|lograr|sacar|superar|acreditar|conseguir|obtener|salir|tener|quedar|entrar|llegar|alcanzar)';
const THE_EXAM = '(?:(?:el|tu|su|este|ese|la)\\s+)?(?:enarm|examen)\\b';
const THE_PLACE = '(?:(?:con|en|a|de)\\s+)?(?:(?:el|la|tu|su|una?)\\s+)?(?:plaza|residencia)\\b';

/** Lo que CLAUDE.md prohíbe prometer. Nada de predecir el puntaje del ENARM ni de asegurar una plaza */
const PROMISES: readonly PromiseRule[] = [
  {
    name: 'puntaje esperado o predicción del puntaje',
    pattern:
      /puntaje\s+(?:esperado|estimado|proyectado|probable|asegurado|garantizado)|(?:predic|predec|pronostic|calcul|estim|proyect|asegur|garantiz|prometem|sabr)\p{L}*\s+(?:de\s+|del\s+)?(?:tu|el|su|un)\s+(?:puntaje|calificaci)|qu[eé]\s+puntaje\s+(?:(?:voy|vas|va)\s+a\s+)?(?:sacar|obtener|tener|lograr|alcanzar|sacar[aá]s|obtendr[aá]s)/giu,
  },
  {
    name: 'plaza asegurada',
    pattern: new RegExp(
      [
        // "Plaza asegurada", "residencia garantizada", "lugar seguro"
        String.raw`(?:plaza|residencia|lugar)\s+(?:asegurad|garantizad|segur)\p{L}*`,
        // "Tu plaza está asegurada", "la residencia ya queda garantizada"
        String.raw`(?:plaza|residencia)\s+(?:\p{L}+\s+){1,2}(?:asegurad|garantizad)\p{L}*`,
        String.raw`(?:asegur|garantiz)\p{L}*\s+(?:tu|la|una)\s+(?:plaza|residencia|lugar)`,
        String.raw`\bte\s+aseguramos\b`,
        // "Saldrás con plaza", "Tendrás tu plaza", "Vas a quedar en una residencia"
        String.raw`\b${FUTURE_VERB}\s+${THE_PLACE}`,
        String.raw`\bvas\s+a\s+${GOING_TO_VERB}\s+${THE_PLACE}`,
      ].join('|'),
      'giu',
    ),
  },
  {
    name: 'garantía de aprobar',
    pattern: new RegExp(
      [
        String.raw`garant\p{L}*[^.?!¿]{0,60}(?:aprob|pasar|plaza|resultado|[eé]xito|puntaje|ENARM)`,
        String.raw`(?:aprob|plaza|resultado|[eé]xito|puntaje)\p{L}*[^.?!¿]{0,60}garant`,
        String.raw`\b(?:aprob|apru[eé]b)\p{L}*\s+(?:el\s+)?(?:ENARM\s+)?(?:seguro|con\s+certeza|sin\s+falla)`,
        // "Aprobarás el ENARM", "Aprobarás tu examen", "Pasarás el examen"
        String.raw`\b${FUTURE_VERB}\s+${THE_EXAM}`,
        // "Vas a pasar el ENARM", "Vas a aprobar"
        String.raw`\b(?:vas|van|voy)\s+a\s+${GOING_TO_VERB}\s+${THE_EXAM}`,
        String.raw`\b(?:vas|van)\s+a\s+aprobar\b`,
        // "Aprobarás" solo, en segunda persona. La tercera ("un médico aprobará la tarjeta") es del flujo editorial
        String.raw`\baprobar[aá]s\b`,
      ].join('|'),
      'giu',
    ),
  },
];

/** Lo que solo se acepta con respaldo escrito en BACKED_CLAIMS */
interface ClaimRule {
  name: string;
  pattern: RegExp;
}

// Cantidades que cuentan como cifra. De diez para arriba, porque "tres tarjetas" no presume nada
const BIG_NUMBER =
  '(?:diez|once|doce|trece|catorce|quince|diec\\p{L}+|veinte|veint\\p{L}+|treinta|cuarenta|cincuenta|sesenta|setenta|ochenta|noventa|cien|ciento|\\p{L}*cientos|mil|mill[oó]n|millones)';
const PEOPLE_OR_THINGS =
  '(?:alumnos|estudiantes|m[eé]dicos|usuarios|personas|aspirantes|residentes|egresados|casos|preguntas|tarjetas|mazos)';

const CLAIMS: readonly ClaimRule[] = [
  {
    name: '100%',
    pattern: /\b100\s?%|\bcien\s+por\s+ciento\b|\bal\s+100\b/giu,
  },
  {
    name: 'superlativo',
    pattern:
      /\b(?:el|la|los|las)\s+(?:mejor(?:es)?|[uú]nic[oa]s?)\b|\bn[uú]mero\s+(?:1|uno)\b|(?<![\p{L}\d])#\s?1\b|\bl[ií]der(?:es)?\b/giu,
  },
  {
    // "El algoritmo más preciso" es un superlativo sin el artículo de arriba. Una comparación así necesita
    // el mismo respaldo que "el mejor", y la portada traía una (FSRS) sin tenerlo. También "la plataforma más
    // usada" y "el banco más grande de México", que comparan con todos los demás
    name: 'comparativo',
    pattern: new RegExp(
      [
        String.raw`\bm[aá]s\s+(?:precis|exact|r[aá]pid|efectiv|eficaz|eficient|confiable|complet|segur|usad|popular|vendid|elegid|recomendad|buscad|valorad|reconocid|premiad|confiad)\p{L}*`,
        String.raw`\bm[aá]s\s+\p{L}+\s+(?:del\s+(?:pa[ií]s|mundo|mercado)|de\s+(?:M[eé]xico|Latinoam[eé]rica|Am[eé]rica|todos|todas|su\s+categor[ií]a)|en\s+(?:M[eé]xico|Latinoam[eé]rica))`,
      ].join('|'),
      'giu',
    ),
  },
  {
    name: 'cifra',
    pattern: new RegExp(
      [
        // 87%, 87 %, 90 por ciento
        String.raw`\b\d+(?:[.,]\d+)?\s?%`,
        String.raw`\bpor\s+ciento\b`,
        // 2,000 y 2.000
        String.raw`\b\d{1,3}(?:[.,]\d{3})+\b`,
        // 10 mil, diez mil, 2 millones
        String.raw`\b(?:\d[\d.,]*|${BIG_NUMBER})\s+mil\b`,
        // 500 médicos, cien alumnos, veinte mil casos
        String.raw`\b(?:\d{2,}|${BIG_NUMBER})\s+${PEOPLE_OR_THINGS}\b`,
        String.raw`\b(?:miles|cientos|millones)\s+de\b`,
        String.raw`\bm[aá]s\s+de\s+(?:\d|${BIG_NUMBER}\b)`,
      ].join('|'),
      'giu',
    ),
  },
];

/**
 * Una afirmación que Ricardo aprobó porque tiene con qué respaldarla. slot es el id del lugar, text el
 * fragmento tal como aparece y backing dice dónde está la prueba (un documento, un estudio, una cifra
 * del producto con su fecha). Vacía hasta que haya una
 */
export interface BackedClaim {
  slot: string;
  text: string;
  backing: string;
}

export const BACKED_CLAIMS: readonly BackedClaim[] = [];

const sentencesOf = (value: string): string[] => value.split(/(?<=[.!?…])\s+/u);
const isQuestion = (sentence: string): boolean => /[¿?]/u.test(sentence);

// Una palabra suelta. \b de JavaScript solo conoce las letras sin acento, así que "niño" o "año" contarían como
// "ni" y "no". Estos límites usan letras Unicode
const WORD_START = String.raw`(?<![\p{L}\d])`;
const WORD_END = String.raw`(?![\p{L}\d])`;

const NEGATION = new RegExp(
  `${WORD_START}(?:no|nadie|nunca|jam[aá]s|ni|ning[uú]n|ninguna|ninguno|imposible)${WORD_END}`,
  'iu',
);

/**
 * Lo que corta el alcance de una negación. Una coma, un punto y coma, dos puntos, un paréntesis o una raya abre otra
 * idea, y una conjunción también. "No pierdas tiempo y aprobarás el ENARM" niega perder tiempo, no la promesa
 */
const CLAUSE_BREAK = new RegExp(
  `[,;:()—–]|${WORD_START}(?:y|e|pero|sino|aunque|mientras|porque|pues|entonces|cuando|para)${WORD_END}`,
  'giu',
);

/**
 * Un "no" que en realidad afirma, como "No dudes que aprobarás" o "No te preocupes, ...". Se quita antes de buscar la
 * negación, porque no niega nada de lo que viene después
 */
const AFFIRMING_NO = new RegExp(
  `${WORD_START}no\\s+(?:(?:lo|te|se)\\s+)?(?:dud|hay\\s+duda|cabe\\s+duda|olvid|pierd|tem[ae]|esper|preocup)\\p{L}*`,
  'giu',
);

/** Cuántas palabras antes de la promesa puede estar la negación, dentro de la misma idea */
const NEGATION_REACH = 6;

/**
 * Si lo que va antes de la promesa la niega, como en "Nadie puede predecir tu puntaje" o "No te prometemos un
 * puntaje esperado". La negación vale solo dentro de la misma idea (sin coma, conjunción ni dos puntos de por
 * medio) y a no más de NEGATION_REACH palabras de la promesa
 */
function negates(before: string): boolean {
  const lastBreak = [...before.matchAll(CLAUSE_BREAK)].at(-1);
  const clause = lastBreak ? before.slice(lastBreak.index + lastBreak[0].length) : before;
  const words = clause.replace(AFFIRMING_NO, ' ').split(/\s+/u).filter(Boolean);
  return words.slice(-NEGATION_REACH).some((word) => NEGATION.test(word));
}

function promiseProblems(value: string): string[] {
  const problems: string[] = [];
  for (const sentence of sentencesOf(value)) {
    // Una pregunta no promete nada
    if (isQuestion(sentence)) continue;
    for (const rule of PROMISES) {
      for (const match of sentence.matchAll(rule.pattern)) {
        // La respuesta honesta niega la promesa en la misma idea, antes de nombrarla
        if (!negates(sentence.slice(0, match.index))) {
          problems.push(`promete algo que no se puede, ${rule.name}`);
        }
      }
    }
  }
  return problems;
}

function claimProblems(id: string, value: string, backed: readonly BackedClaim[]): string[] {
  const problems: string[] = [];
  for (const rule of CLAIMS) {
    for (const match of value.matchAll(rule.pattern)) {
      const fragment = match[0].trim().toLowerCase();
      const respaldo = backed.some(
        (claim) =>
          claim.slot === id &&
          claim.text.trim().toLowerCase() === fragment &&
          claim.backing.trim().length >= 10,
      );
      if (!respaldo) {
        problems.push(
          `"${match[0]}" (${rule.name}) pide respaldo, agrégalo a BACKED_CLAIMS con su fuente`,
        );
      }
    }
  }
  return problems;
}

// Caracteres que no se ven -------------------------------------------------------------------------

/**
 * Cualquier carácter de formato (U+200B espacio de ancho cero, U+00AD guion suave, U+202E inversión de dirección,
 * U+FEFF marca de orden de bytes...) o de control, salvo el salto de línea y el tabulador, de los que ya se ocupa la
 * regla de espacios. Un texto copiado de Word, de un chat o de una página trae a veces alguno sin que nadie lo vea
 */
const INVISIBLE = /(?![\n\r\t])[\p{Cf}\p{Cc}]/u;

/** El texto como lo lee una persona. Sin caracteres de formato y en forma NFKC, que lleva el ancho completo y las ligaduras a letras normales */
export function plainTextOf(value: string): string {
  return value.replace(new RegExp(INVISIBLE, 'gu'), '').normalize('NFKC');
}

// Reglas de un texto ------------------------------------------------------------------------------

export interface RuleOptions {
  allowedHosts?: readonly string[];
  backedClaims?: readonly BackedClaim[];
}

/**
 * Las reglas de 5.3 para un texto. Devuelve los problemas, uno por frase, o una lista vacía si pasa.
 * max es el largo máximo del lugar, y sin él solo se revisan las demás reglas
 */
export function textProblems(
  id: string,
  value: string,
  max?: number,
  options: RuleOptions = {},
): string[] {
  const { allowedHosts = ALLOWED_LINK_HOSTS, backedClaims = BACKED_CLAIMS } = options;
  const problems: string[] = [];
  if (value.trim() === '') return [`${id} está vacío`];
  // Lo que se ve y lo que se revisa pueden ser distintos: un espacio de ancho cero o un guion suave parten una
  // palabra sin que se note, y el ancho completo o una ligadura escriben otras letras. Primero se rechazan, y las
  // demás reglas leen el texto sin ellos y en forma NFKC para que no escondan nada
  if (INVISIBLE.test(value)) {
    problems.push('lleva caracteres invisibles, de control o de formato Unicode');
  }
  const text = plainTextOf(value);
  if (value !== value.normalize('NFC')) problems.push('no está normalizado en Unicode (NFC)');
  if (/^\s|\s$|\s{2,}|[\n\r\t]/u.test(value)) {
    problems.push('lleva espacios de más, saltos de línea o tabuladores');
  }
  if (/[<>]|&(?:#\d+|#x[\da-f]+|[a-z][a-z\d]*);|\$\{|\{\{|\}\}/iu.test(text)) {
    problems.push('lleva HTML, entidades o marcas de plantilla');
  }
  if (/undefined|NaN|\[object/u.test(text)) problems.push('lleva un valor sin llenar');
  if (/[!¡]/u.test(text)) problems.push('lleva signos de exclamación');
  // Los dos puntos de un enlace son del enlace, y de los enlaces ya se ocupa su propia regla
  if (text.replace(SCHEME_LINK, ' ').includes(':')) problems.push('lleva el signo de dos puntos');
  if (/\b(?:usted(?:es)?|vosotros)\b/iu.test(text)) problems.push('no usa el trato de tú');
  const length = Array.from(value).length;
  if (max !== undefined && length > max) {
    problems.push(`pasa de ${max} caracteres (tiene ${length})`);
  }
  problems.push(
    ...linkProblems(text, allowedHosts),
    ...promiseProblems(text),
    ...claimProblems(id, text, backedClaims),
  );
  return problems.map((problem) => (problem.startsWith(id) ? problem : `${id} ${problem}`));
}

// Bloques opcionales ------------------------------------------------------------------------------

/** El archivo de la foto. Siempre webp y dentro de public/landing */
export const PHOTO_FILE = /^[a-z0-9][a-z0-9-]*\.webp$/u;

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/u;

/** Una fecha AAAA-MM-DD real, no posterior a today */
export function validPermissionDate(value: string, today = new Date()): boolean {
  const match = ISO_DATE.exec(value);
  if (!match) return false;
  const [, year, month, day] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  const real =
    date.getUTCFullYear() === Number(year) &&
    date.getUTCMonth() === Number(month) - 1 &&
    date.getUTCDate() === Number(day);
  return real && date.getTime() <= today.getTime();
}

/** Lo propio de cada bloque opcional, además de las reglas de texto de cada lugar */
function blockStructureProblems(
  creator: LandingCreator | null,
  testimonials: readonly LandingTestimonial[],
  today?: Date,
): string[] {
  const problems: string[] = [];
  if (creator?.photo && !PHOTO_FILE.test(creator.photo.file)) {
    problems.push(
      'creator.photoFile debe ser un archivo webp de public/landing, como creador.webp',
    );
  }
  if (testimonials.length > LANDING_COUNTS.testimonialsMax) {
    problems.push(`testimonials pasa de ${LANDING_COUNTS.testimonialsMax} testimonios`);
  }
  testimonials.forEach((testimonial, index) => {
    if (!validPermissionDate(testimonial.permissionOn, today)) {
      problems.push(
        `testimonials.${index + 1}.permissionOn debe ser la fecha AAAA-MM-DD del permiso por escrito, sin ser futura`,
      );
    }
  });
  return problems;
}

/** Los problemas de los dos bloques opcionales, con las reglas de texto en cada lugar y las propias de cada bloque */
export function blockProblems(
  creator: LandingCreator | null,
  testimonials: readonly LandingTestimonial[],
  options: RuleOptions & { today?: Date } = {},
): string[] {
  return [
    ...blockSlots(creator, testimonials).flatMap((entry) =>
      textProblems(entry.id, entry.value, entry.max, options),
    ),
    ...blockStructureProblems(creator, testimonials, options.today),
  ];
}

/** Todas las reglas sobre todo el texto de la portada. Una lista vacía es que todo pasa */
export function landingProblems(
  content: LandingContent,
  options: RuleOptions & { today?: Date; brand?: { name: string; description: string } } = {},
): string[] {
  const problems: string[] = [];
  if (Object.keys(content.features).length !== LANDING_COUNTS.features) {
    problems.push(`features debe tener ${LANDING_COUNTS.features} funciones`);
  }
  if (content.personas.length !== LANDING_COUNTS.personas) {
    problems.push(`personas debe tener ${LANDING_COUNTS.personas} perfiles`);
  }
  if (content.faq.length < LANDING_COUNTS.faqMin) {
    problems.push(`faq debe tener ${LANDING_COUNTS.faqMin} preguntas o más`);
  }
  for (const entry of landingSlots(content, options.brand)) {
    problems.push(...textProblems(entry.id, entry.value, entry.max, options));
  }
  for (const entry of labelEntries(content)) {
    problems.push(...textProblems(entry.id, entry.value, undefined, options));
  }
  problems.push(...blockStructureProblems(content.creator, content.testimonials, options.today));
  return problems;
}
