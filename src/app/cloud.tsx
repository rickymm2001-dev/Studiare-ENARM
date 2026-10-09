// Estado de la cuenta en la nube (D-075). Escucha la sesión de Supabase, une la cuenta con el
// perfil local, abre la sesión y aplica el rol que da el servidor. También reclama el dispositivo
// y vigila que siga siendo el único activo de la cuenta. En la demostración no hace nada.
import type { SupabaseClient } from '@supabase/supabase-js';
import { useEffect } from 'react';
import { readCloudIdentity, recordPrivacyAcceptance } from '@/data/cloud/account';
import { cloudConfigured, loadCloud } from '@/data/cloud/client';
import { forgetDeviceClaim } from '@/data/cloud/device';
import { useDataApi } from '@/data/context';
import { runSync } from '@/data/sync/runSync';
import { refreshCloudPlan } from '@/data/payments/cloudPlan';
import { createSupabaseTransport } from '@/data/sync/supabaseTransport';
import { linkCloudIdentity, pushLocalAccount } from '@/data/usecases/cloudLink';
import { PRIVACY_NOTICE_VERSION } from '@/data/usecases/profile';
import { signedOutState, useCloud, type CloudState } from './cloudState';
import { startDeviceGuard, type DeviceGuard } from './deviceGuard';
import { usePreferences } from './preferences';
import { startSyncScheduler, type SyncScheduler } from './syncScheduler';
import { useSyncStatus } from './syncState';

/** Va dentro de DataProvider. No pinta nada */
export function CloudBridge() {
  const api = useDataApi();
  const signIn = usePreferences((state) => state.signIn);
  const signOut = usePreferences((state) => state.signOut);
  const setRole = usePreferences((state) => state.setRole);
  const setCloud = useCloud((store) => store.set);

  useEffect(() => {
    if (!cloudConfigured() || api.repos.kind !== 'real') return;
    const connect = (cloud: SupabaseClient): (() => void) => {
      const run = { active: true };
      const stopped = () => !run.active;

      // Un solo vigilante por cuenta. Supabase repite SIGNED_IN al volver a enfocar la pestaña y
      // cada sync no debe reclamar otra vez ni abrir otra revisión
      let guard: { authId: string; handle: DeviceGuard } | null = null;
      // La sincronización vive mientras viva el vigilante. Si otro dispositivo gana la cuenta o se
      // cierra la sesión, deja de subir y de bajar en el acto (D-095)
      let syncing: { authId: string; handle: SyncScheduler } | null = null;
      const stopSync = () => {
        syncing?.handle.stop();
        syncing = null;
        useSyncStatus.getState().reset();
      };
      const stopGuard = () => {
        guard?.handle.stop();
        guard = null;
        stopSync();
      };
      // Mientras la sesión de la nube termina de cerrarse, un SIGNED_IN rezagado no debe volver a abrir
      // el perfil local ni reclamar la cuenta de nuevo. Se apaga cuando llega el SIGNED_OUT
      let leaving = false;
      const isLeaving = () => leaving;
      // Ganó otro dispositivo, o el servidor no dejó cambiar por el límite diario. Primero el aviso,
      // luego salir del perfil local, lo que también cierra la sesión de la nube solo en este
      // navegador (signOutCloud usa alcance local)
      const leaveWith = (state: CloudState) => {
        leaving = true;
        stopSync();
        setCloud(state);
        forgetDeviceClaim();
        signOut();
      };
      const leaveForOtherDevice = () => {
        leaveWith({ status: 'signed-out', reason: 'other_device' });
      };
      const leaveForDeviceLimit = (retryAt: number | null) => {
        leaveWith({ status: 'signed-out', reason: 'device_limit', retryAt });
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
              onDeviceLimit: leaveForDeviceLimit,
            });
            guard = { authId: identity.authId, handle };
            // La primera revisión reclama la cuenta si este navegador acaba de entrar. Si otro
            // dispositivo la tiene, o el límite diario no dejó cambiar, este ya salió y no sube nada
            // a nombre de la cuenta
            const first = await handle.first;
            if (first.status === 'other' || first.status === 'limit' || stopped()) return;
          }
          await recordPrivacyAcceptance(cloud, identity.authId, PRIVACY_NOTICE_VERSION);
          await pushLocalAccount(api, cloud, identity.authId, userId);
          if (stopped() || isLeaving()) return;
          if (syncing?.authId !== identity.authId) {
            syncing?.handle.stop();
            const status = useSyncStatus.getState();
            const handle = startSyncScheduler({
              run: async () => {
                // El plan lo decide el servidor, así que se refleja aquí en cada ciclo (D-096)
                await refreshCloudPlan(api, cloud, userId);
                return runSync({
                  api,
                  transport: createSupabaseTransport(cloud),
                  userId,
                  authId: identity.authId,
                });
              },
              report: status.set,
            });
            syncing = { authId: identity.authId, handle };
            status.setSyncNow(() => handle.syncNow());
          }
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
    };

    // El SDK de Supabase se baja aparte del JavaScript inicial. Mientras llega, el estado sigue en
    // comprobando, que es como arranca con la nube configurada
    let cancelled = false;
    let disconnect: (() => void) | null = null;
    void loadCloud().then((cloud) => {
      if (cancelled) return;
      if (cloud) disconnect = connect(cloud);
      else setCloud({ status: 'error' });
    });
    return () => {
      cancelled = true;
      disconnect?.();
    };
  }, [api, signIn, signOut, setRole, setCloud]);

  return null;
}
