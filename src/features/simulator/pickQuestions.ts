// Elige las preguntas de una sesión (7.2). Con la misma semilla sale siempre la misma lista, que es lo
// que necesita un duelo, y los casos seriados quedan juntos y en su orden aunque el azar los separe.
import type { Question } from '@/data/schemas/bank';
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
