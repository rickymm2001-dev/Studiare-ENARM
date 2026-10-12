// Marco de la app. Salto al contenido, encabezado, aviso sin conexión, contenido y navegación.
import { FlaskConical, Menu, WifiOff } from 'lucide-react';
import { lazy, Suspense, useEffect, useRef } from 'react';
import { Link, Outlet, useLocation } from 'react-router';
import logoDarkUrl from '@/assets/brand/studiare-logo-dark.png';
import logoUrl from '@/assets/brand/studiare-logo.png';
import { t } from '@/i18n/es-MX';
import { cn } from '@/ui/cn';
import { useOnlineStatus } from '@/ui/hooks/use-online-status';
import { useApplyAppearance } from '@/ui/appearance';
import { useApplyTheme } from '@/ui/theme';
import { HOME_BY_ROLE, NAV_BY_ROLE } from '../navigation';
import { screenPath } from '../screens';
import { useSession } from '../session';
import { usePreferences } from '../preferences';
import { BottomNav, NAV_ID } from './BottomNav';
import { ConfigUpdateNotice } from './ConfigUpdateNotice';
import { NoticeUpdateNotice } from './NoticeUpdateNotice';
import { DeviceLimitNotice } from './DeviceLimitNotice';
import { OrganizationSync } from './OrganizationSync';
import { OtherDeviceNotice } from './OtherDeviceNotice';
import { PwaUpdatePrompt } from './PwaUpdatePrompt';
import { TopBarContext } from './TopBarContext';

// El aviso de insignias trae el cálculo de logros, que no hace falta para pintar la primera pantalla
const BadgeToast = lazy(() =>
  import('./BadgeToast').then((module) => ({ default: module.BadgeToast })),
);

export function AppShell() {
  const theme = usePreferences((state) => state.theme);
  const role = usePreferences((state) => state.role);
  const database = usePreferences((state) => state.database);
  const setDatabase = usePreferences((state) => state.setDatabase);
  const navCollapsed = usePreferences((state) => state.navCollapsed);
  const setNavCollapsed = usePreferences((state) => state.setNavCollapsed);
  useApplyTheme(theme);
  useApplyAppearance(usePreferences((state) => state.appearance));
  const online = useOnlineStatus();
  useFocusHeadingOnNavigation();
  // La bienvenida es una página aparte, sin navegación ni riel lateral
  const { pathname } = useLocation();
  const session = useSession();
  // Sin sesión, el aviso de privacidad y los términos también van sin navegación
  const legal = pathname === screenPath('privacyNotice') || pathname === screenPath('terms');
  const bare =
    pathname === screenPath('onboarding') ||
    ((pathname === screenPath('home') || legal) && session.status === 'signed-out');
  // Con el menú lateral oculto el contenido usa todo el ancho (D-117)
  const rail = bare || navCollapsed ? '' : 'lg:pl-rail';

  return (
    <div className="min-h-dvh text-fg">
      <a
        href="#contenido"
        className="sr-only z-50 rounded-md bg-primary px-4 py-2 text-primary-fg focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        {t.app.skipToContent}
      </a>

      {/* En el teléfono una barra delgada con el logo. En computadora es la barra blanca de arriba,
          con el botón que oculta o muestra el menú lateral, el símbolo de Studiare y, encima, el
          título de la pantalla con la racha y el nivel, que pone ScreenHeader (D-117) */}
      <header
        className={cn(
          'sticky top-0 z-20 border-b border-line bg-surface/95 backdrop-blur',
          !bare && 'lg:h-topbar lg:bg-surface lg:backdrop-blur-none',
        )}
      >
        <div
          className={cn(
            'flex min-h-12 items-center gap-2 px-4 py-1.5',
            !bare && 'lg:h-full lg:gap-0 lg:p-0',
          )}
        >
          {bare ? null : (
            <button
              type="button"
              aria-label={t.nav.toggle}
              aria-expanded={!navCollapsed}
              aria-controls={NAV_ID}
              title={navCollapsed ? t.nav.show : t.nav.hide}
              onClick={() => {
                setNavCollapsed(!navCollapsed);
              }}
              className="hidden h-full w-rail shrink-0 items-center justify-center bg-primary text-primary-fg transition-colors hover:bg-primary-hover lg:flex [&_svg]:size-7"
            >
              <Menu aria-hidden strokeWidth={2.4} />
            </button>
          )}
          <Link
            to={HOME_BY_ROLE[role]}
            className={cn(
              'mr-auto shrink-0 rounded-sm',
              !bare && 'lg:mr-0 lg:flex lg:w-topbar-logo lg:items-center lg:justify-center',
            )}
          >
            {/* Logo de Studiare. En modo oscuro se usa la versión con letras blancas. En la barra de
                computadora va solo el símbolo, junto al botón del menú */}
            <img
              src={logoUrl}
              alt={t.app.logoAlt}
              width={148}
              height={32}
              className={cn('h-6 w-auto sm:h-8 dark:hidden', !bare && 'lg:hidden')}
            />
            <img
              src={logoDarkUrl}
              alt={t.app.logoAlt}
              width={148}
              height={32}
              className={cn(
                'hidden h-6 w-auto sm:h-8 dark:block',
                !bare && 'lg:hidden dark:lg:hidden',
              )}
            />
            {bare ? null : (
              <img
                src={`${import.meta.env.BASE_URL}favicon-64x64.png`}
                alt={t.app.logoAlt}
                width={64}
                height={64}
                className="hidden size-9 lg:block"
              />
            )}
          </Link>
        </div>
      </header>

      {/* Aviso de demostración en una sola línea delgada. Es la etiqueta visible de Datos
          simulados para toda la pantalla, así que las pantallas ya no repiten la suya (D-078) */}
      {database === 'demo' ? (
        <section
          aria-label={t.labels.simulatedData}
          className={`flex items-center justify-center gap-x-3 border-b border-sim-line bg-sim px-4 text-xs text-sim-fg sm:text-sm ${rail}`}
        >
          <span className="flex min-w-0 items-center gap-1.5">
            <FlaskConical aria-hidden className="size-3.5 shrink-0 sm:size-4" />
            <span className="font-mono text-[0.6875rem] font-semibold tracking-[0.12em] uppercase">
              {t.labels.simulatedData}
            </span>
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
        </section>
      ) : null}

      {online ? null : (
        <div
          role="status"
          className={`flex items-center justify-center gap-2 border-b border-line bg-warning-soft px-4 py-2 text-sm text-warning ${rail}`}
        >
          <WifiOff aria-hidden className="size-4" />
          {t.offlineBanner}
        </div>
      )}

      <OtherDeviceNotice className={rail} />
      <DeviceLimitNotice className={rail} />
      <ConfigUpdateNotice className={rail} />
      <NoticeUpdateNotice className={rail} />
      <OrganizationSync />
      <Suspense fallback={null}>
        <BadgeToast />
      </Suspense>

      <div className={rail}>
        <TopBarContext value={!bare}>
          <main
            id="contenido"
            tabIndex={-1}
            className={
              bare
                ? `mx-auto flex ${pathname === screenPath('onboarding') ? 'max-w-reading' : 'max-w-5xl'} flex-col gap-4 px-4 pt-6 pb-10 outline-none`
                : // Medio centímetro (1.25rem) de separación en todos lados (D-117)
                  'flex w-full flex-col gap-5 px-5 pt-5 pb-[calc(var(--spacing-nav)+env(safe-area-inset-bottom)+1.25rem)] outline-none lg:pb-5'
            }
          >
            <Outlet />
          </main>
        </TopBarContext>
      </div>

      {bare ? null : <BottomNav items={NAV_BY_ROLE[role]} collapsed={navCollapsed} />}
      <PwaUpdatePrompt />
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
