// Pesos del ENARM (pantalla 25, 13.4). El peso de cada rama y de cada tema decide cuánto cuenta en el
// puntaje de dominio, en el examen y en el plan. Los de fábrica son provisionales, iguales por rama,
// hasta que haya los oficiales. Se guardan en este navegador y se aplican al abrir la app.
import { useState } from 'react';
import { topicTaxonomy } from '@/demo/content';
import { readStoredOverrides } from '@/config/overridesStore';
import { commitOverrides } from './commitOverrides';
import { adminText } from '@/i18n/admin';
import { Button } from '@/ui/components/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/ui/components/card';
import { Disclosure } from '@/ui/components/disclosure';
import { TextField } from '@/ui/components/field';
import {
  currentDraft,
  factoryDraft,
  positive,
  weightsPatch,
  type WeightsDraft,
} from './weightsDraft';

export function WeightsForm() {
  const text = adminText.adminConfig.weightsForm;
  const [draft, setDraft] = useState<WeightsDraft>(currentDraft);
  const [message, setMessage] = useState<'saved' | 'reset' | 'failed' | null>(null);

  const invalid =
    Object.values(draft.branches).some((raw) => !positive(raw)) ||
    Object.values(draft.topics).some((raw) => !positive(raw));
  const running = currentDraft();
  const differs =
    Object.entries(draft.branches).some(([key, raw]) => raw !== running.branches[key]) ||
    Object.entries(draft.topics).some(([key, raw]) => raw !== running.topics[key]);

  const save = async () => {
    const patch = weightsPatch(draft);
    const hasChanges = Object.keys(patch.branches).length + Object.keys(patch.topics).length > 0;
    const { weights: _old, ...rest } = readStoredOverrides() ?? {};
    const ok = await commitOverrides(
      hasChanges ? { ...rest, weights: patch } : Object.keys(rest).length > 0 ? rest : null,
    );
    setMessage(ok ? 'saved' : 'failed');
  };
  const reset = async () => {
    const { weights: _old, ...rest } = readStoredOverrides() ?? {};
    const ok = await commitOverrides(Object.keys(rest).length > 0 ? rest : null);
    setDraft(factoryDraft());
    setMessage(ok ? 'reset' : 'failed');
  };
  const set = (kind: keyof WeightsDraft, key: string) => (event: { target: { value: string } }) => {
    setMessage(null);
    setDraft((current) => ({
      ...current,
      [kind]: { ...current[kind], [key]: event.target.value },
    }));
  };

  return (
    <Card aria-labelledby="config-pesos">
      <CardHeader>
        <CardTitle id="config-pesos">{text.title}</CardTitle>
        <CardDescription>{text.hint}</CardDescription>
      </CardHeader>
      <p className="mb-3 text-sm text-fg-muted">{text.provisional}</p>
      <div className="flex flex-col gap-3">
        {topicTaxonomy.branches.map((branch) => (
          <Disclosure
            key={branch.key}
            title={branch.name}
            summary={text.branchSummary(
              Number(draft.branches[branch.key] ?? branch.weight),
              branch.topics.length,
            )}
          >
            <TextField
              label={text.branchWeight(branch.name)}
              type="number"
              inputMode="decimal"
              step={0.1}
              min={0.1}
              value={draft.branches[branch.key] ?? ''}
              error={positive(draft.branches[branch.key] ?? '') ? null : text.invalid}
              onChange={set('branches', branch.key)}
            />
            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
              {branch.topics.map((topic) => {
                const key = `${branch.key}/${topic.key}`;
                return (
                  <TextField
                    key={key}
                    label={topic.name}
                    type="number"
                    inputMode="decimal"
                    step={0.1}
                    min={0.1}
                    value={draft.topics[key] ?? ''}
                    error={positive(draft.topics[key] ?? '') ? null : text.invalid}
                    onChange={set('topics', key)}
                  />
                );
              })}
            </div>
          </Disclosure>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button
          disabled={invalid || !differs}
          onClick={() => {
            void save();
          }}
        >
          {text.save}
        </Button>
        <Button
          variant="ghost"
          onClick={() => {
            void reset();
          }}
        >
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
