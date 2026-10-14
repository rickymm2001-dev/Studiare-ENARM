// Exportar mis datos (4.5). Todo lo del alumno en un JSON legible, incluida la bitácora completa y
// lo que creó él mismo, sus mazos, tarjetas y apuntes (D-092). Lo precargado no se exporta porque
// no es suyo y lo trae la app. Lo de Party que vive solo en la nube (B7), sus grupos, el XP que
// publicó, sus aportes, sus retos y sus duelos, lo pone quien conoce la nube con partyCloud. Si la
// nube no contesta, el archivo sale igual con lo de este dispositivo y dice por qué falta Party.
import type { PartyExport, PartyFailure } from '../cloud/party';
import type { Repositories } from '../repos/types';

/** Lo de Party en la nube dentro del archivo */
export type PartyCloudExport =
  { status: 'included'; data: PartyExport } | { status: 'unavailable'; reason: PartyFailure };

export async function exportUserData(
  repos: Repositories,
  userId: string,
  options: {
    /** Pide a la nube lo de Party. null si la cuenta no está conectada a la nube */
    partyCloud?: () => Promise<PartyCloudExport | null>;
  } = {},
) {
  const [
    user,
    account,
    consents,
    events,
    layout,
    subscription,
    decks,
    notes,
    cards,
    outlines,
    officialScore,
    partyCloud,
  ] = await Promise.all([
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
    repos.officialScores.get(userId),
    options.partyCloud
      ? options.partyCloud().catch((): PartyCloudExport => ({
          status: 'unavailable',
          reason: 'network',
        }))
      : Promise.resolve(null),
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
    officialScore: officialScore ?? null,
    widgetLayout: layout ?? null,
    // Lo que el alumno creó. Las notas y las cartas van por el mazo que es suyo
    content: {
      decks: ownDecks,
      notes: notes.filter((note) => ownDeckIds.has(note.deckId)),
      cards: cards.filter((card) => ownDeckIds.has(card.deckId)),
      outlines: outlines.filter((page) => page.ownerId === userId),
    },
    events,
    // Party en la nube. Solo las filas propias, sin nada de los compañeros
    partyCloud,
  };
}
