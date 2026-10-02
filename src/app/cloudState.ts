// Estado de la cuenta en la nube (D-075). Lo actualiza CloudBridge y lo leen las pantallas.
import { create } from 'zustand';
import type { CloudIdentity } from '@/data/cloud/account';
import { getCloud } from '@/data/cloud/client';
import type { DataApi } from '@/data/context';
import { pushLocalAccount } from '@/data/usecases/cloudLink';

export type CloudState =
  | { status: 'off' }
  | { status: 'checking' }
  | { status: 'signed-out' }
  | { status: 'linked'; identity: CloudIdentity }
  | { status: 'error' };

export const useCloud = create<{ state: CloudState; set: (state: CloudState) => void }>()(
  (set) => ({
    state: getCloud() ? { status: 'checking' } : { status: 'off' },
    set: (state) => {
      set({ state });
    },
  }),
);

/** Sube alias y datos de cuenta si hay cuenta en la nube conectada. No hace nada sin ella */
export async function pushAccountIfLinked(api: Pick<DataApi, 'repos'>, userId: string) {
  const state = useCloud.getState().state;
  const cloud = getCloud();
  if (!cloud || state.status !== 'linked') return;
  await pushLocalAccount(api, cloud, state.identity.authId, userId);
}
