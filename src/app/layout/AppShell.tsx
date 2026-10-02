// Marco de la app. Salto al contenido, encabezado, aviso sin conexión, contenido y navegación.
import { FlaskConical, WifiOff } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { Link, Outlet, useLocation } from 'react-router';
import { AiModeBadge } from '@/ai/AiModeBadge';
import { useAiStatus } from '@/ai/useAiStatus';
import { t } from '@/i18n/es-MX';
import { useOnlineStatus } from '@/ui/hooks/use-online-status';
import { useApplyTheme } from '@/ui/theme';
import { HOME_BY_ROLE, NAV_BY_ROLE } from '../navigation';
import { usePreferences } from '../preferences';
import { BottomNav } from './BottomNav';
import { PwaUpdatePrompt } from './PwaUpdatePrompt';

export function AppShell() {
  const theme = usePreferences((state) => state.theme);
  const role = usePreferences((state) => state.role);
  const database = usePreferences((state) => state.database);
  const setDatabase = usePreferences((state) => state.setDatabase);
  useApplyTheme(theme);
  const online = useOnlineStatus();
  const aiStatus = useAiStatus();
  useFocusHeadingOnNavigation();

  return (
    <div className="min-h-dvh bg-canvas text-fg">
      <a
        href="#contenido"
        className="sr-only z-50 rounded-md bg-primary px-4 py-2 text-primary-fg focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        {t.app.skipToContent}
      </a>

      <header className="sticky top-0 z-10 border-b border-line bg-surface/95 backdrop-blur lg:pl-rail">
        <div className="mx-auto flex min-h-14 max-w-reading flex-wrap items-center gap-2 px-4 py-2">
          <Link to={HOME_BY_ROLE[role]} className="mr-auto rounded-sm font-semibold text-fg">
            {t.app.name}
          </Link>
          <AiModeBadge status={aiStatus} />
        </div>
      </header>

      {database === 'demo' ? (
        <div
          role="note"
          className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-b border-sim-line bg-sim px-4 py-2 text-sm text-sim-fg lg:pl-rail"
        >
          <span className="flex items-center gap-2 font-semibold">
            <FlaskConical aria-hidden className="size-4" />
            {t.labels.simulatedData}
          </span>
          <span>{t.database.banner}</span>
          <button
            type="button"
            className="min-h-touch rounded-sm px-2 font-semibold underline underline-offset-4"
            onClick={() => {
              setDatabase('real');
            }}
          >
            {t.database.backToReal}
          </button>
        </div>
      ) : null}

      {online ? null : (
        <div
          role="status"
          className="flex items-center justify-center gap-2 border-b border-line bg-warning-soft px-4 py-2 text-sm text-warning lg:pl-rail"
        >
          <WifiOff aria-hidden className="size-4" />
          {t.offlineBanner}
        </div>
      )}

      <div className="lg:pl-rail">
        <main
          id="contenido"
          tabIndex={-1}
          className="mx-auto flex max-w-reading flex-col gap-4 px-4 pt-4 pb-[calc(var(--spacing-nav)+env(safe-area-inset-bottom)+1.5rem)] outline-none lg:pb-10"
        >
          <Outlet />
        </main>
      </div>

      <BottomNav items={NAV_BY_ROLE[role]} />
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
