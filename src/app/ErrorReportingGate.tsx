// Decide si los errores del navegador se mandan (Fase G, G5, D-107). Solo se mandan si el alumno con
// sesión dio el permiso de mejora anónima. Sin sesión, o sin ese permiso, se descartan. Mientras se
// lee su decisión, el reporte los guarda en memoria.
import { useEffect } from 'react';
import { useDataApi } from '@/data/context';
import { useLiveData } from '@/data/hooks';
import { currentConsents } from '@/data/usecases/profile';
import { setErrorReportingAllowed } from './errorReporter';
import { usePreferences } from './preferences';

export function ErrorReportingGate() {
  const api = useDataApi();
  const userId = usePreferences((state) => state.sessionUserId);
  // null es que no hay sesión y undefined es que todavía se está leyendo
  const consents = useLiveData(
    () => (userId ? currentConsents(api, userId) : Promise.resolve(null)),
    [api.repos, userId],
  );
  useEffect(() => {
    if (consents === undefined) return;
    setErrorReportingAllowed(consents?.anonymized_improvement === true);
  }, [consents]);
  return null;
}
