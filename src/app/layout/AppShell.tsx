// Marco de la app. Salto al contenido, encabezado, aviso sin conexión, contenido y navegación.
import { FlaskConical, WifiOff } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { Link, Outlet, useLocation } from 'react-router';
import logoDarkUrl from '@/assets/brand/studiare-logo-dark.png';
import logoUrl from '@/assets/brand/studiare-logo.png';
import { t } from '@/i18n/es-MX';
import { useOnlineStatus } from '@/ui/hooks/use-online-status';
import { useApplyAppearance } from '@/ui/appearance';
import { useApplyTheme } from '@/ui/theme';
import { HOME_BY_ROLE, NAV_BY_ROLE } from '../navigation';
import { screenPath } from '../screens';
import { useSession } from '../session';
import { usePreferences } from '../preferences';
import { BottomNav } from './BottomNav';
import { ConfigUpdateNotice } from './ConfigUpdateNotice';
import { BadgeToast } from './BadgeToast';
import { NoticeUpdateNotice } from './NoticeUpdateNotice';
import { DeviceLimitNotice } from './DeviceLimitNotice';
import { OrganizationSync } from './OrganizationSync';
import { OtherDeviceNotice } from './OtherDeviceNotice';
import { PwaUpdatePrompt } from './PwaUpdatePrompt';

export function AppShell() {
  const theme = usePreferences((state) => state.theme);
  const role = usePreferences((state) => state.role);
  const database = usePreferences((state) => state.database);
  const setDatabase = usePreferences((state) => state.setDatabase);
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
  const rail = bare ? '' : 'lg:pl-rail';

  return (
    <div className="min-h-dvh text-fg">
      <a
        href="#contenido"
        className="sr-only z-50 rounded-md bg-primary px-4 py-2 text-primary-fg focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        {t.app.skipToContent}
      </a>

      {/* En el teléfono una barra delgada con el logo. En computadora el logo va en el riel (D-071) */}
      <header
        className={`sticky top-0 z-10 border-b border-line bg-surface/95 backdrop-blur ${bare ? '' : 'lg:hidden'}`}
      >
        <div className="flex min-h-12 items-center gap-2 px-4 py-1.5">
          <Link to={HOME_BY_ROLE[role]} className="mr-auto shrink-0 rounded-sm">
            {/* Logo de Studiare. En modo oscuro se usa la versión con letras blancas */}
            <img
              src={logoUrl}
              alt={t.app.logoAlt}
              width={148}
              height={32}
              className="h-6 w-auto sm:h-8 dark:hidden"
            />
            <img
              src={logoDarkUrl}
              alt={t.app.logoAlt}
              width={148}
              height={32}
              className="hidden h-6 w-auto sm:h-8 dark:block"
            />
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
      <BadgeToast />

      <div className={rail}>
        <main
          id="contenido"
          tabIndex={-1}
          className={
            bare
              ? `mx-auto flex ${pathname === screenPath('onboarding') ? 'max-w-reading' : 'max-w-5xl'} flex-col gap-4 px-4 pt-6 pb-10 outline-none`
              : 'flex w-full flex-col gap-3 px-4 pt-3 pb-[calc(var(--spacing-nav)+env(safe-area-inset-bottom)+1rem)] outline-none lg:px-6 lg:pt-5 lg:pb-8'
          }
        >
          <Outlet />
        </main>
      </div>

      {bare ? null : <BottomNav items={NAV_BY_ROLE[role]} homePath={HOME_BY_ROLE[role]} />}
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
