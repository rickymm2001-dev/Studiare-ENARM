// Marco de la app. Salto al contenido, encabezado, aviso sin conexión, contenido y navegación.
import { FlaskConical, Info, Search, WifiOff } from 'lucide-react';
import { lazy, Suspense, useEffect, useRef } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router';
import logoDarkUrl from '@/assets/brand/studiare-logo-dark.png';
import { isFeatureEnabled } from '@/config/featureFlags';
import { t } from '@/i18n/core';
import { cn } from '@/ui/cn';
import { useOnlineStatus } from '@/ui/hooks/use-online-status';
import { useApplyAppearance } from '@/ui/appearance';
import { useApplyTheme } from '@/ui/theme';
import { useBankNotice } from '@/features/shared/bankNotice';
import { useQuestionSourceKind } from '@/features/shared/questionSourceKind';
import { TourLauncher } from '@/features/tour/TourLauncher';
import { HOME_BY_ROLE, navForRole } from '../navigation';
import { isPublicScreenPath, screenPath } from '../screens';
import { useSession } from '../session';
import { usePreferences } from '../preferences';
import { AccessGate } from './AccessGate';
import { BottomNav } from './BottomNav';
import { ConfigUpdateNotice } from './ConfigUpdateNotice';
import { NoticeUpdateNotice } from './NoticeUpdateNotice';
import { DeviceLimitNotice } from './DeviceLimitNotice';
import { MovedNoticeLauncher } from './MovedNoticeLauncher';
import { OAuthErrorNotice } from './OAuthErrorNotice';
import { OrganizationSync } from './OrganizationSync';
import { OtherDeviceNotice } from './OtherDeviceNotice';
import { PwaUpdatePrompt } from './PwaUpdatePrompt';
import { SyncVersionNotice } from './SyncVersionNotice';
import { SurveyNoticeLauncher } from './SurveyNoticeLauncher';
import { HeaderStats } from './HeaderStats';
import { TopNav } from './TopNav';

// El aviso de una sesión con menos preguntas se carga solo cuando hay aviso (B11, 5.4). Si su archivo
// no llega, como sin red antes de que el service worker lo guarde, no se ve, pero la pantalla sigue
const BankNoticeBanner = lazy(() =>
  import('@/features/shared/BankNoticeBanner').then(
    (module) => ({ default: module.BankNoticeBanner }),
    () => ({ default: () => null }),
  ),
);

export function AppShell() {
  const theme = usePreferences((state) => state.theme);
  const role = usePreferences((state) => state.role);
  const database = usePreferences((state) => state.database);
  const setDatabase = usePreferences((state) => state.setDatabase);
  useApplyTheme(theme);
  useApplyAppearance(usePreferences((state) => state.appearance));
  const online = useOnlineStatus();
  const navigate = useNavigate();
  useFocusHeadingOnNavigation();
  // La bienvenida es una página aparte, sin navegación ni riel lateral
  const { pathname } = useLocation();
  const session = useSession();
  // Sin sesión, el aviso de privacidad, los términos y la baja de los recordatorios (B15) también van sin
  // navegación. La lista de pantallas públicas vive en screens.ts
  const legal = isPublicScreenPath(pathname);
  const bare =
    pathname === screenPath('onboarding') ||
    ((pathname === screenPath('home') || legal) && session.status === 'signed-out');
  // La portada de venta ocupa todo el ancho y pone sus propios márgenes (D-149)
  const landing = pathname === screenPath('home') && session.status === 'signed-out';
  // Mientras el banco es de demostración, un aviso global en lugar de etiquetas por pantalla (4.1). Con
  // el banco de la nube se va solo, sin que haga falta apagar demoBank (B11, 5.1)
  const sourceKind = useQuestionSourceKind();
  const demoBank = isFeatureEnabled('demoBank') && sourceKind === 'local';
  const bankNotice = useBankNotice((state) => state.notice !== null);

  return (
    <div className="min-h-dvh text-fg">
      <a
        href="#contenido"
        className="sr-only z-50 rounded-md bg-primary px-4 py-2 text-primary-fg focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        {t.app.skipToContent}
      </a>

      {/* La barra pizarra de la portada, por dentro (D-150). El logo blanco, el buscador que lleva a
          Buscar tarjetas, las secciones en línea con Más, la racha y el chip del alumno. En el
          teléfono quedan el logo y los chips, y el menú va en el dock de abajo. La portada trae su
          propia barra con la marca (D-149), así que aquí no va otra */}
      {landing ? null : (
        <header className="glass sticky top-0 z-20 [--enarm-surface:var(--enarm-slate)] text-slate-fg">
          <div
            className={cn(
              'mx-auto flex min-h-14 w-full max-w-content items-center gap-3 px-5 py-1.5 lg:gap-4 lg:px-8',
              !bare && 'lg:min-h-topbar',
            )}
          >
            <Link to={HOME_BY_ROLE[role]} className="shrink-0 rounded-sm">
              {/* Sobre la pizarra va siempre la versión con letras blancas */}
              <img
                src={logoDarkUrl}
                alt={t.app.logoAlt}
                width={148}
                height={32}
                className="h-6 w-auto sm:h-7"
              />
            </Link>
            {bare ? null : (
              <>
                <form
                  role="search"
                  className="hidden min-w-0 flex-[0_1_15rem] items-center gap-2 rounded-full bg-white/12 px-3.5 lg:flex"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const query = new FormData(event.currentTarget).get('q');
                    const q = typeof query === 'string' ? query.trim() : '';
                    void navigate(
                      q
                        ? `${screenPath('explore')}?q=${encodeURIComponent(q)}`
                        : screenPath('explore'),
                    );
                  }}
                >
                  <Search aria-hidden className="size-4 shrink-0 text-slate-muted" />
                  <input
                    type="search"
                    name="q"
                    aria-label={t.nav.search}
                    placeholder={t.nav.searchPlaceholder}
                    className="min-h-10 min-w-0 flex-1 bg-transparent text-sm text-slate-fg outline-none placeholder:text-slate-muted"
                  />
                </form>
                <TopNav nav={navForRole(role)} />
                <div className="ml-auto flex shrink-0 items-center gap-2 lg:ml-0">
                  <HeaderStats />
                </div>
              </>
            )}
          </div>
        </header>
      )}

      {/* Un solo aviso global en una línea delgada (4.1 del plan, D-121). Con el banco de
          demostración dice Versión de demostración y se va con el banco real. Con la base de
          demostración dice además Datos simulados para toda la pantalla (D-078), en la misma línea
          para no apilar dos avisos, y la región conserva ese nombre */}
      {database === 'demo' || (demoBank && !bare) ? (
        <section
          aria-label={database === 'demo' ? t.labels.simulatedData : t.labels.demoVersion}
          className={cn(
            // En el teléfono el botón de volver pasa abajo y el renglón de arriba toma aire
            'flex min-h-8 flex-wrap items-center justify-center gap-x-3 border-b px-4 pt-1 text-xs sm:pt-0 sm:text-sm',
            database === 'demo'
              ? 'border-sim-line bg-sim text-sim-fg'
              : 'border-demo-line bg-demo text-demo-fg',
          )}
        >
          {/* Sin sesión no hay aviso del banco */}
          {demoBank && !bare ? (
            <span className="flex min-w-0 items-center gap-1.5">
              <Info aria-hidden className="size-3.5 shrink-0 sm:size-4" />
              <span className="font-semibold">{t.labels.demoVersion}</span>
              {database === 'demo' ? null : (
                <span className="sr-only sm:not-sr-only sm:truncate">
                  {t.labels.demoVersionHint}
                </span>
              )}
            </span>
          ) : null}
          {database === 'demo' ? (
            <>
              <span className="flex min-w-0 items-center gap-1.5">
                <FlaskConical aria-hidden className="size-3.5 shrink-0 sm:size-4" />
                <span className="font-semibold">{t.labels.simulatedData}</span>
                <span className="sr-only sm:not-sr-only sm:truncate">{t.database.banner}</span>
              </span>
              <button
                type="button"
                className="min-h-8 shrink-0 rounded-sm px-1 font-semibold underline underline-offset-4"
                onClick={() => {
                  setDatabase('real');
                }}
              >
                {t.database.backToReal}
              </button>
            </>
          ) : null}
        </section>
      ) : null}

      {online ? null : (
        <div
          role="status"
          className={`flex items-center justify-center gap-2 border-b border-line bg-warning-soft px-4 py-2 text-sm text-warning`}
        >
          <WifiOff aria-hidden className="size-4" />
          {t.offlineBanner}
        </div>
      )}

      {/* Una región viva siempre presente para que el aviso se anuncie al llegar. Con aria-live y no
          con role status, para no sumar un estado vacío a cada pantalla */}
      <div aria-live="polite" aria-atomic="true">
        {bankNotice ? (
          <Suspense fallback={null}>
            <BankNoticeBanner />
          </Suspense>
        ) : null}
      </div>
      <OtherDeviceNotice />
      <DeviceLimitNotice />
      <OAuthErrorNotice />
      <ConfigUpdateNotice />
      <NoticeUpdateNotice />
      {/* La mudanza de la demo de GitHub Pages (B17). Sin las variables del build no pinta ni baja nada */}
      <MovedNoticeLauncher />
      {/* La encuesta de los primeros días (B18). Solo baja algo para un alumno con la nube, fuera de estudiar */}
      <SurveyNoticeLauncher />
      <OrganizationSync />

      <div>
        <main
          id="contenido"
          tabIndex={-1}
          className={
            landing
              ? 'flex w-full flex-col outline-none'
              : bare
                ? `mx-auto flex ${pathname === screenPath('onboarding') ? 'max-w-reading' : 'max-w-5xl'} flex-col gap-4 px-4 pt-6 pb-10 outline-none`
                : // Los márgenes de la portada, 1280 px de ancho con 32 px a los lados (D-150)
                  'mx-auto flex w-full max-w-content flex-col gap-6 px-5 pt-6 pb-[calc(var(--spacing-nav)+env(safe-area-inset-bottom)+1.5rem)] outline-none lg:px-8 lg:pt-8 lg:pb-10'
          }
        >
          {/* Segundo factor del equipo y registro de Google por completar (B9) */}
          <AccessGate>
            <Outlet />
          </AccessGate>
        </main>
      </div>

      {bare ? null : <BottomNav nav={navForRole(role)} />}
      <PwaUpdatePrompt />
      <SyncVersionNotice />
      {/* El recorrido guiado (B15). Solo esto va en el JavaScript inicial, el recorrido se baja al empezar */}
      <TourLauncher userId={session.status === 'ready' ? session.user.id : null} />
    </div>
  );
}

/** Al cambiar de pantalla mueve el foco al título, para teclado y lector de pantalla (4.8) */
function useFocusHeadingOnNavigation() {
  const { pathname } = useLocation();
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    const heading = document.querySelector<HTMLElement>('#contenido h1');
    heading?.focus({ preventScroll: false });
  }, [pathname]);
}
