// Pomodoro en Repasar (9.2, D-062, D-063). Opcional. Empieza como ícono y el alumno lo abre y lo
// arranca si quiere. Píldora a la altura del título, minimizable para no ver el tiempo. Su engrane
// abre Ajustes del repaso en la parte del Pomodoro, el único lugar donde se guardan sus ajustes (B3
// del plan del cambio). Al terminar una fase aparece un aviso con el botón para empezar la siguiente.
import { Maximize2, Minimize2, Pause, Play, Settings2, SkipForward, Timer, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { t } from '@/i18n/es-MX';
import { cn } from '@/ui/cn';
import { Button } from '@/ui/components/button';
import { CheckboxField, TextField } from '@/ui/components/field';
import { SaveBar } from '@/ui/components/save-bar';
import type { ReadySession } from '../shared/RequireSession';
import { formatClock } from './timer';
import { usePomodoro, usePomodoroUi } from './usePomodoro';

export function PomodoroPill({
  session,
  onOpenSettings,
}: {
  session: ReadySession;
  /** Abre Ajustes del repaso en la parte del Pomodoro */
  onOpenSettings: () => void;
}) {
  const pomodoro = usePomodoro(session);
  const { state, left, start, pause, resume, stop } = pomodoro;
  const minimized = usePomodoroUi((ui) => ui.minimized);
  const setMinimized = usePomodoroUi((ui) => ui.setMinimized);
  const isBreak = state.phase !== 'focus';
  const phaseName = t.pomodoro.phases[state.phase];
  const running = state.status === 'running';

  if (minimized) {
    return (
      <button
        type="button"
        onClick={() => {
          setMinimized(false);
        }}
        aria-label={t.pomodoro.show(formatClock(left), phaseName)}
        className="relative flex size-touch items-center justify-center rounded-full border border-line bg-surface shadow-card"
      >
        <Timer
          aria-hidden
          className={cn('size-5', isBreak ? 'text-fg-muted' : 'text-primary-ink')}
        />
        {running ? (
          <span
            aria-hidden
            className={cn(
              'absolute top-1.5 right-1.5 size-2.5 animate-pulse rounded-full',
              isBreak ? 'bg-line-strong' : 'bg-indicator',
            )}
          />
        ) : null}
      </button>
    );
  }

  return (
    <div
      role="group"
      aria-label={t.pomodoro.label}
      className={cn(
        'flex items-center gap-1 rounded-full border bg-surface py-1 pr-1 pl-3 shadow-card',
        isBreak ? 'border-line' : 'border-indicator/30',
      )}
    >
      <span
        aria-hidden
        className={cn(
          'size-2.5 rounded-full',
          isBreak ? 'bg-line-strong' : 'bg-indicator',
          running && 'animate-pulse',
        )}
      />
      <span className="flex flex-col leading-none">
        <span className="font-mono text-lg font-bold tabular-nums" aria-hidden>
          {formatClock(left)}
        </span>
        <span className="text-xs font-semibold tracking-wide text-fg-muted">{phaseName}</span>
      </span>
      <span className="sr-only">{t.pomodoro.remaining(formatClock(left), phaseName)}</span>
      <Button
        variant="ghost"
        size="icon"
        aria-label={
          state.status === 'idle'
            ? t.pomodoro.start
            : running
              ? t.pomodoro.pause
              : t.pomodoro.resume
        }
        onClick={state.status === 'idle' ? start : running ? pause : resume}
      >
        {running ? <Pause aria-hidden /> : <Play aria-hidden />}
      </Button>
      <Button
        variant="ghost"
        size="icon"
        aria-label={t.pomodoro.skip}
        onClick={() => {
          stop(true);
        }}
      >
        <SkipForward aria-hidden />
      </Button>
      <Button variant="ghost" size="icon" aria-label={t.pomodoro.settings} onClick={onOpenSettings}>
        <Settings2 aria-hidden />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        aria-label={t.pomodoro.minimize}
        onClick={() => {
          setMinimized(true);
        }}
      >
        <Minimize2 aria-hidden />
      </Button>
    </div>
  );
}

/** Aviso al terminar una fase, con el botón para empezar la siguiente */
export function PomodoroNotice({ session }: { session: ReadySession }) {
  const message = usePomodoroUi((ui) => ui.message);
  const setMessage = usePomodoroUi((ui) => ui.setMessage);
  const setMinimized = usePomodoroUi((ui) => ui.setMinimized);
  const { state, start } = usePomodoro(session);
  if (!message) return null;
  const isBreak = state.phase !== 'focus';
  return (
    <div
      role="status"
      className={cn(
        'animate-rise flex flex-wrap items-center gap-3 rounded-xl border p-3 shadow-card',
        isBreak ? 'border-line bg-muted' : 'border-indicator/30 bg-primary-soft',
      )}
    >
      <Timer aria-hidden className={cn('size-5', isBreak ? 'text-fg-muted' : 'text-primary-ink')} />
      <p className="flex-1 font-medium">
        {message}. {isBreak ? t.pomodoro.breakTip : t.pomodoro.focusTip}
      </p>
      <Button
        size="sm"
        onClick={() => {
          setMinimized(false);
          start();
        }}
      >
        {isBreak ? <Maximize2 aria-hidden /> : <Play aria-hidden />}
        {isBreak ? t.pomodoro.startBreak : t.pomodoro.startFocus}
      </Button>
      <Button
        variant="ghost"
        size="icon"
        aria-label={t.pomodoro.dismiss}
        onClick={() => {
          setMessage('');
        }}
      >
        <X aria-hidden />
      </Button>
    </div>
  );
}

export function PomodoroSettingsForm({
  value,
  onSave,
  saveBarClassName,
  onDirtyChange,
}: {
  value: ReadySession['settings']['pomodoro'];
  onSave: (next: ReadySession['settings']['pomodoro']) => Promise<void>;
  /** Distancia de la barra de guardar al borde, que dentro de Ajustes del repaso es otra */
  saveBarClassName?: string;
  /** Avisa si hay cambios sin guardar, para preguntar antes de cerrar el panel */
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const [draft, setDraft] = useState(value);
  const [status, setStatus] = useState('');
  const dirty = JSON.stringify(draft) !== JSON.stringify(value);
  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);
  const number = (
    key: 'focusMinutes' | 'shortBreakMinutes' | 'longBreakMinutes' | 'cyclesBeforeLong',
    label: string,
    max: number,
  ) => (
    <TextField
      label={label}
      type="number"
      inputMode="numeric"
      min={1}
      max={max}
      value={String(draft[key])}
      onChange={(event) => {
        setDraft({ ...draft, [key]: Math.min(max, Math.max(1, Number(event.target.value) || 1)) });
        setStatus('');
      }}
    />
  );
  // Sin panel gris propio. Los campos van directo en Ajustes del repaso, sin una caja dentro de otra
  // (H06 de la revisión de B2)
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        void (async () => {
          let next = draft;
          if (
            draft.notifications &&
            typeof Notification !== 'undefined' &&
            Notification.permission !== 'granted'
          ) {
            const permission = await Notification.requestPermission().catch(
              () => 'denied' as const,
            );
            if (permission !== 'granted') {
              next = { ...draft, notifications: false };
              setDraft(next);
              setStatus(t.pomodoro.notificationsDenied);
              await onSave(next);
              return;
            }
          }
          await onSave(next);
          setStatus(t.pomodoro.saved);
        })();
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {number('focusMinutes', t.pomodoro.focusMinutes, 180)}
        {number('shortBreakMinutes', t.pomodoro.shortBreakMinutes, 60)}
        {number('longBreakMinutes', t.pomodoro.longBreakMinutes, 90)}
        {number('cyclesBeforeLong', t.pomodoro.cyclesBeforeLong, 12)}
      </div>
      <CheckboxField
        label={t.pomodoro.sound}
        checked={draft.sound}
        onChange={(event) => {
          setDraft({ ...draft, sound: event.target.checked });
          setStatus('');
        }}
      />
      <CheckboxField
        label={t.pomodoro.notifications}
        hint={t.pomodoro.notificationsHint}
        checked={draft.notifications}
        onChange={(event) => {
          setDraft({ ...draft, notifications: event.target.checked });
          setStatus('');
        }}
      />
      <SaveBar
        dirty={dirty}
        status={status}
        className={saveBarClassName}
        onDiscard={() => {
          setDraft(value);
          setStatus('');
        }}
      />
    </form>
  );
}
