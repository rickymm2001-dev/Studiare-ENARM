/**
 * Respuestas fijas de los motores de IA (8.1, D-017, D-098).
 *
 * Qué hace. Calcula, sin red y sin clave, una salida válida para cada motor a partir de su entrada.
 * Es lo que contesta el proxy en modo simulado, lo que usa la app cuando no hay proxy y contra lo que
 * corren las evaluaciones con la bandera mock.
 * Entradas. La entrada de un motor ya validada por su esquema.
 * Salidas. La salida del motor, que cumple el esquema y las guardas de aiGuards.
 * Método. Plantillas en español que solo repiten lo que la entrada trae. Con el mismo texto sale
 * siempre la misma respuesta. Las preguntas reestructuradas llevan el aviso de que son de ejemplo y
 * de que un médico debe revisarlas. Sin importaciones de la app.
 * Umbrales. De 4 pruebas de evidencia como máximo en una hipótesis y confianza media desde 10
 * hallazgos recientes.
 */
import type {
  AiEngine,
  BiasTipInput,
  BiasTipOutput,
  EngineInputs,
  EngineOutputs,
  FlashcardsInput,
  FlashcardsOutput,
  HypothesisInput,
  HypothesisOutput,
  RestructureInput,
  RestructureOutput,
  WeeklyReportInput,
  WeeklyReportOutput,
} from './aiContracts';
import { simulateCards } from './cardSim';
import { MIN_QUOTE_CHARS, MIN_QUOTE_WORDS, wordsOf } from './grounding';

export const MOCK_MODEL = 'respuestas-fijas-v1';

const MEDIUM_CONFIDENCE_FINDINGS = 10;
const EVIDENCE_REFS = 4;

const HYPOTHESIS_TEXT: Readonly<
  Record<HypothesisInput['rule'], (area: string) => { hypothesis: string; message: string }>
> = {
  persistent_lapse: (area) => ({
    hypothesis: `Sigues fallando ${area} y repetirlo igual no está funcionando.`,
    message:
      'Cambia la forma de estudiar este punto en lugar de repetirlo igual. Revisa la explicación y divide lo que hoy llevas junto.',
  }),
  list_card: (area) => ({
    hypothesis: `Las tarjetas de ${area} guardan varios datos juntos y por eso se escapan.`,
    message:
      'Separa la lista en tarjetas más pequeñas, una idea por tarjeta. Así el repaso te dice exactamente qué dato se te olvida.',
  }),
  interference: (area) => ({
    hypothesis: `En ${area} estás confundiendo conceptos parecidos entre sí.`,
    message:
      'Compáralos lado a lado y fíjate en el dato que los distingue. Una tarjeta de contraste te ayuda a separarlos.',
  }),
  high_confidence_error: (area) => ({
    hypothesis: `En ${area} respondes con seguridad y fallas, lo que sugiere una idea equivocada firme.`,
    message:
      'Antes de responder, nombra el dato del caso que respalda tu elección. Revisa con calma la explicación de esos casos.',
  }),
  misreading: (area) => ({
    hypothesis: `En ${area} fallas más por cómo lees el enunciado que por lo que sabes.`,
    message:
      'Subraya las negaciones y la pregunta final antes de ver las opciones. Activa el resaltado para practicarlo.',
  }),
  fatigue: (area) => ({
    hypothesis: `En ${area} tus fallos aumentan hacia el final de la sesión.`,
    message:
      'Haz una pausa corta cuando notes errores seguidos. Retoma el tema cuando tengas la cabeza más fresca.',
  }),
  rushing: (area) => ({
    hypothesis: `En ${area} contestas muy rápido y por eso fallas.`,
    message:
      'Reserva unos segundos para descartar opciones antes de elegir. Practica el tema en el simulador a ritmo de examen.',
  }),
  foundation_gap: (area) => ({
    hypothesis: `En ${area} falta una base que sostenga los temas que vienen después.`,
    message:
      'Refuerza primero los conceptos básicos del tema. Después vuelve a las preguntas que fallaste.',
  }),
};

export function mockHypothesis(input: HypothesisInput): HypothesisOutput {
  // Con menos de dos pruebas la evidencia no alcanza y lo correcto es no opinar (8.2)
  if (input.evidence.length < 2) {
    return {
      hypothesis: null,
      evidence: [],
      confidence: 'low',
      actions: [],
      studentMessage: null,
    };
  }
  const text = HYPOTHESIS_TEXT[input.rule](input.area);
  return {
    hypothesis: text.hypothesis,
    evidence: input.evidence.slice(0, EVIDENCE_REFS).map((item) => item.ref),
    confidence: input.recentFindings >= MEDIUM_CONFIDENCE_FINDINGS ? 'medium' : 'low',
    actions: input.allowedActions.slice(0, 2),
    studentMessage: text.message,
  };
}

export function mockWeeklyReport(input: WeeklyReportInput): WeeklyReportOutput {
  return {
    summary: `Esta semana respondiste ${input.answers} preguntas. Estas son las prioridades para la que sigue.`,
    priorities: input.priorities.map((line) => ({ ref: line.ref, text: line.detail })),
    habit: input.habit?.detail ?? null,
    challenge: input.challenge?.detail ?? null,
  };
}

export function mockFlashcards(input: FlashcardsInput): FlashcardsOutput {
  const cards = simulateCards({ index: 0, title: input.title, text: input.text });
  return {
    cards: cards.map((card) => ({
      kind: card.kind,
      front: card.front,
      back: card.back,
      quote: card.quote,
      ...(card.controversy
        ? {
            controversy: {
              reason: card.controversy.reason,
              sources: card.controversy.sources.map((entry) => ({
                key: entry.key,
                locator: entry.locator ?? null,
              })),
            },
          }
        : {}),
    })),
  };
}

export function mockBiasTip(input: BiasTipInput): BiasTipOutput {
  return {
    tip: `${input.baseTip} Practícalo con las preguntas donde te pasó.`,
    exampleRefs: input.examples.map((example) => example.ref),
  };
}

const TRANSFORM_NOTE: Readonly<Record<RestructureInput['transform'], string>> = {
  to_except: 'Se cambió a una pregunta de excepción.',
  change_anchor: 'Se pidió considerar el dato que cambia el enfoque del caso.',
  next_step: 'Se movió la pregunta al siguiente paso del manejo.',
};

/** La primera frase de la explicación que sirve de cita, o la explicación recortada */
function quoteFrom(explanation: string): string {
  const sentences = explanation
    .split(/(?<=[.!?;])\s+/)
    .map((sentence) => sentence.trim())
    .filter(
      (sentence) =>
        sentence.length >= MIN_QUOTE_CHARS && wordsOf(sentence).length >= MIN_QUOTE_WORDS,
    );
  return (sentences[0] ?? explanation).slice(0, 1_000);
}

export function mockRestructure(input: RestructureInput): RestructureOutput {
  const stemByTransform: Record<RestructureInput['transform'], string> = {
    to_except: `${input.stem} Elige la opción que no corresponde.`,
    change_anchor: `${input.stem} Considera ahora el dato que cambia el enfoque del caso.`,
    next_step: `${input.stem} ¿Cuál es el siguiente paso en el manejo?`,
  };
  // Para la excepción la clave pasa a la primera opción que no era la clave. Las demás no cambian
  const newKey =
    input.transform === 'to_except' ? input.options.findIndex((option) => !option.isKey) : -1;
  return {
    stem: stemByTransform[input.transform],
    options: input.options.map((option, index) => ({
      label: option.label,
      text: option.text,
      isKey: input.transform === 'to_except' ? index === newKey : option.isKey,
    })),
    explanation: input.explanation,
    rationale: `${TRANSFORM_NOTE[input.transform]} Propuesta de ejemplo del modo simulado. Un médico debe revisarla.`,
    quote: quoteFrom(input.explanation),
  };
}

/** La salida fija de un motor para una entrada */
export function mockOutput<E extends AiEngine>(
  engine: E,
  input: EngineInputs[E],
): EngineOutputs[E] {
  const output = (() => {
    switch (engine) {
      case 'forgetting':
        return mockHypothesis(input as HypothesisInput);
      case 'weekly_report':
        return mockWeeklyReport(input as WeeklyReportInput);
      case 'flashcards':
        return mockFlashcards(input as FlashcardsInput);
      case 'bias_tips':
        return mockBiasTip(input as BiasTipInput);
      case 'restructure':
        return mockRestructure(input as RestructureInput);
      default:
        throw new Error(`Motor desconocido ${String(engine)}`);
    }
  })();
  return output as EngineOutputs[E];
}
