// Importador del banco (pantalla 22, 10.2). Convierte la tabla del archivo con el convertidor de la
// plantilla, la revisa con las mismas reglas del editor y la guarda como borradores. Con un ID, volver
// a importar el mismo archivo no duplica nada. Si cambió una pregunta sale una versión nueva y si no
// cambió se deja como estaba. El contenido nunca entra aprobado (4.2).
import type { DataApi } from '@/data/context';
import { type BankTable, type ConvertedQuestion, convertTable } from '@/data/content/bankConvert';
import type { ItemKind } from '@/data/schemas/common';
import type { Option, Question } from '@/data/schemas/bank';
import { biasTaxonomy, structureDictionary, topicTaxonomy } from '@/demo/content';
import { stableUlid } from '@/demo/stableId';
import { analyzeStructure } from '@/engines/structure';
import { t } from '@/i18n/es-MX';
import { bankTaxonomy } from './bankTaxonomy';
import {
  buildNextVersion,
  changedParts,
  draftFromVersion,
  validateDraft,
  type QuestionDraft,
} from './editorDraft';

type Api = Pick<DataApi, 'repos'>;

const ID_TIME = Date.UTC(2026, 0, 1);
export const importedQuestionId = (key: string) => stableUlid(`bank-import|${key}`, ID_TIME);
const importedOptionId = (key: string, optionKey: string) =>
  stableUlid(`bank-import-opt|${key}|${optionKey}`, ID_TIME);

export type PlannedAction = 'new' | 'new_version' | 'unchanged';

export interface PlannedQuestion {
  key: string;
  rowNumber: number;
  action: PlannedAction;
  /** La versión que se guardaría. Falta si no cambia nada */
  question: Question | null;
  options: Option[];
}

export interface RowProblem {
  rowNumber: number;
  id: string;
  message: string;
}

export interface ImportPlan {
  planned: PlannedQuestion[];
  problems: RowProblem[];
  notes: string[];
  /** Filas con datos que se leyeron */
  rows: number;
  skippedExamples: number;
}

const context = () => ({
  data: { branches: topicTaxonomy.branches, biases: biasTaxonomy.biases },
  analyze: (question: { vignette: string; prompt: string; serialCase: boolean }) => {
    const auto = analyzeStructure(question, structureDictionary);
    return { polarity: auto.polarity, task: auto.task };
  },
});

function draftOf(converted: ConvertedQuestion): QuestionDraft {
  return {
    vignette: converted.vignette,
    prompt: converted.prompt,
    branch: converted.branch,
    topic: converted.topic,
    subtopic: converted.subtopic,
    structure: {
      polarity: converted.polarity,
      task: converted.task as QuestionDraft['structure']['task'],
      format: converted.vignette.trim() ? 'clinical_case' : 'direct',
    },
    explanation: converted.explanation,
    gpcRefs: converted.gpcRefs.map((title) => ({ title, status: 'to_verify' as const })),
    physicianDifficulty: converted.difficulty,
    itemKinds: (converted.kinds ?? []) as ItemKind[],
    clues: [],
    options: converted.options.map((option) => ({
      optionId: importedOptionId(converted.key, option.key),
      text: option.text,
      isCorrect: option.correct,
      biasTag: option.correct ? null : (option.bias ?? null),
      secondaryBiasTags: [],
      rationale: option.rationale,
      canonical: converted.canonical.includes(option.key),
    })),
  };
}

/** Lo que pasaría al importar esta tabla, sin guardar nada */
export async function planImport(
  api: Api,
  table: BankTable,
  options: { prefix: string; now?: Date; newId: () => string },
): Promise<ImportPlan> {
  const converted = convertTable(table, context(), { prefix: options.prefix });
  const problems: RowProblem[] = [...converted.rowProblems];
  // Los problemas de la tabla completa, como columnas que faltan, no tienen fila
  for (const message of converted.problems) {
    if (!converted.rowProblems.some((row) => message.endsWith(row.message)))
      problems.push({ rowNumber: 0, id: '', message });
  }
  const planned: PlannedQuestion[] = [];
  const now = options.now ?? new Date();

  for (const question of converted.questions) {
    const meta = converted.meta[question.key];
    const rowNumber = meta?.rowNumber ?? 0;
    const draft = draftOf(question);
    const issues = validateDraft(draft, bankTaxonomy);
    if (issues.length > 0) {
      for (const issue of issues) {
        const message = t.questionEditor.issues[issue.code] ?? issue.code;
        problems.push({
          rowNumber,
          id: question.key,
          message:
            issue.option === undefined
              ? message
              : t.questionEditor.issueAt(issue.option + 1, message),
        });
      }
      continue;
    }
    const questionId = importedQuestionId(question.key);
    const existing = await api.repos.questions.latest(questionId);
    const declared = meta?.polarityDeclared === true || meta?.taskDeclared === true;
    if (existing) {
      const existingDraft = draftFromVersion(
        existing,
        await api.repos.options.listForQuestionVersion(existing.id),
      );
      if (changedParts(existingDraft, draft).length === 0) {
        planned.push({
          key: question.key,
          rowNumber,
          action: 'unchanged',
          question: null,
          options: [],
        });
        continue;
      }
      const next = buildNextVersion({ current: existing, draft, newId: options.newId, now });
      planned.push({
        key: question.key,
        rowNumber,
        action: 'new_version',
        question: next.question,
        options: next.options,
      });
      continue;
    }
    // Una pregunta nueva sale como versión 1 y, si el médico declaró la estructura, es la suya
    const next = buildNextVersion({
      current: {
        id: options.newId(),
        questionId,
        version: 0,
        caseId: null,
        caseOrder: null,
        vignette: '',
        prompt: draft.prompt,
        branch: draft.branch,
        topic: draft.topic,
        subtopic: draft.subtopic,
        structure: { ...draft.structure, source: declared ? 'physician' : 'auto' },
        explanation: '',
        gpcRefs: [],
        physicianDifficulty: draft.physicianDifficulty,
        canonicalOptionIds: [],
        editorialStatus: 'draft',
        isDemo: false,
        createdAt: now.toISOString(),
      },
      draft,
      newId: options.newId,
      now,
    });
    planned.push({
      key: question.key,
      rowNumber,
      action: 'new',
      question: next.question,
      options: next.options,
    });
  }

  problems.sort((a, b) => a.rowNumber - b.rowNumber);
  return {
    planned,
    problems,
    notes: converted.notes,
    rows: converted.rows,
    skippedExamples: converted.skippedExamples,
  };
}

export interface ImportOutcome {
  created: number;
  newVersions: number;
  unchanged: number;
  failed: number;
}

/** Guarda lo planeado. Una pregunta que falla no frena a las demás */
export async function applyImport(
  api: Api,
  plan: ImportPlan,
  onProgress?: (done: number, total: number) => void,
): Promise<ImportOutcome> {
  const outcome: ImportOutcome = { created: 0, newVersions: 0, unchanged: 0, failed: 0 };
  const total = plan.planned.length;
  let done = 0;
  for (const item of plan.planned) {
    if (item.action === 'unchanged' || !item.question) {
      outcome.unchanged += 1;
    } else {
      try {
        await api.repos.questions.addVersion(item.question, item.options);
        if (item.action === 'new') outcome.created += 1;
        else outcome.newVersions += 1;
      } catch {
        outcome.failed += 1;
      }
    }
    done += 1;
    if (done % 25 === 0 || done === total) onProgress?.(done, total);
  }
  return outcome;
}
