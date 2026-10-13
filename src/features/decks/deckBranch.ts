// Rama troncal de un mazo precargado (D-066). Sus temas salen de topicPaths.ts (B4)
import type { DemoDeckFile } from '@/data/schemas/content';

/** Rama troncal de un mazo. La más común entre sus notas, o la que dice su clave */
const DECK_BRANCH: Record<string, string> = {
  'paco-mi': 'internal_medicine',
  'paco-gyo': 'obstetrics_gynecology',
  'paco-urgencias': 'emergency_medicine',
};

export function deckBranch(file: DemoDeckFile): string {
  const known = DECK_BRANCH[file.key];
  if (known) return known;
  const counts = new Map<string, number>();
  for (const note of file.notes)
    if (note.branch) counts.set(note.branch, (counts.get(note.branch) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'internal_medicine';
}
