// El método del pase que venció sin pago, para el aviso voucher_expired de my_plan (B10). my_plan solo
// dice que venció, así que se lee de los pagos del alumno, por su permiso por fila. Devuelve undefined
// mientras lo busca, null si no aplica o no se pudo saber, y el método si lo encontró.
import { useEffect, useState } from 'react';
import { useCloud } from '@/app/cloudState';
import { loadCloud } from '@/data/cloud/client';
import { expiredPassMethodOf, listMyPayments, type PassMethod } from '@/data/payments/invoices';

export function useExpiredPassMethod(expired: boolean): PassMethod | null | undefined {
  const authId = useCloud((store) =>
    store.state.status === 'linked' ? store.state.identity.authId : null,
  );
  const key = expired ? authId : null;
  const [found, setFound] = useState<{ key: string; method: PassMethod | null } | null>(null);
  useEffect(() => {
    if (key === null) return;
    let live = true;
    void loadCloud().then(async (cloud) => {
      const result = cloud ? await listMyPayments(cloud, key) : null;
      if (!live) return;
      setFound({ key, method: result?.ok ? expiredPassMethodOf(result.payments) : null });
    });
    return () => {
      live = false;
    };
  }, [key]);
  if (key === null) return null;
  return found?.key === key ? found.method : undefined;
}
