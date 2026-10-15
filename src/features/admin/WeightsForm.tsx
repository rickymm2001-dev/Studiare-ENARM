// Pesos del ENARM (pantalla 25, 13.4). El peso de cada rama y de cada tema decide cuánto cuenta en el
// puntaje de dominio, en el examen y en el plan. Desde B11 los de fábrica son los reactivos de cada rama
// sobre 250 de la sección 6 del plan del cambio, con Salud pública como séptima rama, e Inglés médico
// aparte con sus 30. Están marcados como provisionales, con su fuente, hasta que el admin capture los
// oficiales y apague la marca (respuestas 59, 60 y 61). Se guardan en el servidor con la nube y en este
// navegador sin ella, y se aplican al abrir la app.
import { useState } from 'react';
import { readStoredOverrides } from '@/config/overridesStore';
import { topicTaxonomy } from '@/demo/content';
import { adminText } from '@/i18n/admin';
import { bankAdminText } from '@/i18n/bankAdmin';
import { Badge } from '@/ui/components/badge';
import { Button } from '@/ui/components/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/ui/components/card';
import { Disclosure } from '@/ui/components/disclosure';
import { CheckboxField, TextField } from '@/ui/components/field';
import { commitOverrides } from './commitOverrides';
import {
  branchesBySection,
  currentDraft,
  factoryDraft,
  positive,
  weightsProvisional,
  weightsToStore,
  type WeightsDraft,
} from './weightsDraft';

type Branch = (typeof topicTaxonomy.branches)[number];

export function WeightsForm() {
  const text = adminText.adminConfig.weightsForm;
  const marks = bankAdminText.weights;
  const [draft, setDraft] = useState<WeightsDraft>(currentDraft);
  const [provisional, setProvisional] = useState(() => weightsProvisional());
  const [message, setMessage] = useState<'saved' | 'reset' | 'failed' | null>(null);
  const sections = branchesBySection();

  const invalid =
    Object.values(draft.branches).some((raw) => !positive(raw)) ||
    Object.values(draft.topics).some((raw) => !positive(raw));
  const running = currentDraft();
  const differs =
    Object.entries(draft.branches).some(([key, raw]) => raw !== running.branches[key]) ||
    Object.entries(draft.topics).some(([key, raw]) => raw !== running.topics[key]) ||
    provisional !== weightsProvisional();

  const save = async () => {
    const weights = weightsToStore(draft, provisional);
    const { weights: _old, ...rest } = readStoredOverrides() ?? {};
    const ok = await commitOverrides(
      weights ? { ...rest, weights } : Object.keys(rest).length > 0 ? rest : null,
    );
    setMessage(ok ? 'saved' : 'failed');
  };
  const reset = async () => {
    const { weights: _old, ...rest } = readStoredOverrides() ?? {};
    const ok = await commitOverrides(Object.keys(rest).length > 0 ? rest : null);
    setDraft(factoryDraft());
    setProvisional(topicTaxonomy.weightsProvisional ?? true);
    setMessage(ok ? 'reset' : 'failed');
  };
  const set = (kind: keyof WeightsDraft, key: string) => (event: { target: { value: string } }) => {
    setMessage(null);
    setDraft((current) => ({
      ...current,
      [kind]: { ...current[kind], [key]: event.target.value },
    }));
  };

  const branchFields = (branch: Branch) => (
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
  );

  return (
    <Card aria-labelledby="config-pesos">
      <CardHeader>
        <CardTitle id="config-pesos">{text.title}</CardTitle>
        <CardDescription>{text.hint}</CardDescription>
      </CardHeader>
      <p className="mb-2 flex flex-wrap items-center gap-2 text-sm text-fg-muted">
        <Badge variant={provisional ? 'warning' : 'success'}>
          {provisional ? marks.provisionalMark : marks.officialMark}
        </Badge>
        {text.provisional}
      </p>
      {topicTaxonomy.weightsSource ? (
        <p className="mb-2 text-sm text-fg-muted">{marks.source(topicTaxonomy.weightsSource)}</p>
      ) : null}
      <CheckboxField
        className="mb-3"
        label={marks.provisional}
        hint={marks.provisionalHint}
        checked={provisional}
        onChange={(event) => {
          setMessage(null);
          setProvisional(event.target.checked);
        }}
      />
      <h3 className="mb-2 font-semibold">{marks.clinical}</h3>
      <div className="flex flex-col gap-3">{sections.clinical.map(branchFields)}</div>
      {sections.english.length > 0 ? (
        <>
          <h3 className="mt-4 mb-1 font-semibold">{marks.english}</h3>
          <p className="mb-2 text-sm text-fg-muted">{marks.englishHint}</p>
          <div className="flex flex-col gap-3">{sections.english.map(branchFields)}</div>
        </>
      ) : null}
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
