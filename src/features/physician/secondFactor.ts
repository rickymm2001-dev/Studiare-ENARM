// El 42501 de las funciones del banco para el equipo (B11 sobre B9). Con la bandera requireMfa, un
// médico, un admin o el dueño sin sesión aal2 cuenta como alumno en el servidor y las funciones editor_*
// y admin_* le responden 42501. En vez de un error genérico se le pide su código. Si la sesión ya está
// en aal2, o la bandera está apagada, el 42501 es de verdad falta de permiso y la pantalla lo dice.
import { useAccess } from '@/app/accessState';
import { usePreferences } from '@/app/preferences';
import { isFeatureEnabled } from '@/config/featureFlags';
import { loadCloud } from '@/data/cloud/client';
import { needsMfaRole, readMfaStatus } from '@/data/cloud/mfa';

/**
 * Revisa el segundo factor y, si falta, tapa la app con la pantalla del código de B9. Devuelve si la
 * pidió. Al dar el código la pantalla se vuelve a abrir y lee otra vez
 */
export async function requestSecondFactor(): Promise<boolean> {
  const role = usePreferences.getState().role;
  if (!needsMfaRole(role) || !isFeatureEnabled('requireMfa')) return false;
  const cloud = await loadCloud();
  if (!cloud) return false;
  const status = await readMfaStatus(cloud);
  const access = useAccess.getState();
  if (status.kind === 'challenge') {
    access.setMfa({ status: 'challenge', factorId: status.factorId });
    return true;
  }
  if (status.kind === 'enroll') {
    access.setMfa({ status: 'enroll' });
    return true;
  }
  return false;
}

/** Para pasar como onForbidden. No espera, la pantalla sigue con su aviso mientras tanto */
export const askSecondFactor = () => {
  void requestSecondFactor();
};
