// Si la nube ya contestó en esta sesión cuál es el plan del alumno (B8 del plan del cambio). Con la nube
// conectada, un navegador que todavía no guarda el plan que dio la nube, como un dispositivo nuevo, no
// sabe si el alumno paga. Hasta que lo sepa, useActivePlan dice que el plan está cargando, así los
// candados de Gratis no se le muestran a quien sí paga. Cuando my_plan contesta, su plan queda guardado
// aquí y ya no hace falta esperar. Si falla, CloudBridge marca la cuenta como revisada y se usa lo que
// haya en este navegador, para no dejar la carga sin fin.
import { create } from 'zustand';
import type { DataApi } from '@/data/context';

interface PlanCheckStore {
  /** La cuenta de la nube cuyo plan ya no se espera en esta sesión. null si todavía no */
  checkedFor: string | null;
  markChecked: (authId: string) => void;
}

export const usePlanCheck = create<PlanCheckStore>()((set) => ({
  checkedFor: null,
  markChecked: (authId) => {
    set({ checkedFor: authId });
  },
}));

/**
 * Después de preguntar el plan a la nube. Si no quedó guardado un plan de la nube en este navegador,
 * porque my_plan o el guardado fallaron, los candados dejan de esperar. Si quedó, no hace falta marcar
 * nada, y así no hay un instante con los candados de Gratis antes de que se lea el plan guardado
 */
export async function settlePlanCheck(
  api: Pick<DataApi, 'repos'>,
  userId: string,
  authId: string,
): Promise<void> {
  const stored = await api.repos.subscriptions.get(userId).catch(() => undefined);
  if (!stored || stored.isSimulated) usePlanCheck.getState().markChecked(authId);
}
