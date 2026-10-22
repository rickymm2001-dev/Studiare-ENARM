// Puente de la bitácora a la analítica (B15, 1.6). La mayoría de los eventos que se miden ya existen en la
// bitácora, así que una sola tabla los traduce y las pantallas no cambian. DataProvider llama a onRecorded
// con cada evento que ESTE dispositivo guarda, después de guardarlo bien. Lo que baja la sincronización de
// otros dispositivos entra por recordEventQuiet, que no pasa por aquí, para no medir dos veces lo mismo.
//
// Sin permiso no hace nada, ni siquiera guardar la configuración de una sesión, porque track no juntaría nada
// y la memoria tampoco debe juntar lo que no se va a medir. Con permiso guarda en memoria la configuración
// de cada session_started por su sessionId, para saber en session_ended si fue en inglés o cuántas
// preguntas tenía el examen. Nunca lanza: medir no rompe nada.
//
// Lo que no sale de aquí y por qué
//   - duel_completed. Su result (won, lost o tie) depende del resultado del rival, que la bitácora de
//     session_ended no trae. Sin result no se manda un evento a medias
//   - deck_imported de xlsx y docx. El catálogo solo mide apkg y csv
//   - Los eventos de la app que no vienen de la bitácora (candados, pagos, apuntes, recordatorios,
//     recorrido) los manda cada pantalla con track
import type { AppEvent } from '../schemas/events';
import {
  EXAM_SIZES,
  analyticsConsent,
  itemBandOf,
  minuteBandOf,
  track,
  type ExamSize,
} from './catalog';

/** Cuántas configuraciones de sesión aguanta la memoria. Una sesión abierta que no termina no la llena */
export const MAX_SESSIONS_IN_MEMORY = 20;

type Feedback = 'each' | 'end';

export interface BridgeDeps {
  /** El ajuste de retroalimentación de la práctica del alumno, que no viaja en la bitácora de la sesión */
  practiceFeedback: (userId: string) => Promise<Feedback>;
}

interface OpenSession {
  kind: string;
  config: Record<string, unknown>;
  /** Para la práctica: lo que valía el ajuste cuando empezó. Se pide al empezar y se lee al terminar */
  feedback: Promise<Feedback> | null;
}

export interface AppEventBridge {
  /** Traduce un evento recién guardado en este dispositivo. No espera a nadie y no lanza */
  onRecorded: (event: AppEvent) => void;
  /** Olvida las configuraciones guardadas. Lo usan las pruebas y el retiro del permiso */
  reset: () => void;
}

const isExamSize = (value: unknown): value is ExamSize =>
  (EXAM_SIZES as readonly unknown[]).includes(value);

/** Las llaves de un objeto de configuración, o un objeto vacío si no lo es */
const asConfig = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

/** Minutos redondeados de una duración en milisegundos, para el rango */
const minutesOf = (durationMs: number): number => Math.round(durationMs / 60_000);

/** El tamaño del examen y si llevaba inglés, de la configuración de su session_started. null si no se sabe */
function examShape(config: Record<string, unknown>): { size: ExamSize; english: boolean } | null {
  if (!isExamSize(config.requested)) return null;
  const english = typeof config.englishPicked === 'number' && config.englishPicked > 0;
  return { size: config.requested, english };
}

export function createAppEventBridge(deps: BridgeDeps): AppEventBridge {
  const sessions = new Map<string, OpenSession>();

  const remember = (sessionId: string, session: OpenSession) => {
    sessions.set(sessionId, session);
    // Map conserva el orden de inserción, así que lo primero que sale es lo más viejo
    while (sessions.size > MAX_SESSIONS_IN_MEMORY) {
      const oldest = sessions.keys().next();
      if (oldest.done) break;
      sessions.delete(oldest.value);
    }
  };

  const started = (event: Extract<AppEvent, { type: 'session_started' }>) => {
    const { kind } = event.payload;
    const config = asConfig(event.payload.config);
    if (event.sessionId) {
      remember(event.sessionId, {
        kind,
        config,
        feedback: kind === 'practice' ? deps.practiceFeedback(event.userId) : null,
      });
    }
    if (kind === 'exam') {
      const shape = examShape(config);
      if (shape) track('exam_started', { size: shape.size, english_included: shape.english });
    } else if (kind === 'challenge') {
      track('duel_started', {});
    }
  };

  const ended = async (event: Extract<AppEvent, { type: 'session_ended' }>) => {
    const { payload } = event;
    const session = event.sessionId ? sessions.get(event.sessionId) : undefined;
    if (event.sessionId) sessions.delete(event.sessionId);
    const config = session?.config ?? {};
    switch (payload.kind) {
      case 'review':
        // Una sesión sin tarjetas repasadas no es un repaso
        if (payload.items > 0) {
          track('review_session_completed', {
            items: itemBandOf(payload.items),
            minutes: minuteBandOf(minutesOf(payload.durationMs)),
          });
        }
        return;
      case 'practice': {
        if (payload.items === 0) return;
        const feedback = await (session?.feedback ?? deps.practiceFeedback(event.userId));
        track('practice_session_completed', {
          section: config.section === 'english' ? 'en' : 'es',
          items: itemBandOf(payload.items),
          feedback,
          targeted: config.targeted === true || config.sampling === 'targeted',
        });
        return;
      }
      case 'exam': {
        const shape = examShape(config);
        // Sin la configuración, por ejemplo si se dio el permiso con el examen ya empezado, no se inventa
        if (!shape) return;
        const totalMs = typeof config.totalMs === 'number' ? config.totalMs : Infinity;
        track('exam_completed', {
          size: shape.size,
          english_included: shape.english,
          reason:
            payload.reason === 'abandoned'
              ? 'abandoned'
              : payload.durationMs >= totalMs
                ? 'time_up'
                : 'completed',
        });
        return;
      }
      case 'challenge':
        // Ver el comentario de arriba: sin el resultado del rival no hay duel_completed
        return;
    }
  };

  const translate = (event: AppEvent): void | Promise<void> => {
    switch (event.type) {
      case 'session_started':
        started(event);
        return;
      case 'session_ended':
        return ended(event);
      case 'question_card_created':
        track('question_card_created', {
          origin: event.payload.from === 'exam_review' ? 'exam_review' : 'practice_feedback',
          ai_suggested: event.payload.source === 'ai',
        });
        return;
      case 'pomodoro_completed':
        // Solo la fase de enfoque cuenta como un pomodoro
        if (event.payload.phase !== 'focus') return;
        track('pomodoro_completed', {
          focus_minutes: [15, 25, 50].includes(event.payload.plannedMinutes)
            ? (event.payload.plannedMinutes as 15 | 25 | 50)
            : 'other',
        });
        return;
      case 'party_joined':
        track('party_group_joined', {});
        return;
      case 'official_score_submitted':
        // Nunca el puntaje ni el año
        track('official_score_captured', {});
        return;
      case 'deck_imported': {
        const { format } = event.payload;
        if (format === 'csv') track('deck_imported', { format: 'csv' });
        else if (format === 'apkg_legacy' || format === 'apkg_new')
          track('deck_imported', { format: 'apkg' });
        return;
      }
      default:
        return;
    }
  };

  return {
    onRecorded(event) {
      try {
        // Sin permiso no se hace nada, ni guardar la configuración de una sesión
        if (analyticsConsent() !== true) return;
        void Promise.resolve(translate(event)).catch(() => undefined);
      } catch {
        // Medir nunca debe causar un error
      }
    },
    reset() {
      sessions.clear();
    },
  };
}
