// Lo que falta para entrar de lleno, antes de cualquier pantalla (B9 del plan del cambio). Un perfil que
// nació sin formulario, por ejemplo al entrar por primera vez desde Ya tengo cuenta con el correo o con
// Google, confirma su edad y acepta el aviso. Un médico, un admin o el dueño da su segundo factor
// cuando la bandera requireMfa lo pide. Mientras se revisa con la nube la app queda tapada y siempre se
// puede cerrar sesión. Las dos pantallas grandes se bajan solo cuando hacen falta. El aviso de
// privacidad, los términos y la bienvenida siempre se pueden ver.
import { LogOut } from 'lucide-react';
import { lazy, Suspense, type ReactNode } from 'react';
import { useLocation } from 'react-router';
import { t } from '@/i18n/core';
import { Button } from '@/ui/components/button';
import { Skeleton } from '@/ui/components/skeleton';
import { ErrorState, LoadingState } from '@/ui/states/states';
import { useAccess } from '../accessState';
import { useCloud } from '../cloudState';
import { usePreferences } from '../preferences';
import { isPublicScreenPath, screenPath } from '../screens';

const CompleteSignupCard = lazy(() =>
  import('@/features/access/CompleteSignupCard').then((module) => ({
    default: module.CompleteSignupCard,
  })),
);
const MfaCard = lazy(() =>
  import('@/features/access/MfaCard').then((module) => ({ default: module.MfaCard })),
);

/** Cerrar sesión mientras la app está tapada, para no quedarse atorado si la red no contesta */
function SignOutButton() {
  const signOut = usePreferences((state) => state.signOut);
  return (
    <Button variant="secondary" className="self-start" onClick={signOut}>
      <LogOut aria-hidden />
      {t.accounts.access.signOut}
    </Button>
  );
}

/** Espera con lo que se revisa a la vista y la salida a la mano */
function Waiting({ label }: { label: string }) {
  return (
    <div className="flex max-w-reading flex-col gap-3">
      <p role="status" aria-live="polite" className="font-semibold text-fg">
        {label}
      </p>
      <Skeleton className="w-3/4" />
      <Skeleton className="w-1/2" />
      <SignOutButton />
    </div>
  );
}

export function AccessGate({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const linked = useCloud((store) => store.state.status === 'linked');
  const signup = useAccess((store) => store.signup);
  const mfa = useAccess((store) => store.mfa);
  const recheck = useAccess((store) => store.recheck);
  // El aviso, los términos y la baja de los recordatorios no se tapan (B15, isPublicScreenPath)
  const legal = isPublicScreenPath(pathname);
  // La bienvenida tampoco se tapa. Ahí se escribe el código del correo y, al unirse la cuenta, lleva a
  // Inicio, donde se pide lo que falte. No muestra nada de la app
  const welcome = pathname === screenPath('onboarding');
  if (!linked || legal || welcome) return children;
  const text = t.accounts.access;
  if (signup.status === 'checking') return <Waiting label={text.checkingSignup} />;
  if (signup.status === 'unknown') {
    return (
      <div className="flex max-w-reading flex-col gap-3">
        <ErrorState
          title={text.unknownTitle}
          description={text.unknownBody}
          {...(recheck ? { onRetry: recheck } : {})}
        />
        <SignOutButton />
      </div>
    );
  }
  if (signup.status === 'required') {
    return (
      <Suspense fallback={<LoadingState />}>
        <CompleteSignupCard userId={signup.userId} />
      </Suspense>
    );
  }
  if (mfa.status === 'checking') return <Waiting label={t.accounts.mfa.checking} />;
  if (mfa.status === 'enroll' || mfa.status === 'challenge') {
    return (
      <Suspense fallback={<LoadingState />}>
        <MfaCard gate={mfa} />
      </Suspense>
    );
  }
  return children;
}
