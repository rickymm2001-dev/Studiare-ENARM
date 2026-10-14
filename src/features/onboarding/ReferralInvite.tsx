// Llegada con el enlace de un compañero (respuesta 77 del plan del cambio, B7). La bienvenida lee el
// código de /bienvenida?ref=CODIGO, lo guarda en este navegador y lo dice. Se canjea solo al conectar
// la cuenta en la nube (src/app/cloud.tsx), o en el acto si ya estaba conectada y con su registro
// completo. Una cuenta que todavía debe Completa tu registro (B9) lo canjea el puente al terminarlo,
// así no manda nada antes de aceptar el aviso y confirmar su edad. Sin la nube los referidos no
// existen, así que no guarda nada ni muestra el aviso.
import { UserPlus } from 'lucide-react';
import { useEffect } from 'react';
import { useSearchParams } from 'react-router';
import { useAccess } from '@/app/accessState';
import { useCloud } from '@/app/cloudState';
import { cloudConfigured, getCloud } from '@/data/cloud/client';
import {
  redeemPendingReferral,
  referralCodeFromSearch,
  storePendingReferral,
} from '@/data/referrals/pendingReferral';
import { t } from '@/i18n/es-MX';

export function ReferralInvite() {
  const [params] = useSearchParams();
  const code = cloudConfigured() ? referralCodeFromSearch(params.toString()) : null;

  useEffect(() => {
    if (!code) return;
    storePendingReferral(code);
    const cloud = getCloud();
    const signedUp = useAccess.getState().signup.status === 'none';
    if (cloud && useCloud.getState().state.status === 'linked' && signedUp) {
      void redeemPendingReferral(cloud);
    }
  }, [code]);

  if (!code) return null;
  return (
    <p
      role="status"
      className="flex items-start gap-2 rounded-md border border-line bg-surface p-3 text-sm"
    >
      <UserPlus aria-hidden className="mt-0.5 size-4 shrink-0 text-primary-ink" />
      {t.b7.referral.invited(code)}
    </p>
  );
}
