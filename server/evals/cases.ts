// Casos dorados de los motores de IA (8.7). De 10 a 20 por motor, armados con los textos sintéticos
// de data.ts. Cada caso trae la entrada y qué se espera. En los casos de respuesta, la salida tiene
// que cumplir el esquema y las guardas de anclaje. En los casos sin respuesta no hay con qué
// sostener algo, y lo correcto es no producirlo, ya sea con una salida vacía o rechazándola.
import {
  HYPOTHESIS_RULES,
  type AiEngine,
  type BiasTipInput,
  type EngineInputs,
  type FlashcardsInput,
  type HypothesisInput,
  type RestructureInput,
  type WeeklyReportInput,
} from '../../src/engines/aiContracts.ts';
import { EVAL_BIASES, EVAL_ITEMS, type EvalItem } from './data.ts';

export type Expectation = 'answer' | 'no_answer';

export interface GoldenCase<E extends AiEngine = AiEngine> {
  id: string;
  engine: E;
  description: string;
  input: EngineInputs[E];
  expect: Expectation;
}

type CaseOf<E extends AiEngine> = GoldenCase<E>;

/** Acciones que la app ejecuta para cada regla, la misma tabla del tutor */
const RULE_ACTIONS: Record<HypothesisInput['rule'], HypothesisInput['allowedActions']> = {
  persistent_lapse: ['review_explanation', 'split_card'],
  list_card: ['split_card'],
  interference: ['create_contrast_card'],
  high_confidence_error: ['review_explanation'],
  misreading: ['enable_highlight', 'subtopic_simulator'],
  fatigue: ['suggest_break'],
  rushing: ['subtopic_simulator'],
  foundation_gap: ['subtopic_simulator'],
};

/** n elementos consecutivos desde un índice, dando la vuelta */
const take = <T>(list: readonly T[], start: number, count: number): T[] =>
  Array.from({ length: count }, (_, offset) => list[(start + offset) % list.length] as T);

const firstSentence = (text: string) => text.split(/(?<=[.!?])\s+/)[0] ?? text;

function forgettingCases(): CaseOf<'forgetting'>[] {
  const cases: CaseOf<'forgetting'>[] = [];
  HYPOTHESIS_RULES.forEach((rule, index) => {
    const items = take(EVAL_ITEMS, index, 3);
    const input: HypothesisInput = {
      rule,
      area: items[0]?.area ?? 'Tema',
      recentFindings: 5 + index,
      evidence: items.map((item) => ({
        ref: `ev-${item.id}`,
        kind: 'question',
        text: item.stem,
      })),
      causesReported: index % 3,
      causeMismatches: index % 2,
      allowedActions: [...RULE_ACTIONS[rule]],
    };
    cases.push({
      id: `forgetting-${rule}`,
      engine: 'forgetting',
      description: `Patrón de ${rule} con 3 preguntas del banco`,
      input,
      expect: 'answer',
    });
  });
  // Dos con tarjetas como evidencia y varios hallazgos
  for (const [offset, rule] of (['persistent_lapse', 'list_card'] as const).entries()) {
    const items = take(EVAL_ITEMS, 8 + offset, 5);
    cases.push({
      id: `forgetting-tarjetas-${rule}`,
      engine: 'forgetting',
      description: `Patrón de ${rule} con 5 tarjetas`,
      input: {
        rule,
        area: items[0]?.area ?? 'Tema',
        recentFindings: 12,
        evidence: items.map((item) => ({
          ref: `ev-${item.id}`,
          kind: 'card' as const,
          text: firstSentence(item.explanation),
        })),
        causesReported: 4,
        causeMismatches: 1,
        allowedActions: [...RULE_ACTIONS[rule]],
      },
      expect: 'answer',
    });
  }
  // Sin evidencia suficiente lo correcto es no opinar
  for (const [offset, rule] of (['fatigue', 'rushing'] as const).entries()) {
    const item = EVAL_ITEMS[offset] as EvalItem;
    cases.push({
      id: `forgetting-sin-evidencia-${rule}`,
      engine: 'forgetting',
      description: 'Una sola prueba, la evidencia no alcanza',
      input: {
        rule,
        area: item.area,
        recentFindings: 5,
        evidence: [{ ref: `ev-${item.id}`, kind: 'question', text: item.stem }],
        causesReported: 0,
        causeMismatches: 0,
        allowedActions: [...RULE_ACTIONS[rule]],
      },
      expect: 'no_answer',
    });
  }
  return cases;
}

function weeklyReportCases(): CaseOf<'weekly_report'>[] {
  const line = (item: EvalItem, ref: string) => ({
    ref,
    title: item.area,
    detail: `Practica ${item.area.toLowerCase()} con preguntas del simulador.`,
  });
  const variants: { habit: boolean; challenge: boolean; priorities: number; answers: number }[] = [
    { habit: true, challenge: true, priorities: 3, answers: 120 },
    { habit: true, challenge: false, priorities: 3, answers: 45 },
    { habit: false, challenge: true, priorities: 2, answers: 300 },
    { habit: false, challenge: false, priorities: 1, answers: 31 },
    { habit: true, challenge: true, priorities: 2, answers: 80 },
    { habit: true, challenge: true, priorities: 1, answers: 500 },
    { habit: false, challenge: false, priorities: 3, answers: 60 },
    { habit: true, challenge: false, priorities: 1, answers: 150 },
    { habit: false, challenge: true, priorities: 3, answers: 220 },
    { habit: true, challenge: true, priorities: 3, answers: 0 },
  ];
  return variants.map((variant, index): CaseOf<'weekly_report'> => {
    const items = take(EVAL_ITEMS, index, 5);
    const input: WeeklyReportInput = {
      answers: variant.answers,
      priorities: items
        .slice(0, variant.priorities)
        .map((item, position) => line(item, `prioridad-${position + 1}`)),
      habit: variant.habit
        ? {
            ref: 'habito',
            title: 'Pausas cortas',
            detail: 'Haz una pausa de cinco minutos después de cada bloque de preguntas.',
          }
        : null,
      challenge: variant.challenge
        ? {
            ref: 'reto',
            title: items[4]?.area ?? 'Reto',
            detail: `Resuelve diez preguntas de ${(items[4]?.area ?? 'este tema').toLowerCase()}.`,
          }
        : null,
    };
    return {
      id: `weekly_report-${index + 1}`,
      engine: 'weekly_report',
      description: `${variant.priorities} prioridades, hábito ${variant.habit ? 'sí' : 'no'}, reto ${
        variant.challenge ? 'sí' : 'no'
      }`,
      input,
      expect: 'answer',
    };
  });
}

function flashcardsCases(): CaseOf<'flashcards'>[] {
  const cases = EVAL_ITEMS.map((item): CaseOf<'flashcards'> => ({
    id: `flashcards-${item.id}`,
    engine: 'flashcards',
    description: `Sección sobre ${item.area}`,
    input: { title: item.area, text: item.explanation } satisfies FlashcardsInput,
    expect: 'answer',
  }));
  const empty = (id: string, text: string): CaseOf<'flashcards'> => ({
    id,
    engine: 'flashcards',
    description: 'Texto sin nada que estudiar',
    input: { title: null, text },
    expect: 'no_answer',
  });
  return [
    ...cases,
    empty('flashcards-sin-contenido', 'Sin contenido que estudiar.'),
    empty('flashcards-saludo', 'Hola. Gracias. Hasta luego.'),
  ];
}

function biasTipCases(): CaseOf<'bias_tips'>[] {
  const build = (
    bias: (typeof EVAL_BIASES)[number],
    start: number,
    count: number,
    suffix = '',
  ): CaseOf<'bias_tips'> => {
    const examples = take(EVAL_ITEMS, start, count);
    const input: BiasTipInput = {
      biasKey: bias.key,
      biasLabel: bias.label,
      baseTip: bias.baseTip,
      examples: examples.map((item) => ({ ref: `q-${item.id}`, text: item.stem })),
    };
    return {
      id: `bias_tips-${bias.key}${suffix}`,
      engine: 'bias_tips',
      description: `${bias.label} con ${examples.length} ejemplos`,
      input,
      expect: 'answer',
    };
  };
  const cases = EVAL_BIASES.map((bias, index) => build(bias, index * 2, index % 2 === 0 ? 2 : 3));
  // Las mismas trampas con otros ejemplos
  const [anchoring, confirmation] = [EVAL_BIASES[0], EVAL_BIASES[3]];
  if (anchoring) cases.push(build(anchoring, 7, 3, '-otros'));
  if (confirmation) cases.push(build(confirmation, 9, 2, '-otros'));
  return cases;
}

function restructureCases(): CaseOf<'restructure'>[] {
  const transforms = ['to_except', 'change_anchor', 'next_step'] as const;
  const items = EVAL_ITEMS.filter((item) =>
    ['neumonia', 'diabetes', 'preeclampsia', 'infarto'].includes(item.id),
  );
  const build = (item: EvalItem, transform: RestructureInput['transform']): RestructureInput => ({
    questionRef: `q-${item.id}`,
    transform,
    stem: item.stem,
    options: item.options.map((option, index) => ({
      label: option.label,
      text: option.text,
      isKey: index === item.key,
    })),
    explanation: item.explanation,
  });
  const cases = items.flatMap((item) =>
    transforms.map((transform): CaseOf<'restructure'> => ({
      id: `restructure-${item.id}-${transform}`,
      engine: 'restructure',
      description: `${item.area}, ${transform}`,
      input: build(item, transform),
      expect: 'answer',
    })),
  );
  // Sin una explicación de la que sacar una frase, la pregunta nueva no puede anclarse
  const bare = (transform: RestructureInput['transform']): CaseOf<'restructure'> => ({
    id: `restructure-sin-explicacion-${transform}`,
    engine: 'restructure',
    description: 'Pregunta sin explicación que citar',
    input: { ...build(items[0] as EvalItem, transform), explanation: 'Corta.' },
    expect: 'no_answer',
  });
  return [...cases, bare('to_except'), bare('next_step')];
}

export function buildCases(): GoldenCase[] {
  return [
    ...forgettingCases(),
    ...weeklyReportCases(),
    ...flashcardsCases(),
    ...biasTipCases(),
    ...restructureCases(),
  ];
}
