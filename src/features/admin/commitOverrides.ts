// Guarda los cambios del admin a umbrales, pesos y estimación de costo (Fase G, G3). Con la cuenta
// en la nube conectada se guardan primero en el servidor, para que valgan para todos, y solo si salió
// bien se copian a este navegador. Sin nube, como en la demostración, se guardan en el navegador.
import { useCloud } from '@/app/cloudState';
import { saveRemoteOverrides } from '@/data/cloud/adminSettings';
import { loadCloud } from '@/data/cloud/client';
import { writeStoredOverrides, type StoredOverrides } from '@/config/overridesStore';

/** Devuelve si se guardó. null borra todos los cambios y deja todo de fábrica */
export async function commitOverrides(next: StoredOverrides | null): Promise<boolean> {
  if (useCloud.getState().state.status === 'linked') {
    const cloud = await loadCloud();
    if (!cloud || !(await saveRemoteOverrides(cloud, next))) return false;
  }
  return writeStoredOverrides(next);
}
