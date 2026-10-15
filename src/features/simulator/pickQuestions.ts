// Elige las preguntas de una sesión (7.2). Con la misma semilla sale siempre la misma lista, que es lo
// que necesita un duelo, y los casos seriados quedan juntos y en su orden aunque el azar los separe.
// La práctica de Inglés médico no elige preguntas sino textos completos (B13, 2.2), con pickEnglishCases.
import type { Question } from '@/data/schemas/bank';
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
