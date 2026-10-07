// Los cinco estados que toda pantalla debe tener (10.4). Vacío, cargando, error, sin conexión
// y calibrando. Calibrando siempre dice cuánto falta para llegar al umbral (4.3).
import { CircleAlert, Gauge, Inbox, LoaderCircle, WifiOff } from 'lucide-react';
import type { ReactNode } from 'react';
import { t } from '@/i18n/es-MX';
import { cn } from '@/ui/cn';
import { Button } from '@/ui/components/button';
import { ProgressBar } from '@/ui/components/progress-bar';

interface StateFrameProps {
  icon: ReactNode;
  title: string;
  description?: string | undefined;
  tone?: 'neutral' | 'danger' | 'info';
  children?: ReactNode;
  role?: 'status' | 'alert';
  className?: string | undefined;
}

function StateFrame({
  icon,
  title,
  description,
  tone = 'neutral',
  children,
  role,
  className,
}: StateFrameProps) {
  return (
    <div
      role={role}
      className={cn(
        'flex flex-col items-center gap-3 rounded-lg border border-dashed border-line bg-surface px-4 py-8 text-center',
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          'flex size-12 items-center justify-center rounded-full [&_svg]:size-6',
          tone === 'danger' && 'bg-danger-soft text-danger',
          tone === 'info' && 'bg-primary-soft text-primary',
          tone === 'neutral' && 'bg-muted text-fg-muted',
        )}
      >
        {icon}
      </span>
      <p className="text-lg font-semibold text-fg">{title}</p>
      {description ? <p className="max-w-prose text-fg-muted">{description}</p> : null}
      {children}
    </div>
  );
}

export function EmptyState({
  title = t.states.empty.title,
  description = t.states.empty.description,
  action,
  className,
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <StateFrame icon={<Inbox />} title={title} description={description} className={className}>
      {action}
    </StateFrame>
  );
}

export function LoadingState({
  label = t.states.loading.label,
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn('flex flex-col gap-3 rounded-lg border border-line bg-surface p-4', className)}
    >
      <span className="flex items-center gap-2 text-fg-muted">
        <LoaderCircle aria-hidden className="size-5 animate-spin" />
        {label}
      </span>
      <span aria-hidden className="h-4 w-3/4 animate-pulse rounded-sm bg-muted" />
      <span aria-hidden className="h-4 w-1/2 animate-pulse rounded-sm bg-muted" />
      <span aria-hidden className="h-4 w-2/3 animate-pulse rounded-sm bg-muted" />
    </div>
  );
}

export function ErrorState({
  title = t.states.error.title,
  description = t.states.error.description,
  onRetry,
  className,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <StateFrame
      role="alert"
      tone="danger"
      icon={<CircleAlert />}
      title={title}
      description={description}
      className={className}
    >
      {onRetry ? (
        <Button variant="secondary" onClick={onRetry}>
          {t.states.error.retry}
        </Button>
      ) : null}
    </StateFrame>
  );
}

export function OfflineState({
  description = t.states.offline.description,
  className,
}: {
  description?: string;
  className?: string;
}) {
  return (
    <StateFrame
      role="status"
      icon={<WifiOff />}
      title={t.states.offline.title}
      description={description}
      className={className}
    />
  );
}

interface CalibratingStateProps {
  /** Datos que ya hay, por ejemplo 12 */
  current: number;
  /** Umbral de la sección 12, por ejemplo 40 */
  target: number;
  /** Unidad en plural, por ejemplo errores etiquetados */
  unit: string;
  title?: string;
  description?: string;
  className?: string;
}

export function CalibratingState({
  current,
  target,
  unit,
  title = t.states.calibrating.title,
  description = t.states.calibrating.description,
  className,
}: CalibratingStateProps) {
  const missing = Math.max(target - current, 0);
  const progressLabel = t.states.calibrating.progress(Math.min(current, target), target, unit);
  return (
    <StateFrame
      role="status"
      tone="info"
      icon={<Gauge />}
      title={title}
      description={description}
      className={className}
    >
      <div className="flex w-full max-w-xs flex-col gap-2">
        <ProgressBar value={current} max={target} label={progressLabel} />
        <p className="text-sm text-fg-muted">{progressLabel}</p>
        <p className="font-semibold text-fg">{t.states.calibrating.remaining(missing, unit)}</p>
      </div>
    </StateFrame>
  );
}

/**
 * Versión corta de calibrando para tarjetas y renglones donde no cabe el cuadro completo. Dice
 * cuánto falta, como pide 4.3, en una sola línea con su barra
 */
export function CalibratingNote({
  current,
  target,
  unit,
  className,
}: {
  current: number;
  target: number;
  unit: string;
  className?: string;
}) {
  const missing = Math.max(target - current, 0);
  const progress = t.states.calibrating.progress(Math.min(current, target), target, unit);
  return (
    <div
      role="status"
      className={cn(
        'flex flex-col gap-1.5 rounded-md bg-primary-soft px-3 py-2 text-sm',
        className,
      )}
    >
      <p className="flex flex-wrap items-center gap-x-2 text-primary">
        <Gauge aria-hidden className="size-4 shrink-0" />
        <span className="font-semibold">{t.states.calibrating.title}</span>
        <span>
          {progress}. {t.states.calibrating.remaining(missing, unit)}
        </span>
      </p>
      <ProgressBar value={current} max={target} label={progress} className="h-1.5" />
    </div>
  );
}
