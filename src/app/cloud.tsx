// Estado de la cuenta en la nube (D-075). Escucha la sesión de Supabase, une la cuenta con el
// perfil local, abre la sesión y aplica el rol que da el servidor. También reclama el dispositivo
// y vigila que siga siendo el único activo de la cuenta. En la demostración no hace nada.
import { useEffect } from 'react';
import { readCloudIdentity, recordPrivacyAcceptance } from '@/data/cloud/account';
import { getCloud } from '@/data/cloud/client';
import { forgetDeviceClaim } from '@/data/cloud/device';
import { useDataApi } from '@/data/context';
import { linkCloudIdentity, pushLocalAccount } from '@/data/usecases/cloudLink';
import { PRIVACY_NOTICE_VERSION } from '@/data/usecases/profile';
import { signedOutState, useCloud } from './cloudState';
import { startDeviceGuard, type DeviceGuard } from './deviceGuard';
import { usePreferences } from './preferences';

/** Va dentro de DataProvider. No pinta nada */
export function CloudBridge() {
  const api = useDataApi();
  const signIn = usePreferences((state) => state.signIn);
  const signOut = usePreferences((state) => state.signOut);
  const setRole = usePreferences((state) => state.setRole);
  const setCloud = useCloud((store) => store.set);

  useEffect(() => {
    const cloud = getCloud();
    if (!cloud || api.repos.kind !== 'real') return;
    const run = { active: true };
    const stopped = () => !run.active;

    // Un solo vigilante por cuenta. Supabase repite SIGNED_IN al volver a enfocar la pestaña y
    // cada sync no debe reclamar otra vez ni abrir otra revisión
    let guard: { authId: string; handle: DeviceGuard } | null = null;
    const stopGuard = () => {
      guard?.handle.stop();
      guard = null;
    };
    // Mientras la sesión de la nube termina de cerrarse, un SIGNED_IN rezagado no debe volver a abrir
    // el perfil local ni reclamar la cuenta de nuevo. Se apaga cuando llega el SIGNED_OUT
    let leaving = false;
    const isLeaving = () => leaving;
    // Ganó otro dispositivo. Primero el aviso, luego salir del perfil local, lo que también cierra
    // la sesión de la nube solo en este navegador (signOutCloud usa alcance local)
    const leaveForOtherDevice = () => {
      leaving = true;
      setCloud({ status: 'signed-out', reason: 'other_device' });
      forgetDeviceClaim();
      signOut();
    };

    const sync = async () => {
      try {
        const identity = await readCloudIdentity(cloud);
        if (stopped()) return;
        if (!identity) {
          leaving = false;
          stopGuard();
          forgetDeviceClaim();
          setCloud(signedOutState(useCloud.getState().state));
          return;
        }
        if (isLeaving()) return;
        const userId = await linkCloudIdentity(api, identity);
        if (stopped() || isLeaving()) return;
        signIn(userId);
        setRole(identity.role);
        setCloud({ status: 'linked', identity });
        if (guard?.authId !== identity.authId) {
          stopGuard();
          const handle = startDeviceGuard({
            cloud,
            authId: identity.authId,
            onOtherDevice: leaveForOtherDevice,
          });
          guard = { authId: identity.authId, handle };
          // La primera revisión reclama la cuenta si este navegador acaba de entrar. Si otro
          // dispositivo la tiene, este ya salió y no sube nada a nombre de la cuenta
          if ((await handle.first) === 'other' || stopped()) return;
        }
        await recordPrivacyAcceptance(cloud, identity.authId, PRIVACY_NOTICE_VERSION);
        await pushLocalAccount(api, cloud, identity.authId, userId);
      } catch {
        if (!stopped()) setCloud({ status: 'error' });
      }
    };
    void sync();
    const { data } = cloud.auth.onAuthStateChange((event) => {
      // Supabase pide no esperar llamadas dentro del aviso, así que se agenda aparte
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') {
        setTimeout(() => void sync(), 0);
      }
    });
    return () => {
      run.active = false;
      stopGuard();
      data.subscription.unsubscribe();
    };
  }, [api, signIn, signOut, setRole, setCloud]);

  return null;
}
