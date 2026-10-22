// Las preguntas de la encuesta de los primeros días (B18 del plan del cambio, 1.3 del diseño). Los ids son los que
// viajan y los que guarda la base, y el texto de cada uno vive aparte en src/i18n/survey.ts. Una prueba lee la
// migración 20261030000001_first_week_survey.sql y compara cada id y cada regla con este archivo, en los dos sentidos,
// así que cambiar una pregunta pide cambiar los dos lados y la prueba avisa si falta uno.
//
// Siete preguntas cerradas, todas obligatorias, y un comentario libre opcional. Una segunda encuesta, por ejemplo a los
// 30 días, trae su propio id (FIRST_WEEK_SURVEY_ID es el primero) sin pedir otra tabla, pero hay que sumar su id a
// KNOWN_SURVEY_IDS, a survey_answers_ok y a la lista de survey_setting. Es un archivo de datos y de reglas puras, sin
// React ni Dexie, y viaja solo en los módulos diferidos de la encuesta.

/** Qué encuesta es. Va en la fila, en el ajuste survey_first_week y en cada llamada */
export const FIRST_WEEK_SURVEY_ID = 'first-week-v1';

/**
 * Las encuestas que la base sabe revisar. El ajuste survey_first_week solo puede apuntar a una de estas: con otro id, la
 * franja saldría abierta y submit_survey diría que está cerrada. Es la misma lista de survey_setting y de
 * survey_answers_ok en la migración, y una prueba las compara
 */
export const KNOWN_SURVEY_IDS: readonly string[] = [FIRST_WEEK_SURVEY_ID];

/** El comentario libre, hasta 500 caracteres */
export const SURVEY_COMMENT_MAX = 500;

/** Cuántos motivos que frenaron se pueden marcar a la vez */
export const MAX_BLOCKERS = 3;

export const DAYS_USED = ['d0', 'd1_2', 'd3_4', 'd5_6', 'd7'] as const;
export const USED_FEATURES = [
  'review',
  'practice',
  'exam',
  'outlines',
  'progress',
  'party',
  'tutor',
  'import',
  'none',
] as const;
export const SCALE_VALUES = [1, 2, 3, 4, 5] as const;
export const BLOCKERS = [
  'unclear_start',
  'error',
  'slow',
  'few_questions',
  'not_like_exam',
  'confusing_design',
  'nothing',
] as const;
export const RECOMMEND = ['yes', 'maybe', 'no'] as const;

export type DaysUsed = (typeof DAYS_USED)[number];
export type UsedFeature = (typeof USED_FEATURES)[number];
export type ScaleValue = (typeof SCALE_VALUES)[number];
export type Blocker = (typeof BLOCKERS)[number];
export type Recommend = (typeof RECOMMEND)[number];

/** Una pregunta de una sola opción, de varias (con una opción que excluye a las demás) o de escala del 1 al 5 */
export type SurveyQuestion =
  | { id: 'days_used'; kind: 'single'; options: typeof DAYS_USED }
  | { id: 'recommend'; kind: 'single'; options: typeof RECOMMEND }
  | { id: 'used'; kind: 'multiple'; options: typeof USED_FEATURES; exclusive: 'none'; max: number }
  | {
      id: 'blockers';
      kind: 'multiple';
      options: typeof BLOCKERS;
      exclusive: 'nothing';
      max: typeof MAX_BLOCKERS;
    }
  | { id: 'clarity' | 'ease' | 'useful'; kind: 'scale' };

/** En el orden en que se contestan. La pantalla las numera "Pregunta 3 de 8", con el comentario como la octava */
export const SURVEY_QUESTIONS: readonly SurveyQuestion[] = [
  { id: 'days_used', kind: 'single', options: DAYS_USED },
  {
    id: 'used',
    kind: 'multiple',
    options: USED_FEATURES,
    exclusive: 'none',
    max: USED_FEATURES.length,
  },
  { id: 'clarity', kind: 'scale' },
  { id: 'ease', kind: 'scale' },
  { id: 'useful', kind: 'scale' },
  { id: 'blockers', kind: 'multiple', options: BLOCKERS, exclusive: 'nothing', max: MAX_BLOCKERS },
  { id: 'recommend', kind: 'single', options: RECOMMEND },
];

export type QuestionId = SurveyQuestion['id'];
export const QUESTION_IDS: readonly QuestionId[] = SURVEY_QUESTIONS.map((question) => question.id);

/** Las siete preguntas cerradas y el comentario */
export const QUESTION_COUNT = SURVEY_QUESTIONS.length + 1;

/** Las respuestas completas, como viajan y como las guarda la base */
export interface SurveyAnswers {
  days_used: DaysUsed;
  used: UsedFeature[];
  clarity: ScaleValue;
  ease: ScaleValue;
  useful: ScaleValue;
  blockers: Blocker[];
  recommend: Recommend;
}

/** Lo que lleva contestado el formulario. Cada pregunta puede faltar */
export type SurveyDraft = Partial<SurveyAnswers>;

/** Las opciones de una pregunta como texto, de una lista cerrada o los cinco números de una escala */
export function optionsOf(question: SurveyQuestion): readonly string[] {
  return question.kind === 'scale' ? SCALE_VALUES.map(String) : question.options;
}

/**
 * Marca o desmarca una opción de una pregunta de varias. La opción que excluye a las demás (Nada todavía, Nada me frenó)
 * saca a todas las otras, y marcar otra saca a la exclusiva. Con el máximo marcado, una opción más no entra. El orden
 * es el de la pregunta y no el de los clics, así la misma respuesta sale igual
 */
export function toggleOption<T extends string>(
  question: { options: readonly T[]; exclusive: T; max: number },
  current: readonly T[],
  value: T,
): T[] {
  const marked = current.includes(value);
  let next: T[];
  if (marked) {
    next = current.filter((item) => item !== value);
  } else if (value === question.exclusive) {
    next = [value];
  } else {
    next = [...current.filter((item) => item !== question.exclusive), value];
    if (next.length > question.max) return [...current];
  }
  return question.options.filter((option) => next.includes(option));
}

/** Los ids de las preguntas cerradas que todavía no tienen respuesta, en el orden de la pantalla */
export function missingQuestions(draft: SurveyDraft): QuestionId[] {
  return QUESTION_IDS.filter((id) => {
    const answer = draft[id];
    return answer === undefined || (Array.isArray(answer) && answer.length === 0);
  });
}

/** Las respuestas completas, o null si falta alguna */
export function completeAnswers(draft: SurveyDraft): SurveyAnswers | null {
  if (missingQuestions(draft).length > 0) return null;
  const { days_used, used, clarity, ease, useful, blockers, recommend } = draft;
  if (
    days_used === undefined ||
    used === undefined ||
    clarity === undefined ||
    ease === undefined ||
    useful === undefined ||
    blockers === undefined ||
    recommend === undefined
  ) {
    return null;
  }
  return { days_used, used, clarity, ease, useful, blockers, recommend };
}

// ===================================================================== Comentario

/** Por qué no sirve un comentario. Son las mismas reglas de survey_comment_ok en la base, que es la que decide */
export type CommentProblem = 'too_long' | 'email' | 'phone';

/**
 * Las expresiones del filtro, como texto y escritas igual que en survey_comment_ok (migración
 * 20261030000001_first_week_survey.sql). Una prueba lee la migración y compara cada una, y los mismos casos de
 * tests/fixtures/survey-comments.json corren aquí y en el SQL. Es un apoyo y no una garantía: atrapa las formas comunes
 * de dejar un correo o un teléfono y no sabe leer un nombre, un número escrito con palabras ni un correo dictado.
 *   - invisible, lo que se quita antes de revisar: guion suave, caracteres de ancho cero, marcas de dirección, selectores
 *     de variante y rellenos que no se ven
 *   - atForm, "(at)", "[at]" y "{at}", con o sin espacios dentro
 *   - arroba, la palabra entera, sin letras ni números pegados
 *   - phone, diez dígitos o más con a lo mucho tres separadores entre uno y otro (espacio, paréntesis, punto, guion,
 *     raya, guion bajo o punto medio)
 */
export const COMMENT_RULES = {
  invisible:
    '[\\u00AD\\u034F\\u061C\\u115F\\u1160\\u17B4\\u17B5\\u180B-\\u180F\\u200B-\\u200F\\u202A-\\u202E\\u2060-\\u206F\\u3164\\uFE00-\\uFE0F\\uFEFF\\uFFA0]',
  atForm: '[(\\[{]\\s*at\\s*[)\\]}]',
  arroba: '(^|[^a-z0-9_])arroba($|[^a-z0-9_])',
  phone: '(\\+?\\d[\\s().\\u2013\\u2014_\\u00B7\\u2022-]{0,3}){10,}',
} as const;

// La clase lleva a propósito caracteres que se combinan con otros (U+034F, selectores de variante), todos como escapes
// sueltos y no pegados a una letra, que es lo que la regla no-misleading-character-class quiere evitar
// eslint-disable-next-line no-misleading-character-class -- son caracteres invisibles que se quitan, no una letra con acento
const INVISIBLE_PATTERN = new RegExp(COMMENT_RULES.invisible, 'g');
const AT_FORM_PATTERN = new RegExp(COMMENT_RULES.atForm, 'i');
const ARROBA_PATTERN = new RegExp(COMMENT_RULES.arroba, 'i');
const PHONE_PATTERN = new RegExp(COMMENT_RULES.phone);

/**
 * El comentario como lo revisa el filtro. NFKC vuelve ＠ en @ y los dígitos o las letras de ancho completo en los de
 * siempre, y se quitan los caracteres de ancho cero y de formato, que esconden una arroba entre las letras
 */
export function flattenComment(text: string): string {
  return text.normalize('NFKC').replace(INVISIBLE_PATTERN, '');
}

/** El comentario sin espacios sobrantes. Un comentario vacío es no haber escrito nada */
export function cleanComment(text: string): string | null {
  const clean = text.trim();
  return clean === '' ? null : clean;
}

/**
 * Qué le pasa a un comentario ya limpio, o null si sirve. Una arroba (también la de ancho completo o con espacios
 * alrededor), un "(at)" o la palabra arroba cuentan como correo, y un número largo como teléfono. Se avisan antes de
 * enviar. Es un apoyo y no una garantía
 */
export function commentProblem(comment: string | null): CommentProblem | null {
  if (comment === null) return null;
  if (comment.length > SURVEY_COMMENT_MAX) return 'too_long';
  const flat = flattenComment(comment);
  if (flat.includes('@') || AT_FORM_PATTERN.test(flat) || ARROBA_PATTERN.test(flat)) return 'email';
  if (PHONE_PATTERN.test(flat)) return 'phone';
  return null;
}

/** Cuántas preguntas contestó, para la medición. 7 sin comentario y 8 con él */
export function answeredCount(comment: string | null): 7 | 8 {
  return comment === null ? 7 : 8;
}

// ===================================================================== Lectura de los conteos

/**
 * La mediana de una escala del 1 al 5 a partir de cuántas respuestas hubo en cada valor. Con un número par de
 * respuestas y dos valores en medio, el promedio de los dos. null si no hubo ninguna
 */
export function scaleMedian(counts: Readonly<Record<string, number>>): number | null {
  const total = SCALE_VALUES.reduce((sum, value) => sum + (counts[String(value)] ?? 0), 0);
  if (total === 0) return null;
  const at = (rank: number): number => {
    let seen = 0;
    for (const value of SCALE_VALUES) {
      seen += counts[String(value)] ?? 0;
      if (rank <= seen) return value;
    }
    return SCALE_VALUES[SCALE_VALUES.length - 1] ?? 5;
  };
  const low = at(Math.ceil(total / 2));
  const high = at(Math.floor(total / 2) + 1);
  return (low + high) / 2;
}
