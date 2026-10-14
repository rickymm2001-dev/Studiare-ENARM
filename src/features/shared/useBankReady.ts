// Espera a que el banco esté listo para elegir preguntas. useBankReady es el de las pantallas del médico
// y del admin, que esperan el banco de demostración guardado en la base activa. useSourceReadiness es
// el del alumno (B11), que prepara su fuente de preguntas. Con la nube baja el catálogo si nunca se
// bajó y dice si hace falta conexión o si el banco todavía no abre. Si preparar falla, o la base se
// cierra mientras tanto, la pantalla sigue con lo que haya en vez de quedarse cargando.
import { useEffect, useState } from 'react';
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

/** Si la fuente del alumno ya se puede usar. undefined mientras se prepara */
export function useSourceReadiness(source: QuestionSource): SourceReadiness | undefined {
  const [state, setState] = useState<{ source: QuestionSource; value: SourceReadiness }>();
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
  }, [source]);
  // Si la fuente cambió, lo de la anterior ya no vale
  return state?.source === source ? state.value : undefined;
}
