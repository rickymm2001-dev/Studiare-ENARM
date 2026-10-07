// Reglas de un borrador de preguntas demo antes de unirlo a un lote (docs/contenido-demo.md). Son
// funciones puras que reciben lo que necesitan, para probarlas sin leer archivos. Una pregunta de un
// tipo raro (D-080) no se rechaza por ser imperfecta. Con tipos, la explicación puede ser corta y lo
// que difiere del motor de estructura se avisa pero no falla, porque la etiqueta del médico gana
// (7.5). Cualquier pregunta, con tipos o sin ellos, puede traer de 4 a 10 opciones. El examen real
// trae 4 y el banco nuevo trae hasta 6. Las 10 de los lotes demo ya no son una regla, solo un aviso.

export interface DraftOption {
  key: string;
  text: string;
  correct: boolean;
  bias?: string | undefined;
  secondaryBiases?: string[] | undefined;
  rationale: string;
}

export interface DraftQuestion {
  key: string;
  caseKey: string | null;
  branch: string;
  topic: string;
  subtopic: string;
  vignette: string;
  prompt: string;
  polarity: 'affirmative' | 'negative';
  task: string;
  options: DraftOption[];
  canonical: string[];
  explanation: string;
  gpcRefs: string[];
  /** Tipos de reactivo raros. Con alguno, las reglas de forma se relajan */
  kinds?: string[] | undefined;
}

export interface DraftContext {
  /** Sesgos que se pueden etiquetar en un distractor */
  taggable: ReadonlySet<string>;
  allBiases: ReadonlySet<string>;
  topics: ReadonlyMap<string, { branch: string; subtopics: ReadonlySet<string> }>;
  /** Polaridad y tarea que detecta el motor de estructura */
  analyze: (question: { vignette: string; prompt: string; serialCase: boolean }) => {
    polarity: string;
    task: string | null;
  };
}

export interface DraftReport {
  problems: string[];
  /**
   * Avisos que no hacen fallar el borrador. Diferencias con el motor en preguntas de un tipo raro y
   * preguntas que no traen 10 opciones
   */
  notes: string[];
  /** Preguntas cuya tarea detectó el motor */
  detected: number;
  /** De esas, las que coinciden con la tarea del borrador */
  agree: number;
}

const YEAR = /(?<!\d)(19|20)\d{2}(?!\d)/;
const CATALOG_CODE = /[A-Z]{2,}-\d/;
export const OPTION_KEYS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'];
const CANONICAL_SIZE = 4;
/** Menos opciones que el set canónico no dejan elegir 3 distractores */
export const MIN_OPTIONS = CANONICAL_SIZE;
/** Cuántas opciones traían los lotes demo. Con otra cantidad solo se avisa */
export const DEMO_OPTIONS = OPTION_KEYS.length;

const wordCount = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;

export function checkQuestions(questions: readonly DraftQuestion[], context: DraftContext) {
  const report: DraftReport = { problems: [], notes: [], detected: 0, agree: 0 };
  for (const question of questions) checkQuestion(question, context, report);
  return report;
}

function checkQuestion(question: DraftQuestion, context: DraftContext, report: DraftReport) {
  const { key } = question;
  const rare = (question.kinds?.length ?? 0) > 0;
  const problems = report.problems;
  // Un reactivo raro avisa de lo que se aparta del patrón y uno estándar lo rechaza
  const deviation = rare ? report.notes : problems;

  const words = wordCount(question.explanation);
  if (words === 0) problems.push(`${key} sin explicación`);
  else if (!rare && (words < 80 || words > 150))
    problems.push(`${key} explicación de ${words} palabras`);

  const topic = context.topics.get(question.topic);
  if (topic?.branch !== question.branch) problems.push(`${key} rama y tema no coinciden`);
  if (!topic?.subtopics.has(question.subtopic))
    problems.push(`${key} subtema ${question.subtopic}`);

  const keys = question.options.map((option) => option.key);
  const expected = OPTION_KEYS.slice(0, keys.length);
  if (keys.join('') !== expected.join('') || keys.length < MIN_OPTIONS)
    problems.push(
      `${key} las opciones deben ser a, b, c... en orden, de ${MIN_OPTIONS} a ${OPTION_KEYS.length}`,
    );
  else if (!rare && keys.length !== DEMO_OPTIONS)
    report.notes.push(
      `${key} tiene ${keys.length} opciones y los lotes demo traen ${DEMO_OPTIONS}`,
    );

  const correct = question.options.filter((option) => option.correct);
  if (correct.length !== 1) problems.push(`${key} tiene ${correct.length} opciones correctas`);
  for (const option of question.options) {
    if (option.correct && option.bias) problems.push(`${key}${option.key} correcta con sesgo`);
    if (!option.correct && !context.taggable.has(option.bias ?? ''))
      problems.push(`${key}${option.key} sesgo no válido ${option.bias ?? '(vacío)'}`);
    for (const secondary of option.secondaryBiases ?? [])
      if (!context.allBiases.has(secondary))
        problems.push(`${key}${option.key} sesgo secundario ${secondary}`);
  }
  const distinct = new Set(question.options.map((option) => option.text.trim().toLowerCase()));
  if (distinct.size !== question.options.length) problems.push(`${key} opciones repetidas`);

  const canonical = new Set(question.canonical);
  if (
    canonical.size !== CANONICAL_SIZE ||
    !question.canonical.includes(correct[0]?.key ?? '') ||
    question.canonical.some((entry) => !keys.includes(entry))
  )
    problems.push(
      `${key} el set canónico debe tener ${CANONICAL_SIZE} claves de las opciones e incluir la correcta`,
    );

  for (const reference of question.gpcRefs)
    if (YEAR.test(reference) || CATALOG_CODE.test(reference))
      problems.push(`${key} referencia con año o clave de catálogo`);

  const auto = context.analyze({
    vignette: question.vignette,
    prompt: question.prompt,
    serialCase: question.caseKey !== null,
  });
  if (auto.polarity !== question.polarity)
    deviation.push(`${key} polaridad ${question.polarity}, el motor dice ${auto.polarity}`);
  if (auto.task !== null) {
    report.detected += 1;
    if (auto.task === question.task) report.agree += 1;
    else deviation.push(`${key} tarea ${question.task}, el motor dice ${auto.task}`);
  }
}
