/**
 * Reglas de olvido en cada error (7.9).
 *
 * Qué hace. Pasa cada error por 9 reglas que no cuestan nada. Cada regla que se cumple crea un
 * hallazgo con su evidencia (IDs de eventos y de ítems) y una acción sugerida. Agrupa hallazgos del
 * mismo tipo y área en patrones, y dice cuándo un patrón se confirma y puede llamar al LLM (8.2).
 * Entradas. El contexto de un error, ya calculado por los otros motores (lapsos y retrievability
 * de FSRS, mala lectura de structure, adivinanza rápida y fatiga de behavior, dominio del tema base
 * de topics) y la causa que reportó el alumno.
 * Salidas. Hallazgos con regla, área, evidencia, acción, gravedad y si la causa reportada
 * coincide con las señales. Patrones con su estado.
 * Método. Las reglas de la tabla de 7.9. La causa reportada se compara con las reglas que se
 * cumplieron. Si no coinciden, el hallazgo lo dice.
 * Umbrales. 3 lapsos para olvido persistente, 4 elementos para tarjeta de lista, patrón con 5
 * hallazgos en 14 días y como máximo una llamada al LLM por patrón cada 7 días (J). Olvido esperado
 * con retrievability predicha menor a 0.8 tras un intervalo de 21 días o más (J).
 */
import type { Thresholds } from '@/config/thresholds';
import type { z } from 'zod';
import type { ErrorCauseSchema, ForgettingRuleSchema } from '@/data/schemas/common';

export type ForgettingRule = z.infer<typeof ForgettingRuleSchema>;
export type ErrorCause = z.infer<typeof ErrorCauseSchema>;

export type ForgettingAction =
  | 'review_explanation'
  | 'split_card'
  | 'create_contrast_card'
  | 'repeat_soon'
  | 'enable_highlight'
  | 'suggest_break'
  | 'slow_down'
  | 'review_base_topic'
  | 'none';

export interface ErrorContext {
  /** Evento del error, por ejemplo question_answered o card_reviewed */
  eventId: string;
  /** Pregunta o tarjeta */
  itemId: string;
  kind: 'question' | 'card';
  /** Momento del error, ISO UTC */
  at: string;
  subtopic: string;
  /** Lapsos de la tarjeta después del error. null en preguntas que no son tarjeta */
  lapses: number | null;
  /** Elementos que enumera la respuesta de la tarjeta, si es tarjeta */
  answerListItems: number | null;
  /** Ítem parecido del mismo subtema cuya respuesta eligió, o con el que se confunde seguido */
  confusedWithItemId: string | null;
  confidence: 'guessed' | 'unsure' | 'sure' | 'dont_know' | null;
  /** Hallazgo de mala lectura del motor structure */
  probableMisread: boolean;
  /** Error en el último tercio de una sesión larga con caída de exactitud */
  fatigueContext: boolean;
  rapidGuess: boolean;
  /** El tema base de su subtema tiene dominio bajo (la taxonomía trae la relación) */
  baseTopicWeak: boolean;
  /** Retrievability que FSRS predijo antes del lapso y días desde el último repaso */
  predictedRetrievability: number | null;
  daysSinceLastReview: number | null;
  reportedCause: ErrorCause | null;
}

export interface Finding {
  rule: ForgettingRule;
  area: string;
  evidence: { eventIds: string[]; itemIds: string[] };
  action: ForgettingAction;
  /** El olvido esperado es informativo y no alarma al alumno */
  severity: 'info' | 'notice';
  causeMatchesSignals: boolean | null;
  at: string;
}

/** Reglas que esperaríamos ver con cada causa reportada (13.3) */
const CAUSE_RULES: Record<ErrorCause, readonly ForgettingRule[] | null> = {
  not_studied: ['foundation_gap'],
  forgot: ['persistent_lapse', 'expected_forgetting'],
  confused: ['interference'],
  misread: ['misreading'],
  missed_detail: ['misreading', 'rushing'],
  rushed_or_tired: ['rushing', 'fatigue'],
  changed_answer: null,
  other: null,
};

export function evaluateError(
  context: ErrorContext,
  thresholds: Thresholds['forgetting'],
): Finding[] {
  const triggered: {
    rule: ForgettingRule;
    action: ForgettingAction;
    area: string;
    extraItems?: string[];
  }[] = [];
  const area = context.subtopic;
  if (
    context.kind === 'card' &&
    context.lapses !== null &&
    context.lapses >= thresholds.lapsesForForgettingRules
  ) {
    triggered.push({ rule: 'persistent_lapse', action: 'review_explanation', area });
  }
  if (context.answerListItems !== null && context.answerListItems >= thresholds.listCardItems) {
    triggered.push({ rule: 'list_card', action: 'split_card', area });
  }
  if (context.confusedWithItemId !== null) {
    triggered.push({
      rule: 'interference',
      action: 'create_contrast_card',
      area,
      extraItems: [context.confusedWithItemId],
    });
  }
  if (context.confidence === 'sure')
    triggered.push({ rule: 'high_confidence_error', action: 'repeat_soon', area });
  if (context.probableMisread)
    triggered.push({ rule: 'misreading', action: 'enable_highlight', area });
  if (context.fatigueContext) triggered.push({ rule: 'fatigue', action: 'suggest_break', area });
  if (context.rapidGuess) triggered.push({ rule: 'rushing', action: 'slow_down', area });
  if (context.baseTopicWeak)
    triggered.push({ rule: 'foundation_gap', action: 'review_base_topic', area });
  if (
    context.kind === 'card' &&
    context.predictedRetrievability !== null &&
    context.daysSinceLastReview !== null &&
    context.predictedRetrievability < 0.8 &&
    context.daysSinceLastReview >= 21
  ) {
    triggered.push({ rule: 'expected_forgetting', action: 'none', area });
  }

  const expected = context.reportedCause === null ? null : CAUSE_RULES[context.reportedCause];
  const rules = new Set(triggered.map((entry) => entry.rule));
  const causeMatchesSignals = expected === null ? null : expected.some((rule) => rules.has(rule));
  return triggered.map((entry) => ({
    rule: entry.rule,
    area: entry.area,
    evidence: {
      eventIds: [context.eventId],
      itemIds: [context.itemId, ...(entry.extraItems ?? [])],
    },
    action: entry.action,
    severity: entry.rule === 'expected_forgetting' ? 'info' : 'notice',
    causeMatchesSignals,
    at: context.at,
  }));
}

export interface PatternSummary {
  rule: ForgettingRule;
  area: string;
  /** Hallazgos dentro de la ventana de 14 días */
  recentFindings: number;
  status: 'forming' | 'confirmed';
  /** Hallazgos que faltan para confirmarlo */
  findingsNeeded: number;
  evidence: { eventIds: string[]; itemIds: string[] };
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Agrupa hallazgos por regla y área. El olvido esperado no forma patrones porque es normal */
export function groupPatterns(input: {
  findings: readonly Finding[];
  now: Date;
  thresholds: Thresholds['forgetting'];
}): PatternSummary[] {
  const windowStart = input.now.getTime() - input.thresholds.patternWindowDays * DAY_MS;
  const groups = new Map<string, Finding[]>();
  for (const finding of input.findings) {
    if (finding.rule === 'expected_forgetting') continue;
    const time = new Date(finding.at).getTime();
    if (time < windowStart || time > input.now.getTime()) continue;
    const key = `${finding.rule}|${finding.area}`;
    const list = groups.get(key) ?? [];
    list.push(finding);
    groups.set(key, list);
  }
  return [...groups.values()]
    .map((list): PatternSummary => {
      const first = list[0] as Finding;
      const needed = Math.max(0, input.thresholds.findingsForPattern - list.length);
      return {
        rule: first.rule,
        area: first.area,
        recentFindings: list.length,
        status: needed === 0 ? 'confirmed' : 'forming',
        findingsNeeded: needed,
        evidence: {
          eventIds: [...new Set(list.flatMap((finding) => finding.evidence.eventIds))],
          itemIds: [...new Set(list.flatMap((finding) => finding.evidence.itemIds))],
        },
      };
    })
    .sort((a, b) => b.recentFindings - a.recentFindings || a.rule.localeCompare(b.rule));
}

/** Un patrón confirmado llama al LLM como máximo una vez cada 7 días (8.2) */
export function canCallLlm(
  pattern: Pick<PatternSummary, 'status'>,
  lastCallAt: string | null,
  now: Date,
): boolean {
  if (pattern.status !== 'confirmed') return false;
  return lastCallAt === null || now.getTime() - new Date(lastCallAt).getTime() >= 7 * DAY_MS;
}

/** Elementos que enumera la respuesta de una tarjeta, para la regla de tarjeta de lista */
export function countListItems(answer: string): number {
  const text = answer.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ' ');
  const lines = text
    .split(/\n|•|·|;/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length > 1) return lines.length;
  // Una sola línea con comas, por ejemplo fiebre, tos, disnea y dolor
  return text
    .split(/,|\by\b|\be\b/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0).length;
}
