// Selección de qué repasar (D-072). Modo, mazos y subespecialidades, recordada en este dispositivo.
export type ReviewMode = 'today' | 'due' | 'new';

export interface ReviewSelection {
  mode: ReviewMode;
  decks: Set<string>;
  topics: Set<string>;
  /** Tarjetas cuya nota no trae subespecialidad. Entran con su mazo si está marcado */
  includeUntagged: boolean;
}

const KEY = 'enarm.review-selection.v1';

export function loadSelection(
  deckIds: readonly string[],
  allTopics: readonly string[],
): ReviewSelection {
  const fallback: ReviewSelection = {
    mode: 'today',
    decks: new Set(deckIds),
    topics: new Set(allTopics),
    includeUntagged: true,
  };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return fallback;
    const saved = JSON.parse(raw) as Partial<{
      mode: ReviewMode;
      decks: string[];
      topics: string[];
      includeUntagged: boolean;
    }>;
    const decks = (saved.decks ?? []).filter((id) => deckIds.includes(id));
    return {
      mode: saved.mode === 'due' || saved.mode === 'new' ? saved.mode : 'today',
      // Si los mazos guardados ya no se siguen, se usan todos
      decks: new Set(decks.length > 0 ? decks : deckIds),
      topics: new Set((saved.topics ?? allTopics).filter((key) => allTopics.includes(key))),
      includeUntagged: saved.includeUntagged !== false,
    };
  } catch {
    return fallback;
  }
}

export function saveSelection(selection: ReviewSelection): void {
  try {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        mode: selection.mode,
        decks: [...selection.decks],
        topics: [...selection.topics],
        includeUntagged: selection.includeUntagged,
      }),
    );
  } catch {
    // Sin almacenamiento se usa la selección por defecto la próxima vez
  }
}

/** Si una tarjeta entra con la selección */
export function cardMatches(
  card: { deckId: string },
  topic: string | null,
  selection: ReviewSelection,
): boolean {
  if (!selection.decks.has(card.deckId)) return false;
  return topic === null ? selection.includeUntagged : selection.topics.has(topic);
}
