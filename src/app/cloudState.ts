// Estado de la cuenta en la nube (D-075). Lo actualiza CloudBridge y lo leen las pantallas.
import { create } from 'zustand';
import type { CloudIdentity } from '@/data/cloud/account';
import { getCloud } from '@/data/cloud/client';
import type { DataApi } from '@/data/context';
import { pushLocalAccount } from '@/data/usecases/cloudLink';

/**
 * Por qué la app cerró la sesión sin que el alumno lo pidiera. other_device, ganó otro dispositivo.
 * device_limit, el servidor no dejó cambiar de dispositivo por el límite diario
 */
export type SignOutReason = 'other_device' | 'device_limit';

export type CloudState =
  | { status: 'off' }
  | { status: 'checking' }
  | { status: 'signed-out'; reason?: 'other_device' }
  // retryAt, la hora en milisegundos en que podrá volver a cambiar de dispositivo, o null si no se sabe
  | { status: 'signed-out'; reason: 'device_limit'; retryAt: number | null }
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

/**
 * Estado al quedar sin sesión. Si ya se sabía el motivo, como other_device, lo conserva, porque el
 * aviso de que la sesión se cerró llega antes que el SIGNED_OUT de Supabase y no debe borrarlo
 */
export function signedOutState(previous: CloudState): CloudState {
  return previous.status === 'signed-out' && previous.reason ? previous : { status: 'signed-out' };
}

/** Sube alias y datos de cuenta si hay cuenta en la nube conectada. No hace nada sin ella */
export async function pushAccountIfLinked(api: Pick<DataApi, 'repos'>, userId: string) {
  const state = useCloud.getState().state;
  const cloud = getCloud();
  if (!cloud || state.status !== 'linked') return;
  await pushLocalAccount(api, cloud, state.identity.authId, userId);
}
