// Estado de la cuenta en la nube (D-075). Escucha la sesión de Supabase, une la cuenta con el
// perfil local, abre la sesión y aplica el rol que da el servidor. También reclama el dispositivo
// y vigila que siga siendo el único activo de la cuenta. Desde B9 revisa además si el equipo debe dar
// su segundo factor, si una cuenta de Google debe completar su registro y si Google no dejó entrar.
// En la demostración no hace nada.
import type { SupabaseClient } from '@supabase/supabase-js';
import { useEffect } from 'react';
import { isFeatureEnabled } from '@/config/featureFlags';
import {
  readCloudIdentity,
  recordPrivacyAcceptance,
  type CloudIdentity,
} from '@/data/cloud/account';
import { mirrorRemoteOverrides } from '@/data/cloud/adminSettings';
import { mirrorRemoteFlags } from '@/data/cloud/featureFlags';
import { cloudConfigured, loadCloud } from '@/data/cloud/client';
import { forgetDeviceClaim } from '@/data/cloud/device';
import { needsMfaRole, readMfaStatus } from '@/data/cloud/mfa';
import { readOAuthRedirectError, withoutOAuthError } from '@/data/cloud/oauth';
import { clearPendingSignup, takePendingSignup } from '@/data/cloud/pendingSignup';
import { useDataApi } from '@/data/context';
import { runSync } from '@/data/sync/runSync';
import { refreshCloudPlan } from '@/data/payments/cloudPlan';
import { createSupabaseTransport } from '@/data/sync/supabaseTransport';
import {
  linkCloudIdentity,
  pushLocalAccount,
  signupCompletionNeeded,
} from '@/data/usecases/cloudLink';
import { acceptedNoticeVersion } from '@/data/usecases/profile';
import { useAccess } from './accessState';
import { useConfigUpdate } from './configUpdate';
import { signedOutState, useCloud, type CloudState } from './cloudState';
import { startDeviceGuard, type DeviceGuard } from './deviceGuard';
import { usePreferences } from './preferences';
import { startSyncScheduler, type SyncScheduler } from './syncScheduler';
import { useSyncStatus } from './syncState';

/**
 * Si Google regresó con un error, lo deja para el aviso del marco de la app, olvida lo que el alumno
 * había llenado para registrarse y quita el error de la dirección, para que recargar no lo repita
 */
function takeOAuthRedirectError(): void {
  const error = readOAuthRedirectError(window.location.href);
  if (!error) return;
  useAccess.getState().setOAuthError(error);
  clearPendingSignup();
  const clean = withoutOAuthError(window.location.href);
  if (clean) window.history.replaceState(window.history.state, '', clean);
}

/** Va dentro de DataProvider. No pinta nada */
export function CloudBridge() {
  const api = useDataApi();
  const signIn = usePreferences((state) => state.signIn);
  const signOut = usePreferences((state) => state.signOut);
  const setRole = usePreferences((state) => state.setRole);
  const setCloud = useCloud((store) => store.set);

  useEffect(() => {
    if (!cloudConfigured() || api.repos.kind !== 'real') return;
    takeOAuthRedirectError();
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
        useAccess.getState().resetSession();
        signOut();
      };
      const leaveForOtherDevice = () => {
        leaveWith({ status: 'signed-out', reason: 'other_device' });
      };
      const leaveForDeviceLimit = (retryAt: number | null) => {
        leaveWith({ status: 'signed-out', reason: 'device_limit', retryAt });
      };

      /**
       * Segundo factor del equipo (B9). Con la bandera requireMfa, que lee también el servidor, un
       * médico, un admin o el dueño sin sesión aal2 ve la pantalla del código. Una sesión que ya lo dio
       * no se vuelve a revisar. El alumno nunca
       */
      const checkMfa = async (identity: CloudIdentity, flags: Promise<unknown>) => {
        const access = useAccess.getState();
        await flags;
        if (stopped() || isLeaving()) return;
        if (!needsMfaRole(identity.role) || !isFeatureEnabled('requireMfa')) {
          access.setMfa({ status: 'not-required' });
          return;
        }
        if (useAccess.getState().mfa.status === 'verified') return;
        if (useAccess.getState().mfa.status === 'not-required')
          access.setMfa({ status: 'checking' });
        const status = await readMfaStatus(cloud);
        if (stopped() || isLeaving()) return;
        access.setMfa(
          status.kind === 'challenge'
            ? { status: 'challenge', factorId: status.factorId }
            : { status: status.kind },
        );
      };

      // Reintentos de sync cuando falla, con espera creciente de 15 segundos a 5 minutos
      const retry: { failures: number; timer: ReturnType<typeof setTimeout> | null } = {
        failures: 0,
        timer: null,
      };
      const scheduleRetry = () => {
        if (retry.timer) clearTimeout(retry.timer);
        const wait = Math.min(15_000 * 2 ** retry.failures, 300_000);
        retry.failures += 1;
        retry.timer = setTimeout(() => {
          retry.timer = null;
          void sync();
        }, wait);
      };

      const sync = async () => {
        try {
          // Las banderas de lanzamiento del servidor valen también para quien no ha entrado, porque la
          // tabla las deja leer sin sesión. Mandan sobre el entorno y se aplican al recargar (D-119)
          const flags = mirrorRemoteFlags(cloud).then((result) => {
            if (result === 'changed' && !stopped()) useConfigUpdate.getState().set(true);
          });
          const identity = await readCloudIdentity(cloud);
          if (stopped()) return;
          if (!identity) {
            leaving = false;
            stopGuard();
            forgetDeviceClaim();
            useAccess.getState().resetSession();
            // Sin sesión nadie tiene un rol. Lo que haya en este dispositivo no vale (D-108)
            setRole('student');
            setCloud(signedOutState(useCloud.getState().state));
            return;
          }
          if (isLeaving()) return;
          // Lo que el alumno llenó en Crear cuenta antes de ir a Google solo sirve para una cuenta que
          // entró con Google. Se toma una sola vez y se borra (B9)
          const pending = takePendingSignup();
          const linked = await linkCloudIdentity(
            api,
            identity,
            identity.provider && identity.provider !== 'email' ? pending : null,
          );
          if (stopped() || isLeaving()) return;
          const { userId } = linked;
          signIn(userId);
          setRole(identity.role);
          setCloud({ status: 'linked', identity });
          void checkMfa(identity, flags);
          // La configuración que el admin fijó en el servidor manda sobre la de este navegador. Los
          // motores la leen al abrir la app, así que si cambió se pide recargar
          void mirrorRemoteOverrides(cloud).then((result) => {
            if (result === 'changed' && !stopped()) useConfigUpdate.getState().set(true);
          });
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
          // Antes de subir la cuenta se pone de acuerdo la foto de perfil y los datos opcionales. Gana
          // lo más reciente, así un dispositivo nuevo o uno que se quedó atrás baja lo de la nube (B2, H29)
          await pushLocalAccount(api, cloud, identity.authId, userId);
          if (stopped() || isLeaving()) return;
          // Una cuenta de Google que no pasó por Crear cuenta confirma su edad y acepta el aviso antes
          // de seguir (B9). Su aceptación la registra esa pantalla, no este paso
          const completion = await signupCompletionNeeded(api, cloud, identity, userId);
          if (stopped() || isLeaving()) return;
          useAccess.getState().setSignupFor(completion ? userId : null);
          if (!completion) {
            // Se registra la versión del aviso que el alumno aceptó de verdad en este dispositivo y no
            // la que trae la app ahora. Una versión nueva se registra cuando la acepte (D-104)
            const accepted = await acceptedNoticeVersion(api, userId);
            if (accepted) await recordPrivacyAcceptance(cloud, identity.authId, accepted);
          }
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
              paused: () => useSyncStatus.getState().paused,
            });
            syncing = { authId: identity.authId, handle };
            status.setSyncNow(() => handle.syncNow());
          }
          retry.failures = 0;
        } catch {
          if (stopped()) return;
          // Sin conexión o con el servidor caído. Se queda con el rol de la última vez que se
          // verificó, se avisa que la nube falló y se vuelve a intentar con espera creciente
          setCloud({ status: 'error' });
          scheduleRetry();
        }
      };
      void sync();
      const onOnline = () => {
        retry.failures = 0;
        void sync();
      };
      window.addEventListener('online', onOnline);
      const { data } = cloud.auth.onAuthStateChange((event) => {
        // Supabase pide no esperar llamadas dentro del aviso, así que se agenda aparte
        if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') {
          setTimeout(() => void sync(), 0);
        }
      });
      return () => {
        run.active = false;
        if (retry.timer) clearTimeout(retry.timer);
        window.removeEventListener('online', onOnline);
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
