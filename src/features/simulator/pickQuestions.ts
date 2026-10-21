// Elige las preguntas de una sesión (7.2). Con la misma semilla sale siempre la misma lista, que es lo
// que necesita un duelo, y los casos seriados quedan juntos y en su orden aunque el azar los separe.
// La práctica de Inglés médico no elige preguntas sino textos completos (B13, 2.2), con pickEnglishCases.
import { isMeasured, poolDifficulty } from '@/data/bank/calibration';
import type { PoolQuestion } from '@/data/bank/questionSource';
import type { Question } from '@/data/schemas/bank';
import { pickAdaptiveSession, type AdaptiveOptions } from '@/engines/adaptive';
import { pickCaseUnits, type PickedCases } from '@/engines/caseUnits';
import { createRng } from '@/engines/random';

export function pickQuestions<T extends Pick<Question, 'id' | 'caseId' | 'caseOrder'>>(
  questions: readonly T[],
  seed: string,
  count: number,
): T[] {
  const picked = createRng(seed).shuffle(questions).slice(0, Math.max(0, count));
  const placed = new Set<string>();
  const ordered: T[] = [];
  for (const question of picked) {
    if (placed.has(question.id)) continue;
    // Un caso seriado entra completo, con sus preguntas en orden, donde salió la primera
    const group =
      question.caseId === null
        ? [question]
        : picked
            .filter((other) => other.caseId === question.caseId)
            .sort((a, b) => (a.caseOrder ?? 0) - (b.caseOrder ?? 0));
    for (const member of group) {
      placed.add(member.id);
      ordered.push(member);
    }
  }
  return ordered;
}

/**
 * Elige las preguntas de una práctica adaptativa (B14, 4.5). Cerca de la habilidad del alumno, con una
 * parte para las que todavía calibran, y los casos seriados completos. Usa la misma dificultad efectiva
 * que los filtros de Simular. Con la misma semilla sale siempre la misma lista
 */
export function pickAdaptiveQuestions<
  T extends Pick<
    PoolQuestion,
    'id' | 'caseId' | 'caseOrder' | 'physicianDifficulty' | 'effectiveDifficulty'
  >,
>(questions: readonly T[], options: AdaptiveOptions): T[] {
  const byId = new Map(questions.map((question) => [question.id, question]));
  const items = questions.map((question) => {
    const difficulty = poolDifficulty(question);
    return {
      id: question.id,
      caseId: question.caseId,
      caseOrder: question.caseOrder,
      difficulty: difficulty.logit,
      measured: isMeasured(difficulty.source),
    };
  });
  return pickAdaptiveSession(items, options).flatMap((item) => byId.get(item.id) ?? []);
}

/**
 * Elige hasta cases textos de lectura completos, con todas sus preguntas y en orden. A diferencia de
 * pickQuestions, que elige preguntas y luego junta las de un mismo caso, aquí nunca queda un texto a medias.
 * maxItems es lo que le queda hoy a Gratis, o null sin tope, y un texto que no cabe se salta
 */
export function pickEnglishCases<T extends Pick<Question, 'id' | 'caseId' | 'caseOrder'>>(
  questions: readonly T[],
  seed: string,
  cases: number,
  maxItems: number | null,
): PickedCases<T> {
  return pickCaseUnits(questions, seed, cases, maxItems === null ? {} : { maxItems });
}
