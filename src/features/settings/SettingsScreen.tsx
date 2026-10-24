// Configuración (pantalla 27, D-065). Una sola página con tres secciones, Perfil, Apariencia y
// Privacidad, cada una con su subtítulo y una línea entre ellas, sin pestañas (B3 del plan del
// cambio, comentarios 5, 6 y 16). Las anclas #perfil, #apariencia y #privacidad llevan a cada una y
// los enlaces viejos con ?seccion= siguen funcionando. Estudio y Pomodoro pasaron a Ajustes del
// repaso, en Repasar. La base de demostración y su panel pasaron a Datos de demostración del admin y el
// modo de la IA a Costos de IA (5.4). Sin sesión o con la demostración vacía quedan el aviso de las
// demás pantallas y Apariencia. En Perfil también va la tarjeta Invita y gana un mes de los referidos,
// abierta en cualquier plan (4.3 del plan del cambio, B7), y desde B10 Facturas, justo después de Tu
// plan, solo con la cuenta de la nube conectada.
import { LogIn } from 'lucide-react';
import { useEffect, type ReactNode } from 'react';
import { Link, Navigate, useLocation, useSearchParams } from 'react-router';
import { useCloud } from '@/app/cloudState';
import { ScreenHeader } from '@/app/layout/ScreenHeader';
import { screenPath } from '@/app/screens';
import { useSession } from '@/app/session';
import { t } from '@/i18n/es-MX';
import { cn } from '@/ui/cn';
import { Button } from '@/ui/components/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/ui/components/card';
import { scrollToElement } from '@/ui/scroll';
import { LoadingState } from '@/ui/states/states';
import { ReferralCard } from '../party/ReferralCard';
import { AccountDataCard } from '../profile/AccountDataCard';
import { InvoiceRequestCard } from '../profile/InvoiceRequestCard';
import { PlanCard } from '../profile/PlanCard';
import { SessionCard } from '../profile/SessionCard';
import { useSubscription } from '../profile/useSubscription';
import { DemoEmptyCard } from '../shared/DemoEmptyCard';
import type { ReadySession } from '../shared/RequireSession';
import { useAccount } from '../shared/useAccount';
import { AppearanceSettings } from './AppearanceSettings';
import { PrivacySection } from './PrivacySection';
import {
  legacyRedirect,
  requestedSection,
  SETTINGS_SECTIONS,
  type SettingsSection,
} from './sections';

export function SettingsScreen() {
  const session = useSession();
  const [params] = useSearchParams();
  const { hash } = useLocation();
  const seccion = params.get('seccion');
  const redirect = legacyRedirect(seccion);
  const header = (
    <ScreenHeader
      title={t.screens.settings.title}
      description={t.screens.settings.description}
    />
  );
  if (redirect) return <Navigate to={redirect} replace />;
  const target = requestedSection(hash, seccion);
  if (session.status === 'loading') {
    return (
      <>
        {header}
        <LoadingState />
      </>
    );
  }
  if (session.status !== 'ready') {
    return (
      <>
        {header}
        {session.status === 'demo-empty' ? (
          <DemoEmptyCard />
        ) : (
          // El mismo aviso que el resto de las pantallas con sesión, para entrar desde aquí
          <Card aria-labelledby="configuracion-sin-sesion">
            <CardHeader>
              <CardTitle id="configuracion-sin-sesion">{t.session.signedOutTitle}</CardTitle>
              <CardDescription>{t.settingsPage.signedOut.body}</CardDescription>
            </CardHeader>
            <Button asChild className="self-start">
              <Link to={screenPath('onboarding')}>
                <LogIn aria-hidden />
                {t.session.goToWelcome}
              </Link>
            </Button>
          </Card>
        )}
        <SettingsSectionBlock id="apariencia" title={t.settingsPage.sections.appearance} first>
          <AppearanceSettings />
        </SettingsSectionBlock>
        <ScrollToSection target={target === 'apariencia' ? target : null} />
      </>
    );
  }
  return (
    <>
      {header}
      <ReadySettings session={session} target={target} />
    </>
  );
}

/**
 * Las tres secciones con sesión. Se pintan cuando ya cargaron la cuenta y el plan, para que la
 * página no cambie de alto después de llevar al alumno a la sección que pidió
 */
function ReadySettings({
  session,
  target,
}: {
  session: ReadySession;
  target: SettingsSection | null;
}) {
  const account = useAccount(session.user.id);
  const subscription = useSubscription(session.user.id);
  // Los pagos viven en la nube, así que Facturas solo aparece con la cuenta conectada (B10)
  const authId = useCloud((store) =>
    store.state.status === 'linked' ? store.state.identity.authId : null,
  );
  if (account === undefined || subscription === undefined) return <LoadingState />;
  const text = t.settingsPage.sections;
  return (
    // En computadora un índice a la izquierda y las secciones al lado, para no apilar tarjetas con
    // poco contenido en una sola columna (V4-B1)
    <div className="lg:grid lg:grid-cols-[11rem_minmax(0,1fr)] lg:items-start lg:gap-8">
      <nav
        aria-label={t.settingsPage.indexLabel}
        className="sticky top-24 hidden flex-col gap-1 lg:flex"
      >
        {SETTINGS_SECTIONS.map((section) => (
          <a
            key={section}
            href={`#${section}`}
            className="rounded-md px-3 py-2 text-sm font-semibold text-fg-muted hover:bg-muted hover:text-fg"
          >
            {text[SECTION_TITLE[section]]}
          </a>
        ))}
      </nav>
      <div className="flex min-w-0 flex-col gap-5">
        {/* Primero el plan, después tus datos y al final tu sesión (comentarios 5 y 6) */}
        <SettingsSectionBlock id="perfil" title={text.profile} first columns>
          <PlanCard subscription={subscription} />
          {authId ? (
            <InvoiceRequestCard authId={authId} accountEmail={account?.email ?? null} />
          ) : null}
          <ReferralCard headingAs="h3" />
          <AccountDataCard session={session} account={account} />
          <SessionCard session={session} />
        </SettingsSectionBlock>
        <SettingsSectionBlock id="apariencia" title={text.appearance}>
          <AppearanceSettings />
        </SettingsSectionBlock>
        <SettingsSectionBlock id="privacidad" title={text.privacy}>
          <PrivacySection session={session} />
        </SettingsSectionBlock>
      </div>
      <ScrollToSection target={target} />
    </div>
  );
}

const SECTION_TITLE = {
  perfil: 'profile',
  apariencia: 'appearance',
  privacidad: 'privacy',
} as const;

/** Una sección de la página con su subtítulo. Desde la segunda lleva una línea arriba */
function SettingsSectionBlock({
  id,
  title,
  first = false,
  columns = false,
  children,
}: {
  id: SettingsSection;
  title: string;
  first?: boolean;
  /** Las tarjetas de la sección en dos columnas desde lg, para que no queden apiladas con poco contenido */
  columns?: boolean;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-subtitulo`}
      className={cn('flex scroll-mt-24 flex-col gap-3', !first && 'border-t border-line pt-5')}
    >
      <h2 id={`${id}-subtitulo`} className="text-lg font-bold text-fg">
        {title}
      </h2>
      {columns ? (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 lg:items-start">{children}</div>
      ) : (
        children
      )}
    </section>
  );
}

/**
 * Lleva a la sección que pide la dirección cuando ya está pintada. Espera una vuelta para ir después
 * de que el marco mueva el foco al título de la pantalla
 */
function ScrollToSection({ target }: { target: SettingsSection | null }) {
  useEffect(() => {
    if (!target) return;
    const timer = setTimeout(() => {
      scrollToElement(document.getElementById(target));
    }, 0);
    return () => {
      clearTimeout(timer);
    };
  }, [target]);
  return null;
}
