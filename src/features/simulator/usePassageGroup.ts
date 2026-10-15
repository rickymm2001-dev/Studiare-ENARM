// En qué lugar de su texto va una pregunta de lectura en inglés (B13, 2.3 del plan de B13). Un texto trae
// dos o tres preguntas, y el tiempo sugerido es el de todas, así que hace falta saber cuántas trae en esta
// práctica y cuál es la que se está viendo. Sale de las preguntas de la sesión, sin depender de cómo se
// armó: una práctica de inglés, o las falladas de un examen con casos de inglés.
import { useDataApi } from '@/data/context';
import { useLiveData } from '@/data/hooks';

export interface PassageGroup {
  /** Preguntas del texto que hay en la sesión */
  size: number;
  /** Lugar de la pregunta en el texto, desde 0 */
  position: number;
  /** A qué pregunta de la sesión corresponde, para no usar el lugar de la anterior mientras carga */
  index: number;
}

/**
 * El lugar de la pregunta en su texto. Una pregunta suelta es un texto de una y se sabe al instante. Con
 * caso es undefined mientras carga, y mientras cambia de pregunta puede traer el lugar de la anterior,
 * por eso lleva el index al que corresponde
 */
export function usePassageGroup(
  questionIds: readonly string[],
  index: number,
  caseId: string | null,
): PassageGroup | undefined {
  const api = useDataApi();
  const loaded = useLiveData(async (): Promise<PassageGroup | undefined> => {
    if (caseId === null) return undefined;
    const rows = await Promise.all(questionIds.map((id) => api.repos.questions.get(id)));
    const members = rows.flatMap((row, position) => (row?.caseId === caseId ? [position] : []));
    return {
      size: Math.max(1, members.length),
      position: Math.max(0, members.indexOf(index)),
      index,
    };
  }, [api.repos, questionIds.join(','), index, caseId]);
  return caseId === null ? { size: 1, position: 0, index } : loaded;
}
