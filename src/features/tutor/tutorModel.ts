// Hipótesis del tutor sin IA (8.2, 7.9). Pasa el contexto de cada error por las reglas de olvido,
// agrupa los hallazgos del mismo tipo y la misma área en patrones y los convierte en hipótesis con
// su evidencia y las acciones que la app sabe ejecutar. Un patrón se confirma con 5 hallazgos en
// 14 días. Antes solo se está formando y se muestra calibrando con cuánto falta. La confianza es
// baja o media y nunca alta. La IA de la Fase D llenará el mismo lugar con su propio texto. Sin
// React ni Dexie.
import type { Thresholds } from '@/config/thresholds';
import type { TutorActionSchema } from '@/data/schemas/common';
import {
  evaluateError,
  groupPatterns,
  type ErrorContext,
  type Finding,
  type ForgettingRule,
} from '@/engines/forgetting';
import type { z } from 'zod';

export type TutorAction = z.infer<typeof TutorActionSchema>;

/** Acciones que la app ejecuta para cada regla, de la lista cerrada de 8.2 */
export const RULE_ACTIONS: Readonly<Record<ForgettingRule, readonly TutorAction[]>> = {
  persistent_lapse: ['review_explanation', 'split_card'],
  list_card: ['split_card'],
  interference: ['create_contrast_card'],
  high_confidence_error: ['review_explanation'],
  misreading: ['enable_highlight', 'subtopic_simulator'],
  fatigue: ['suggest_break'],
  rushing: ['subtopic_simulator'],
  foundation_gap: ['subtopic_simulator'],
  // Es normal y no se alarma al alumno, así que nunca forma un patrón
  expected_forgetting: [],
};

export interface HypothesisItem {
  eventId: string;
  itemId: string;
  kind: 'question' | 'card';
  at: string;
  /** Con interferencia, la pregunta con la que se confundió */
  confusedWithItemId: string | null;
}

export interface Hypothesis {
  /** Estable por regla y área, para guardar la respuesta del alumno */
  key: string;
  rule: ForgettingRule;
  area: string;
  status: 'forming' | 'confirmed';
  /** Hallazgos dentro de la ventana de 14 días */
  recentFindings: number;
  /** Hallazgos que faltan para confirmarlo. 0 si ya está confirmado */
  findingsNeeded: number;
  /** Nunca alta (8.2) */
  confidence: 'low' | 'medium';
  actions: readonly TutorAction[];
  /** Los errores que lo forman, del más reciente al más antiguo */
  items: readonly HypothesisItem[];
  /** Casos en que la causa que dijo el alumno no coincide con las señales */
  causeMismatches: number;
  /** Casos en que sí reportó una causa */
  causesReported: number;
}

export const hypothesisKey = (rule: ForgettingRule, area: string) => `${rule}|${area}`;

/** Con el doble de hallazgos que pide el patrón la confianza sube de baja a media */
const MEDIUM_CONFIDENCE_FACTOR = 2;

const DAY_MS = 24 * 60 * 60 * 1000;

export function buildHypotheses(input: {
  contexts: readonly ErrorContext[];
  now: Date;
  thresholds: Thresholds['forgetting'];
}): Hypothesis[] {
  const { thresholds } = input;
  const contextByEvent = new Map(input.contexts.map((context) => [context.eventId, context]));
  const findings: Finding[] = input.contexts.flatMap((context) =>
    evaluateError(context, thresholds),
  );
  const windowStart = input.now.getTime() - thresholds.patternWindowDays * DAY_MS;
  const inWindow = (finding: Finding) => {
    const time = Date.parse(finding.at);
    return time >= windowStart && time <= input.now.getTime();
  };

  return groupPatterns({ findings, now: input.now, thresholds }).map((pattern): Hypothesis => {
    const mine = findings.filter(
      (finding) =>
        finding.rule === pattern.rule && finding.area === pattern.area && inWindow(finding),
    );
    const items = mine
      .flatMap((finding) => {
        const context = contextByEvent.get(finding.evidence.eventIds[0] ?? '');
        return context
          ? [
              {
                eventId: context.eventId,
                itemId: context.itemId,
                kind: context.kind,
                at: context.at,
                confusedWithItemId: context.confusedWithItemId,
              },
            ]
          : [];
      })
      .sort((a, b) => b.at.localeCompare(a.at));
    return {
      key: hypothesisKey(pattern.rule, pattern.area),
      rule: pattern.rule,
      area: pattern.area,
      status: pattern.status,
      recentFindings: pattern.recentFindings,
      findingsNeeded: pattern.findingsNeeded,
      confidence:
        pattern.recentFindings >= thresholds.findingsForPattern * MEDIUM_CONFIDENCE_FACTOR
          ? 'medium'
          : 'low',
      actions: RULE_ACTIONS[pattern.rule],
      items,
      causesReported: mine.filter((finding) => finding.causeMatchesSignals !== null).length,
      causeMismatches: mine.filter((finding) => finding.causeMatchesSignals === false).length,
    };
  });
}

/** Pares de preguntas que el alumno confunde, para la tarjeta de contraste. Del más reciente al más antiguo */
export function confusedPairs(hypothesis: Pick<Hypothesis, 'items'>, limit = 3) {
  const seen = new Set<string>();
  const pairs: { failedId: string; chosenId: string }[] = [];
  for (const item of hypothesis.items) {
    if (!item.confusedWithItemId) continue;
    const key = [item.itemId, item.confusedWithItemId].sort().join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    pairs.push({ failedId: item.itemId, chosenId: item.confusedWithItemId });
    if (pairs.length === limit) break;
  }
  return pairs;
}

/**
 * Las hipótesis que se abren de entrada y las demás. Van primero las de más hallazgos, pero de
 * reglas distintas mientras las haya, para que no sean tres del mismo tipo. Con mucha actividad
 * salen decenas y no se pueden leer todas. El orden de cada grupo es el original
 */
export function pickTop<T extends Pick<Hypothesis, 'rule'>>(
  sorted: readonly T[],
  count: number,
): { top: T[]; rest: T[] } {
  const chosen = new Set<T>();
  const rules = new Set<string>();
  for (const hypothesis of sorted) {
    if (chosen.size >= count) break;
    if (rules.has(hypothesis.rule)) continue;
    rules.add(hypothesis.rule);
    chosen.add(hypothesis);
  }
  for (const hypothesis of sorted) {
    if (chosen.size >= count) break;
    chosen.add(hypothesis);
  }
  return {
    top: sorted.filter((hypothesis) => chosen.has(hypothesis)),
    rest: sorted.filter((hypothesis) => !chosen.has(hypothesis)),
  };
}
