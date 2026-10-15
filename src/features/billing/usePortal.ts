// Abrir el portal de Stripe desde Suscripción, con su flujo si lo hay (B10, 2.3). Lo usan Administrar
// suscripción y los botones Cambiar a Anual y Cambiar a Mensual de las tarjetas de planes (3.1.1).
import { useState } from 'react';
import { loadCloud } from '@/data/cloud/client';
import { openBillingPortal, type PortalFlow } from '@/data/payments/portal';
import { billingCloudText as text } from '@/i18n/billingCloud';

const assign = (url: string) => {
  window.location.assign(url);
};

/** Abre el portal. busy mientras pide la dirección y error si no pudo */
export function usePortal(open: (url: string) => void = assign) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const go = async (flow?: PortalFlow) => {
    setError(null);
    setBusy(true);
    const cloud = await loadCloud();
    if (!cloud) {
      setBusy(false);
      setError(text.portal.errors.failed);
      return;
    }
    const result = await openBillingPortal(cloud, flow ? { flow } : {});
    if (result.ok) {
      open(result.url);
      return;
    }
    setBusy(false);
    setError(text.portal.errors[result.reason]);
  };
  return { busy, error, go };
}
