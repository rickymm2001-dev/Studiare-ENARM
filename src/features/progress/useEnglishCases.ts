// Si hay textos de lectura en inglés publicados que el alumno pueda practicar (B13). La tarjeta de Inglés médico
// de Progreso lo usa para no pedir reactivos ni mandar a Simular cuando no hay nada que practicar. Lee el
// mismo pool que Simular, el de la fuente de preguntas del alumno, y solo lo consulta si la bandera
// medicalEnglish está prendida.
import { useLiveData } from '@/data/hooks';
import { groupCaseUnits } from '@/engines/caseUnits';
import { useQuestionSource } from '../shared/useQuestionSource';

/** undefined mientras carga. false si no hay ningún caso publicado, o si la bandera está apagada */
export function useEnglishCases(enabled: boolean): boolean | undefined {
  const source = useQuestionSource();
  return useLiveData(async () => {
    if (!enabled) return false;
    const pool = await source.pool();
    return groupCaseUnits(pool.english.practice).length > 0;
  }, [source, enabled]);
}
