// Pomodoro en Repasar (9.2, D-062). Píldora compacta a la altura del título que corre mientras el
// alumno estudia y se puede minimizar para no ver el tiempo. Al terminar una fase aparece un aviso
// con el botón para empezar la siguiente. Los ajustes viven en Perfil.
import { Maximize2, Minimize2, Pause, Play, SkipForward, Timer, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { t } from '@/i18n/es-MX';
import { cn } from '@/ui/cn';
import { Button } from '@/ui/components/button';
import { CheckboxField, TextField } from '@/ui/components/field';
import type { ReadySession } from '../shared/RequireSession';
import { formatClock } from './timer';
import { usePomodoro, usePomodoroUi } from './usePomodoro';

export function PomodoroPill({
  session,
  autoStart,
}: {
  session: ReadySession;
  /** Arranca el enfoque solo al empezar a estudiar, si estaba detenido */
  autoStart: boolean;
}) {
  const pomodoro = usePomodoro(session);
  const { state, left, start, pause, resume, stop } = pomodoro;
  const minimized = usePomodoroUi((ui) => ui.minimized);
  const setMinimized = usePomodoroUi((ui) => ui.setMinimized);
  const isBreak = state.phase !== 'focus';
  const phaseName = t.pomodoro.phases[state.phase];
  const running = state.status === 'running';

  useEffect(() => {
    if (autoStart && state.status === 'idle' && state.phase === 'focus') start();
    // Solo al montar, cuando el alumno empieza a estudiar
    // eslint-disable-next-line react-hooks/exhaustive-deps -- arranca una sola vez por visita
  }, [autoStart]);

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
        <Timer aria-hidden className={cn('size-5', isBreak ? 'text-cir' : 'text-primary')} />
        {running ? (
          <span
            aria-hidden
            className={cn(
              'absolute top-1.5 right-1.5 size-2.5 animate-pulse rounded-full',
              isBreak ? 'bg-cir' : 'bg-primary',
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
        isBreak ? 'border-cir/40' : 'border-primary/30',
      )}
    >
      <span
        aria-hidden
        className={cn(
          'size-2.5 rounded-full',
          isBreak ? 'bg-cir' : 'bg-primary',
          running && 'animate-pulse',
        )}
      />
      <span className="flex flex-col leading-none">
        <span className="font-mono text-lg font-bold tabular-nums" aria-hidden>
          {formatClock(left)}
        </span>
        <span className="text-[0.65rem] font-semibold tracking-wide text-fg-muted uppercase">
          {phaseName}
        </span>
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
        isBreak ? 'border-cir/40 bg-cir-soft' : 'border-primary/30 bg-primary-soft',
      )}
    >
      <Timer aria-hidden className={cn('size-5', isBreak ? 'text-cir' : 'text-primary')} />
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
}: {
  value: ReadySession['settings']['pomodoro'];
  onSave: (next: ReadySession['settings']['pomodoro']) => Promise<void>;
}) {
  const [draft, setDraft] = useState(value);
  const [status, setStatus] = useState('');
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
      }}
    />
  );
  return (
    <form
      className="flex flex-col gap-3 rounded-md bg-muted p-3"
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
        }}
      />
      <CheckboxField
        label={t.pomodoro.notifications}
        hint={t.pomodoro.notificationsHint}
        checked={draft.notifications}
        onChange={(event) => {
          setDraft({ ...draft, notifications: event.target.checked });
        }}
      />
      <Button type="submit" size="sm" className="self-start">
        {t.pomodoro.save}
      </Button>
      <p role="status" className="text-sm text-fg-muted">
        {status}
      </p>
    </form>
  );
}
