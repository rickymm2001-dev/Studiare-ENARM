// Borrador del editor de pregunta (pantalla 18). Convierte una versión del banco en algo que se puede
// editar, valida el borrador, arma la versión siguiente y compara versiones para el historial. Sin
// React ni Dexie. Editar nunca cambia una versión. Siempre sale una versión nueva en borrador (6.1).
//
// Inglés médico (B13, 1.4 y 5.4 del plan de B13). El idioma de la pregunta sale de su rama. En inglés el
// borrador lleva aparte la fuente del texto (título, licencia y enlace), y al guardar se vuelve la
// primera referencia con la forma fija de passageSource.ts (draftForSave). Así llega igual a la nube, a
// la huella y al alumno, sin redefinir nada del contenido de B11. Que falte la fuente o que su licencia
// no esté en la lista no impide guardar, deja el pendiente que impide aprobar (passageIssue).
import type { EditorVersion } from '@/data/bank/contracts';
import {
  composePassageSource,
  isHttpsUrl,
  isPassageSourceRef,
  LICENSE_LABELS,
  licenseNeedsUrl,
  parsePassageSource,
  PASSAGE_LICENSES,
  PASSAGE_SOURCE_MAX_LENGTH,
  splitPassageSource,
  type PassageSourceIssue,
} from '@/data/content/passageSource';
import { newId } from '@/data/ids';
import {
  CognitiveLevelSchema,
  ItemKindSchema,
  type ClueStrength,
  type CognitiveLevel,
  type ItemKind,
} from '@/data/schemas/common';
import {
  QuestionTaskSchema,
  type Clue,
  type Option,
  type Question,
  type QuestionLanguage,
} from '@/data/schemas/bank';
import { languageOfBranch } from './branchLanguage';

export const MIN_OPTIONS = 4;
export const MAX_OPTIONS = 10;
export const MAX_SECONDARY_TAGS = 5;

/**
 * La estructura del borrador. task vacía es una versión del Sheet sin tarea detectada
 * (task_undetected). El médico la elige antes de guardar
 */
type Structure = Pick<Question['structure'], 'polarity' | 'format'> & {
  task: Question['structure']['task'] | '';
};

export interface DraftOption {
  /** ID estable de la opción. Las etiquetas de los médicos se guardan con este ID */
  optionId: string;
  text: string;
  isCorrect: boolean;
  /** null en la correcta */
  biasTag: string | null;
  secondaryBiasTags: string[];
  rationale: string;
  /** Si entra al set canónico, que es lo que ve el alumno por defecto (7.8) */
  canonical: boolean;
}

/** Una opción en blanco, con su ID estable ya asignado */
export function emptyOption(): DraftOption {
  return {
    optionId: newId(),
    text: '',
    isCorrect: false,
    biasTag: null,
    secondaryBiasTags: [],
    rationale: '',
    canonical: false,
  };
}

export interface DraftClue {
  text: string;
  strength: ClueStrength;
}

/**
 * La fuente del texto de una pregunta en inglés, como la escribe el médico en tres campos. license es el
 * nombre de la licencia como se lee en la lista (LICENSE_LABELS), o lo que trajo el Sheet si no es de la
 * lista, y queda vacío mientras no se elige. url es una dirección https y va vacía con el texto propio
 */
export interface DraftPassage {
  title: string;
  license: string;
  url: string;
}

export const EMPTY_PASSAGE: DraftPassage = { title: '', license: '', url: '' };

export interface QuestionDraft {
  vignette: string;
  prompt: string;
  branch: string;
  topic: string;
  subtopic: string;
  structure: Structure;
  explanation: string;
  gpcRefs: { title: string; status: 'to_verify' | 'verified' }[];
  physicianDifficulty: number;
  itemKinds: ItemKind[];
  /** Nivel cognitivo de Bloom. Ausente es sin nivel, nunca se adivina (V4-B5) */
  cognitiveLevel?: CognitiveLevel | undefined;
  clues: DraftClue[];
  options: DraftOption[];
  /**
   * Idioma de la pregunta (B13). Solo viaja en inglés, y sale de la rama: Inglés médico es en y las demás
   * ramas son es. Sin el campo es español, como todo lo de antes
   */
  language?: QuestionLanguage | undefined;
  /**
   * La fuente del texto, solo en inglés. draftForSave la vuelve la primera referencia, así que los
   * borradores que ya pasaron por ahí no la traen y sus gpcRefs ya llevan la fuente
   */
  passage?: DraftPassage | undefined;
}

/** Lo que necesita una versión para volverse borrador. Lo cumplen Question y EditorVersion */
export interface DraftSourceQuestion {
  vignette: string;
  prompt: string;
  branch: string;
  topic: string;
  subtopic: string;
  structure: Structure;
  explanation: string;
  gpcRefs: readonly { title: string; status: 'to_verify' | 'verified' }[];
  physicianDifficulty: number;
  itemKinds?: readonly ItemKind[] | undefined;
  cognitiveLevel?: CognitiveLevel | undefined;
  clues?: readonly Clue[] | undefined;
  canonicalOptionIds: readonly string[];
  /** Sin el campo se toma del idioma de la rama. La nube no lo devuelve en editor_question (B13) */
  language?: QuestionLanguage | undefined;
}

export type DraftSourceOption = Pick<
  Option,
  'id' | 'optionId' | 'text' | 'isCorrect' | 'biasTag' | 'rationale'
> & { secondaryBiasTags: readonly string[] };

/**
 * Separa la fuente del texto de las demás referencias. Toma la primera que empieza con Fuente del texto,
 * como parsePassageSource, y deja las otras donde estaban. Sin fuente, el pasaje queda vacío
 */
function splitPassage<T extends { title: string }>(
  refs: readonly T[],
): { passage: DraftPassage; rest: T[] } {
  const at = refs.findIndex((ref) => isPassageSourceRef(ref.title));
  const found = at === -1 ? undefined : refs[at];
  const parts = found ? splitPassageSource(found.title) : null;
  if (!parts) return { passage: { ...EMPTY_PASSAGE }, rest: [...refs] };
  return {
    passage: { title: parts.title, license: parts.licenseText, url: parts.url },
    rest: refs.filter((_, index) => index !== at),
  };
}

/** El borrador de una versión. Primero van las opciones del set canónico, en su orden */
export function draftFromVersion(
  question: DraftSourceQuestion,
  options: readonly DraftSourceOption[],
): QuestionDraft {
  const canonical = new Set(question.canonicalOptionIds);
  const rank = (option: DraftSourceOption) => {
    const place = question.canonicalOptionIds.indexOf(option.id);
    return place === -1 ? Number.MAX_SAFE_INTEGER : place;
  };
  const ordered = [...options].sort((a, b) => rank(a) - rank(b));
  // En inglés la fuente del texto sale de las referencias y se edita aparte (B13, 5.4)
  const english = (question.language ?? languageOfBranch(question.branch)) === 'en';
  const split = english ? splitPassage(question.gpcRefs) : null;
  const refs = split ? split.rest : question.gpcRefs;
  return {
    vignette: question.vignette,
    prompt: question.prompt,
    branch: question.branch,
    topic: question.topic,
    subtopic: question.subtopic,
    structure: {
      polarity: question.structure.polarity,
      task: question.structure.task,
      format: question.structure.format,
    },
    explanation: question.explanation,
    gpcRefs: refs.map((ref) => ({ ...ref })),
    physicianDifficulty: question.physicianDifficulty,
    itemKinds: [...(question.itemKinds ?? [])],
    ...(question.cognitiveLevel ? { cognitiveLevel: question.cognitiveLevel } : {}),
    clues: (question.clues ?? []).map((clue) => ({ ...clue })),
    options: ordered.map((option) => ({
      optionId: option.optionId,
      text: option.text,
      isCorrect: option.isCorrect,
      biasTag: option.biasTag,
      secondaryBiasTags: [...option.secondaryBiasTags],
      rationale: option.rationale,
      canonical: canonical.has(option.id),
    })),
    ...(split ? { language: 'en' as const, passage: split.passage } : {}),
  };
}

/**
 * El borrador de una versión del editor en la nube (EditorVersion, 5.7). Es tolerante como ella. Una
 * justificación que falta queda vacía y una tarea o un tipo de reactivo que no conoce la app se deja
 * como el editor lo mostraría, para que el médico lo elija
 */
export function draftFromEditorVersion(version: EditorVersion): QuestionDraft {
  const task = QuestionTaskSchema.safeParse(version.structure.task);
  return draftFromVersion(
    {
      vignette: version.vignette,
      prompt: version.prompt,
      branch: version.branch,
      topic: version.topic,
      subtopic: version.subtopic,
      structure: {
        polarity: version.structure.polarity,
        // Sin tarea queda vacía para que el médico la elija. Una que la app no conoce se muestra como
        // diagnóstico, como antes
        task: task.success ? task.data : version.structure.task === '' ? '' : 'diagnosis',
        format: version.structure.format,
      },
      explanation: version.explanation,
      gpcRefs: version.gpcRefs,
      physicianDifficulty: version.difficulty,
      itemKinds: version.itemKinds.flatMap((kind) => {
        const parsed = ItemKindSchema.safeParse(kind);
        return parsed.success ? [parsed.data] : [];
      }),
      ...(CognitiveLevelSchema.safeParse(version.cognitiveLevel).success
        ? { cognitiveLevel: CognitiveLevelSchema.parse(version.cognitiveLevel) }
        : {}),
      clues: version.clues,
      canonicalOptionIds: version.canonicalOptionIds,
    },
    [...version.options]
      .sort((a, b) => a.position - b.position)
      .map((option) => ({
        id: option.id,
        optionId: option.optionId,
        text: option.text,
        isCorrect: option.isCorrect,
        biasTag: option.isCorrect ? null : option.biasTag,
        secondaryBiasTags: option.secondaryBiasTags,
        rationale: option.rationale ?? '',
      })),
  );
}

export type IssueCode =
  | 'prompt_empty'
  | 'prompt_long'
  | 'vignette_long'
  | 'explanation_long'
  | 'topic_mismatch'
  | 'subtopic_mismatch'
  | 'difficulty_range'
  | 'options_count'
  | 'correct_count'
  | 'option_text_empty'
  | 'option_text_long'
  | 'option_text_repeated'
  | 'option_rationale_empty'
  | 'option_rationale_long'
  | 'option_tag_missing'
  | 'option_tag_unknown'
  | 'option_secondary_repeats'
  | 'option_secondary_many'
  | 'canonical_count'
  | 'canonical_without_correct'
  | 'canonical_without_distractor'
  | 'gpc_empty'
  | 'clue_empty'
  | 'task_missing'
  // Inglés médico (B13). La fuente no cabe en 300 caracteres, o el idioma no va con la rama
  | 'passage_long'
  | 'language_branch_mismatch';

export interface DraftIssue {
  code: IssueCode;
  /** Posición de la opción, de 0 en adelante, cuando el problema es de una opción */
  option?: number;
}

export interface TaxonomyView {
  /** Subespecialidades por rama */
  topicsOfBranch: (branch: string) => readonly string[];
  /** Subtemas por subespecialidad */
  subtopicsOfTopic: (branch: string, topic: string) => readonly string[];
  /** Las etiquetas que se pueden poner a un distractor */
  taggable: ReadonlySet<string>;
  /** El idioma que lleva una pregunta de esa rama: Inglés médico en inglés y las demás en español */
  languageOf: (branch: string) => QuestionLanguage;
}

const normalize = (text: string) =>
  text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();

/** Los problemas que impiden guardar. Vacío si el borrador se puede guardar */
export function validateDraft(draft: QuestionDraft, taxonomy: TaxonomyView): DraftIssue[] {
  const issues: DraftIssue[] = [];
  const push = (code: IssueCode, option?: number) => {
    issues.push(option === undefined ? { code } : { code, option });
  };

  if (draft.prompt.trim().length === 0) push('prompt_empty');
  if (draft.prompt.length > 1_000) push('prompt_long');
  if (draft.vignette.length > 8_000) push('vignette_long');
  if (draft.explanation.length > 4_000) push('explanation_long');
  if (!taxonomy.topicsOfBranch(draft.branch).includes(draft.topic)) push('topic_mismatch');
  else if (!taxonomy.subtopicsOfTopic(draft.branch, draft.topic).includes(draft.subtopic))
    push('subtopic_mismatch');
  if (
    !Number.isInteger(draft.physicianDifficulty) ||
    draft.physicianDifficulty < 1 ||
    draft.physicianDifficulty > 5
  )
    push('difficulty_range');

  const { options } = draft;
  if (options.length < MIN_OPTIONS || options.length > MAX_OPTIONS) push('options_count');
  if (options.filter((option) => option.isCorrect).length !== 1) push('correct_count');

  const seen = new Map<string, number>();
  options.forEach((option, index) => {
    const text = option.text.trim();
    if (text.length === 0) push('option_text_empty', index);
    else {
      if (option.text.length > 1_000) push('option_text_long', index);
      const key = normalize(text);
      if (seen.has(key)) push('option_text_repeated', index);
      else seen.set(key, index);
    }
    if (option.rationale.trim().length === 0) push('option_rationale_empty', index);
    if (option.rationale.length > 1_500) push('option_rationale_long', index);
    if (!option.isCorrect) {
      if (option.biasTag === null || option.biasTag === '') push('option_tag_missing', index);
      else if (!taxonomy.taggable.has(option.biasTag)) push('option_tag_unknown', index);
      if (option.biasTag !== null && option.secondaryBiasTags.includes(option.biasTag))
        push('option_secondary_repeats', index);
      if (option.secondaryBiasTags.length > MAX_SECONDARY_TAGS)
        push('option_secondary_many', index);
    }
  });

  const canonical = options.filter((option) => option.canonical);
  if (canonical.length < 2 || canonical.length > MAX_OPTIONS) push('canonical_count');
  if (!canonical.some((option) => option.isCorrect)) push('canonical_without_correct');
  if (!canonical.some((option) => !option.isCorrect)) push('canonical_without_distractor');

  if (draft.gpcRefs.some((ref) => ref.title.trim().length === 0)) push('gpc_empty');
  if (draft.clues.some((clue) => clue.text.trim().length === 0)) push('clue_empty');
  if (draft.structure.task === '') push('task_missing');
  // Inglés médico (B13). El idioma va con la rama, y la fuente tiene que caber en una referencia
  if ((draft.language ?? 'es') !== taxonomy.languageOf(draft.branch)) {
    push('language_branch_mismatch');
  }
  if (draft.language === 'en' && draft.passage) {
    const reference = composePassageSource(draft.passage);
    if (reference !== null && reference.length > PASSAGE_SOURCE_MAX_LENGTH) push('passage_long');
  }
  return issues;
}

/**
 * Qué le falta a la fuente del texto de un borrador en inglés para aprobarse, que es lo mismo que dirá la
 * base al leer la referencia que arma draftForSave (1.6 del plan de B13). null si está completa o si la
 * pregunta no es en inglés. No impide guardar, solo aprobar, así que no es parte de validateDraft
 */
export function passageIssue(
  draft: Pick<QuestionDraft, 'language' | 'passage'>,
): PassageSourceIssue | null {
  if (draft.language !== 'en') return null;
  const reference = draft.passage ? composePassageSource(draft.passage) : null;
  if (reference === null) return 'passage_source_missing';
  const read = parsePassageSource([{ title: reference }]);
  return read.ok ? null : read.issue;
}

/** Lo que está mal en cada campo de la fuente, para decirlo junto al campo */
export interface PassageProblems {
  title?: 'missing';
  license?: 'missing' | 'not_allowed';
  url?: 'missing' | 'invalid';
}

/** La licencia de la lista que el texto nombra, sin importar mayúsculas ni acentos, o undefined */
export function licenseOfPassage(license: string) {
  const wanted = normalize(license);
  return PASSAGE_LICENSES.find((key) => normalize(LICENSE_LABELS[key]) === wanted);
}

/**
 * Los problemas de cada campo de la fuente. Sin licencia elegida solo falta la licencia. Con una
 * licencia que pide enlace faltan el título y el enlace https. El texto propio del equipo no pide más
 */
export function passageProblems(passage: DraftPassage): PassageProblems {
  const problems: PassageProblems = {};
  if (passage.license.trim() === '') {
    problems.license = 'missing';
    return problems;
  }
  const key = licenseOfPassage(passage.license);
  if (key === undefined) {
    problems.license = 'not_allowed';
    return problems;
  }
  if (!licenseNeedsUrl(key)) return problems;
  if (passage.title.trim() === '') problems.title = 'missing';
  const url = passage.url.trim();
  if (url === '') problems.url = 'missing';
  else if (!isHttpsUrl(url)) problems.url = 'invalid';
  return problems;
}

/**
 * El borrador como lo guarda el repositorio. En inglés la fuente del texto pasa a ser la primera
 * referencia, con la forma fija de passageSource.ts, y el idioma viaja con el borrador. En español no
 * cambia nada. Es idempotente, un borrador que ya pasó por aquí no lleva el pasaje aparte
 */
export function draftForSave(draft: QuestionDraft): QuestionDraft {
  const { passage, ...rest } = draft;
  if (draft.language !== 'en') return rest;
  const reference = passage ? composePassageSource(passage) : null;
  return {
    ...rest,
    gpcRefs:
      reference === null
        ? rest.gpcRefs
        : [{ title: reference, status: 'verified' }, ...rest.gpcRefs],
  };
}

/**
 * Lo que la nube deja guardar como borrador incompleto (3.4 del plan de B11). Una justificación vacía o
 * un distractor sin sesgo no impiden guardar en la nube, quedan como pendientes que impiden aprobar. La
 * base local guarda con OptionSchema, que los pide, así que ahí siguen impidiendo guardar
 */
export const CLOUD_PENDING_ISSUES: ReadonlySet<IssueCode> = new Set<IssueCode>([
  'option_rationale_empty',
  'option_tag_missing',
]);

/** Los problemas que impiden guardar en esa base */
export function blockingIssues(
  issues: readonly DraftIssue[],
  kind: 'local' | 'cloud',
): DraftIssue[] {
  return kind === 'local'
    ? [...issues]
    : issues.filter((issue) => !CLOUD_PENDING_ISSUES.has(issue.code));
}

/**
 * La estructura de un borrador que ya pasó validateDraft, que no deja guardar con la tarea vacía
 * (task_missing). Nunca elige una tarea por el médico
 */
export function checkedStructure(
  draft: QuestionDraft,
): Pick<Question['structure'], 'polarity' | 'task' | 'format'> {
  const { task } = draft.structure;
  if (task === '') throw new Error('Una versión no se guarda sin tarea. validateDraft lo avisa');
  return { ...draft.structure, task };
}

export interface NextVersionInput {
  current: Question;
  draft: QuestionDraft;
  /** Genera un ID nuevo. Cada versión de pregunta y de opción lleva el suyo */
  newId: () => string;
  now: Date;
}

const sameStructure = (a: Structure, b: Structure) =>
  a.polarity === b.polarity && a.task === b.task && a.format === b.format;

/**
 * La versión que sigue a la actual, con sus opciones. Entra como borrador, porque lo editado vuelve
 * a pasar por revisión. Si el médico cambió la estructura, la suya gana sobre la automática (7.5)
 */
export function buildNextVersion(input: NextVersionInput): {
  question: Question;
  options: Option[];
} {
  const { current, newId, now } = input;
  // En inglés la fuente del texto pasa a ser la primera referencia. Si ya pasó, no cambia nada
  const draft = draftForSave(input.draft);
  const options: Option[] = draft.options.map((option) => ({
    id: newId(),
    optionId: option.optionId,
    questionVersionId: '',
    text: option.text.trim(),
    isCorrect: option.isCorrect,
    biasTag: option.isCorrect ? null : option.biasTag,
    secondaryBiasTags: option.isCorrect ? [] : [...option.secondaryBiasTags],
    rationale: option.rationale.trim(),
  }));
  const versionId = newId();
  for (const option of options) option.questionVersionId = versionId;
  const idOf = new Map(options.map((option) => [option.optionId, option.id]));
  const canonicalOptionIds = draft.options
    .filter((option) => option.canonical)
    .map((option) => idOf.get(option.optionId))
    .filter((id): id is string => id !== undefined);
  const question: Question = {
    id: versionId,
    questionId: current.questionId,
    version: current.version + 1,
    caseId: current.caseId,
    caseOrder: current.caseOrder,
    // La viñeta de un caso seriado es del caso y no se edita aquí
    vignette: current.caseId === null ? draft.vignette.trim() : current.vignette,
    prompt: draft.prompt.trim(),
    branch: draft.branch,
    topic: draft.topic,
    subtopic: draft.subtopic,
    structure: {
      ...checkedStructure(draft),
      source:
        current.structure.source === 'physician' ||
        !sameStructure(current.structure, draft.structure)
          ? 'physician'
          : 'auto',
    },
    explanation: draft.explanation.trim(),
    gpcRefs: draft.gpcRefs.map((ref) => ({ title: ref.title.trim(), status: ref.status })),
    physicianDifficulty: draft.physicianDifficulty,
    // Solo la pregunta en inglés lleva el idioma. Sin el campo es español, como todo lo de antes
    ...(draft.language === 'en' ? { language: 'en' as const } : {}),
    ...(draft.itemKinds.length > 0 ? { itemKinds: [...draft.itemKinds] } : {}),
    ...(draft.cognitiveLevel ? { cognitiveLevel: draft.cognitiveLevel } : {}),
    ...(draft.clues.length > 0
      ? {
          clues: draft.clues.map((clue): Clue => ({
            text: clue.text.trim(),
            strength: clue.strength,
          })),
        }
      : {}),
    canonicalOptionIds,
    editorialStatus: 'draft',
    isDemo: current.isDemo,
    createdAt: now.toISOString(),
  };
  return { question, options };
}

/** Las partes de la pregunta que pueden cambiar entre dos versiones, para el historial */
export type ChangedPart =
  | 'vignette'
  | 'source'
  | 'prompt'
  | 'taxonomy'
  | 'structure'
  | 'explanation'
  | 'gpc'
  | 'difficulty'
  | 'itemKinds'
  | 'cognitive'
  | 'clues'
  | 'options'
  | 'tags'
  | 'canonical';

const CHANGED_ORDER: readonly ChangedPart[] = [
  'vignette',
  'source',
  'prompt',
  'options',
  'tags',
  'canonical',
  'explanation',
  'taxonomy',
  'structure',
  'difficulty',
  'gpc',
  'itemKinds',
  'cognitive',
  'clues',
];

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Qué cambió de una versión a la siguiente. Compara los borradores y no los IDs de cada versión */
export function changedParts(before: QuestionDraft, after: QuestionDraft): ChangedPart[] {
  const byId = new Map(before.options.map((option) => [option.optionId, option]));
  const optionsChanged =
    before.options.length !== after.options.length ||
    after.options.some((option) => {
      const old = byId.get(option.optionId);
      return (
        old?.text !== option.text ||
        old.isCorrect !== option.isCorrect ||
        old.rationale !== option.rationale
      );
    });
  const tagsChanged = after.options.some((option) => {
    const old = byId.get(option.optionId);
    return (
      old !== undefined &&
      (old.biasTag !== option.biasTag ||
        !same([...old.secondaryBiasTags].sort(), [...option.secondaryBiasTags].sort()))
    );
  });
  const canonicalChanged = !same(
    before.options.filter((option) => option.canonical).map((option) => option.optionId),
    after.options.filter((option) => option.canonical).map((option) => option.optionId),
  );
  const changed = new Set<ChangedPart>();
  if (before.vignette !== after.vignette) changed.add('vignette');
  // La fuente del texto de una pregunta en inglés. En español los dos son undefined
  if (!same(before.passage, after.passage)) changed.add('source');
  if (before.prompt !== after.prompt) changed.add('prompt');
  if (optionsChanged) changed.add('options');
  if (tagsChanged) changed.add('tags');
  if (canonicalChanged) changed.add('canonical');
  if (before.explanation !== after.explanation) changed.add('explanation');
  if (
    !same(
      [before.branch, before.topic, before.subtopic],
      [after.branch, after.topic, after.subtopic],
    )
  )
    changed.add('taxonomy');
  if (!sameStructure(before.structure, after.structure)) changed.add('structure');
  if (before.physicianDifficulty !== after.physicianDifficulty) changed.add('difficulty');
  if (!same(before.gpcRefs, after.gpcRefs)) changed.add('gpc');
  if (!same([...before.itemKinds].sort(), [...after.itemKinds].sort())) changed.add('itemKinds');
  if (before.cognitiveLevel !== after.cognitiveLevel) changed.add('cognitive');
  if (!same(before.clues, after.clues)) changed.add('clues');
  return CHANGED_ORDER.filter((part) => changed.has(part));
}

/** La taxonomía del banco tal como la valida el editor */
export function taxonomyViewFrom(source: {
  branches: readonly {
    key: string;
    /** clinical o english. Sin el campo es clinical, como en branchSection */
    section?: 'clinical' | 'english' | undefined;
    topics: readonly { key: string; subtopics: readonly { key: string }[] }[];
  }[];
  taggable: Iterable<string>;
}): TaxonomyView {
  const taggable = new Set(source.taggable);
  const topicsOf = (branch: string) =>
    source.branches.find((item) => item.key === branch)?.topics ?? [];
  return {
    topicsOfBranch: (branch) => topicsOf(branch).map((topic) => topic.key),
    subtopicsOfTopic: (branch, topic) =>
      (topicsOf(branch).find((item) => item.key === topic)?.subtopics ?? []).map(
        (subtopic) => subtopic.key,
      ),
    taggable,
    languageOf: (branch) =>
      source.branches.find((item) => item.key === branch)?.section === 'english' ? 'en' : 'es',
  };
}
