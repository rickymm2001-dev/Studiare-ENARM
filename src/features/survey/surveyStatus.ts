// El estado de la encuesta tal como lo contesta el servidor (my_survey_status), recordado un rato mientras dure la
// página. La franja vive en el marco de la app y se monta de nuevo cada vez que el alumno sale de un examen o de un
// repaso, y sin esto preguntaría al servidor en cada regreso. El servidor es el único que decide si la encuesta le toca
// a esta cuenta. Esto solo evita repetir la misma pregunta unos minutos. Al contestar, borrar o abrir otra cuenta se
// olvida.
import { loadCloud } from '@/data/cloud/client';
import { readSurveyStatus, type SurveyFailure, type SurveyStatus } from '@/data/cloud/survey';

/** Cuánto vale lo que contestó el servidor sin volver a preguntarle */
export const STATUS_TTL_MS = 2 * 60 * 1000;

const cache = new Map<string, { at: number; status: SurveyStatus }>();

export type StatusResult =
  { ok: true; status: SurveyStatus } | { ok: false; reason: SurveyFailure };

/** Lo que dice el servidor de esta cuenta. fresh pide la respuesta de ahora y no la recordada */
export async function fetchSurveyStatus(
  userId: string,
  options: { fresh?: boolean; now?: () => number } = {},
): Promise<StatusResult> {
  const now = options.now ?? Date.now;
  const known = cache.get(userId);
  if (!options.fresh && known && now() - known.at < STATUS_TTL_MS) {
    return { ok: true, status: known.status };
  }
  const cloud = await loadCloud();
  if (!cloud) return { ok: false, reason: 'network' };
  const result = await readSurveyStatus(cloud);
  if (result.ok) cache.set(userId, { at: now(), status: result.status });
  return result;
}

/** Olvida lo recordado de una cuenta, o de todas. Se llama al contestar y al borrar la respuesta */
export function forgetSurveyStatus(userId?: string): void {
  if (userId === undefined) cache.clear();
  else cache.delete(userId);
}
