// Ajustes del repaso (D-119 B3, comentario 4).
// Vive dentro de Repasar, en el panel de Límites y ajustes.
// Contiene: meta diaria, paso de confianza, resaltado de negaciones, errores al repaso, momento de la
// retroalimentación, opciones visibles, temporizador, días fáciles, opciones avanzadas de FSRS, Pomodoro y
// recordatorios por correo. Tarjetas nuevas y repasos por día están en DailyLimits para guardado al instante.
import { useState } from 'react';
import { WEEKDAY_KEYS } from '@/engines/easyDays';
import type { UserSettings } from '@/data/schemas/people';
import { t } from '@/i18n/es-MX';
import { Button } from '@/ui/components/button';
import { Disclosure } from '@/ui/components/disclosure';
import { CheckboxField, SelectField, TextField } from '@/ui/components/field';
import { SaveBar } from '@/ui/components/save-bar';
import { FeatureGate } from '../shared/FeatureGate';
import type { ReadySession } from '../shared/RequireSession';
import { CardTimerFields, EasyDaysFields } from '../profile/StudyDailyFields';
import { fromOption, maxIntervalOptions } from './intervalOptions';
import {
  STUDY_KEYS,
  draftOf,
  patchOf,
  differs,
  type ReviewSettingsDraft,
} from './reviewSettingsDraft';

const SPACING_OPTIONS = [50, 75, 100, 125, 150, 200];

export function ReviewSettingsPanel({
  session,
  onSave,
}: {
  session: ReadySession;
  onSave: (patch: Partial<UserSettings>) => Promise<unknown>;
}) {
  const { user, settings } = session;
  const [draft, setDraft] = useState(() => draftOf(settings));
  const [status, setStatus] = useState('');

  const change = (patch: Partial<ReviewSettingsDraft>) => {
    setDraft((current) => ({ ...current, ...patch }));
    setStatus('');
  };

  const changePomodoro = (patch: Partial<UserSettings['pomodoro']>) => {
    setDraft((current) => ({ ...current, pomodoro: { ...current.pomodoro, ...patch } }));
    setStatus('');
  };

  const patch = patchOf(draft);
  const dirty = differs(patch, settings);

  return (
    <form
      id="ajustes-del-repaso"
      aria-label="Ajustes del repaso"
      className="flex flex-col gap-4 border-t border-line pt-3"
      onSubmit={(event) => {
        event.preventDefault();
        void onSave(patch).then(() => {
          setStatus(t.settings.saved);
        });
      }}
    >
      <fieldset>
        <legend className="eyebrow mb-2 text-fg-muted">{t.settings.dailyTitle}</legend>
        <div className="grid grid-cols-2 items-end gap-3">
          <SelectField
            label={t.onboarding.goalMetric}
            value={draft.metric}
            options={(['cards', 'questions', 'focusMinutes'] as const).map((value) => ({
              value,
              label: t.onboarding.goalMetrics[value],
            }))}
            onChange={(event) => {
              change({ metric: event.target.value as UserSettings['dailyGoal']['metric'] });
            }}
          />
          <TextField
            label={t.onboarding.goalValue}
            type="number"
            inputMode="numeric"
            min={1}
            max={1000}
            value={draft.goal}
            onChange={(event) => {
              change({ goal: event.target.value });
            }}
          />
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="eyebrow mb-1 text-fg-muted">{t.settings.studyOptionsTitle}</legend>
        {STUDY_KEYS.map((key) => (
          <CheckboxField
            key={key}
            label={t.settings[key]}
            hint={key === 'cardConfidenceStep' ? t.settings.cardConfidenceStepHint : undefined}
            checked={draft[key]}
            onChange={(event) => {
              change({ [key]: event.target.checked });
            }}
          />
        ))}
        <div className="grid gap-3 sm:grid-cols-2">
          <SelectField
            className="max-w-72"
            label={t.settings.practiceFeedback}
            value={draft.practiceFeedback}
            options={(['end', 'each'] as const).map((value) => ({
              value,
              label: t.settings.practiceFeedbackOptions[value],
            }))}
            onChange={(event) => {
              change({ practiceFeedback: event.target.value as UserSettings['practiceFeedback'] });
            }}
          />
          <SelectField
            className="max-w-56"
            label={t.settings.optionsShown}
            value={String(draft.optionsShown)}
            options={[4, 5, 6].map((n) => ({ value: String(n), label: String(n) }))}
            onChange={(event) => {
              change({ optionsShown: Number(event.target.value) });
            }}
          />
        </div>
      </fieldset>

      <FeatureGate userId={user.id} feature="cardTimer">
        <CardTimerFields
          value={draft.cardTimer}
          onChange={(cardTimer) => {
            change({ cardTimer });
          }}
        />
      </FeatureGate>

      <FeatureGate userId={user.id} feature="easyDays">
        <Disclosure
          title={t.settings.easyDaysTitle}
          summary={t.settings.easyDaysSummary(
            WEEKDAY_KEYS.filter((day) => draft.easyDays[day] !== 'normal').length,
          )}
        >
          <EasyDaysFields
            value={draft.easyDays}
            onChange={(easyDays) => {
              change({ easyDays });
            }}
          />
        </Disclosure>
      </FeatureGate>

      <Disclosure
        title={t.settings.advanced}
        summary={t.settings.advancedSummary(
          Math.round(patch.desiredRetention * 100),
          patch.maxIntervalDays,
        )}
      >
        <TextField
          label={t.settings.retention}
          hint={t.settings.retentionHint}
          type="number"
          min={80}
          max={97}
          value={draft.retention}
          onChange={(event) => {
            change({ retention: event.target.value });
          }}
        />
        <SelectField
          label={t.settings.maxInterval}
          hint={t.settings.maxIntervalHint}
          value={draft.maxInterval}
          options={maxIntervalOptions(draft.maxInterval).map((value) => ({
            value,
            label: t.settings.maxIntervalOption(fromOption(value)),
          }))}
          onChange={(event) => {
            change({ maxInterval: event.target.value });
          }}
        />
        <fieldset className="flex flex-col gap-2 rounded-lg bg-muted p-3">
          <legend className="eyebrow text-fg-muted">{t.settings.spacingTitle}</legend>
          <p className="text-sm text-fg-muted">{t.settings.spacingHint}</p>
          <div className="grid gap-3 sm:grid-cols-3">
            {(['hard', 'good', 'easy'] as const).map((rating) => (
              <SelectField
                key={rating}
                label={t.settings.spacingLabels[rating]}
                value={String(Math.round(draft.spacing[rating] * 100))}
                options={SPACING_OPTIONS.map((percent) => ({
                  value: String(percent),
                  label: t.settings.spacingOption(percent),
                }))}
                onChange={(event) => {
                  change({
                    spacing: { ...draft.spacing, [rating]: Number(event.target.value) / 100 },
                  });
                }}
              />
            ))}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="self-start"
            onClick={() => {
              change({
                spacing: { hard: 1, good: 1, easy: 1 },
                maxInterval: '21',
                retention: '90',
              });
            }}
          >
            {t.settings.resetRecommended}
          </Button>
        </fieldset>
      </Disclosure>

      <Disclosure
        title={t.settings.pomodoroTitle}
        summary={`${draft.pomodoro.focusMinutes} min · ${draft.pomodoro.shortBreakMinutes} min`}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField
            label={t.pomodoro.focusMinutes}
            type="number"
            inputMode="numeric"
            min={1}
            max={180}
            value={String(draft.pomodoro.focusMinutes)}
            onChange={(event) => {
              changePomodoro({
                focusMinutes: Math.min(180, Math.max(1, Number(event.target.value) || 1)),
              });
            }}
          />
          <TextField
            label={t.pomodoro.shortBreakMinutes}
            type="number"
            inputMode="numeric"
            min={1}
            max={60}
            value={String(draft.pomodoro.shortBreakMinutes)}
            onChange={(event) => {
              changePomodoro({
                shortBreakMinutes: Math.min(60, Math.max(1, Number(event.target.value) || 1)),
              });
            }}
          />
          <TextField
            label={t.pomodoro.longBreakMinutes}
            type="number"
            inputMode="numeric"
            min={1}
            max={90}
            value={String(draft.pomodoro.longBreakMinutes)}
            onChange={(event) => {
              changePomodoro({
                longBreakMinutes: Math.min(90, Math.max(1, Number(event.target.value) || 1)),
              });
            }}
          />
          <TextField
            label={t.pomodoro.cyclesBeforeLong}
            type="number"
            inputMode="numeric"
            min={1}
            max={12}
            value={String(draft.pomodoro.cyclesBeforeLong)}
            onChange={(event) => {
              changePomodoro({
                cyclesBeforeLong: Math.min(12, Math.max(1, Number(event.target.value) || 1)),
              });
            }}
          />
        </div>
        <CheckboxField
          label={t.pomodoro.sound}
          checked={draft.pomodoro.sound}
          onChange={(event) => {
            changePomodoro({ sound: event.target.checked });
          }}
        />
        <CheckboxField
          label={t.pomodoro.notifications}
          hint={t.pomodoro.notificationsHint}
          checked={draft.pomodoro.notifications}
          onChange={(event) => {
            changePomodoro({ notifications: event.target.checked });
          }}
        />
      </Disclosure>

      <Disclosure
        title="Recordatorios por correo"
        summary={draft.emailReminders.enabled ? `Activo · ${draft.emailReminders.time}` : 'Apagado'}
      >
        <CheckboxField
          label="Enviar recordatorio diario de repaso por correo"
          hint="Te avisa por la mañana cuántas tarjetas vencen hoy para no perder tu racha."
          checked={draft.emailReminders.enabled}
          onChange={(event) => {
            change({
              emailReminders: { ...draft.emailReminders, enabled: event.target.checked },
            });
          }}
        />
        {draft.emailReminders.enabled ? (
          <TextField
            label="Hora del recordatorio"
            type="time"
            className="max-w-44"
            value={draft.emailReminders.time}
            onChange={(event) => {
              change({
                emailReminders: { ...draft.emailReminders, time: event.target.value },
              });
            }}
          />
        ) : null}
      </Disclosure>

      <SaveBar
        dirty={dirty}
        status={status}
        onDiscard={() => {
          setDraft(draftOf(settings));
          setStatus(t.settings.discarded);
        }}
      />
    </form>
  );
}
