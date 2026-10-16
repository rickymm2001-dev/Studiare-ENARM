// Las tres puertas de las tarjetas con IA (desde una pregunta fallada, desde un texto o PDF y desde
// un apunte) comparten el estado del motor de tarjetas para quien las usa (B12, 3.5). Con la
// compuerta cerrada el botón no aparece para los alumnos y se ve el aviso. Sin IA, sin conexión o
// mientras se revisa tampoco se ofrece. Médicos y admins siguen usando todo para auditar. También
// traduce lo que falló a un aviso y deja en la bitácora lo que costaron las llamadas que fallaron.
import type { AiStatus } from '@/ai/client';
import { engineAccess, type EngineAccess } from '@/ai/gate';
import { CardGenerationError } from '@/ai/flashcards';
import { useAiStatus } from '@/ai/useAiStatus';
import { usePreferences } from '@/app/preferences';
import type { DataApi } from '@/data/context';
import type { User } from '@/data/schemas/people';
import { GenerationLimitError } from '@/data/usecases/aiCards';
import { logAiCall } from '@/data/usecases/aiTutor';
import { t } from '@/i18n/es-MX';
import type { ReadySession } from './RequireSession';

export interface CardsAi {
  status: AiStatus;
  access: EngineAccess;
  /** El formulario y el botón se pintan. Con la compuerta cerrada o sin IA solo se ve el aviso */
  offered: boolean;
  /** El botón se puede pulsar ahora */
  canGenerate: boolean;
}

export function useCardsAi(session: Pick<ReadySession, 'isDemo'>): CardsAi {
  const status = useAiStatus({ demo: session.isDemo });
  const role = usePreferences((state) => state.role);
  const access = engineAccess(status, 'flashcards', role);
  return {
    status,
    access,
    offered: access === 'open' || access === 'checking' || access === 'offline',
    canGenerate: access === 'open',
  };
}

/**
 * El aviso de por qué no salieron las tarjetas. Un tope de generaciones, la compuerta o la pausa
 * llegan con el texto del servidor, que ya viene en español y con trato de tú
 */
export function cardsFailureText(error: unknown, fallback: string): string {
  if (error instanceof GenerationLimitError) return t.aiCards.limitReached;
  if (error instanceof CardGenerationError) return error.message;
  return fallback;
}

/** Lo que costaron las llamadas de una generación que falló también queda en la bitácora de costo */
export async function logFailedGeneration(
  api: Pick<DataApi, 'repos'>,
  user: Pick<User, 'id'>,
  error: unknown,
): Promise<void> {
  if (!(error instanceof CardGenerationError)) return;
  for (const meta of error.metas) await logAiCall(api, user, meta);
}
