// Espera a que el banco esté listo para elegir preguntas. useBankReady es el de las pantallas del médico
// y del admin, que esperan el banco de demostración guardado en la base activa. useSourceReadiness es
// el del alumno (B11), que prepara su fuente de preguntas. Con la nube baja el catálogo si nunca se
// bajó y dice si hace falta conexión o si el banco todavía no abre. Si preparar falla, o la base se
// cierra mientras tanto, la pantalla sigue con lo que haya en vez de quedarse cargando.
import { useCallback, useEffect, useState } from 'react';
import type { QuestionSource, SourceReadiness } from '@/data/bank/questionSource';
import { useDataApi } from '@/data/context';
import { ensureDemoBank } from '@/data/usecases/bank';

export function useBankReady(): boolean {
  const api = useDataApi();
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let mounted = true;
    void ensureDemoBank(api)
      .catch(() => 0)
      .then(() => {
        if (mounted) setReady(true);
      });
    return () => {
      mounted = false;
    };
  }, [api]);
  return ready;
}

/**
 * Si la fuente del alumno ya se puede usar. readiness es undefined mientras se prepara. Se vuelve a
 * preparar cuando vuelve la red y con retry, así Conéctate una vez no se queda puesto (B4 de la
 * revisión de B11). Mientras se reintenta se conserva lo último que se supo
 */
export function useSourceReadiness(source: QuestionSource): {
  readiness: SourceReadiness | undefined;
  retry: () => void;
} {
  const [state, setState] = useState<{ source: QuestionSource; value: SourceReadiness }>();
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => {
    setAttempt((value) => value + 1);
  }, []);
  useEffect(() => {
    window.addEventListener('online', retry);
    return () => {
      window.removeEventListener('online', retry);
    };
  }, [retry]);
  useEffect(() => {
    let mounted = true;
    void source
      .prepare()
      .catch((): SourceReadiness => 'ready')
      .then((value) => {
        if (mounted) setState({ source, value });
      });
    return () => {
      mounted = false;
    };
  }, [source, attempt]);
  // Si la fuente cambió, lo de la anterior ya no vale
  return { readiness: state?.source === source ? state.value : undefined, retry };
}
