// Cuerpos de preguntas que llegan de fetch_questions, convertidos a lo que guarda la app (B11, 5.2 del
// plan de B11). Función pura, sin Dexie ni red. Cada cuerpo se valida con QuestionSchema, OptionSchema y
// ClinicalCaseSchema, los mismos del banco de demostración, y los ids pasan de uuid a ULID. Lo que no
// pasa se descarta completo, nunca a medias, y solo se cuenta. Ningún validador rechaza un reactivo por
// imperfecto (D-080). Solo lo que no se puede representar, como una tarea que la app no conoce.
// Lo que baja de la nube es contenido aprobado por un médico, así que se guarda como approved y sin la
// marca de demostración.
import { uuidToUlid } from '../cloud/cloudIds';
import {
  ClinicalCaseSchema,
  OptionSchema,
  QuestionSchema,
  type ClinicalCase,
  type Option,
  type Question,
} from '../schemas/bank';
import { CognitiveLevelSchema } from '../schemas/common';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Un id de la nube en ULID, o undefined si no es un uuid */
const ulid = (value: unknown): string | undefined =>
  typeof value === 'string' ? (uuidToUlid(value) ?? undefined) : undefined;

/** Un instante en ISO UTC con milisegundos, el formato de la app */
function instant(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const time = Date.parse(value);
  return Number.isNaN(time) ? undefined : new Date(time).toISOString();
}

const nonEmpty = (value: unknown) => (Array.isArray(value) && value.length > 0 ? value : undefined);

export interface BodyEntities {
  question: Question;
  options: Option[];
}

/** La pregunta con sus opciones como las guarda la app. null si no se puede guardar */
export function bodyEntitiesOf(raw: unknown): BodyEntities | null {
  if (!isRecord(raw)) return null;
  const id = ulid(raw.versionId);
  const questionId = ulid(raw.questionId);
  if (!id || !questionId) return null;
  const caseId = raw.caseId === null || raw.caseId === undefined ? null : ulid(raw.caseId);
  if (caseId === undefined) return null;
  const variantOf =
    raw.variantOf === null || raw.variantOf === undefined ? null : ulid(raw.variantOf);
  if (variantOf === undefined) return null;
  const rawOptions = Array.isArray(raw.options) ? raw.options : [];
  const options: Option[] = [];
  for (const item of rawOptions) {
    if (!isRecord(item)) return null;
    const option = OptionSchema.safeParse({
      id: ulid(item.id),
      optionId: ulid(item.optionId),
      questionVersionId: id,
      text: item.text,
      isCorrect: item.isCorrect,
      biasTag: item.biasTag ?? null,
      secondaryBiasTags: Array.isArray(item.secondaryBiasTags) ? item.secondaryBiasTags : [],
      rationale: item.rationale,
    });
    if (!option.success) return null;
    options.push(option.data);
  }
  // Las opciones se guardan en el orden del médico
  const positions = new Map(
    rawOptions.map((item, index) => [
      isRecord(item) ? ulid(item.id) : undefined,
      isRecord(item) && typeof item.position === 'number' ? item.position : index,
    ]),
  );
  options.sort((a, b) => (positions.get(a.id) ?? 0) - (positions.get(b.id) ?? 0));
  const canonical = Array.isArray(raw.canonicalOptionIds)
    ? raw.canonicalOptionIds.map((value) => ulid(value))
    : [];
  if (canonical.some((value) => value === undefined)) return null;
  const optionIds = new Set(options.map((option) => option.id));
  if (options.filter((option) => option.isCorrect).length !== 1) return null;
  if (!canonical.every((value) => value !== undefined && optionIds.has(value))) return null;
  const parsed = QuestionSchema.safeParse({
    id,
    questionId,
    version: raw.version,
    caseId,
    caseOrder: caseId === null ? null : raw.caseOrder,
    vignette: typeof raw.vignette === 'string' ? raw.vignette : '',
    prompt: raw.prompt,
    branch: raw.branch,
    topic: raw.topic,
    subtopic: raw.subtopic,
    structure: raw.structure,
    explanation: typeof raw.explanation === 'string' ? raw.explanation : '',
    gpcRefs: Array.isArray(raw.gpcRefs) ? raw.gpcRefs : [],
    ...(nonEmpty(raw.itemKinds) ? { itemKinds: raw.itemKinds } : {}),
    // Nivel cognitivo de Bloom. null, ausente o un valor que la app no conoce es sin nivel (V4-B5)
    ...(CognitiveLevelSchema.safeParse(raw.cognitiveLevel).success
      ? { cognitiveLevel: CognitiveLevelSchema.parse(raw.cognitiveLevel) }
      : {}),
    ...(nonEmpty(raw.clues) ? { clues: raw.clues } : {}),
    physicianDifficulty: raw.physicianDifficulty,
    // Sin el campo, o con uno que no se conoce, es español como todo lo de antes de B13 (en queda guardado)
    ...(raw.language === 'en' ? { language: 'en' } : {}),
    ...(variantOf === null ? {} : { variantOf }),
    canonicalOptionIds: canonical,
    editorialStatus: 'approved',
    isDemo: false,
    createdAt: instant(raw.createdAt),
  });
  return parsed.success ? { question: parsed.data, options } : null;
}

/** El caso clínico como lo guarda la app. null si no se puede guardar */
export function caseEntityOf(raw: unknown): ClinicalCase | null {
  if (!isRecord(raw)) return null;
  const parsed = ClinicalCaseSchema.safeParse({
    id: ulid(raw.id),
    vignette: raw.vignette,
    isDemo: false,
    createdAt: instant(raw.createdAt),
  });
  return parsed.success ? parsed.data : null;
}
