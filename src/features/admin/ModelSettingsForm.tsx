// Sección Modelo del alumno y calibración de Plataforma (pantalla 25, 1.5 y 7.2 del plan de B14). Los
// números de model_settings con los que la calibración de la noche y la app deciden cuándo hay datos
// suficientes, y las dos funciones para los alumnos que se pueden apagar. Los lee la base y los leen todos
// los alumnos, así que solo se cambian con la cuenta de la nube conectada como admin. minGroupSize y
// populationMinStudents no bajan de 30: son la promesa de privacidad de la comparación. El interruptor
// y el modo de la calibración viven en la pantalla Calibración. Las respuestas mínimas por pregunta y los
// umbrales de distractores siguen en Umbrales de calibración.
import { useState } from 'react';
import { Link } from 'react-router';
import { useCloud } from '@/app/cloudState';
import { SCREENS } from '@/app/screens';
import { FACTORY_MODEL_SETTINGS, type ModelSettings } from '@/config/modelSettings';
import { readModelSettingsDocument, saveModelSettings } from '@/data/cloud/calibrationAdmin';
import type { ModelSettingsPatch } from '@/data/cloud/calibrationAdmin';
import { calibrationAdminTexts } from '@/i18n/calibrationAdmin';
import { Button } from '@/ui/components/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/ui/components/card';
import { CheckboxField, TextField } from '@/ui/components/field';
import { ErrorState, LoadingState } from '@/ui/states/states';
import { askSecondFactor } from '../physician/secondFactor';
import { bankCodeText, bankErrorText } from './bankErrors';
import {
  MODEL_FIELDS,
  MODEL_GROUPS,
  draftFrom,
  factoryDraft,
  factoryPatch,
  patchFromDraft,
  thresholdValue,
  validateModelDraft,
  type ModelDraft,
} from './modelSettingsFields';
import { requireCloud, useBankAdminQuery } from './useBankAdminQuery';

const text = calibrationAdminTexts.settings;

export function ModelSettingsForm() {
  const linked = useCloud((store) => store.state.status === 'linked');
  return (
    <Card aria-labelledby="config-modelo" className="flex flex-col gap-3">
      <CardHeader>
        <CardTitle id="config-modelo">{text.title}</CardTitle>
        <CardDescription>{text.hint}</CardDescription>
      </CardHeader>
      {linked ? (
        <ModelSettingsFields />
      ) : (
        <p className="text-sm text-fg-muted">{text.needsCloud}</p>
      )}
    </Card>
  );
}

function ModelSettingsFields() {
  const { state, reload } = useBankAdminQuery(
    async (cloud) => (await readModelSettingsDocument(cloud)).settings,
    'model-settings',
  );
  if (state.status === 'loading') return <LoadingState />;
  if (state.status === 'failed') {
    return (
      <ErrorState title={text.loadFailed} description={bankCodeText(state.code)} onRetry={reload} />
    );
  }
  return <SettingsForm initial={state.value} />;
}

type Message = 'saved' | 'restored' | 'failed' | 'invalid';

function SettingsForm({ initial }: { initial: ModelSettings }) {
  const [saved, setSaved] = useState(initial);
  const [draft, setDraft] = useState<ModelDraft>(() => draftFrom(initial));
  const [message, setMessage] = useState<{ kind: Message; detail?: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const errors = validateModelDraft(draft);
  const patch = patchFromDraft(draft, saved);
  const changed = Object.keys(patch).length > 0;
  const atFactory =
    MODEL_FIELDS.every(
      (field) =>
        thresholdValue(saved, field.id) === thresholdValue(FACTORY_MODEL_SETTINGS, field.id),
    ) &&
    saved.features.comparison === FACTORY_MODEL_SETTINGS.features.comparison &&
    saved.features.adaptive === FACTORY_MODEL_SETTINGS.features.adaptive;

  const write = async (next: ModelSettingsPatch, done: Message) => {
    setBusy(true);
    setMessage(null);
    try {
      const result = await saveModelSettings(await requireCloud(), next, askSecondFactor);
      setSaved(result);
      setDraft(draftFrom(result));
      setMessage({ kind: done });
    } catch (caught) {
      setMessage({ kind: 'failed', detail: bankErrorText(caught) });
    } finally {
      setBusy(false);
    }
  };

  const edit = (update: (current: ModelDraft) => ModelDraft) => {
    setMessage(null);
    setDraft(update);
  };

  return (
    <form
      className="flex flex-col gap-5"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        if (Object.keys(errors).length > 0) setMessage({ kind: 'invalid' });
        else if (changed) void write(patch, 'saved');
      }}
    >
      <fieldset className="flex flex-col gap-3">
        <legend className="font-semibold">{text.features.title}</legend>
        <CheckboxField
          label={text.features.comparison.label}
          hint={text.features.comparison.hint}
          checked={draft.comparison}
          onChange={(event) => {
            const checked = event.target.checked;
            edit((current) => ({ ...current, comparison: checked }));
          }}
        />
        <CheckboxField
          label={text.features.adaptive.label}
          hint={text.features.adaptive.hint}
          checked={draft.adaptive}
          onChange={(event) => {
            const checked = event.target.checked;
            edit((current) => ({ ...current, adaptive: checked }));
          }}
        />
      </fieldset>

      {MODEL_GROUPS.map((group) => (
        <fieldset key={group} className="flex flex-col gap-3 border-t border-line pt-4">
          <legend className="font-semibold">{text.groups[group]}</legend>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {MODEL_FIELDS.filter((field) => field.group === group).map((field) => {
              const info = text.fields[field.id];
              return (
                <TextField
                  key={field.id}
                  label={info?.label ?? field.id}
                  hint={`${info?.hint ?? ''} ${text.factory(
                    String(thresholdValue(FACTORY_MODEL_SETTINGS, field.id)),
                  )}`.trim()}
                  type="number"
                  inputMode="decimal"
                  step={field.step}
                  value={draft.values[field.id] ?? ''}
                  error={errors[field.id] ?? null}
                  onChange={(event) => {
                    const value = event.target.value;
                    edit((current) => ({
                      ...current,
                      values: { ...current.values, [field.id]: value },
                    }));
                  }}
                />
              );
            })}
          </div>
        </fieldset>
      ))}

      <div className="flex flex-col gap-1 border-t border-line pt-4 text-sm text-fg-muted">
        <p>{text.noticeVersion(saved.calibration.minNoticeVersion)}</p>
        <p>{text.responsesLink}</p>
        <p className="flex flex-wrap items-center gap-x-3">
          {text.calibrationLink}
          <Button asChild variant="link" size="sm" className="px-0">
            <Link to={SCREENS.calibrationAdmin.path}>{text.calibrationOpen}</Link>
          </Button>
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={busy || !changed}>
          {text.save}
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={busy || (atFactory && !changed)}
          onClick={() => {
            setDraft(factoryDraft());
            void write(factoryPatch(), 'restored');
          }}
        >
          {text.restore}
        </Button>
      </div>
      <p
        role={message?.kind === 'failed' || message?.kind === 'invalid' ? 'alert' : 'status'}
        aria-live="polite"
        className={
          message?.kind === 'failed' || message?.kind === 'invalid'
            ? 'text-sm text-danger'
            : 'text-sm font-medium text-success'
        }
      >
        {message === null
          ? ''
          : message.kind === 'saved'
            ? text.saved
            : message.kind === 'restored'
              ? text.restored
              : message.kind === 'invalid'
                ? text.invalid
                : `${text.failed} ${message.detail ?? ''}`.trim()}
      </p>
    </form>
  );
}
