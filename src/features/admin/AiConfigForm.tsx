// Modelos, precios y límites de la IA (pantalla 25, 8.1). Se leen y se guardan en el proxy, que es
// quien los usa, y se aplican al instante. Sin proxy, como en la demo publicada, no hay nada que
// cambiar y la pantalla dice dónde vive la configuración. La estimación de costo del plan maestro
// vive en este navegador y sirve para comparar en la pantalla de costos.
import { useState } from 'react';
import type { AdminConfig } from '@/ai/admin';
import { readStoredOverrides, writeStoredOverrides } from '@/config/overridesStore';
import { AI_ENGINES } from '@/engines/aiContracts';
import { t } from '@/i18n/es-MX';
import { adminText } from '@/i18n/admin';
import { Badge } from '@/ui/components/badge';
import { Button } from '@/ui/components/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/ui/components/card';
import { SelectField, TextField } from '@/ui/components/field';
import { LoadingState } from '@/ui/states/states';
import { EFFORTS, draftOf, patchOf, validateAiDraft, type AiDraft } from './aiConfigDraft';
import type { AiAdmin } from './useAiAdmin';

export function AiConfigForm({ admin }: { admin: AiAdmin }) {
  const text = adminText.adminConfig.aiForm;
  const config = admin.config?.config;
  // El borrador nace de la configuración del proxy y se vuelve a armar cuando ella cambia
  const [draftState, setDraft] = useState<{ source: AdminConfig | null; draft: AiDraft | null }>({
    source: null,
    draft: null,
  });
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [estimate, setEstimate] = useState(() => {
    const stored = readStoredOverrides()?.aiCostEstimateUsd;
    return stored === null || stored === undefined ? '' : String(stored);
  });
  const [estimateMessage, setEstimateMessage] = useState<'saved' | 'failed' | null>(null);

  const estimateValid =
    estimate.trim() === '' ||
    (Number.isFinite(Number(estimate)) && Number(estimate) >= 0 && Number(estimate) <= 1000);
  const saveEstimate = () => {
    const { aiCostEstimateUsd: _old, ...rest } = readStoredOverrides() ?? {};
    const next = estimate.trim() === '' ? rest : { ...rest, aiCostEstimateUsd: Number(estimate) };
    setEstimateMessage(
      writeStoredOverrides(Object.keys(next).length > 0 ? next : null) ? 'saved' : 'failed',
    );
  };

  const estimateCard = (
    <Card aria-labelledby="config-estimacion">
      <CardHeader>
        <CardTitle id="config-estimacion">{text.estimate.title}</CardTitle>
        <CardDescription>{text.estimate.hint}</CardDescription>
      </CardHeader>
      <div className="flex flex-wrap items-end gap-3">
        <TextField
          label={text.estimate.label}
          type="number"
          inputMode="decimal"
          step={0.01}
          min={0}
          value={estimate}
          error={estimateValid ? null : text.priceError}
          className="max-w-xs"
          onChange={(event) => {
            setEstimateMessage(null);
            setEstimate(event.target.value);
          }}
        />
        <Button disabled={!estimateValid} onClick={saveEstimate}>
          {text.estimate.save}
        </Button>
      </div>
      <p className="mt-3 text-sm text-fg-muted" role="status" aria-live="polite">
        {estimateMessage === 'saved'
          ? text.estimate.saved
          : estimateMessage === 'failed'
            ? text.estimate.failed
            : ''}
      </p>
    </Card>
  );

  if (!admin.loaded) {
    return (
      <>
        <LoadingState />
        {estimateCard}
      </>
    );
  }
  if (!config) {
    return (
      <>
        <Card aria-labelledby="config-ia">
          <CardHeader>
            <CardTitle id="config-ia">{text.title}</CardTitle>
            <CardDescription>{text.noProxy}</CardDescription>
          </CardHeader>
        </Card>
        {estimateCard}
      </>
    );
  }

  // Si el proxy devolvió otra configuración, el borrador se arma de nuevo
  const draft =
    draftState.source === config && draftState.draft ? draftState.draft : draftOf(config);
  const update = (change: (current: AiDraft) => AiDraft) => {
    setMessage(null);
    setDraft({ source: config, draft: change(draft) });
  };
  const errors = validateAiDraft(draft, config);
  const patch = patchOf(draft, config);
  const dirty = Object.keys(patch).length > 0;
  const modelOptions = Object.keys(config.prices)
    .concat(
      draft.newModel.id.trim() !== '' && !(draft.newModel.id.trim() in config.prices)
        ? [draft.newModel.id.trim()]
        : [],
    )
    .map((id) => ({ value: id, label: id }));

  const save = async () => {
    setSaving(true);
    const result = await admin.save(patch);
    setSaving(false);
    setMessage(result.ok ? text.saved : result.message);
    if (result.ok) setDraft({ source: null, draft: null });
  };

  return (
    <>
      <Card aria-labelledby="config-ia">
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle id="config-ia">{text.title}</CardTitle>
            <Badge variant={admin.config?.mode === 'real' ? 'info' : 'simulated'}>
              {admin.config?.mode === 'real' ? t.ai.badge.real : t.ai.badge.mock}
            </Badge>
          </div>
          <CardDescription>{text.hint}</CardDescription>
        </CardHeader>

        <h3 className="mt-2 mb-2 font-bold">{text.modelsTitle}</h3>
        <div className="flex flex-col gap-4">
          {AI_ENGINES.map((engine) => {
            const row = draft.models[engine];
            return (
              <fieldset key={engine} className="rounded-lg border border-line p-3">
                <legend className="px-1 font-semibold">
                  {adminText.adminCosts.engines[engine]}
                </legend>
                <p className="mb-2 text-xs text-fg-muted">
                  {text.promptVersion(admin.config?.prompts[engine] ?? '—')}
                </p>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                  <SelectField
                    label={text.model}
                    value={row.id}
                    error={errors[`model.${engine}`] ?? null}
                    options={modelOptions}
                    onChange={(event) => {
                      update((current) => ({
                        ...current,
                        models: { ...current.models, [engine]: { ...row, id: event.target.value } },
                      }));
                    }}
                  />
                  <SelectField
                    label={text.effort}
                    hint={text.effortHint}
                    value={row.effort}
                    options={EFFORTS.map((value) => ({
                      value: value ?? '',
                      label: value === null ? text.effortNone : text.efforts[value],
                    }))}
                    onChange={(event) => {
                      update((current) => ({
                        ...current,
                        models: {
                          ...current.models,
                          [engine]: { ...row, effort: event.target.value },
                        },
                      }));
                    }}
                  />
                  <TextField
                    label={text.maxTokens}
                    type="number"
                    inputMode="numeric"
                    value={row.maxTokens}
                    error={errors[`tokens.${engine}`] ?? null}
                    onChange={(event) => {
                      update((current) => ({
                        ...current,
                        models: {
                          ...current.models,
                          [engine]: { ...row, maxTokens: event.target.value },
                        },
                      }));
                    }}
                  />
                  <TextField
                    label={text.perStudent}
                    type="number"
                    inputMode="numeric"
                    value={draft.limits[engine]}
                    error={errors[`limit.${engine}`] ?? null}
                    onChange={(event) => {
                      update((current) => ({
                        ...current,
                        limits: { ...current.limits, [engine]: event.target.value },
                      }));
                    }}
                  />
                </div>
              </fieldset>
            );
          })}
        </div>

        <h3 className="mt-5 mb-2 font-bold">{text.budgetTitle}</h3>
        <TextField
          label={text.budget}
          hint={text.budgetHint}
          type="number"
          inputMode="decimal"
          step={0.5}
          min={0}
          value={draft.budget}
          error={errors.budget ?? null}
          className="max-w-xs"
          onChange={(event) => {
            update((current) => ({ ...current, budget: event.target.value }));
          }}
        />

        <h3 className="mt-5 mb-2 font-bold">{text.pricesTitle}</h3>
        <p className="mb-2 text-sm text-fg-muted">{text.pricesHint}</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-fg-muted">
                <th scope="col" className="py-1 pr-2">
                  {text.model}
                </th>
                <th scope="col" className="py-1 pr-2 text-right">
                  {text.priceInput}
                </th>
                <th scope="col" className="py-1 pr-2 text-right">
                  {text.priceOutput}
                </th>
                <th scope="col" className="py-1 pr-2 text-right">
                  {text.priceCacheWrite}
                </th>
                <th scope="col" className="py-1 text-right">
                  {text.priceCacheRead}
                </th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(config.prices).map(([id, price]) => (
                <tr key={id} className="border-t border-line">
                  <th scope="row" className="py-1.5 pr-2 text-left font-mono text-xs">
                    {id}
                  </th>
                  <td className="py-1.5 pr-2 text-right">{price.input}</td>
                  <td className="py-1.5 pr-2 text-right">{price.output}</td>
                  <td className="py-1.5 pr-2 text-right">{price.cacheWrite}</td>
                  <td className="py-1.5 text-right">{price.cacheRead}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h3 className="mt-5 mb-2 font-bold">{text.newModelTitle}</h3>
        <p className="mb-2 text-sm text-fg-muted">{text.newModelHint}</p>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <TextField
            label={text.newModelId}
            value={draft.newModel.id}
            error={errors['new.id'] ?? null}
            onChange={(event) => {
              update((current) => ({
                ...current,
                newModel: { ...current.newModel, id: event.target.value },
              }));
            }}
          />
          {(['input', 'output', 'cacheWrite', 'cacheRead'] as const).map((key) => (
            <TextField
              key={key}
              label={text[`price${key.charAt(0).toUpperCase()}${key.slice(1)}` as 'priceInput']}
              type="number"
              inputMode="decimal"
              step={0.01}
              value={draft.newModel[key]}
              error={errors[`new.${key}`] ?? null}
              onChange={(event) => {
                update((current) => ({
                  ...current,
                  newModel: { ...current.newModel, [key]: event.target.value },
                }));
              }}
            />
          ))}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button
            disabled={saving || !dirty || Object.keys(errors).length > 0}
            onClick={() => void save()}
          >
            {saving ? text.saving : text.save}
          </Button>
          <Button
            variant="ghost"
            disabled={saving || !dirty}
            onClick={() => {
              setMessage(null);
              setDraft({ source: null, draft: null });
            }}
          >
            {text.discard}
          </Button>
        </div>
        <p className="mt-3 text-sm text-fg-muted" role="status" aria-live="polite">
          {message ?? ''}
        </p>
      </Card>
      {estimateCard}
    </>
  );
}
