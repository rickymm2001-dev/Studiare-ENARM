// Exportar mazos propios a CSV (D-093). Solo lo que el alumno creó o importó, con sus submazos.
// Lo precargado no se exporta porque no es suyo. El archivo lleva un identificador por nota, así
// que volver a importarlo no duplica nada.
import { deckPath, descendantIds } from '../../engines/deckTree';
import { buildCsv } from '../import/exportCsv';
import type { DataApi } from '../context';
import { isEditableDeck } from '../schemas/decks';
import type { User } from '../schemas/people';

export interface DeckExport {
  fileName: string;
  content: string;
  notes: number;
}

/** deckId es el mazo con sus submazos, o undefined para todos los mazos propios */
export async function exportDecksCsv(
  api: Pick<DataApi, 'repos'>,
  user: Pick<User, 'id'>,
  deckId: string | undefined,
  now: Date = new Date(),
): Promise<DeckExport> {
  const decks = await api.repos.decks.list();
  const own = decks.filter((deck) => isEditableDeck(deck, user.id));
  const chosen = new Set(
    deckId === undefined
      ? own.map((deck) => deck.id)
      : [...descendantIds(decks, deckId)].filter((id) => own.some((deck) => deck.id === id)),
  );
  const rows = (await api.repos.notes.list())
    .filter((note) => chosen.has(note.deckId))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
    .map((note) => ({ note, deckPath: deckPath(decks, note.deckId) }));
  const name =
    deckId === undefined ? 'Studiare' : (decks.find((deck) => deck.id === deckId)?.name ?? 'mazo');
  const safe = name
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .replace(/[^\w-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return {
    fileName: `${safe || 'mazo'}-${now.toISOString().slice(0, 10)}.csv`,
    content: buildCsv(rows),
    notes: rows.length,
  };
}
