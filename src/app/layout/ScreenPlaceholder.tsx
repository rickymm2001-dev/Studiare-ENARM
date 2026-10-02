// Pantalla de esqueleto de la Fase A. Cada pantalla real la reemplaza en su fase.
// Con ?estado= se ve cada uno de los cinco estados reutilizables (10.4).
import { Link, useSearchParams } from 'react-router';
import { t } from '@/i18n/es-MX';
import { cn } from '@/ui/cn';
import { Badge } from '@/ui/components/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/ui/components/card';
import { SimulatedDataLabel } from '@/ui/components/labels';
import {
  CalibratingState,
  EmptyState,
  ErrorState,
  LoadingState,
  OfflineState,
} from '@/ui/states/states';
import { SCREEN_KEYS, SCREENS, type ScreenKey } from '../screens';
import { ScreenHeader } from './ScreenHeader';

const PREVIEW_STATES = ['vacio', 'cargando', 'error', 'sin-conexion', 'calibrando'] as const;
type PreviewState = (typeof PREVIEW_STATES)[number];

function parsePreviewState(value: string | null): PreviewState {
  return PREVIEW_STATES.find((state) => state === value) ?? 'vacio';
}

export function ScreenPlaceholder({ screenKey }: { screenKey: ScreenKey }) {
  const screen = SCREENS[screenKey];
  const text = t.screens[screenKey];
  const [searchParams] = useSearchParams();
  const state = parsePreviewState(searchParams.get('estado'));

  return (
    <>
      <ScreenHeader
        title={text.title}
        description={text.description}
        badges={
          <>
            <Badge variant="neutral">{t.phase.skeleton(screen.number, SCREEN_KEYS.length)}</Badge>
            <Badge variant="info">{t.phase.builtIn(screen.phase)}</Badge>
          </>
        }
      />

      <Card aria-labelledby="estados-titulo">
        <CardHeader>
          <CardTitle id="estados-titulo">{t.states.previewLabel}</CardTitle>
        </CardHeader>
        <CardContent>
          <nav aria-label={t.states.previewLabel}>
            <ul className="flex flex-wrap gap-2">
              {PREVIEW_STATES.map((option) => (
                <li key={option}>
                  <Link
                    to={{ search: option === 'vacio' ? '' : `?estado=${option}` }}
                    replace
                    aria-current={option === state ? 'true' : undefined}
                    className={cn(
                      'inline-flex min-h-touch items-center rounded-md border border-line px-3 text-sm font-medium text-fg hover:bg-muted',
                      option === state && 'border-primary bg-primary-soft text-primary',
                    )}
                  >
                    {t.states.previewOptions[option]}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <PreviewState state={state} />
        </CardContent>
      </Card>

      {screenKey === 'home' ? <AllScreensIndex /> : null}
    </>
  );
}

function PreviewState({ state }: { state: PreviewState }) {
  switch (state) {
    case 'vacio':
      return <EmptyState />;
    case 'cargando':
      return <LoadingState />;
    case 'error':
      return <ErrorState onRetry={() => undefined} />;
    case 'sin-conexion':
      return <OfflineState />;
    case 'calibrando':
      // Cifras de ejemplo, por eso llevan la etiqueta de datos simulados (4.6)
      return (
        <div className="flex flex-col items-start gap-2">
          <SimulatedDataLabel />
          <CalibratingState
            current={12}
            target={40}
            unit={t.states.exampleUnit}
            className="w-full"
          />
        </div>
      );
  }
}

/** Índice temporal de todas las pantallas, para recorrer el esqueleto. La Fase C lo reemplaza */
function AllScreensIndex() {
  const entries = Object.entries(SCREENS) as [ScreenKey, (typeof SCREENS)[ScreenKey]][];
  return (
    <Card aria-labelledby="pantallas-titulo">
      <CardHeader>
        <CardTitle id="pantallas-titulo">{t.phase.allScreens}</CardTitle>
      </CardHeader>
      <CardContent>
        <ol className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
          {entries
            .sort(([, a], [, b]) => a.number - b.number)
            .map(([key, screen]) => (
              <li key={key}>
                <Link
                  to={screen.path}
                  className="flex min-h-touch items-center gap-2 rounded-md px-2 text-fg hover:bg-muted"
                >
                  <span className="w-6 text-right text-sm text-fg-muted tabular-nums">
                    {screen.number}
                  </span>
                  {t.screens[key].title}
                </Link>
              </li>
            ))}
        </ol>
      </CardContent>
    </Card>
  );
}
