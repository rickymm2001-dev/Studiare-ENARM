// Metas del día, opciones al estudiar y repaso avanzado de Ajustes del repaso (B3 del plan del
// cambio, comentario 4). Era StudyForm de Configuración y guarda igual, en los mismos ajustes del
// alumno, así que los valores guardados se conservan y cada cambio sigue quedando como evento
// settings_changed. Una sola barra de guardar que aparece al haber cambios (D-078). Retención, tope
// e intervalos por botón quedan plegados porque casi nadie los cambia.
import { useEffect, useState } from 'react';
import { WEEKDAY_KEYS } from '@/engines/easyDays';
import type { UserSettings } from '@/data/schemas/people';
import { t } from '@/i18n/es-MX';
import { Button } from '@/ui/components/button';
import { Disclosure } from '@/ui/components/disclosure';
import { CheckboxField, SelectField, TextField } from '@/ui/components/field';
import { SaveBar } from '@/ui/components/save-bar';
import { FeatureGate } from '../../shared/FeatureGate';
import { fromOption, maxIntervalOptions } from '../intervalOptions';
import { CardTimerFields, EasyDaysFields } from './StudyDailyFields';
import {
  differs,
  draftOf,
  mergeDraft,
  patchOf,
  sameDraft,
  SPACING_OPTIONS,
  STUDY_KEYS,
  type StudyDraft,
} from './studyDraft';

export function StudySettingsForm({
  userId,
  settings,
  onSave,
  saveBarClassName,
  onDirtyChange,
}: {
  userId: string;
  settings: UserSettings;
  onSave: (patch: Partial<UserSettings>) => Promise<unknown>;
  /** Distancia de la barra de guardar al borde, que dentro del panel es otra */
  saveBarClassName?: string;
  /** Avisa si hay cambios sin guardar, para preguntar antes de cerrar el panel */
  onDirtyChange?: (dirty: boolean) => void;
}) {
  // base es lo guardado cuando se armó el borrador. Sirve para saber qué tocó el alumno
  const [state, setState] = useState(() => {
    const initial = draftOf(settings);
    return { base: initial, draft: initial };
  });
  const [status, setStatus] = useState('');
  // Si los ajustes cambian por fuera, como la sugerencia de nuevas en el mismo panel, el borrador
  // toma lo nuevo sin perder lo que el alumno ya escribió
  const incoming = draftOf(settings);
  if (!sameDraft(incoming, state.base)) {
    setState({ base: incoming, draft: mergeDraft(state.base, state.draft, incoming) });
  }
  const draft = state.draft;
  const change = (patch: Partial<StudyDraft>) => {
    setState((current) => ({ ...current, draft: { ...current.draft, ...patch } }));
    setStatus('');
  };
  const patch = patchOf(draft);
  const dirty = differs(patch, settings);
  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        void onSave(patch).then(() => {
          setStatus(t.settings.saved);
        });
      }}
    >
      <fieldset>
        <legend className="eyebrow mb-2 text-fg-muted">{t.settings.dailyTitle}</legend>
        <div className="grid grid-cols-2 items-end gap-3 lg:grid-cols-4">
          <TextField
            label={t.settings.newCardsPerDay}
            type="number"
            inputMode="numeric"
            min={0}
            max={500}
            value={draft.newCards}
            disabled={draft.unlimitedNewCards}
            onChange={(event) => {
              change({ newCards: event.target.value });
            }}
          />
          <TextField
            label={t.settings.reviewsPerDay}
            type="number"
            inputMode="numeric"
            min={0}
            max={5000}
            value={draft.reviews}
            onChange={(event) => {
              change({ reviews: event.target.value });
            }}
          />
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
        <CheckboxField
          className="mt-3"
          label={t.settings.unlimitedNewCards}
          hint={t.settings.unlimitedNewCardsHint}
          checked={draft.unlimitedNewCards}
          onChange={(event) => {
            change({ unlimitedNewCards: event.target.checked });
          }}
        />
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
      </fieldset>

      <FeatureGate userId={userId} feature="cardTimer">
        <CardTimerFields
          value={draft.cardTimer}
          onChange={(cardTimer) => {
            change({ cardTimer });
          }}
        />
      </FeatureGate>

      <FeatureGate userId={userId} feature="easyDays">
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
        {/* Sin caja gris dentro del panel, solo una línea arriba (H06 de la revisión de B2) */}
        <div className="border-t border-line pt-3">
          <fieldset className="flex flex-col gap-2">
            <legend className="eyebrow mb-1 text-fg-muted">{t.settings.spacingTitle}</legend>
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
        </div>
      </Disclosure>

      <SaveBar
        dirty={dirty}
        status={status}
        className={saveBarClassName}
        onDiscard={() => {
          const saved = draftOf(settings);
          setState({ base: saved, draft: saved });
          setStatus(t.settings.discarded);
        }}
      />
    </form>
  );
}
