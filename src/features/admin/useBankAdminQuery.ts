// Una lectura del admin contra las funciones del banco (B11), con su carga, su falla y su recarga. Un
// 42501 de una función admin_* con B9 lleva a la pantalla del código del segundo factor (onForbidden).
import type { SupabaseClient } from '@supabase/supabase-js';
import { useCloud } from '@/app/cloudState';
import { loadCloud } from '@/data/cloud/client';
import { EditorialError } from '@/data/editorial/editorialRepo';
import { askSecondFactor } from '../physician/secondFactor';
import { useRepoQuery } from '../physician/useRepoQuery';

/** El cliente de la nube o un error de red, para las acciones de las pantallas del admin */
export async function requireCloud(): Promise<SupabaseClient> {
  const cloud = await loadCloud();
  if (!cloud) throw new EditorialError('network');
  return cloud;
}

/** Lee con load mientras la cuenta de la nube está conectada. key cambia lo que se lee */
export function useBankAdminQuery<T>(
  load: (cloud: SupabaseClient, onForbidden: () => void) => Promise<T>,
  key: string,
) {
  const linked = useCloud((store) => store.state.status === 'linked');
  return useRepoQuery(async () => load(await requireCloud(), askSecondFactor), key, linked);
}
