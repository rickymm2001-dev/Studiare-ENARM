// Decide si los errores del navegador se mandan (Fase G, G5, D-107). Solo se mandan si el alumno con
// sesión dio el permiso de mejora anónima. Sin sesión, o sin ese permiso, se descartan. Mientras se
// lee su decisión, el reporte los guarda en memoria.
import { useEffect } from 'react';
import { useDataApi } from '@/data/context';
import { useLiveDataFor } from '@/data/hooks';
import { currentConsents } from '@/data/usecases/profile';
import { setErrorReportingAllowed } from './errorReporter';
import { usePreferences } from './preferences';

export function ErrorReportingGate() {
  const api = useDataApi();
  const userId = usePreferences((state) => state.sessionUserId);
  // null es que no hay sesión y undefined es que todavía se está leyendo. El resultado va atado al alumno que lo
  // produjo, para que en un cambio directo de cuenta el permiso de A no valga para B mientras llega el de B
  const consents = useLiveDataFor(
    userId,
    () => (userId ? currentConsents(api, userId) : Promise.resolve(null)),
    [api.repos],
  );
  useEffect(() => {
    // Mientras se lee la decisión de la cuenta que acaba de entrar, no vale la de la anterior
    if (consents === undefined) {
      setErrorReportingAllowed(null);
      return;
    }
    setErrorReportingAllowed(consents?.anonymized_improvement === true);
  }, [consents]);
  return null;
}
