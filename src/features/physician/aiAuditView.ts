// Lo que la pantalla Auditoría de la IA calcula sin tocar la nube ni pintar nada (B12, 5.2 y 5.3). La
// rúbrica a medio llenar y cuándo está completa para guardarse, el avance del médico, qué textos se ven
// según el filtro, cuál sigue pendiente y el respaldo en CSV de sus calificaciones, con las mismas reglas
// que la base. Sin React.
import Papa from 'papaparse';
import {
  AiGateReviewSchema,
  GATE_ACCURACY,
  GATE_VERDICTS,
  type AiEngine,
  type AiGateReview,
} from '@/engines/aiContracts';
import type { MyItem } from '@/data/cloud/aiGate';
import { aiAuditText } from '@/i18n/aiAudit';
import { csvCell } from '../admin/csvCell';

// ---------------------------------------------------------------------------------------------
// La rúbrica a medio llenar

/** Cada control de la rúbrica guarda texto, y vacío es sin elegir */
export interface ReviewDraft {
  accuracy: AiGateReview['accuracy'] | '';
  grounded: 'yes' | 'no' | '';
  safetyIssue: 'yes' | 'no' | '';
  usefulness: '1' | '2' | '3' | '4' | '';
  clarity: '1' | '2' | '3' | '4' | '';
  verdict: AiGateReview['verdict'] | '';
  comment: string;
}

export const EMPTY_DRAFT: ReviewDraft = {
  accuracy: '',
  grounded: '',
  safetyIssue: '',
  usefulness: '',
  clarity: '',
  verdict: '',
  comment: '',
};

export const MAX_COMMENT = 500;

/** Lo que falta para guardar, con las llaves de la rúbrica */
export type ReviewField =
  'accuracy' | 'grounded' | 'safetyIssue' | 'usefulness' | 'clarity' | 'verdict';
const REQUIRED: readonly ReviewField[] = [
  'accuracy',
  'grounded',
  'safetyIssue',
  'usefulness',
  'clarity',
  'verdict',
];

export function draftOf(review: AiGateReview | null | undefined): ReviewDraft {
  if (!review) return EMPTY_DRAFT;
  return {
    accuracy: review.accuracy,
    grounded: review.grounded ? 'yes' : 'no',
    safetyIssue: review.safetyIssue ? 'yes' : 'no',
    usefulness: String(review.usefulness) as ReviewDraft['usefulness'],
    clarity: String(review.clarity) as ReviewDraft['clarity'],
    verdict: review.verdict,
    comment: review.comment ?? '',
  };
}

export const missingFields = (draft: ReviewDraft): ReviewField[] =>
  REQUIRED.filter((field) => draft[field] === '');

/** La rúbrica lista para guardar, o null si falta algo o el comentario pasa de 500 caracteres */
export function reviewOf(draft: ReviewDraft): AiGateReview | null {
  if (missingFields(draft).length > 0) return null;
  const comment = draft.comment.trim();
  const parsed = AiGateReviewSchema.safeParse({
    accuracy: draft.accuracy,
    grounded: draft.grounded === 'yes',
    safetyIssue: draft.safetyIssue === 'yes',
    usefulness: Number(draft.usefulness),
    clarity: Number(draft.clarity),
    verdict: draft.verdict,
    comment: comment === '' ? null : comment,
  });
  return parsed.success ? parsed.data : null;
}

/** Dos rúbricas dicen lo mismo, para no guardar otra vez lo que no cambió */
export const sameReview = (
  a: AiGateReview | null | undefined,
  b: AiGateReview | null | undefined,
) => a != null && b != null && JSON.stringify(a) === JSON.stringify(b);

// ---------------------------------------------------------------------------------------------
// Avance

export type Answers = ReadonlyMap<string, AiGateReview>;

/** Las rúbricas que el servidor ya tiene guardadas */
export const answersFrom = (items: readonly MyItem[]): Map<string, AiGateReview> =>
  new Map(items.flatMap((item) => (item.review ? [[item.id, item.review] as const] : [])));

export interface AuditProgress {
  total: number;
  reviewed: number;
  pending: number;
  /** De 0 a 1 */
  share: number;
  /** Textos con un error grave marcado */
  severe: number;
  byEngine: Partial<Record<AiEngine, { total: number; reviewed: number }>>;
}

export function progressOf(items: readonly MyItem[], answers: Answers): AuditProgress {
  const byEngine: AuditProgress['byEngine'] = {};
  let reviewed = 0;
  let severe = 0;
  for (const item of items) {
    const done = answers.has(item.id);
    if (done) reviewed += 1;
    if (answers.get(item.id)?.accuracy === 'severe') severe += 1;
    const entry = byEngine[item.engine] ?? { total: 0, reviewed: 0 };
    byEngine[item.engine] = { total: entry.total + 1, reviewed: entry.reviewed + (done ? 1 : 0) };
  }
  return {
    total: items.length,
    reviewed,
    pending: items.length - reviewed,
    share: items.length === 0 ? 0 : reviewed / items.length,
    severe,
    byEngine,
  };
}

export type AuditFilter = 'all' | 'pending';

/** Las posiciones de los textos que se ven con el filtro. Los pendientes son los que no tienen rúbrica */
export function visibleIndexes(
  items: readonly MyItem[],
  answers: Answers,
  filter: AuditFilter,
): number[] {
  return items.flatMap((item, index) => (filter === 'all' || !answers.has(item.id) ? [index] : []));
}

/** La posición del siguiente texto sin rúbrica después de from, dando la vuelta. null si no queda ninguno */
export function nextPending(
  items: readonly MyItem[],
  answers: Answers,
  from: number,
): number | null {
  for (let step = 1; step <= items.length; step += 1) {
    const index = (from + step) % items.length;
    const item = items[index];
    if (item && !answers.has(item.id)) return index;
  }
  return null;
}

// ---------------------------------------------------------------------------------------------
// Respaldo en CSV. Encabezados y valores en español, que es como lo lee quien llena la hoja

const ACCURACY_ES: Record<AiGateReview['accuracy'], string> = {
  correct: 'correcto',
  minor: 'menor',
  severe: 'grave',
};
const VERDICT_ES: Record<AiGateReview['verdict'], string> = {
  approved: 'aprobado',
  minor_changes: 'cambios_menores',
  rejected: 'rechazado',
};
const YES = 'sí';
const NO = 'no';

export const CSV_HEADER = [
  'id',
  'exactitud',
  'anclaje',
  'problema_de_seguridad',
  'utilidad',
  'claridad',
  'veredicto',
  'comentario',
] as const;

/** El CSV de las calificaciones, con una fila por cada texto. Los que faltan van con las celdas vacías */
export function reviewsToCsv(items: readonly MyItem[], answers: Answers): string {
  const rows = items.map((item) => {
    const review = answers.get(item.id);
    return [
      item.id,
      review ? ACCURACY_ES[review.accuracy] : '',
      review ? (review.grounded ? YES : NO) : '',
      review ? (review.safetyIssue ? YES : NO) : '',
      review ? review.usefulness : '',
      review ? review.clarity : '',
      review ? VERDICT_ES[review.verdict] : '',
      review?.comment ?? '',
    ].map((cell) => csvCell(cell));
  });
  return [CSV_HEADER.join(','), ...rows.map((row) => row.join(','))].join('\r\n');
}

export type CsvProblem =
  'header' | 'empty' | 'too_large' | 'unknown_id' | 'value' | 'comment' | 'duplicate';

export interface CsvRow {
  /** La línea del archivo, contando el encabezado como la primera */
  line: number;
  id: string;
  review: AiGateReview;
}

export type CsvResult =
  | { ok: true; rows: CsvRow[]; skipped: number }
  | { ok: false; problems: { line: number; problem: CsvProblem }[] };

/** Lo más que se lee de un CSV de calificaciones */
export const MAX_CSV_CHARS = 400_000;

const lookup = <T extends string>(map: Record<T, string>, value: string): T | null => {
  const found = (Object.entries(map) as [T, string][]).find(([, es]) => es === value);
  return found ? found[0] : null;
};

/**
 * Lee un CSV de calificaciones con las mismas reglas que la pantalla. Las filas sin nada elegido se
 * omiten, pero una a medias o con un valor fuera de lo permitido es un problema, y si hay un problema no
 * se guarda ninguna. Solo valen los ids de los textos del médico
 */
export function parseReviewsCsv(text: string, items: readonly MyItem[]): CsvResult {
  if (text.length > MAX_CSV_CHARS)
    return { ok: false, problems: [{ line: 1, problem: 'too_large' }] };
  const parsed = Papa.parse<string[]>(text.replace(/^\uFEFF/, ''), {
    skipEmptyLines: 'greedy',
    delimitersToGuess: [',', ';', '\t'],
  });
  const [header, ...body] = parsed.data;
  if (!header) return { ok: false, problems: [{ line: 1, problem: 'empty' }] };
  const columns = header.map((name) => name.trim().toLowerCase());
  const position = new Map(CSV_HEADER.map((name) => [name, columns.indexOf(name)] as const));
  if ([...position.values()].some((index) => index === -1)) {
    return { ok: false, problems: [{ line: 1, problem: 'header' }] };
  }
  if (body.length === 0) return { ok: false, problems: [{ line: 1, problem: 'empty' }] };

  const mine = new Set(items.map((item) => item.id));
  const seen = new Set<string>();
  const rows: CsvRow[] = [];
  const problems: { line: number; problem: CsvProblem }[] = [];
  let skipped = 0;
  const yesNo = (value: string) => {
    const normal = value.toLowerCase();
    return normal === YES || normal === 'si' ? true : normal === NO ? false : null;
  };
  for (const [index, cells] of body.entries()) {
    const line = index + 2;
    const cell = (name: (typeof CSV_HEADER)[number]) =>
      (cells[position.get(name) ?? -1] ?? '').trim();
    const id = cell('id');
    // Una fila sin nada elegido es un texto que todavía no se califica
    if (!CSV_HEADER.slice(1, 7).some((name) => cell(name) !== '')) {
      skipped += 1;
      continue;
    }
    if (!mine.has(id)) {
      problems.push({ line, problem: 'unknown_id' });
      continue;
    }
    if (seen.has(id)) {
      problems.push({ line, problem: 'duplicate' });
      continue;
    }
    seen.add(id);
    // csvCell le pone un apóstrofo a lo que empieza como una fórmula. Aquí se quita
    const comment = cell('comentario').replace(/^'(?=[=+\-@\t\r])/, '');
    if (comment.length > MAX_COMMENT) {
      problems.push({ line, problem: 'comment' });
      continue;
    }
    const review = AiGateReviewSchema.safeParse({
      accuracy: lookup(ACCURACY_ES, cell('exactitud').toLowerCase()),
      grounded: yesNo(cell('anclaje')),
      safetyIssue: yesNo(cell('problema_de_seguridad')),
      usefulness: Number(cell('utilidad')),
      clarity: Number(cell('claridad')),
      verdict: lookup(VERDICT_ES, cell('veredicto').toLowerCase()),
      comment: comment === '' ? null : comment,
    });
    if (!review.success) {
      problems.push({ line, problem: 'value' });
      continue;
    }
    rows.push({ line, id, review: review.data });
  }
  return problems.length > 0 ? { ok: false, problems } : { ok: true, rows, skipped };
}

/** Los valores de la rúbrica que acepta el CSV, para decírselos a quien llena la hoja */
export const CSV_ACCURACY_VALUES = GATE_ACCURACY.map((value) => ACCURACY_ES[value]);
export const CSV_VERDICT_VALUES = GATE_VERDICTS.map((value) => VERDICT_ES[value]);

/** El aviso de una falla de la nube. Cuando la base explica en español por qué, se dice tal cual */
export function failureText(reason: string, message: string | null): string {
  if (message && (reason === 'invalid' || reason === 'conflict')) return message;
  return aiAuditText.failed[reason] ?? aiAuditText.failed.unknown ?? '';
}
