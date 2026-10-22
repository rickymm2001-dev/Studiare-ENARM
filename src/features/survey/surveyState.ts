// Lo que este dispositivo recuerda de la encuesta de los primeros días (B18 del plan del cambio, 1.2 y 1.5 del diseño).
// Dos cosas, las dos solo comodidades que viven en localStorage y que la app sobrevive sin ellas.
//   - Cuándo se vuelve a ofrecer. Ahora no esconde la franja 2 días y, tras tres veces, ya no sale sola. No quiero
//     contestarla la esconde para siempre en este dispositivo. Quien la quiera después la encuentra en Configuración,
//     Privacidad. El calendario (isHiddenNow, snooze, neverAsk) es puro y se prueba con fechas fijas
//   - El borrador. Las respuestas a medias y el comentario, para que cerrar la pestaña no pierda lo escrito. Vive solo en
//     este dispositivo, lo dice la pantalla y se borra al enviar
// Las dos claves guardan una entrada por cuenta, así dos personas en el mismo navegador no se mezclan. Nada de esto
// decide si la encuesta le toca a alguien. Eso lo decide el servidor (my_survey_status). Cerrar sesión, Borrar mis datos y
// Eliminar mi cuenta quitan las dos claves (forgetSurveyLocal).
import {
  BLOCKERS,
  DAYS_USED,
  MAX_BLOCKERS,
  RECOMMEND,
  SCALE_VALUES,
  SURVEY_COMMENT_MAX,
  USED_FEATURES,
  type SurveyDraft,
} from '@/config/surveys';
import { SURVEY_DRAFT_STORAGE_KEY, SURVEY_STORAGE_KEY } from './surveyLocal';

// Los nombres de las dos claves y cómo se borran viven en surveyLocal.ts, que sí viaja en el JavaScript inicial
export { SURVEY_DRAFT_STORAGE_KEY, SURVEY_STORAGE_KEY };

/** Cuántos días se esconde la franja con Ahora no */
export const SNOOZE_DAYS = 2;
/** A la tercera vez que se toca Ahora no, la franja ya no sale sola */
export const MAX_LATER = 3;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface Hiding {
  /** Cuántas veces tocó Ahora no */
  laterCount: number;
  /** Hasta cuándo está escondida, en milisegundos desde 1970, o null si no lo está por un Ahora no */
  hiddenUntil: number | null;
  /** Tocó No quiero contestarla */
  never: boolean;
}

export const FRESH_HIDING: Hiding = { laterCount: 0, hiddenUntil: null, never: false };

/** true si la franja no debe salir ahora en este dispositivo */
export function isHiddenNow(hiding: Hiding, now: number): boolean {
  if (hiding.never || hiding.laterCount >= MAX_LATER) return true;
  return hiding.hiddenUntil !== null && now < hiding.hiddenUntil;
}

/** Ahora no. La esconde 2 días y cuenta una vez más */
export function snooze(hiding: Hiding, now: number): Hiding {
  return { ...hiding, laterCount: hiding.laterCount + 1, hiddenUntil: now + SNOOZE_DAYS * DAY_MS };
}

/** No quiero contestarla. No vuelve a salir sola en este dispositivo */
export function neverAsk(hiding: Hiding): Hiding {
  return { ...hiding, never: true };
}

// ===================================================================== Lectura y escritura

type Store<T> = Record<string, T>;

function readStore(key: string): Store<unknown> {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return {};
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Store<unknown>)
      : {};
  } catch {
    // Almacenamiento bloqueado o texto dañado. Sin él la franja se ve y se esconde mientras dure la página
    return {};
  }
}

function writeEntry(key: string, userId: string, entry: unknown): void {
  try {
    const others = Object.entries(readStore(key)).filter(([id]) => id !== userId);
    const store = Object.fromEntries(entry === null ? others : [...others, [userId, entry]]);
    localStorage.setItem(key, JSON.stringify(store));
  } catch {
    // Sin almacenamiento no se recuerda, y no pasa nada
  }
}

function hidingOf(value: unknown): Hiding {
  if (typeof value !== 'object' || value === null) return FRESH_HIDING;
  const raw = value as Record<string, unknown>;
  const count = raw.laterCount;
  const until = raw.hiddenUntil;
  return {
    laterCount: typeof count === 'number' && Number.isInteger(count) && count >= 0 ? count : 0,
    hiddenUntil: typeof until === 'number' && Number.isFinite(until) ? until : null,
    never: raw.never === true,
  };
}

/** Lo que este dispositivo recuerda de esta cuenta. Sin nada guardado, la franja se ofrece */
export function readHiding(userId: string): Hiding {
  return hidingOf(readStore(SURVEY_STORAGE_KEY)[userId]);
}

export function writeHiding(userId: string, hiding: Hiding): void {
  writeEntry(SURVEY_STORAGE_KEY, userId, hiding);
}

// ===================================================================== Borrador

export interface SurveyDraftState {
  answers: SurveyDraft;
  comment: string;
}

export const EMPTY_DRAFT: SurveyDraftState = { answers: {}, comment: '' };

function pick<T extends string>(value: unknown, list: readonly T[]): T | undefined {
  return typeof value === 'string' ? list.find((item) => item === value) : undefined;
}

function pickMany<T extends string>(
  value: unknown,
  list: readonly T[],
  max: number,
): T[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const marked = list.filter((item) => value.includes(item));
  return marked.length > 0 && marked.length <= max ? marked : undefined;
}

function draftOf(value: unknown): SurveyDraftState {
  if (typeof value !== 'object' || value === null) return EMPTY_DRAFT;
  const raw = value as { answers?: unknown; comment?: unknown };
  const answers = (
    typeof raw.answers === 'object' && raw.answers !== null ? raw.answers : {}
  ) as Record<string, unknown>;
  const draft: SurveyDraft = {};
  const days = pick(answers.days_used, DAYS_USED);
  if (days !== undefined) draft.days_used = days;
  const used = pickMany(answers.used, USED_FEATURES, USED_FEATURES.length);
  // Nada todavía no se junta con otra opción
  if (used !== undefined && (!used.includes('none') || used.length === 1)) draft.used = used;
  for (const id of ['clarity', 'ease', 'useful'] as const) {
    const scale = SCALE_VALUES.find((item) => item === answers[id]);
    if (scale !== undefined) draft[id] = scale;
  }
  const blockers = pickMany(answers.blockers, BLOCKERS, MAX_BLOCKERS);
  if (blockers !== undefined && (!blockers.includes('nothing') || blockers.length === 1)) {
    draft.blockers = blockers;
  }
  const recommend = pick(answers.recommend, RECOMMEND);
  if (recommend !== undefined) draft.recommend = recommend;
  const comment =
    typeof raw.comment === 'string' ? raw.comment.slice(0, SURVEY_COMMENT_MAX * 2) : '';
  return { answers: draft, comment };
}

/** El borrador de esta cuenta en este dispositivo. Lo que ya no cabe en las preguntas de hoy se descarta */
export function readDraft(userId: string): SurveyDraftState {
  return draftOf(readStore(SURVEY_DRAFT_STORAGE_KEY)[userId]);
}

export function writeDraft(userId: string, draft: SurveyDraftState): void {
  writeEntry(SURVEY_DRAFT_STORAGE_KEY, userId, draft);
}

/** Se borra al enviar y al borrar la respuesta. Al cerrar sesión y al borrar datos se quita todo con forgetSurveyLocal */
export function clearDraft(userId: string): void {
  writeEntry(SURVEY_DRAFT_STORAGE_KEY, userId, null);
}

// ===================================================================== Medición de la franja

const shown = new Set<string>();

/**
 * true la primera vez que se ve la encuesta en esta carga de la app, para medir survey_shown una sola vez aunque la
 * franja y la pantalla se vean seguidas
 */
export function markShown(userId: string): boolean {
  if (shown.has(userId)) return false;
  shown.add(userId);
  return true;
}

/** Deja la medición como al abrir la pestaña. Lo usan las pruebas */
export function resetShown(): void {
  shown.clear();
}
