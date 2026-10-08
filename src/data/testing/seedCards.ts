// Un mazo propio con tarjetas básicas y algunas suspendidas, para las pruebas de pantalla. Solo lo
// usan las pruebas.
import type { DataApi } from '../context';
import { createEvent } from '../events/createEvent';
import type { User } from '../schemas/people';
import { newId } from './fixtures';

const NOW = '2026-10-01T15:00:00.000Z';

export async function seedManualCards(
  api: Pick<DataApi, 'repos' | 'recordEvent'>,
  user: User,
  options: { count: number; suspended: number },
): Promise<{ deckId: string; cardIds: string[] }> {
  const deckId = newId();
  await api.repos.decks.put({
    id: deckId,
    name: 'Mazo con suspendidas',
    description: '',
    ownerId: user.id,
    origin: 'manual',
    visibility: 'private',
    isDemo: false,
    createdAt: NOW,
  });
  const cardIds: string[] = [];
  for (let index = 0; index < options.count; index += 1) {
    const noteId = newId();
    await api.repos.notes.put({
      id: noteId,
      deckId,
      tags: [],
      origin: 'manual',
      editorialStatus: 'draft',
      sourceQuote: null,
      sourceQuestionVersionId: null,
      isDemo: false,
      createdAt: NOW,
      kind: 'basic',
      front: `<p>Pregunta ${index + 1}</p>`,
      back: '<p>x</p>',
    });
    const cardId = newId();
    cardIds.push(cardId);
    await api.repos.cards.put({ id: cardId, noteId, deckId, ordinal: 0, createdAt: NOW });
  }
  if (options.suspended > 0) {
    await api.recordEvent(
      createEvent(
        'cards_suspended',
        { cardIds: cardIds.slice(0, options.suspended), reason: 'manual' },
        { userId: user.id, tz: user.timeZone },
      ),
    );
  }
  return { deckId, cardIds };
}

/**
 * Un mazo propio con tarjetas que ya se repasaron una vez y vencieron hace unos días, más algunas
 * que nunca se han visto. Sirve para probar atrasos y la carga diaria
 */
export async function seedOverdueCards(
  api: Pick<DataApi, 'repos' | 'recordEvent'>,
  user: User,
  options: { overdue: number; unseen?: number; daysLate?: number },
): Promise<{ deckId: string; overdueIds: string[] }> {
  const { deckId, cardIds } = await seedManualCards(api, user, {
    count: options.overdue + (options.unseen ?? 0),
    suspended: 0,
  });
  const overdueIds = cardIds.slice(0, options.overdue);
  const dayMs = 86_400_000;
  const late = options.daysLate ?? 3;
  for (const cardId of overdueIds) {
    const reviewedAt = new Date(Date.now() - (late + 5) * dayMs);
    await api.recordEvent(
      createEvent(
        'card_reviewed',
        {
          cardId,
          deckId,
          source: 'card',
          rating: 'good',
          confidence: null,
          msToReveal: 3000,
          msToRate: 2000,
          stateBefore: null,
          stateAfter: {
            due: new Date(Date.now() - late * dayMs).toISOString(),
            stability: 5,
            difficulty: 5,
            scheduledDays: 5,
            learningSteps: 0,
            reps: 2,
            lapses: 0,
            state: 'review',
            lastReview: reviewedAt.toISOString(),
          },
        },
        { userId: user.id, tz: user.timeZone, clock: { now: () => reviewedAt } },
      ),
    );
  }
  return { deckId, overdueIds };
}
