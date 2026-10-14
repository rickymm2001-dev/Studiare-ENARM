// El permiso de Party y la nube (B7 del plan del cambio, 4.27). Ese permiso es el que deja compartir el
// alias y el XP con los grupos, así que retirarlo saca al alumno de todos sus grupos en la nube. Sin la
// nube conectada no hay nada que hacer, porque la Party de la demostración no comparte nada.
import { useCloud } from '@/app/cloudState';
import { getCloud } from '@/data/cloud/client';
import { stopSharingParty } from '@/data/usecases/partyCloud';

/** Lo que pasa en la nube al dar o retirar el permiso de Party. Si la nube falla, Party lo ofrece después */
export async function afterPartyConsentChange(granted: boolean): Promise<void> {
  if (granted) return;
  const cloud = getCloud();
  if (!cloud || useCloud.getState().state.status !== 'linked') return;
  await stopSharingParty(cloud);
}
