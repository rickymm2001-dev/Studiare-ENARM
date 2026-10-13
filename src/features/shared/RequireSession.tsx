// Muestra la pantalla solo con sesión. Sin sesión invita a entrar y con la demo vacía invita a
// generarla a quien puede y a los demás a volver a Mi cuenta. Así cada pantalla del alumno trabaja
// siempre con un usuario real de la base activa.
import { LogIn } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { ScreenHeader } from '@/app/layout/ScreenHeader';
import { screenPath, type ScreenKey } from '@/app/screens';
import { useSession, type SessionState } from '@/app/session';
import { t } from '@/i18n/es-MX';
import { Button } from '@/ui/components/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/ui/components/card';
import { LoadingState } from '@/ui/states/states';
import { DemoEmptyCard } from './DemoEmptyCard';

export type ReadySession = Extract<SessionState, { status: 'ready' }>;

export function RequireSession({
  screen,
  children,
}: {
  /** Pantalla que se protege. Sin sesión se muestra su título para que nunca falte el h1 */
  screen: ScreenKey;
  children: (session: ReadySession) => ReactNode;
}) {
  const session = useSession();
  const header = (
    <ScreenHeader title={t.screens[screen].title} description={t.screens[screen].description} />
  );
  if (session.status === 'loading') return <LoadingState />;
  if (session.status === 'signed-out') {
    return (
      <>
        {header}
        <Card aria-labelledby="sin-sesion">
          <CardHeader>
            <CardTitle id="sin-sesion">{t.session.signedOutTitle}</CardTitle>
            <CardDescription>{t.session.signedOutBody}</CardDescription>
          </CardHeader>
          <Button asChild className="self-start">
            <Link to={screenPath('onboarding')}>
              <LogIn aria-hidden />
              {t.session.goToWelcome}
            </Link>
          </Button>
        </Card>
      </>
    );
  }
  if (session.status === 'demo-empty') {
    return (
      <>
        {header}
        <DemoEmptyCard />
      </>
    );
  }
  return <>{children(session)}</>;
}
