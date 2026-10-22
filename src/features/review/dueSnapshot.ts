// La foto de tarjetas vencidas para el recordatorio por correo (B15, 3.3). Las tarjetas de los mazos
// precargados no viajan a la nube, así que el servidor no puede contar cuántas le tocan al alumno. La app
// cuenta (src/engines/dueForecast.ts) y sube una foto con solo fechas y números, nunca una tarjeta.
//
// Cuándo sube, solo si el alumno tiene los recordatorios prendidos y la cuenta de la nube conectada
//   - al guardar los recordatorios (ReminderSettingsSection)
//   - al abrir la app y después a lo mucho cada 30 minutos, colgada de la sincronización
//   - después de terminar un repaso, con la siguiente sincronización. Corre cada 5 minutos y al ocultar la
//     pestaña, así que la foto se actualiza antes de que llegue la hora del recordatorio
// Sube con la zona que el servidor guardó para los recordatorios, porque el servidor busca el día con esa zona.
// Se importa en diferido, para que el motor de repasos no pese en lo que carga la nube
import type { SupabaseClient } from '@supabase/supabase-js';
import { isFeatureEnabled } from '@/config/featureFlags';
import { fetchReminderPrefs, putDueSnapshot } from '@/data/cloud/reminders';
import type { DueSnapshot } from '@/data/cloud/engagementContracts';
import type { DataApi } from '@/data/context';
import { forecastDue } from '@/engines/dueForecast';
import { studyDayOf } from '@/engines/studyDay';
import { suspendedCardIds } from '@/engines/suspension';
import { followedDeckIds } from '../decks/followed';
import { schedulerConfig } from './schedulerConfig';
import { latestCardStates, reviewedToday } from './study';

/** Cuánto espera entre una foto y la siguiente cuando el alumno no ha terminado ningún repaso */
export const SNAPSHOT_MIN_GAP_MS = 30 * 60_000;

type Api = Pick<DataApi, 'repos'>;

/**
 * Cuenta las tarjetas vencidas de hoy y de los 13 días que siguen, y las nuevas de hoy, con las mismas tarjetas
 * y la misma regla que el contador de Repasar. null si el alumno no existe en este dispositivo
 */
export async function buildDueSnapshot(
  api: Api,
  userId: string,
  timeZone: string,
  now: Date = new Date(),
): Promise<DueSnapshot | null> {
  const { repos } = api;
  const user = await repos.users.get(userId);
  if (!user) return null;
  const [decks, cards, events] = await Promise.all([
    repos.decks.list(),
    repos.cards.list(),
    // Solo lo que cambia el estado o la suspensión de una tarjeta, no toda la bitácora
    repos.events.query({
      userId,
      types: [
        'card_reviewed',
        'cards_rescheduled',
        'cards_reset',
        'cards_suspended',
        'cards_unsuspended',
      ],
    }),
  ]);
  const followed = followedDeckIds({ isDemo: false, user, settings: user.settings }, decks);
  const suspended = suspendedCardIds(events);
  const states = latestCardStates(events);
  // La zona del servidor manda sobre la del perfil, porque con ella busca el día del recordatorio
  const config = { ...schedulerConfig({ user, settings: user.settings }), timeZone };
  const noteOfCard = new Map(cards.map((card) => [card.id, card.noteId]));
  const done = reviewedToday(events, studyDayOf(now, timeZone), noteOfCard);
  const forecast = forecastDue({
    cards: cards
      .filter((card) => followed.has(card.deckId) && !suspended.has(card.id))
      .map((card) => ({
        cardId: card.id,
        noteId: card.noteId,
        state: states.get(card.id) ?? null,
      })),
    now,
    config,
    reviewedToday: done,
  });
  return {
    computedAt: now.toISOString(),
    timeZone,
    days: forecast.days,
    newAvailable: forecast.newAvailable,
  };
}

/** Cuenta y sube la foto. Devuelve si el servidor la guardó */
export async function uploadDueSnapshot(
  api: Api,
  cloud: Pick<SupabaseClient, 'rpc'>,
  userId: string,
  timeZone: string,
  now: Date = new Date(),
): Promise<boolean> {
  try {
    const snapshot = await buildDueSnapshot(api, userId, timeZone, now);
    return snapshot !== null && (await putDueSnapshot(cloud, snapshot));
  } catch {
    // Una falla al contar o al subir no debe afectar a la sincronización. Se reintenta en la siguiente
    return false;
  }
}

/** Si el alumno terminó algún repaso desde cierto momento */
async function reviewedSince(api: Api, userId: string, sinceMs: number): Promise<boolean> {
  if (!Number.isFinite(sinceMs)) return true;
  const ended = await api.repos.events.query({
    userId,
    types: ['session_ended'],
    from: new Date(sinceMs).toISOString(),
  });
  return ended.some((event) => event.type === 'session_ended' && event.payload.kind === 'review');
}

export interface DueSnapshotSync {
  /** Se llama después de cada sincronización buena. Sube la foto solo si toca y si hay recordatorios prendidos */
  afterSync: (api: Api, cloud: Pick<SupabaseClient, 'rpc'>, userId: string) => Promise<void>;
  /** Olvida lo que sabe. Lo usa quien guarda los recordatorios para que la siguiente sincronización los relea */
  forget: () => void;
}

/** Quién decide cuándo subir la foto. Uno por conexión con la nube, así cerrar sesión lo reinicia */
export function createDueSnapshotSync(now: () => number = Date.now): DueSnapshotSync {
  let checkedAt = Number.NEGATIVE_INFINITY;
  let uploadedAt = Number.NEGATIVE_INFINITY;
  /** La zona de los recordatorios prendidos, o null si están apagados */
  let activeZone: string | null = null;
  return {
    forget() {
      checkedAt = Number.NEGATIVE_INFINITY;
      uploadedAt = Number.NEGATIVE_INFINITY;
      activeZone = null;
    },
    async afterSync(api, cloud, userId) {
      try {
        if (!isFeatureEnabled('emailReminders')) return;
        const at = now();
        // Los recordatorios se leen al abrir y cada 30 minutos, por si se cambiaron en otro dispositivo
        if (at - checkedAt >= SNAPSHOT_MIN_GAP_MS) {
          const prefs = await fetchReminderPrefs(cloud);
          checkedAt = at;
          activeZone = prefs?.enabled === true && !prefs.unsubscribed ? prefs.timeZone : null;
        }
        if (activeZone === null) return;
        if (
          at - uploadedAt >= SNAPSHOT_MIN_GAP_MS ||
          (await reviewedSince(api, userId, uploadedAt))
        ) {
          if (await uploadDueSnapshot(api, cloud, userId, activeZone, new Date(at)))
            uploadedAt = at;
        }
      } catch {
        // Nunca debe frenar la sincronización
      }
    },
  };
}
