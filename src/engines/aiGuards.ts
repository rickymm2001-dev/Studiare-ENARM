/**
 * Guardas de la salida de los motores de IA (8.1 a 8.6, D-098, CLAUDE.md).
 *
 * Qué hace. Después de que una salida cumple su esquema, revisa que lo que dice sea cierto con
 * respecto a lo que recibió el modelo. La evidencia tiene que existir en la entrada, las acciones
 * tienen que ser de la lista cerrada, no puede haber cifras ni fármacos que el texto de origen no
 * traiga, y una cita tiene que aparecer tal cual en la fuente. Nada de opiniones sobre la salud
 * mental del alumno. La IA señala y nunca corrige.
 * Entradas. La entrada del motor y su salida ya validada por el esquema.
 * Salidas. Si pasó y la lista de problemas con un código por cada uno. Las tarjetas devuelven
 * además solo las que pasaron.
 * Método. Funciones puras que usan el núcleo de anclaje. Las ejecutan el servidor, que reintenta una
 * vez con los problemas, y el cliente, que no confía en nadie. Sin importaciones de la app.
 * Umbrales. Mensaje al alumno de 2 a 3 frases, una frase de hipótesis, de 2 a 3 ejemplos en un
 * consejo y cita de 20 caracteres y 4 palabras como mínimo.
 * B12. Dos guardas nuevas. score_prediction rechaza en lo que lee el alumno (hipótesis, informe y
 * consejo) un puntaje estimado, una probabilidad de plaza o un percentil futuro, porque la regla de
 * CLAUDE.md prohíbe predecir el puntaje del ENARM. vocabulary rechaza la palabra sesgo en un consejo
 * cuando la app todavía dice trampas (D-099, 10.14 del plan de B12).
 */
import {
  DEFAULT_BIAS_VOCABULARY,
  type BiasTipInput,
  type BiasTipOutput,
  type EngineInputs,
  type EngineOutputs,
  type FlashcardsInput,
  type FlashcardsOutput,
  type HypothesisInput,
  type HypothesisOutput,
  type RestructureInput,
  type RestructureOutput,
  type WeeklyReportInput,
  type WeeklyReportOutput,
  type AiEngine,
} from './aiContracts.ts';
import { clozeHoles } from './cloze.ts';
import {
  ANSWER_GROUNDED_RATIO,
  groundedRatio,
  normalizeForMatch,
  quoteIssues,
  unsupportedFacts,
} from './grounding.ts';

export type GuardIssue =
  | 'evidence_missing'
  | 'evidence_not_in_input'
  | 'action_not_allowed'
  | 'new_medical_fact'
  | 'mental_health_opinion'
  | 'hypothesis_not_one_sentence'
  | 'message_sentences'
  | 'inconsistent_empty'
  | 'ref_not_in_input'
  | 'priorities_mismatch'
  | 'section_not_provided'
  | 'examples_count'
  | 'option_labels'
  | 'key_count'
  | 'unchanged'
  | 'transform_not_applied'
  | 'quote_too_short'
  | 'quote_not_in_source'
  | 'number_not_in_quote'
  | 'drug_not_in_quote'
  | 'answer_not_grounded'
  | 'controversy_invalid'
  | 'score_prediction'
  | 'vocabulary';

export interface GuardResult {
  passed: boolean;
  issues: GuardIssue[];
}

/** Qué falló, en una línea que se le da al modelo en el reintento y se muestra al admin */
export const GUARD_MESSAGES: Readonly<Record<GuardIssue, string>> = {
  evidence_missing: 'Hay hipótesis pero no citas ninguna evidencia',
  evidence_not_in_input: 'Citaste evidencia que no está en los datos',
  action_not_allowed: 'Propusiste una acción que no está entre las permitidas',
  new_medical_fact: 'Agregaste una cifra o un fármaco que los datos no traen',
  mental_health_opinion: 'Opinaste sobre la salud mental del alumno',
  hypothesis_not_one_sentence: 'La hipótesis debe ser una sola frase',
  message_sentences: 'El mensaje al alumno debe tener de 2 a 3 frases',
  inconsistent_empty: 'Sin hipótesis no puede haber evidencia, acciones ni mensaje',
  ref_not_in_input: 'Usaste una referencia que no está en los datos',
  priorities_mismatch: 'Las prioridades deben ser las mismas de los datos, sin repetir ni faltar',
  section_not_provided: 'Hablaste de una sección que no venía en los datos',
  examples_count: 'Los ejemplos citados no pueden repetirse',
  option_labels: 'Las letras de las opciones no pueden repetirse',
  key_count: 'Debe haber exactamente una opción correcta',
  unchanged: 'La pregunta quedó igual que la original',
  transform_not_applied: 'No se aplicó la transformación pedida',
  quote_too_short: 'La cita es demasiado corta',
  quote_not_in_source: 'La cita no aparece tal cual en el texto de origen',
  number_not_in_quote: 'Hay una cifra que la cita no trae',
  drug_not_in_quote: 'Hay un fármaco que la cita no trae',
  answer_not_grounded: 'La respuesta no se apoya en las palabras de la cita',
  controversy_invalid: 'La controversia no cita una fuente de la lista cerrada',
  score_prediction:
    'Predijiste un puntaje, una plaza o un percentil del ENARM, y eso nunca se hace',
  vocabulary: 'Usaste la palabra sesgo y con este alumno se dice trampa',
};

const result = (issues: Iterable<GuardIssue>): GuardResult => {
  const unique = [...new Set(issues)];
  return { passed: unique.length === 0, issues: unique };
};

/**
 * Términos de salud mental. El tutor habla de cómo estudia el alumno y nunca opina sobre cómo está
 * (8.2). Se revisan sobre el texto normalizado, sin acentos
 */
const MENTAL_HEALTH_TERMS = String.raw`depresion|deprimid[oa]|ansiedad|ansios[oa]|trastorno|burnout|agotamiento emocional|estres cronico|salud mental|psicolog\w*|psiquiatr\w*|terapia|suicid\w*|panico|angustia|autoestima`;
const MENTAL_HEALTH = new RegExp(String.raw`\b(${MENTAL_HEALTH_TERMS})\b`, 'g');
/**
 * Una frase que le atribuye al alumno un estado de ánimo, como tienes ansiedad, estás deprimido o tu
 * autoestima (B12). Aunque el término venga en el texto del banco, eso ya es opinar sobre el alumno
 */
const ABOUT_STUDENT = [
  new RegExp(
    String.raw`\b(tienes|tengas|sientes|sufres|padeces|vives con|muestras) (de |un |una |mucha |mucho |cierta |cierto |algo de )?(${MENTAL_HEALTH_TERMS})\b`,
  ),
  /\b(estas|estes|te sientes|te notas|te ves|pareces|eres|andas) (muy |algo |un poco |bastante )?(deprimid[oa]|ansios[oa]|estresad[oa]|agotad[oa]|angustiad[oa]|triste)\b/,
  new RegExp(String.raw`\btu (${MENTAL_HEALTH_TERMS}|estres|animo)\b`),
];

/**
 * Si el texto opina sobre la salud mental del alumno. Un término de salud mental cuenta si no viene
 * en el apoyo, que es el texto del banco o los datos que recibió el motor, o si la frase se lo
 * atribuye al alumno. Así un tema de psiquiatría del banco o una terapia intensiva se pueden repetir
 * y "parece que tienes ansiedad" nunca pasa (B12, para no rechazar el banco imperfecto, D-080)
 */
export function mentionsMentalHealth(text: string, support = ''): boolean {
  const supported = new Set(normalizeForMatch(support).match(MENTAL_HEALTH) ?? []);
  return sentencesOf(text).some((raw) => {
    const sentence = normalizeForMatch(raw);
    const terms = sentence.match(MENTAL_HEALTH) ?? [];
    if (terms.length === 0) return false;
    if (ABOUT_STUDENT.some((pattern) => pattern.test(sentence))) return true;
    return terms.some((term) => !supported.has(term));
  });
}

/** Frases de un texto. Un punto dentro de una cifra como 3.5 no corta la frase */
function sentencesOf(text: string): string[] {
  return text
    .trim()
    .split(/(?<=[.!?…])\s+(?=[¿¡"“(\p{Lu}\d])/u)
    .filter((part) => part.replace(/[^\p{L}\d]/gu, '').length > 0);
}

export function sentenceCount(text: string): number {
  return sentencesOf(text).length;
}

// ---------------------------------------------------------------------------------------------
// Predicción del puntaje (CLAUDE.md, B12)

/**
 * Lo que una predicción promete. El puntaje, la calificación, los aciertos o el percentil del
 * examen, una plaza o la selección. Se revisa frase por frase sobre el texto normalizado, sin acentos
 */
const EXAM_OUTCOME =
  /\b(puntajes?|calificacion(es)?|aciertos|percentil(es)?|plazas?|seleccion|seleccionad[oa]s?|residencias?)\b/;
/** Verbos en futuro sobre el resultado del alumno, como obtendrás o vas a aprobar */
const OUTCOME_FUTURE =
  /\b(obtendras|sacaras|alcanzaras|lograras|aprobaras|pasaras|quedaras|vas a (sacar|obtener|alcanzar|lograr|aprobar|pasar|quedar))\b/;
/** Palabras de estimación, como puntaje estimado o percentil proyectado */
const ESTIMATE =
  /\b(estimad[oa]s?|estimacion(es)?|proyectad[oa]s?|proyeccion(es)?|pronostic\w*|predic\w*)\b/;
/** Probabilidad de aprobar o de ser seleccionado, que siempre es del examen */
const CHANCE_TO_PASS =
  /\b(probabilidad(es)?|posibilidad(es)?|chances?|oportunidad(es)?) de (aprobar|ser seleccionad[oa])\b/;
/** Probabilidad de quedar, de entrar o de conseguir algo, que es del examen si nombra su resultado */
const CHANCE_TO_GET =
  /\b(probabilidad(es)?|posibilidad(es)?|chances?|oportunidad(es)?) de (pasar|quedar|entrar|obtener|conseguir|ganar|alcanzar)\b/;
const EXAM = /\b(enarm|examen)\b/;
/** Una predicción sin rodeos sobre el examen, como aprobarás el ENARM o tu percentil */
const DIRECT_PREDICTION = [
  /\b(aprobaras|pasaras|vas a aprobar|vas a pasar) (el )?(enarm|examen)\b/,
  /\bseras seleccionad[oa]\b/,
  /\btu percentil\b/,
  /\btu (puntaje|calificacion|lugar|resultado) (en|del) (el )?enarm\b/,
];

/**
 * Si el texto predice el puntaje del ENARM, una plaza o un percentil del alumno. La app nunca predice
 * el puntaje (CLAUDE.md), así que la IA tampoco. Una frase cuenta si junta un resultado del examen con
 * un futuro o una estimación, si habla de la probabilidad de aprobar o de quedar en el examen, o si lo
 * dice sin rodeos. Frases como "en el ENARM tendrás casos así", "la probabilidad de quedar con
 * secuelas" o "la escala de Alvarado da una puntuación de 7" no cuentan
 */
export function predictsScore(text: string): boolean {
  return sentencesOf(text).some((raw) => {
    const sentence = normalizeForMatch(raw);
    if (DIRECT_PREDICTION.some((pattern) => pattern.test(sentence))) return true;
    if (CHANCE_TO_PASS.test(sentence)) return true;
    const outcome = EXAM_OUTCOME.test(sentence);
    if (CHANCE_TO_GET.test(sentence) && (outcome || EXAM.test(sentence))) return true;
    return outcome && (OUTCOME_FUTURE.test(sentence) || ESTIMATE.test(sentence));
  });
}

// ---------------------------------------------------------------------------------------------
// Vocabulario de sesgo o trampa (D-099, B12)

const BIAS_WORD = /\bsesg\w*/;

/** Si el texto usa la palabra sesgo, o sesgado, que no se dice mientras el alumno ve trampas */
export function usesBiasWord(text: string): boolean {
  return BIAS_WORD.test(normalizeForMatch(text));
}

const joinTexts = (...parts: readonly (string | null | undefined)[]) =>
  parts.filter((part): part is string => typeof part === 'string').join('\n');

/** Si el texto trae cifras o fármacos que el apoyo no trae */
const hasNewFact = (content: string, support: string) => {
  const missing = unsupportedFacts(content, support);
  return missing.numbers.length > 0 || missing.drugs.length > 0;
};

// ---------------------------------------------------------------------------------------------
// Hipótesis del tutor (8.2)

export function guardHypothesis(output: HypothesisOutput, input: HypothesisInput): GuardResult {
  const issues: GuardIssue[] = [];
  const refs = new Set(input.evidence.map((item) => item.ref));
  const allowed = new Set<string>(input.allowedActions);
  const text = joinTexts(output.hypothesis, output.studentMessage);

  if (output.hypothesis === null) {
    // Sin hipótesis no hay evidencia, acciones ni mensaje que defender
    if (output.evidence.length > 0 || output.actions.length > 0 || output.studentMessage !== null) {
      issues.push('inconsistent_empty');
    }
    return result(issues);
  }

  if (output.evidence.length === 0) issues.push('evidence_missing');
  if (output.evidence.some((ref) => !refs.has(ref))) issues.push('evidence_not_in_input');
  if (output.actions.some((action) => !allowed.has(action))) issues.push('action_not_allowed');
  if (sentenceCount(output.hypothesis) !== 1) issues.push('hypothesis_not_one_sentence');
  if (output.studentMessage === null) {
    issues.push('message_sentences');
  } else {
    const sentences = sentenceCount(output.studentMessage);
    if (sentences < 2 || sentences > 3) issues.push('message_sentences');
  }
  // Los datos médicos salen de los ítems implicados y de nada más
  const support = joinTexts(input.area, ...input.evidence.map((item) => item.text));
  if (mentionsMentalHealth(text, support)) issues.push('mental_health_opinion');
  if (predictsScore(text)) issues.push('score_prediction');
  if (hasNewFact(text, support)) issues.push('new_medical_fact');
  return result(issues);
}

// ---------------------------------------------------------------------------------------------
// Informe semanal (8.3)

export function guardWeeklyReport(
  output: WeeklyReportOutput,
  input: WeeklyReportInput,
): GuardResult {
  const issues: GuardIssue[] = [];
  const inputRefs = input.priorities.map((line) => line.ref);
  const outputRefs = output.priorities.map((line) => line.ref);

  if (outputRefs.some((ref) => !inputRefs.includes(ref))) issues.push('ref_not_in_input');
  if (new Set(outputRefs).size !== outputRefs.length || outputRefs.length !== inputRefs.length) {
    issues.push('priorities_mismatch');
  }
  // Una sección que sigue calibrando no llega en la entrada y no puede aparecer en la salida
  if (output.habit !== null && input.habit === null) issues.push('section_not_provided');
  if (output.challenge !== null && input.challenge === null) issues.push('section_not_provided');

  const text = joinTexts(
    output.summary,
    ...output.priorities.map((line) => line.text),
    output.habit,
    output.challenge,
  );
  const support = joinTexts(
    String(input.answers),
    ...input.priorities.flatMap((line) => [line.title, line.detail]),
    input.habit?.title,
    input.habit?.detail,
    input.challenge?.title,
    input.challenge?.detail,
  );
  if (mentionsMentalHealth(text, support)) issues.push('mental_health_opinion');
  if (predictsScore(text)) issues.push('score_prediction');
  if (hasNewFact(text, support)) issues.push('new_medical_fact');
  return result(issues);
}

// ---------------------------------------------------------------------------------------------
// Consejo por sesgo (8.5)

export function guardBiasTip(output: BiasTipOutput, input: BiasTipInput): GuardResult {
  const issues: GuardIssue[] = [];
  const refs = new Set(input.examples.map((example) => example.ref));

  if (output.exampleRefs.some((ref) => !refs.has(ref))) issues.push('ref_not_in_input');
  if (new Set(output.exampleRefs).size !== output.exampleRefs.length) issues.push('examples_count');
  const support = joinTexts(input.baseTip, input.biasLabel, ...input.examples.map((e) => e.text));
  if (mentionsMentalHealth(output.tip, support)) issues.push('mental_health_opinion');
  if (predictsScore(output.tip)) issues.push('score_prediction');
  // Sin el vocabulario en la entrada cuenta como trampa, que es lo que dice la app sin acuerdo medido
  const vocabulary = input.vocabulary ?? DEFAULT_BIAS_VOCABULARY;
  if (vocabulary === 'trampa' && usesBiasWord(output.tip)) issues.push('vocabulary');
  if (hasNewFact(output.tip, support)) issues.push('new_medical_fact');
  return result(issues);
}

// ---------------------------------------------------------------------------------------------
// Tarjetas (8.4)

export interface GuardOptions {
  /** Claves de los textos académicos que una controversia puede citar. Sin ella no se revisa la lista */
  sourceKeys?: ReadonlySet<string>;
}

export interface GuardedCards {
  /** Solo las tarjetas que pasaron */
  cards: FlashcardsOutput['cards'];
  result: GuardResult;
  /** Cuántas se descartaron */
  dropped: number;
}

/**
 * Deja pasar solo las tarjetas ancladas al texto de donde dicen salir. Pasa si no había tarjetas o si
 * al menos una se salvó. Los códigos de lo descartado quedan en la lista para la bitácora
 */
export function guardFlashcards(
  output: FlashcardsOutput,
  input: FlashcardsInput,
  options: GuardOptions = {},
): GuardedCards {
  const kept: FlashcardsOutput['cards'] = [];
  const issues: GuardIssue[] = [];
  for (const card of output.cards) {
    const cardIssues: GuardIssue[] = [...quoteIssues(card.quote, input.text)];
    const missing = unsupportedFacts(`${card.front} ${card.back}`, card.quote);
    if (missing.numbers.length > 0) cardIssues.push('number_not_in_quote');
    if (missing.drugs.length > 0) cardIssues.push('drug_not_in_quote');
    const answer =
      card.kind === 'basic'
        ? card.back
        : clozeHoles(card.front)
            .map((hole) => hole.answer)
            .join(' ');
    if (groundedRatio(answer, card.quote) < ANSWER_GROUNDED_RATIO) {
      cardIssues.push('answer_not_grounded');
    }
    const sources = card.controversy?.sources;
    if (
      sources !== undefined &&
      (sources.length === 0 ||
        (options.sourceKeys !== undefined &&
          sources.some((entry) => !options.sourceKeys?.has(entry.key))))
    ) {
      cardIssues.push('controversy_invalid');
    }
    if (cardIssues.length === 0) kept.push(card);
    else issues.push(...cardIssues);
  }
  const dropped = output.cards.length - kept.length;
  const passed = output.cards.length === 0 || kept.length > 0;
  return { cards: kept, dropped, result: { passed, issues: [...new Set(issues)] } };
}

// ---------------------------------------------------------------------------------------------
// Pregunta reestructurada (8.6)

const EXCEPT_STEM = /\b(excepto|salvo|menos|no es|no corresponde|no se|no forma|no pertenece)\b/;

export function guardRestructure(output: RestructureOutput, input: RestructureInput): GuardResult {
  const issues: GuardIssue[] = [];
  const labels = output.options.map((option) => option.label.trim().toUpperCase());
  if (new Set(labels).size !== labels.length) issues.push('option_labels');
  if (output.options.filter((option) => option.isKey).length !== 1) issues.push('key_count');

  const original = joinTexts(input.stem, ...input.options.map((o) => o.text), input.explanation);
  const proposed = joinTexts(output.stem, ...output.options.map((o) => o.text), output.explanation);
  if (
    normalizeForMatch(output.stem) === normalizeForMatch(input.stem) &&
    normalizeForMatch(proposed) === normalizeForMatch(original)
  ) {
    issues.push('unchanged');
  }
  if (input.transform === 'to_except' && !EXCEPT_STEM.test(normalizeForMatch(output.stem))) {
    issues.push('transform_not_applied');
  }

  // Ni cifras ni fármacos nuevos. El médico revisa el fondo, pero esto no puede crecer solo
  if (hasNewFact(proposed, original)) issues.push('new_medical_fact');

  // La nueva clave se apoya en una frase literal de la explicación original
  for (const issue of quoteIssues(output.quote, input.explanation)) issues.push(issue);
  const key = output.options.find((option) => option.isKey);
  if (key && groundedRatio(key.text, original) < ANSWER_GROUNDED_RATIO) {
    issues.push('answer_not_grounded');
  }
  // Un tema de psiquiatría puede repetir sus términos. Lo nuevo no
  if (mentionsMentalHealth(proposed, original)) issues.push('mental_health_opinion');
  return result(issues);
}

// ---------------------------------------------------------------------------------------------
// Por motor

/** Corre la guarda del motor. Las tarjetas devuelven aparte las que pasaron */
export function guardOutput<E extends AiEngine>(
  engine: E,
  output: EngineOutputs[E],
  input: EngineInputs[E],
  options: GuardOptions = {},
): GuardResult {
  switch (engine) {
    case 'forgetting':
      return guardHypothesis(output as HypothesisOutput, input as HypothesisInput);
    case 'weekly_report':
      return guardWeeklyReport(output as WeeklyReportOutput, input as WeeklyReportInput);
    case 'bias_tips':
      return guardBiasTip(output as BiasTipOutput, input as BiasTipInput);
    case 'restructure':
      return guardRestructure(output as RestructureOutput, input as RestructureInput);
    case 'flashcards':
      return guardFlashcards(output as FlashcardsOutput, input as FlashcardsInput, options).result;
    default:
      return assertNever(engine);
  }
}

function assertNever(value: never): never {
  throw new Error(`Motor desconocido ${String(value)}`);
}
