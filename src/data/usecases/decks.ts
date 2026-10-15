// Seguir y dejar mazos precargados (3.1). Seguir guarda el mazo, sus submazos, notas y tarjetas en la
// base activa con IDs estables, así un mazo seguido dos veces no se duplica. Dejarlo conserva el
// historial de repasos, solo lo quita de los que sigue. Quien ya seguía mazos antes del árbol (D-085)
// los recibe reacomodados con ensurePreloadedTree, sin perder ninguna tarjeta ni su historial, y
// quien los seguía con los nombres pegados de las materias los recibe con su nombre legible (B4).
import type { DemoDeckFile } from '@/data/schemas/content';
import { buildDeckEntities, deckIds, ROOT_DECK_KEY } from '@/demo/content/deckEntities';
import { TOPIC_DISPLAY_NAMES } from '@/demo/content/topicDisplayNames';
import type { DataApi } from '../context';
import type { User } from '../schemas/people';
import { updateProfile } from './profile';

/**
 * Guarda mazos, notas y tarjetas de los archivos con sus IDs estables. Repetirlo no duplica nada. Los
 * submazos que se bajan del catálogo de la nube (B11, catalogDecks.ts) pasan por aquí con isDemo en
 * false. Llevan las mismas claves de nota que en la demo, así quien ya los seguía conserva su historial
 */
export async function saveDeckFiles(
  api: Pick<DataApi, 'repos'>,
  files: readonly DemoDeckFile[],
  options: { isDemo?: boolean } = {},
) {
  const built = buildDeckEntities(files);
  const isDemo = options.isDemo ?? true;
  const entities = isDemo
    ? built
    : {
        decks: built.decks.map((deck) => ({ ...deck, isDemo })),
        notes: built.notes.map((note) => ({ ...note, isDemo })),
        cards: built.cards,
      };
  // La decisión de un médico sobre una tarjeta (aprobada o rechazada) sobrevive a volver a seguir el
  // mazo, que si no la regresaría a borrador
  const decided = new Map(
    (await api.repos.notes.list())
      .filter((note) => note.editorialStatus === 'approved' || note.editorialStatus === 'rejected')
      .map((note) => [note.id, note.editorialStatus] as const),
  );
  const notes = entities.notes.map((note) => {
    const status = decided.get(note.id);
    return status ? { ...note, editorialStatus: status } : note;
  });
  // Los mazos van al final porque ensurePreloadedTree los usa para saber si ya está todo en su lugar.
  // Si la pestaña se cierra a la mitad, el mazo sigue sin su padre y la próxima vez se repite
  await api.repos.notes.putMany(notes);
  await api.repos.cards.putMany(entities.cards.map((entry) => entry.card));
  await api.repos.decks.putMany(entities.decks);
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
 * Si alguna materia de los mazos seguidos conserva un nombre de antes de la tabla de nombres
 * legibles, como AnticonceptivosyMPF. Se sabe sin cargar el catálogo, porque el ID de cada materia
 * sale del mazo y de su nivel de etiqueta, que son las claves de la tabla
 */
async function hasStaleSubjectNames(
  api: Pick<DataApi, 'repos'>,
  followed: readonly string[],
): Promise<boolean> {
  const expected = new Map<string, string>();
  for (const key of followed) {
    for (const [segment, name] of Object.entries(TOPIC_DISPLAY_NAMES))
      expected.set(deckIds.subject(key, segment), name);
  }
  return (await api.repos.decks.list()).some((deck) => {
    const name = expected.get(deck.id);
    return name !== undefined && deck.name !== name;
  });
}

/**
 * Pasa al árbol los mazos precargados que el alumno ya seguía. Si falta la raíz ENARM 2027, un
 * mazo seguido todavía no cuelga de ella o una materia tiene su nombre pegado de antes, vuelve a
 * guardar sus archivos, que trae las materias como submazos con su nombre legible y las etiquetas
 * en ruta. Los IDs son los mismos, así que las tarjetas conservan su historial de repaso. true si
 * hubo que reacomodar algo
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
  const inTree = parents.every((parent) => parent === rootId);
  if (inTree && !(await hasStaleSubjectNames(api, followed))) return false;
  const files = (await loadFiles()).filter((file) => followed.includes(file.key));
  if (files.length === 0) return false;
  await saveDeckFiles(api, files);
  return true;
}
