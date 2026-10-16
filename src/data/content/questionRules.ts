// Lo que le falta a una versión del banco para poder aprobarse (B11, 3.4 y 5.7 del plan de B11). Es el
// espejo de la función SQL bank_version_issues de 20261023000002_bank_core.sql, que es la que manda en
// la nube. La usa la aprobación local de la demo para pedir lo mismo que la base, y el convertidor del
// Sheet da los mismos códigos de pendiente. Nunca marca un reactivo por imperfecto (D-080). Solo pide
// lo que un revisor necesita para aprobar, que es explicación, referencias, la justificación de cada
// opción y el sesgo de cada distractor, y la tarea cuando el convertidor no la detectó. Una pregunta en
// inglés pide además su fuente del texto con una licencia aceptada (B13, 1.6 del plan de B13), y el idioma
// tiene que ir con la rama. Funciones puras.
import { OPTION_LETTERS } from './bankColumns.ts';
import { parsePassageSource } from './passageSource.ts';

/** Una versión, con lo mínimo para revisar sus pendientes. Tolera borradores incompletos */
export interface RuleVersion {
  prompt: string;
  /**
   * La tarea. Vacía o null cuando el convertidor del Sheet no la detectó, y queda pendiente
   * task_undetected. Sin la propiedad no se revisa, como en la demo, donde siempre hay tarea
   */
  task?: string | null;
  explanation: string;
  /** Títulos de las referencias */
  refs: readonly string[];
  options: readonly {
    /** Letra del Sheet. Sin letra toma la de su posición */
    letter?: string | null;
    position: number;
    text: string;
    isCorrect: boolean;
    biasTag: string | null;
    rationale: string | null;
  }[];
  /** Posiciones de las opciones del set canónico */
  canonicalPositions: readonly number[];
  /**
   * Idioma de la pregunta (B13). Con él se pide la fuente del texto de las preguntas en inglés. Sin la
   * propiedad no se revisan las reglas del inglés, como en la demo, donde todo es español
   */
  language?: 'es' | 'en';
  /**
   * Si la rama es de la sección english, o sea Inglés médico. Junto con language dice si el idioma va con
   * la rama (language_branch_mismatch). Sin alguno de los dos no se revisa
   */
  englishBranch?: boolean;
}

/** Códigos que impiden aprobar y que no se arreglan en el Sheet con una celda vacía */
export const STRUCTURE_ISSUES = [
  'prompt_missing',
  'options_count',
  'correct_count',
  'canonical_invalid',
  'language_branch_mismatch',
] as const;

export const MIN_VERSION_OPTIONS = 4;
export const MAX_VERSION_OPTIONS = 10;

const blank = (text: string | null) => text === null || text.trim() === '';

/**
 * Los pendientes de una versión, en orden fijo. Primero los de estructura, después la tarea, la
 * explicación y las referencias, y al final los de cada opción por posición. Vacío quiere decir que se
 * puede aprobar
 */
export function versionIssues(version: RuleVersion, taggable: ReadonlySet<string>): string[] {
  const issues: string[] = [];
  const options = [...version.options].sort((a, b) => a.position - b.position);
  if (blank(version.prompt)) issues.push('prompt_missing');
  if (options.length < MIN_VERSION_OPTIONS || options.length > MAX_VERSION_OPTIONS)
    issues.push('options_count');
  if (options.filter((option) => option.isCorrect).length !== 1) issues.push('correct_count');
  const canonical = options.filter((option) =>
    version.canonicalPositions.includes(option.position),
  );
  if (
    !canonical.some((option) => option.isCorrect) ||
    !canonical.some((option) => !option.isCorrect)
  )
    issues.push('canonical_invalid');
  // Inglés fuera de Inglés médico, o español dentro de esa rama. No se arregla con una celda vacía
  if (
    version.language !== undefined &&
    version.englishBranch !== undefined &&
    (version.language === 'en') !== version.englishBranch
  )
    issues.push('language_branch_mismatch');
  if (version.task !== undefined && blank(version.task)) issues.push('task_undetected');
  if (blank(version.explanation)) issues.push('explanation_missing');
  if (version.refs.every((ref) => blank(ref))) issues.push('references_missing');
  // Una pregunta en inglés lleva su fuente del texto con una licencia aceptada, que cuenta como referencia
  if (version.language === 'en') {
    const source = parsePassageSource(version.refs.map((title) => ({ title })));
    if (!source.ok) issues.push(source.issue);
  }
  for (const option of options) {
    const letter = (
      option.letter ??
      OPTION_LETTERS[option.position] ??
      String(option.position)
    ).toUpperCase();
    if (blank(option.rationale)) issues.push(`rationale_missing:${letter}`);
    if (option.isCorrect) continue;
    if (option.biasTag === null || option.biasTag === '') issues.push(`bias_missing:${letter}`);
    else if (!taggable.has(option.biasTag)) issues.push(`bias_unknown:${letter}`);
  }
  return issues;
}

/** Los pendientes que se completan en el Sheet o en el editor, sin los de estructura */
export function incompleteOnly(issues: readonly string[]): string[] {
  return issues.filter((issue) => !(STRUCTURE_ISSUES as readonly string[]).includes(issue));
}
