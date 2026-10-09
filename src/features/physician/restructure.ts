// Preguntas reestructuradas por IA (8.6, pantalla 20). Arma lo que se le manda al motor, convierte su
// propuesta en un borrador que el médico revisa con las mismas reglas del editor y construye la
// variante que entra al banco cuando la aprueba. Sin React ni Dexie.
import { z } from 'zod';
import { newId } from '@/data/ids';
import type { Option, Question } from '@/data/schemas/bank';
import { structureDictionary } from '@/demo/content';
import {
  RESTRUCTURE_TRANSFORMS,
  RestructureOutputSchema,
  type RestructureInput,
  type RestructureOutput,
} from '@/engines/aiContracts';
import { analyzeStructure } from '@/engines/structure';
import {
  buildNextVersion,
  draftFromVersion,
  type DraftOption,
  type QuestionDraft,
} from './editorDraft';

export type Transform = (typeof RESTRUCTURE_TRANSFORMS)[number];
export const TRANSFORMS: readonly Transform[] = RESTRUCTURE_TRANSFORMS;

const LABELS = 'ABCDEFGHIJ';
const normalize = (text: string) =>
  text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();

/** El enunciado completo, como lo lee el alumno. La viñeta y luego la frase de la pregunta */
export const stemOf = (question: Pick<Question, 'vignette' | 'prompt'>) =>
  question.vignette.trim()
    ? `${question.vignette.trim()} ${question.prompt.trim()}`
    : question.prompt.trim();

export type InputResult =
  | { ok: true; input: RestructureInput }
  | { ok: false; reason: 'serial_case' | 'variant' | 'few_options' };

/** Lo que se le manda al motor. Una pregunta de caso seriado o una variante no se reestructura */
export function buildRestructureInput(
  question: Question,
  options: readonly Option[],
  transform: Transform,
): InputResult {
  if (question.caseId !== null) return { ok: false, reason: 'serial_case' };
  if (question.variantOf !== undefined) return { ok: false, reason: 'variant' };
  const draft = draftFromVersion(question, options);
  const canonical = draft.options.filter((option) => option.canonical);
  if (canonical.length < 2) return { ok: false, reason: 'few_options' };
  return {
    ok: true,
    input: {
      questionRef: question.id,
      transform,
      stem: stemOf(question),
      options: canonical.map((option, index) => ({
        label: LABELS[index] ?? String(index + 1),
        text: option.text,
        isKey: option.isCorrect,
      })),
      explanation: question.explanation,
    },
  };
}

/** Lo que guarda el artefacto, con el original al lado de la propuesta */
export const RestructureContentSchema = z.strictObject({
  questionId: z.string(),
  questionVersionId: z.string(),
  transform: z.enum(RESTRUCTURE_TRANSFORMS),
  original: z.strictObject({
    stem: z.string(),
    options: z.array(z.strictObject({ label: z.string(), text: z.string(), isKey: z.boolean() })),
    explanation: z.string(),
  }),
  proposal: RestructureOutputSchema,
  /** La variante que salió de aprobarla */
  variantQuestionId: z.string().optional(),
});
export type RestructureContent = z.infer<typeof RestructureContentSchema>;

export function contentFor(
  question: Question,
  input: RestructureInput,
  proposal: RestructureOutput,
): RestructureContent {
  return {
    questionId: question.questionId,
    questionVersionId: question.id,
    transform: input.transform,
    original: { stem: input.stem, options: input.options, explanation: input.explanation },
    proposal,
  };
}

/** Viñeta y frase de un enunciado propuesto. Si empieza igual que el original, la viñeta se conserva */
export function splitProposedStem(
  stem: string,
  originalVignette: string,
): { vignette: string; prompt: string } {
  const vignette = originalVignette.trim();
  const text = stem.trim();
  if (vignette && text.startsWith(vignette)) {
    return { vignette, prompt: text.slice(vignette.length).trim() };
  }
  if (!vignette) return { vignette: '', prompt: text };
  // El motor tocó la viñeta. La frase es desde la última pregunta
  const start = text.lastIndexOf('¿');
  return start > 0
    ? { vignette: text.slice(0, start).trim(), prompt: text.slice(start).trim() }
    : { vignette: '', prompt: text };
}

/**
 * El borrador que revisa el médico. Las opciones que ya existían heredan su etiqueta y su razón. Las
 * que cambiaron de papel, de clave a distractor o al revés, salen sin etiqueta ni razón para que las
 * escriba él. Todas son opciones nuevas con su propio ID, porque la variante es otra pregunta
 */
export function draftFromProposal(input: {
  original: QuestionDraft;
  proposal: RestructureOutput;
}): QuestionDraft {
  const { original, proposal } = input;
  const { vignette, prompt } = splitProposedStem(proposal.stem, original.vignette);
  const byText = new Map(original.options.map((option) => [normalize(option.text), option]));
  const options: DraftOption[] = proposal.options.map((proposed) => {
    const found = byText.get(normalize(proposed.text));
    // Solo hereda lo que sigue con el mismo papel. La que cambió de papel la completa el médico
    const kept = found?.isCorrect === proposed.isKey ? found : undefined;
    return {
      optionId: newId(),
      text: proposed.text,
      isCorrect: proposed.isKey,
      biasTag: proposed.isKey ? null : (kept?.biasTag ?? null),
      secondaryBiasTags: proposed.isKey ? [] : [...(kept?.secondaryBiasTags ?? [])],
      rationale: kept?.rationale ?? '',
      canonical: true,
    };
  });
  const auto = analyzeStructure({ vignette, prompt, serialCase: false }, structureDictionary);
  return {
    ...original,
    vignette,
    prompt,
    explanation: proposal.explanation,
    options,
    structure: {
      polarity: auto.polarity,
      task: auto.task ?? original.structure.task,
      format: auto.format,
    },
  };
}

/** La variante: una pregunta nueva que apunta a la original y entra aprobada por el médico */
export function buildVariant(input: { original: Question; draft: QuestionDraft; now: Date }): {
  question: Question;
  options: Option[];
} {
  const { original, draft, now } = input;
  const built = buildNextVersion({
    // Una pregunta nueva, sin caso y con estructura automática. Sale como versión 1
    current: {
      ...original,
      questionId: newId(),
      version: 0,
      caseId: null,
      caseOrder: null,
      structure: { ...original.structure, source: 'auto' },
    },
    draft,
    newId,
    now,
  });
  // La estructura es automática mientras el médico no la haya cambiado de lo que detecta el motor
  const auto = analyzeStructure(
    { vignette: draft.vignette, prompt: draft.prompt, serialCase: false },
    structureDictionary,
  );
  const untouched =
    draft.structure.polarity === auto.polarity &&
    draft.structure.format === auto.format &&
    (auto.task === null || draft.structure.task === auto.task);
  return {
    question: {
      ...built.question,
      structure: { ...built.question.structure, source: untouched ? 'auto' : 'physician' },
      variantOf: original.questionId,
      editorialStatus: 'approved',
    },
    options: built.options,
  };
}
