// Recordatorios de repaso por correo en Ajustes del repaso (B15, 3.2 y 3.7). Un interruptor, la hora en punto, la
// frecuencia y los días, y si el correo solo llega cuando hay tarjetas que repasar. Se guarda con su propio
// botón y avisa al panel si hay cambios sin guardar, igual que el Pomodoro. Nace apagado. Sin cuenta en la nube
// dice que la necesita y no guarda nada. Lo que se guarda vive en el servidor, que es quien manda el correo,
// y la app sube además una foto de conteos de tarjetas vencidas (dueSnapshot.ts) porque las tarjetas de los
// mazos precargados no viajan a la nube.
//
// Medición de uso. Al guardar manda reminder_prefs_saved con solo si quedó prendido, la frecuencia y la parte del
// día de la hora, y solo si el alumno dio el permiso Medición de uso
import { useEffect, useRef, useState } from 'react';
import { useCloud } from '@/app/cloudState';
import { hourBandOf, track } from '@/data/analytics/catalog';
import { getCloud } from '@/data/cloud/client';
import {
  ALL_WEEK_DAYS,
  DEFAULT_REMINDER_HOUR,
  REMINDER_FREQUENCIES,
  REMINDER_HOURS,
  daysOfFrequency,
  frequencyOf,
  type ReminderFrequency,
  type ReminderPrefs,
} from '@/data/cloud/engagementContracts';
import { fetchReminderPrefs, saveReminderPrefs } from '@/data/cloud/reminders';
import { useDataApi } from '@/data/context';
import { DEFAULT_TIME_ZONE } from '@/data/schemas/common';
import { engagementTexts, hourLabel, maskEmail } from '@/i18n/engagement';
import { Button } from '@/ui/components/button';
import { CheckboxField, SelectField } from '@/ui/components/field';
import { SaveBar } from '@/ui/components/save-bar';
import { SegmentedControl } from '@/ui/components/segmented';
import { LoadingState } from '@/ui/states/states';
import { uploadDueSnapshot } from '../dueSnapshot';

const text = engagementTexts.reminders;

/** Lo que el alumno está editando, antes de guardar */
interface Draft {
  enabled: boolean;
  hour: number;
  frequency: ReminderFrequency;
  /** Los días que marcó. Solo valen con Días que elijas */
  chosenDays: number[];
  onlyWhenDue: boolean;
}

const draftOf = (prefs: ReminderPrefs): Draft => ({
  enabled: prefs.enabled,
  hour: prefs.hour,
  frequency: prefs.frequency,
  chosenDays: [...prefs.days],
  onlyWhenDue: prefs.onlyWhenDue,
});

const daysOf = (draft: Draft): number[] => daysOfFrequency(draft.frequency, draft.chosenDays);

/** Si dos borradores dicen lo mismo, sin importar cómo se llegó a los días */
const sameDraft = (a: Draft, b: Draft): boolean =>
  a.enabled === b.enabled &&
  a.hour === b.hour &&
  a.onlyWhenDue === b.onlyWhenDue &&
  daysOf(a).join() === daysOf(b).join();

/** La zona horaria de este dispositivo, que es con la que el alumno piensa su hora. La base la valida */
function deviceTimeZone(fallback: string): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || fallback;
  } catch {
    return fallback;
  }
}

type Load =
  { status: 'loading' } | { status: 'failed' } | { status: 'ready'; saved: ReminderPrefs };

const FRESH: Draft = {
  enabled: false,
  hour: DEFAULT_REMINDER_HOUR,
  frequency: 'daily',
  chosenDays: [...ALL_WEEK_DAYS],
  onlyWhenDue: true,
};

export function ReminderSettingsSection({
  userId,
  saveBarClassName,
  onDirtyChange,
}: {
  userId: string;
  /** Distancia de la barra de guardar al borde, que dentro de Ajustes del repaso es otra */
  saveBarClassName?: string;
  /** Avisa si hay cambios sin guardar, para preguntar antes de cerrar el panel */
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const api = useDataApi();
  const cloudState = useCloud((store) => store.state);
  const linked = cloudState.status === 'linked';
  const email = cloudState.status === 'linked' ? cloudState.identity.email : '';
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [draft, setDraft] = useState<Draft>(FRESH);
  const [status, setStatus] = useState('');
  const [problem, setProblem] = useState('');
  const [saving, setSaving] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Lee lo guardado al abrir la sección, o al reintentar. Sin cliente de la nube (no pasa con la cuenta
  // conectada) la lectura no arranca y la sección queda en cargando
  useEffect(() => {
    if (!linked) return;
    const cloud = getCloud();
    if (!cloud) return;
    let cancelled = false;
    void fetchReminderPrefs(cloud).then((prefs) => {
      if (cancelled) return;
      if (prefs === null) {
        setLoad({ status: 'failed' });
        return;
      }
      setLoad({ status: 'ready', saved: prefs });
      setDraft(draftOf(prefs));
    });
    return () => {
      cancelled = true;
    };
  }, [linked, attempt]);

  const saved = load.status === 'ready' ? load.saved : null;
  const dirty = saved !== null && !sameDraft(draft, draftOf(saved));
  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  if (!linked) return <p className="text-sm text-fg-muted">{text.needsCloud}</p>;
  if (load.status === 'loading') return <LoadingState label={text.loading} />;
  if (load.status === 'failed') {
    return (
      <div className="flex flex-col items-start gap-2">
        <p role="alert" className="text-sm text-danger">
          {text.loadFailed}
        </p>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => {
            setLoad({ status: 'loading' });
            setAttempt((value) => value + 1);
          }}
        >
          {text.retry}
        </Button>
      </div>
    );
  }

  const change = (patch: Partial<Draft>) => {
    setDraft((current) => ({ ...current, ...patch }));
    setStatus('');
    setProblem('');
  };
  const days = daysOf(draft);

  const save = async () => {
    const cloud = getCloud();
    if (!cloud || saving) return;
    if (draft.enabled && days.length === 0) {
      setProblem(text.needsDay);
      return;
    }
    setSaving(true);
    setProblem('');
    const result = await saveReminderPrefs(cloud, {
      enabled: draft.enabled,
      hour: draft.hour,
      days: days.length > 0 ? days : [...ALL_WEEK_DAYS],
      onlyWhenDue: draft.onlyWhenDue,
      timeZone: deviceTimeZone(saved?.timeZone ?? DEFAULT_TIME_ZONE),
    });
    if (!mounted.current) return;
    setSaving(false);
    if (!result.ok) {
      setProblem(result.reason === 'not_active_device' ? text.notActiveDevice : text.saveFailed);
      return;
    }
    setLoad({ status: 'ready', saved: result.prefs });
    setDraft(draftOf(result.prefs));
    setStatus(text.saved);
    track('reminder_prefs_saved', {
      enabled: result.prefs.enabled,
      frequency: frequencyOf(result.prefs.days),
      hour_band: hourBandOf(result.prefs.hour),
    });
    // Con los recordatorios prendidos, la foto sube ya, sin esperar a la siguiente sincronización
    if (result.prefs.enabled) {
      void uploadDueSnapshot(api, cloud, userId, result.prefs.timeZone);
    }
  };

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <CheckboxField
        label={text.enable}
        hint={text.enableHint}
        checked={draft.enabled}
        onChange={(event) => {
          change({ enabled: event.target.checked });
        }}
      />
      {saved?.unsubscribed && !draft.enabled ? (
        <p className="text-sm text-fg-muted">{text.unsubscribed}</p>
      ) : null}
      {draft.enabled ? (
        <>
          <SelectField
            label={text.hour}
            hint={text.hourHint}
            value={String(draft.hour)}
            options={Array.from(
              { length: REMINDER_HOURS.max - REMINDER_HOURS.min + 1 },
              (_, index) => {
                const hour = REMINDER_HOURS.min + index;
                return { value: String(hour), label: hourLabel(hour) };
              },
            )}
            onChange={(event) => {
              change({ hour: Number(event.target.value) });
            }}
          />
          <SegmentedControl
            label={text.frequency}
            value={draft.frequency}
            options={REMINDER_FREQUENCIES.map((value) => ({
              value,
              label: text.frequencies[value],
            }))}
            onChange={(frequency) => {
              change({ frequency });
            }}
          />
          {draft.frequency === 'custom' ? (
            <fieldset className="flex flex-col gap-1.5">
              <legend className="mb-1 text-sm font-medium">{text.days}</legend>
              <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                {text.dayOrder.map((day) => {
                  const name = text.dayNames[day];
                  return (
                    <CheckboxField
                      key={day}
                      label={name.charAt(0).toUpperCase() + name.slice(1)}
                      checked={draft.chosenDays.includes(day)}
                      onChange={(event) => {
                        change({
                          chosenDays: event.target.checked
                            ? [...draft.chosenDays, day]
                            : draft.chosenDays.filter((chosen) => chosen !== day),
                        });
                      }}
                    />
                  );
                })}
              </div>
            </fieldset>
          ) : null}
          <CheckboxField
            label={text.onlyWhenDue}
            hint={text.onlyWhenDueHint}
            checked={draft.onlyWhenDue}
            onChange={(event) => {
              change({ onlyWhenDue: event.target.checked });
            }}
          />
          {email ? <p className="text-sm text-fg-muted">{text.sentTo(maskEmail(email))}</p> : null}
          {saved ? <p className="text-sm text-fg-muted">{text.timeZone(saved.timeZone)}</p> : null}
        </>
      ) : null}
      {problem ? (
        <p role="alert" className="text-sm text-danger">
          {problem}
        </p>
      ) : null}
      <SaveBar
        dirty={dirty}
        status={status}
        className={saveBarClassName}
        onDiscard={() => {
          if (saved) setDraft(draftOf(saved));
          setStatus('');
          setProblem('');
        }}
      />
    </form>
  );
}
