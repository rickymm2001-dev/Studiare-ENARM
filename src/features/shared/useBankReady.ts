// Espera a que el banco de demostración esté guardado en la base activa. Las pantallas del médico y
// del admin lo usan para no mostrar un banco a medias. Si guardar falla, o la base se cierra mientras
// tanto, la pantalla sigue con lo que haya en vez de quedarse cargando.
import { useEffect, useState } from 'react';
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
