// Exportar mis datos (4.5). Todo lo del alumno en un JSON legible, incluida la bitácora completa y
// lo que creó él mismo, sus mazos, tarjetas y apuntes (D-092). Lo precargado no se exporta porque
// no es suyo y lo trae la app. Lo de Party que vive solo en la nube (B7), sus grupos, el XP que
// publicó, sus aportes, sus retos y sus duelos, lo pone quien conoce la nube con partyCloud. Si la
// nube no contesta, el archivo sale igual con lo de este dispositivo y dice por qué falta Party. Los
// recordatorios por correo (B15, 3.8) también viven en la nube y se piden igual, y la respuesta a la encuesta de
// los primeros días (B18, 2.5), con el código con el que la guarda la base. Si el alumno dio el permiso
// Medición de uso ya sale en sus permisos, que son de este dispositivo.
import type { PartyExport, PartyFailure } from '../cloud/party';
import type { MySurveyResponse } from '../cloud/survey';
import type { ReminderPrefs } from '../cloud/engagementContracts';
import type { Repositories } from '../repos/types';

/** Lo de Party en la nube dentro del archivo */
export type PartyCloudExport =
  { status: 'included'; data: PartyExport } | { status: 'unavailable'; reason: PartyFailure };

/** Los recordatorios por correo que tiene guardados en la nube, sin su ficha de baja */
export type RemindersCloudExport =
  { status: 'included'; data: ReminderPrefs } | { status: 'unavailable' };

/**
 * La respuesta a la encuesta de los primeros días que tiene guardada en la nube, con su código y sus días. data es null
 * si no la contestó
 */
export type SurveyCloudExport =
  { status: 'included'; data: MySurveyResponse | null } | { status: 'unavailable' };

export async function exportUserData(
  repos: Repositories,
  userId: string,
  options: {
    /** Pide a la nube lo de Party. null si la cuenta no está conectada a la nube */
    partyCloud?: () => Promise<PartyCloudExport | null>;
    /** Pide a la nube sus recordatorios por correo. null si la cuenta no está conectada a la nube */
    remindersCloud?: () => Promise<RemindersCloudExport | null>;
    /** Pide a la nube su respuesta a la encuesta de los primeros días. null si la cuenta no está conectada a la nube */
    surveyCloud?: () => Promise<SurveyCloudExport | null>;
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
    remindersCloud,
    surveyCloud,
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
    options.remindersCloud
      ? options.remindersCloud().catch((): RemindersCloudExport => ({ status: 'unavailable' }))
      : Promise.resolve(null),
    options.surveyCloud
      ? options.surveyCloud().catch((): SurveyCloudExport => ({ status: 'unavailable' }))
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
    // Los recordatorios por correo de la nube, con la hora, los días, la zona y si se dio de baja
    remindersCloud,
    // La respuesta a la encuesta de los primeros días, lo único suyo que vive en la tabla survey_responses
    surveyCloud,
  };
}
