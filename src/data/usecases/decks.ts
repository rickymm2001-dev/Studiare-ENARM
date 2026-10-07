// Seguir y dejar mazos precargados (3.1). Seguir guarda el mazo, sus submazos, notas y tarjetas en la
// base activa con IDs estables, así un mazo seguido dos veces no se duplica. Dejarlo conserva el
// historial de repasos, solo lo quita de los que sigue. Quien ya seguía mazos antes del árbol (D-085)
// los recibe reacomodados con ensurePreloadedTree, sin perder ninguna tarjeta ni su historial.
import type { DemoDeckFile } from '@/data/schemas/content';
import { buildDeckEntities, deckIds, ROOT_DECK_KEY } from '@/demo/content/deckEntities';
import type { DataApi } from '../context';
import type { User } from '../schemas/people';
import { updateProfile } from './profile';

/** Guarda mazos, notas y tarjetas de los archivos con sus IDs estables. Repetirlo no duplica nada */
async function saveDeckFiles(api: Pick<DataApi, 'repos'>, files: readonly DemoDeckFile[]) {
  const entities = buildDeckEntities(files);
  await api.repos.decks.putMany(entities.decks);
  await api.repos.notes.putMany(entities.notes);
  await api.repos.cards.putMany(entities.cards.map((entry) => entry.card));
}

export async function followDeck(
  api: Pick<DataApi, 'repos' | 'recordEvent'>,
  user: User,
  file: DemoDeckFile,
) {
  await saveDeckFiles(api, [file]);
  const followed = new Set(user.settings.followedDecks);
  followed.add(file.key);
  return updateProfile(api, user, { settings: { followedDecks: [...followed] } });
}

export async function unfollowDeck(
  api: Pick<DataApi, 'repos' | 'recordEvent'>,
  user: User,
  deckKey: string,
) {
  return updateProfile(api, user, {
    settings: { followedDecks: user.settings.followedDecks.filter((key) => key !== deckKey) },
  });
}

/**
 * Pasa al árbol los mazos precargados que el alumno ya seguía. Si falta la raíz ENARM 2027 o un
 * mazo seguido todavía no cuelga de ella, vuelve a guardar sus archivos, que trae las materias como
 * submazos y las etiquetas en ruta. Los IDs son los mismos, así que las tarjetas conservan su
 * historial de repaso. true si hubo que reacomodar algo
 */
export async function ensurePreloadedTree(
  api: Pick<DataApi, 'repos'>,
  followed: readonly string[],
  loadFiles: () => Promise<DemoDeckFile[]>,
): Promise<boolean> {
  if (followed.length === 0) return false;
  const rootId = deckIds.deck(ROOT_DECK_KEY);
  const parents = await Promise.all(
    followed.map(async (key) => (await api.repos.decks.get(deckIds.deck(key)))?.parentId),
  );
  if (parents.every((parent) => parent === rootId)) return false;
  const files = (await loadFiles()).filter((file) => followed.includes(file.key));
  if (files.length === 0) return false;
  await saveDeckFiles(api, files);
  return true;
}
