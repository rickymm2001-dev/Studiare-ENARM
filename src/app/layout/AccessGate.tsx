// Lo que falta para entrar de lleno, antes de cualquier pantalla (B9 del plan del cambio). Una cuenta de
// Google que no pasó por Crear cuenta confirma su edad y acepta el aviso. Un médico, un admin o el
// dueño da su segundo factor cuando la bandera requireMfa lo pide. Las dos pantallas se bajan solo
// cuando hacen falta. El aviso de privacidad y los términos siempre se pueden leer.
import { lazy, Suspense, type ReactNode } from 'react';
import { useLocation } from 'react-router';
import { t } from '@/i18n/es-MX';
import { LoadingState } from '@/ui/states/states';
import { useAccess } from '../accessState';
import { useCloud } from '../cloudState';
import { screenPath } from '../screens';

const CompleteSignupCard = lazy(() =>
  import('@/features/access/CompleteSignupCard').then((module) => ({
    default: module.CompleteSignupCard,
  })),
);
const MfaCard = lazy(() =>
  import('@/features/access/MfaCard').then((module) => ({ default: module.MfaCard })),
);

export function AccessGate({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const linked = useCloud((store) => store.state.status === 'linked');
  const signupFor = useAccess((store) => store.signupFor);
  const mfa = useAccess((store) => store.mfa);
  const legal = pathname === screenPath('privacyNotice') || pathname === screenPath('terms');
  if (!linked || legal) return children;
  if (signupFor) {
    return (
      <Suspense fallback={<LoadingState />}>
        <CompleteSignupCard userId={signupFor} />
      </Suspense>
    );
  }
  if (mfa.status === 'checking') return <LoadingState label={t.accounts.mfa.checking} />;
  if (mfa.status === 'enroll' || mfa.status === 'challenge') {
    return (
      <Suspense fallback={<LoadingState />}>
        <MfaCard gate={mfa} />
      </Suspense>
    );
  }
  return children;
}
