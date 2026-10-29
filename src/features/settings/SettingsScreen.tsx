// Configuración (pantalla 27, D-065, D-150). Una sola página al estilo de la portada. Héroe con
// kicker, título en marino y la explicación en cursiva, el índice de secciones en una tarjeta crema a
// la izquierda y las secciones al lado, cada una con su subtítulo y sus tarjetas de 20 px, sin
// pestañas (B3 del plan del cambio, comentarios 5, 6 y 16). Las anclas #perfil, #carga, #apariencia y
// #privacidad llevan a cada una y los enlaces viejos con ?seccion= siguen funcionando. Carga diaria
// solo lee lo que se guarda en Ajustes del repaso, en Repasar, a donde pasaron Estudio y Pomodoro. La
// base de demostración y su panel pasaron a Datos de demostración del admin y el modo de la IA a
// Costos de IA (5.4). Sin sesión o con la demostración vacía quedan el aviso de las demás pantallas y
// Apariencia. En Perfil también va la tarjeta Invita y gana un mes de los referidos, abierta en
// cualquier plan (4.3 del plan del cambio, B7), y desde B10 Facturas, justo después de Tu plan, solo
// con la cuenta de la nube conectada.
import { LogIn, SlidersHorizontal } from 'lucide-react';
import { useEffect, type ReactNode } from 'react';
import { Link, Navigate, useLocation, useSearchParams } from 'react-router';
import { useCloud } from '@/app/cloudState';
import { ScreenHeader } from '@/app/layout/ScreenHeader';
import { screenPath } from '@/app/screens';
import { useSession } from '@/app/session';
import { PLANS } from '@/config/billing';
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
import { reviewSettingsLinkState, reviewSettingsPath } from '../review/settings/panelParam';
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
  // El héroe del diseño. El kicker dice la pantalla y el título de la pestaña sigue siendo Configuración
  const header = (
    <ScreenHeader
      kicker={t.screens.settings.title}
      title={t.settings.heroTitle}
      documentTitle={t.screens.settings.title}
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
          <Card aria-labelledby="configuracion-sin-sesion" lift={false}>
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
        <SettingsSectionBlock id="apariencia" title={t.settingsPage.sections.appearance}>
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
 * Las secciones con sesión. Se pintan cuando ya cargaron la cuenta y el plan, para que la página no
 * cambie de alto después de llevar al alumno a la sección que pidió
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
    // Dos columnas que se acomodan solas. El índice a la izquierda, en crema, y las secciones al lado,
    // como el diseño de Configuración (D-150). En el teléfono el índice queda arriba
    <div className="flex flex-wrap items-start gap-6">
      <SectionIndex />
      <div className="flex min-w-0 flex-[999_1_32rem] flex-col gap-6">
        {/* Primero el plan, después tus datos y al final tu sesión (comentarios 5 y 6) */}
        <SettingsSectionBlock id="perfil" title={text.profile} columns>
          <PlanCard subscription={subscription} />
          {authId ? (
            <InvoiceRequestCard authId={authId} accountEmail={account?.email ?? null} />
          ) : null}
          <ReferralCard headingAs="h3" />
          <AccountDataCard session={session} account={account} />
          <SessionCard session={session} />
        </SettingsSectionBlock>
        <SettingsSectionBlock id="carga" title={t.dailyLoad.title}>
          <DailyLoadCard session={session} />
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

/** El nombre de cada sección en el índice y en su subtítulo */
function sectionTitle(section: SettingsSection): string {
  const text = t.settingsPage.sections;
  switch (section) {
    case 'perfil':
      return text.profile;
    case 'carga':
      return t.dailyLoad.title;
    case 'apariencia':
      return text.appearance;
    case 'privacidad':
      return text.privacy;
  }
}

/**
 * Índice de las secciones en una tarjeta crema. La sección que pide el ancla va en píldora marina con
 * texto blanco y las demás se tiñen de cielo suave al pasar el puntero (D-150). Son anclas de la misma
 * página, así que llevan a la sección real y el navegador guarda el paso
 */
function SectionIndex() {
  const { hash } = useLocation();
  const active = requestedSection(hash, null) ?? SETTINGS_SECTIONS[0];
  return (
    <nav
      aria-label={t.settingsPage.indexLabel}
      className="flex max-w-65 flex-[1_1_13.75rem] flex-col gap-1 rounded-lg border border-line bg-cream p-2 lg:sticky lg:top-24"
    >
      {SETTINGS_SECTIONS.map((section) => {
        const current = section === active;
        return (
          <a
            key={section}
            href={`#${section}`}
            aria-current={current ? 'location' : undefined}
            className={cn(
              'flex min-h-touch items-center rounded-md px-3.5 text-sm font-semibold transition-colors',
              current ? 'bg-primary font-bold text-primary-fg' : 'text-fg hover:bg-primary-soft',
            )}
          >
            {sectionTitle(section)}
          </a>
        );
      })}
    </nav>
  );
}

/**
 * Carga diaria, en crema (D-150). Solo lee los límites que el alumno guardó en Ajustes del repaso, en
 * Repasar, que es donde se cambian, y recuerda el tope real del plan Gratis
 */
function DailyLoadCard({ session }: { session: ReadySession }) {
  const { settings } = session;
  const text = t.settings.dailyLoadCard;
  const freeLimit = PLANS.free.access.dailyQuestions;
  const rows = [
    { label: text.reviews, value: settings.reviewsPerDay.toLocaleString('es-MX') },
    {
      label: text.newCards,
      value: settings.unlimitedNewCards
        ? text.unlimited
        : settings.newCardsPerDay.toLocaleString('es-MX'),
    },
    { label: text.questions, value: settings.questionsPerDay.toLocaleString('es-MX') },
  ];
  return (
    // Sin etiqueta propia. La sección Carga diaria ya es la región que la nombra
    <Card tone="cream" lift={false}>
      <div className="flex flex-col gap-4">
        <dl className="grid gap-3 sm:grid-cols-3">
          {rows.map((row) => (
            <div
              key={row.label}
              className="flex min-w-0 flex-col gap-1 rounded-md border border-line bg-surface px-4 py-3"
            >
              <dt className="text-sm text-fg-muted">{row.label}</dt>
              <dd className="text-2xl font-extrabold tracking-tight text-heading">{row.value}</dd>
            </div>
          ))}
        </dl>
        {freeLimit === null ? null : (
          <p className="text-sm text-fg-muted">{text.freeNote(freeLimit)}</p>
        )}
        <Button asChild variant="secondary" size="sm" className="self-start">
          <Link to={reviewSettingsPath()} state={reviewSettingsLinkState}>
            <SlidersHorizontal aria-hidden />
            {t.settingsPage.reviewSettings.change}
          </Link>
        </Button>
      </div>
    </Card>
  );
}

/** Una sección de la página con su subtítulo, como el título de un grupo de tarjetas del diseño */
function SettingsSectionBlock({
  id,
  title,
  columns = false,
  children,
}: {
  id: SettingsSection;
  title: string;
  /** Las tarjetas de la sección en dos columnas desde lg, para que no queden apiladas con poco contenido */
  columns?: boolean;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-subtitulo`}
      className="flex scroll-mt-24 flex-col gap-3"
    >
      <h2 id={`${id}-subtitulo`} className="group-title">
        {title}
      </h2>
      {columns ? (
        // Cada tarjeta con min-w-0, para que una fila ancha no desborde la página con el texto Muy grande
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:items-start [&>*]:min-w-0">
          {children}
        </div>
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
