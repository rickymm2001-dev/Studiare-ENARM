// Seguir y dejar mazos precargados (3.1). Seguir guarda el mazo, sus notas y tarjetas en la base
// activa con IDs estables, así un mazo seguido dos veces no se duplica. Dejarlo conserva el
// historial de repasos, solo lo quita de los que sigue.
import type { DemoDeckFile } from '@/data/schemas/content';
import { buildDeckEntities } from '@/demo/content/deckEntities';
import type { DataApi } from '../context';
import type { User } from '../schemas/people';
import { updateProfile } from './profile';

export async function followDeck(
  api: Pick<DataApi, 'repos' | 'recordEvent'>,
  user: User,
  file: DemoDeckFile,
) {
  const entities = buildDeckEntities([file]);
  await api.repos.decks.putMany(entities.decks);
  await api.repos.notes.putMany(entities.notes);
  await api.repos.cards.putMany(entities.cards.map((entry) => entry.card));
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
