// Convierte los lotes de preguntas demo (JSON) en las entidades del banco de la base: casos,
// preguntas y opciones con IDs estables. La misma clave de contenido da siempre el mismo ID, así
// que los eventos de los alumnos simulados apuntan a preguntas que existen al sembrar la demo.
// Todo queda como borrador de demostración, pendiente de revisión médica (11.1, CLAUDE.md).
import {
  ClinicalCaseSchema,
  OptionSchema,
  QuestionSchema,
  type ClinicalCase,
  type Option,
  type Question,
} from '@/data/schemas/bank';
import type { DemoQuestion, DemoQuestionBatch } from '@/data/schemas/content';
import { DEMO_CONTENT_TIME, stableUlid } from '../stableId';
import { questionBatches } from './questions';

export interface DemoBankQuestion {
  /** Clave del contenido, por ejemplo b1-q01 */
  key: string;
  question: Question;
  options: Option[];
  /** Clave de la opción (a a j) por ID de versión de la opción */
  optionKeyById: Record<string, string>;
  /** Palabras de la viñeta del caso, la viñeta propia y la frase. Las opciones se suman aparte */
  stemWords: number;
  /** Palabras de cada opción por ID de versión */
  optionWords: Record<string, number>;
}

export interface DemoBank {
  cases: ClinicalCase[];
  questions: DemoBankQuestion[];
  byKey: ReadonlyMap<string, DemoBankQuestion>;
  byVersionId: ReadonlyMap<string, DemoBankQuestion>;
}

const createdAt = new Date(DEMO_CONTENT_TIME).toISOString();
const words = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;

export const demoIds = {
  case: (caseKey: string) => stableUlid(`case|${caseKey}`, DEMO_CONTENT_TIME),
  question: (key: string) => stableUlid(`question|${key}`, DEMO_CONTENT_TIME),
  questionVersion: (key: string) => stableUlid(`question-v1|${key}`, DEMO_CONTENT_TIME),
  option: (key: string, option: string) => stableUlid(`option|${key}|${option}`, DEMO_CONTENT_TIME),
  optionVersion: (key: string, option: string) =>
    stableUlid(`option-v1|${key}|${option}`, DEMO_CONTENT_TIME),
};

function toQuestion(item: DemoQuestion, caseVignette: string | null): DemoBankQuestion {
  const versionId = demoIds.questionVersion(item.key);
  const options = item.options.map((option) =>
    OptionSchema.parse({
      id: demoIds.optionVersion(item.key, option.key),
      optionId: demoIds.option(item.key, option.key),
      questionVersionId: versionId,
      text: option.text,
      isCorrect: option.correct,
      biasTag: option.correct ? null : (option.bias ?? null),
      secondaryBiasTags: option.secondaryBiases ?? [],
      rationale: option.rationale,
    }),
  );
  const optionKeyById: Record<string, string> = {};
  const optionWords: Record<string, number> = {};
  item.options.forEach((option, index) => {
    const id = (options[index] as Option).id;
    optionKeyById[id] = option.key;
    optionWords[id] = words(option.text);
  });
  const format =
    item.caseKey !== null
      ? 'serial_case'
      : item.vignette.trim() === ''
        ? 'direct'
        : 'clinical_case';
  const question = QuestionSchema.parse({
    id: versionId,
    questionId: demoIds.question(item.key),
    version: 1,
    caseId: item.caseKey === null ? null : demoIds.case(item.caseKey),
    caseOrder: item.caseKey === null ? null : item.caseOrder,
    vignette: item.vignette,
    prompt: item.prompt,
    branch: item.branch,
    topic: item.topic,
    subtopic: item.subtopic,
    structure: { polarity: item.polarity, task: item.task, format, source: 'physician' },
    explanation: item.explanation,
    gpcRefs: item.gpcRefs.map((title) => ({ title, status: 'to_verify' })),
    physicianDifficulty: item.difficulty,
    canonicalOptionIds: item.canonical.map((key) => demoIds.optionVersion(item.key, key)),
    editorialStatus: 'draft',
    isDemo: true,
    createdAt,
  });
  return {
    key: item.key,
    question,
    options,
    optionKeyById,
    stemWords: words(caseVignette ?? '') + words(item.vignette) + words(item.prompt),
    optionWords,
  };
}

export function buildDemoBank(batches: readonly DemoQuestionBatch[] = questionBatches): DemoBank {
  const cases: ClinicalCase[] = [];
  const caseVignettes = new Map<string, string>();
  for (const batch of batches) {
    for (const item of batch.cases) {
      caseVignettes.set(item.key, item.vignette);
      cases.push(
        ClinicalCaseSchema.parse({
          id: demoIds.case(item.key),
          vignette: item.vignette,
          isDemo: true,
          createdAt,
        }),
      );
    }
  }
  const questions = batches.flatMap((batch) =>
    batch.questions.map((item) =>
      toQuestion(item, item.caseKey === null ? null : (caseVignettes.get(item.caseKey) ?? null)),
    ),
  );
  return {
    cases,
    questions,
    byKey: new Map(questions.map((entry) => [entry.key, entry])),
    byVersionId: new Map(questions.map((entry) => [entry.question.id, entry])),
  };
}
