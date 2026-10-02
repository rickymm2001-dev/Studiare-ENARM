// Estado de la cuenta en la nube (D-075). Escucha la sesión de Supabase, une la cuenta con el
// perfil local, abre la sesión y aplica el rol que da el servidor. En la demostración no hace nada.
import { useEffect } from 'react';
import { readCloudIdentity, recordPrivacyAcceptance } from '@/data/cloud/account';
import { getCloud } from '@/data/cloud/client';
import { useDataApi } from '@/data/context';
import { linkCloudIdentity, pushLocalAccount } from '@/data/usecases/cloudLink';
import { PRIVACY_NOTICE_VERSION } from '@/data/usecases/profile';
import { useCloud } from './cloudState';
import { usePreferences } from './preferences';

/** Va dentro de DataProvider. No pinta nada */
export function CloudBridge() {
  const api = useDataApi();
  const signIn = usePreferences((state) => state.signIn);
  const setRole = usePreferences((state) => state.setRole);
  const setCloud = useCloud((store) => store.set);

  useEffect(() => {
    const cloud = getCloud();
    if (!cloud || api.repos.kind !== 'real') return;
    const run = { active: true };
    const stopped = () => !run.active;
    const sync = async () => {
      try {
        const identity = await readCloudIdentity(cloud);
        if (stopped()) return;
        if (!identity) {
          setCloud({ status: 'signed-out' });
          return;
        }
        const userId = await linkCloudIdentity(api, identity);
        if (stopped()) return;
        signIn(userId);
        setRole(identity.role);
        setCloud({ status: 'linked', identity });
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
      data.subscription.unsubscribe();
    };
  }, [api, signIn, setRole, setCloud]);

  return null;
}
