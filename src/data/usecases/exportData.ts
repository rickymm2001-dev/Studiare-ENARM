// Exportar mis datos (4.5). Todo lo del alumno en un JSON legible, incluida la bitácora completa y
// lo que creó él mismo, sus mazos, tarjetas y apuntes (D-092). Lo precargado no se exporta porque
// no es suyo y lo trae la app.
import type { Repositories } from '../repos/types';

export async function exportUserData(repos: Repositories, userId: string) {
  const [user, account, consents, events, layout, subscription, decks, notes, cards, outlines] =
    await Promise.all([
      repos.users.get(userId),
      repos.accounts.get(userId),
      repos.consents.list().then((list) => list.filter((consent) => consent.userId === userId)),
      repos.events.query({ userId }),
      repos.widgetLayouts.get(userId),
      repos.subscriptions.get(userId),
      repos.decks.list(),
      repos.notes.list(),
      repos.cards.list(),
      repos.outlines.list(),
    ]);
  const ownDecks = decks.filter((deck) => deck.ownerId === userId);
  const ownDeckIds = new Set(ownDecks.map((deck) => deck.id));
  return {
    exportedAt: new Date().toISOString(),
    format: 'enarm-prototipo-export-v2',
    user,
    account: account ?? null,
    consents,
    subscription: subscription ?? null,
    widgetLayout: layout ?? null,
    // Lo que el alumno creó. Las notas y las cartas van por el mazo que es suyo
    content: {
      decks: ownDecks,
      notes: notes.filter((note) => ownDeckIds.has(note.deckId)),
      cards: cards.filter((card) => ownDeckIds.has(card.deckId)),
      outlines: outlines.filter((page) => page.ownerId === userId),
    },
    events,
  };
}
