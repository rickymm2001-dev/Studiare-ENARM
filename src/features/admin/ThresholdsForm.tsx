// Umbrales de calibración (pantalla 25, sección 12). Cada función de datos muestra calibrando hasta
// llegar a su umbral, y aquí el admin los ajusta. Se guardan en este navegador y se aplican al abrir
// la app. Un conjunto que rompa una regla, como una retención fuera de rango, no se guarda.
import { useState } from 'react';
import { DEFAULT_THRESHOLDS, FACTORY_THRESHOLDS } from '@/config/thresholds';
import { readStoredOverrides, writeStoredOverrides } from '@/config/overridesStore';
import { adminText } from '@/i18n/admin';
import { Button } from '@/ui/components/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/ui/components/card';
import { TextField } from '@/ui/components/field';
import { THRESHOLD_FIELDS, fieldId, readThreshold } from './thresholdFields';
import { initialDraft, patchFromDraft, validateDraft, type ThresholdDraft } from './thresholdDraft';

export function ThresholdsForm() {
  const text = adminText.adminConfig.thresholdsForm;
  const [draft, setDraft] = useState<ThresholdDraft>(initialDraft);
  const [message, setMessage] = useState<'saved' | 'reset' | 'failed' | null>(null);
  const errors = validateDraft(draft);
  const changed = Object.keys(patchFromDraft(draft)).length > 0;
  const differsFromRunning = THRESHOLD_FIELDS.some(
    (field) => Number(draft[fieldId(field)]) !== readThreshold(DEFAULT_THRESHOLDS, field),
  );

  const save = () => {
    const patch = patchFromDraft(draft);
    const { thresholds: _old, ...rest } = readStoredOverrides() ?? {};
    const next = Object.keys(patch).length > 0 ? { ...rest, thresholds: patch } : rest;
    setMessage(
      writeStoredOverrides(Object.keys(next).length > 0 ? next : null) ? 'saved' : 'failed',
    );
  };
  const reset = () => {
    const { thresholds: _removed, ...rest } = readStoredOverrides() ?? {};
    const ok = writeStoredOverrides(Object.keys(rest).length > 0 ? rest : null);
    setDraft(
      Object.fromEntries(
        THRESHOLD_FIELDS.map((field) => [
          fieldId(field),
          String(readThreshold(FACTORY_THRESHOLDS, field)),
        ]),
      ),
    );
    setMessage(ok ? 'reset' : 'failed');
  };

  return (
    <Card aria-labelledby="config-umbrales">
      <CardHeader>
        <CardTitle id="config-umbrales">{text.title}</CardTitle>
        <CardDescription>{text.hint}</CardDescription>
      </CardHeader>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {THRESHOLD_FIELDS.map((field) => {
          const id = fieldId(field);
          const info =
            adminText.adminConfig.thresholds[id as keyof typeof adminText.adminConfig.thresholds];
          return (
            <TextField
              key={id}
              label={info.label}
              hint={`${info.hint} ${text.factory(String(readThreshold(FACTORY_THRESHOLDS, field)))}`}
              type="number"
              inputMode="decimal"
              step={field.step}
              value={draft[id] ?? ''}
              error={errors[id] ?? null}
              onChange={(event) => {
                setMessage(null);
                setDraft((current) => ({ ...current, [id]: event.target.value }));
              }}
            />
          );
        })}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button disabled={Object.keys(errors).length > 0 || !differsFromRunning} onClick={save}>
          {text.save}
        </Button>
        <Button variant="ghost" disabled={!changed && !differsFromRunning} onClick={reset}>
          {text.reset}
        </Button>
        {message === 'saved' ? (
          <Button
            variant="secondary"
            onClick={() => {
              window.location.reload();
            }}
          >
            {text.reload}
          </Button>
        ) : null}
      </div>
      <p className="mt-3 text-sm text-fg-muted" role="status" aria-live="polite">
        {message === 'saved'
          ? text.saved
          : message === 'reset'
            ? text.resetDone
            : message === 'failed'
              ? text.failed
              : ''}
      </p>
    </Card>
  );
}
