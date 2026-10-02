// Widget del Pomodoro (9.1, 9.2). Duraciones, ciclos, sonido y notificación configurables. Registra
// cada fase como evento y los minutos de enfoque reales, que usan la racha, el heatmap y el
// planificador. Avisa con sonido, con un aviso dentro de la página y, con permiso, con notificación.
import { Pause, Play, Settings2, SkipForward, Square } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useDataApi } from '@/data/context';
import { createEvent } from '@/data/events/createEvent';
import { updateProfile } from '@/data/usecases/profile';
import { t } from '@/i18n/es-MX';
import { Button } from '@/ui/components/button';
import { CheckboxField, TextField } from '@/ui/components/field';
import type { ReadySession } from '../shared/RequireSession';
import {
  elapsedMinutes,
  formatClock,
  IDLE,
  nextPhase,
  phaseMinutes,
  remainingMs,
  usePomodoroTimer,
  type PomodoroPhase,
} from './timer';

function beep() {
  try {
    const context = new AudioContext();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.value = 880;
    gain.gain.setValueAtTime(0.2, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.8);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.8);
  } catch {
    // Sin audio disponible, queda el aviso visual
  }
}

function notify(text: string) {
  try {
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      new Notification(text);
    }
  } catch {
    // Algunos navegadores solo notifican desde el service worker
  }
}

export function PomodoroWidget({ session }: { session: ReadySession }) {
  const api = useDataApi();
  const { user, settings } = session;
  const config = settings.pomodoro;
  const timer = usePomodoroTimer();
  const [now, setNow] = useState(() => Date.now());
  const [message, setMessage] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const own = timer.userId === null || timer.userId === user.id;
  const state = own ? timer : { ...IDLE, set: timer.set };

  const record = (
    type: 'pomodoro_started' | 'pomodoro_completed' | 'pomodoro_interrupted',
    phase: PomodoroPhase,
    minutes: number,
  ) => {
    const plannedMinutes = phaseMinutes(phase, config);
    const event =
      type === 'pomodoro_started'
        ? createEvent(
            type,
            { phase, plannedMinutes, cycle: state.cycle },
            { userId: user.id, tz: user.timeZone },
          )
        : createEvent(
            type,
            { phase, plannedMinutes, actualMinutes: Math.min(600, Math.round(minutes * 10) / 10) },
            { userId: user.id, tz: user.timeZone },
          );
    void api.recordEvent(event);
  };

  // Cierra la fase cuando llega su marca de tiempo. Se llama desde el reloj, que es externo a React
  const finishIfDue = (at: number) => {
    if (!own || state.status !== 'running' || state.endsAt === null || at < state.endsAt) return;
    const finished = state.phase;
    record('pomodoro_completed', finished, elapsedMinutes(state, state.endsAt));
    const next = nextPhase(state, config);
    const text = `${t.pomodoro.finished(t.pomodoro.phases[finished])}. ${t.pomodoro.next(t.pomodoro.phases[next.phase])}`;
    setMessage(text);
    if (config.sound) beep();
    if (config.notifications) notify(text);
    state.set({ ...IDLE, userId: user.id, ...next });
  };
  const finishRef = useRef(finishIfDue);
  useEffect(() => {
    finishRef.current = finishIfDue;
  });
  useEffect(() => {
    const tick = window.setInterval(() => {
      const at = Date.now();
      setNow(at);
      finishRef.current(at);
    }, 1000);
    return () => {
      window.clearInterval(tick);
    };
  }, []);

  const start = () => {
    const minutes = phaseMinutes(state.phase, config);
    const at = Date.now();
    state.set({
      userId: user.id,
      status: 'running',
      startedAt: at,
      endsAt: at + minutes * 60000,
      remainingMs: null,
      elapsedBeforePauseMs: 0,
    });
    record('pomodoro_started', state.phase, 0);
    setMessage('');
  };
  const pause = () => {
    const at = Date.now();
    state.set({
      status: 'paused',
      remainingMs: remainingMs(state, at),
      elapsedBeforePauseMs:
        state.elapsedBeforePauseMs + (state.startedAt ? at - state.startedAt : 0),
      endsAt: null,
      startedAt: null,
    });
  };
  const resume = () => {
    const at = Date.now();
    state.set({
      status: 'running',
      startedAt: at,
      endsAt: at + (state.remainingMs ?? 0),
      remainingMs: null,
    });
  };
  const stop = (skip: boolean) => {
    if (state.status !== 'idle')
      record('pomodoro_interrupted', state.phase, elapsedMinutes(state, Date.now()));
    const next = skip ? nextPhase(state, config) : { phase: state.phase, cycle: state.cycle };
    state.set({ ...IDLE, userId: user.id, ...next });
  };

  const total = phaseMinutes(state.phase, config) * 60000;
  const left = state.status === 'idle' ? total : remainingMs(state, now);
  const phaseName = t.pomodoro.phases[state.phase];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium text-fg-muted">
          {phaseName} · {t.pomodoro.cycle(state.cycle, config.cyclesBeforeLong)}
        </span>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t.pomodoro.settings}
          aria-expanded={showSettings}
          onClick={() => {
            setShowSettings((value) => !value);
          }}
        >
          <Settings2 aria-hidden />
        </Button>
      </div>
      <p className="font-mono text-5xl font-bold tabular-nums" aria-hidden>
        {formatClock(left)}
      </p>
      <p className="sr-only" aria-live="off">
        {t.pomodoro.remaining(formatClock(left), phaseName)}
      </p>
      <div className="flex flex-wrap gap-2">
        {state.status === 'idle' ? (
          <Button onClick={start}>
            <Play aria-hidden />
            {t.pomodoro.start}
          </Button>
        ) : state.status === 'running' ? (
          <Button onClick={pause}>
            <Pause aria-hidden />
            {t.pomodoro.pause}
          </Button>
        ) : (
          <Button onClick={resume}>
            <Play aria-hidden />
            {t.pomodoro.resume}
          </Button>
        )}
        {state.status !== 'idle' ? (
          <Button
            variant="secondary"
            onClick={() => {
              stop(false);
            }}
          >
            <Square aria-hidden />
            {t.pomodoro.stop}
          </Button>
        ) : null}
        <Button
          variant="ghost"
          onClick={() => {
            stop(true);
          }}
        >
          <SkipForward aria-hidden />
          {t.pomodoro.skip}
        </Button>
      </div>
      <p role="status" className="text-sm font-medium text-primary">
        {message}
      </p>
      {showSettings ? (
        <PomodoroSettingsForm
          value={config}
          onSave={async (next) => {
            await updateProfile(api, user, { settings: { pomodoro: next } });
          }}
        />
      ) : null}
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
