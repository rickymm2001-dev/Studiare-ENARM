// Elegir preguntas y bajar sus cuerpos antes de empezar (B11, 5.4, y M2 de la revisión de B11). Con el
// banco de la nube el catálogo trae todo el banco, pero sin conexión solo se puede estudiar lo que ya
// tiene su cuerpo en este navegador. Elegir al azar de todo el catálogo dejaba, sin red, una práctica de
// 3 de 20 o un examen casi vacío. Así que sin conexión se elige solo de lo ya bajado, y si la bajada
// responde sin conexión se vuelve a elegir de ahí. La pantalla lo dice en el aviso del marco.
import type { ReadPurpose } from '@/data/bank/contracts';
import type { EnsureResult, PoolQuestion, QuestionSource } from '@/data/bank/questionSource';

/** El navegador dice que no hay red */
export function browserOffline(): boolean {
  return typeof navigator !== 'undefined' && !navigator.onLine;
}

export interface ChosenWithBodies {
  /** Lo elegido, en el orden en que se eligió */
  ids: readonly string[];
  result: EnsureResult;
  /** Se eligió solo de lo ya bajado porque no hubo conexión */
  fromStored: boolean;
}

export async function chooseWithBodies<T extends PoolQuestion>(input: {
  source: Pick<QuestionSource, 'kind' | 'ensureBodies'>;
  candidates: readonly T[];
  purpose: ReadPurpose;
  /** Elige de los candidatos que se le pasen y devuelve sus ids */
  choose: (from: readonly T[]) => readonly string[];
  offline?: () => boolean;
}): Promise<ChosenWithBodies> {
  const { source, candidates, purpose, choose } = input;
  // El banco de demostración vive completo en el navegador, así que solo cuenta con la nube
  const offline = source.kind === 'cloud' && (input.offline ?? browserOffline)();
  const ids = choose(offline ? candidates.filter((question) => question.cached) : candidates);
  const result = await source.ensureBodies(ids, purpose);
  if (offline || source.kind !== 'cloud' || !result.offline) {
    return { ids, result, fromStored: offline };
  }
  // La bajada no llegó. Lo que ya estaba, o lo que alcanzó a llegar, es lo único que se puede estudiar
  const stored = new Set(result.ready);
  const again = choose(candidates.filter((question) => question.cached || stored.has(question.id)));
  return { ids: again, result: await source.ensureBodies(again, purpose), fromStored: true };
}
