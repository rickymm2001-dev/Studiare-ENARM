// Secciones del editor de pregunta (pantalla 18). Opciones con su etiqueta y su definición a la
// vista, referencias de GPC, datos del caso y el historial de versiones.
import { Plus, Trash2 } from 'lucide-react';
import type { Question } from '@/data/schemas/bank';
import { TAGGABLE_BIASES } from '@/data/usecases/labeling';
import { t } from '@/i18n/es-MX';
import { Badge } from '@/ui/components/badge';
import { Button } from '@/ui/components/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/ui/components/card';
import { Disclosure } from '@/ui/components/disclosure';
import { CheckboxField, SelectField, TextAreaField, TextField } from '@/ui/components/field';
import {
  changedParts,
  emptyOption,
  MAX_OPTIONS,
  MAX_SECONDARY_TAGS,
  MIN_OPTIONS,
  type DraftClue,
  type DraftIssue,
  type DraftOption,
  type QuestionDraft,
} from './editorDraft';

const biasByKey = new Map(TAGGABLE_BIASES.map((bias) => [bias.key, bias]));
const excerpt = (text: string) => (text.length > 70 ? `${text.slice(0, 70)}…` : text);

export function OptionsEditor({
  options,
  issues,
  onChange,
}: {
  options: DraftOption[];
  issues: readonly DraftIssue[];
  onChange: (options: DraftOption[]) => void;
}) {
  const text = t.questionEditor.options;
  const patch = (index: number, change: Partial<DraftOption>) => {
    onChange(options.map((option, at) => (at === index ? { ...option, ...change } : option)));
  };
  const markCorrect = (index: number) => {
    onChange(
      options.map((option, at) =>
        at === index
          ? { ...option, isCorrect: true, biasTag: null, secondaryBiasTags: [], canonical: true }
          : option.isCorrect
            ? { ...option, isCorrect: false }
            : option,
      ),
    );
  };
  return (
    <Card aria-labelledby="editor-opciones">
      <CardHeader>
        <CardTitle id="editor-opciones">{t.questionEditor.sections.options}</CardTitle>
        <CardDescription>
          {text.count(options.length)}. {text.hint}
        </CardDescription>
      </CardHeader>
      <ol className="flex flex-col gap-2">
        {options.map((option, index) => {
          const problems = issues.filter((issue) => issue.option === index).length;
          const bias = option.biasTag ? biasByKey.get(option.biasTag) : undefined;
          return (
            <li key={option.optionId}>
              <div role="group" aria-label={text.title(index + 1)}>
                <Disclosure
                  title={
                    <span className="flex flex-wrap items-center gap-2">
                      {text.title(index + 1)}
                      <Badge variant={option.isCorrect ? 'success' : 'neutral'}>
                        {option.isCorrect ? text.key : text.distractor}
                      </Badge>
                      {problems > 0 ? (
                        <Badge variant="danger">{t.questionEditor.save.invalid}</Badge>
                      ) : null}
                    </span>
                  }
                  summary={option.text ? excerpt(option.text) : undefined}
                >
                  <TextAreaField
                    label={text.text}
                    value={option.text}
                    rows={2}
                    onChange={(event) => {
                      patch(index, { text: event.target.value });
                    }}
                  />
                  <label className="flex items-center gap-3 font-medium">
                    <input
                      type="radio"
                      name="opcion-correcta"
                      className="size-5 accent-[var(--color-primary)]"
                      checked={option.isCorrect}
                      onChange={() => {
                        markCorrect(index);
                      }}
                    />
                    {text.correct}
                  </label>
                  {option.isCorrect ? null : (
                    <>
                      <SelectField
                        label={text.tag}
                        value={option.biasTag ?? ''}
                        options={[
                          { value: '', label: text.tagNone },
                          ...TAGGABLE_BIASES.map((item) => ({ value: item.key, label: item.name })),
                        ]}
                        onChange={(event) => {
                          const tag = event.target.value || null;
                          patch(index, {
                            biasTag: tag,
                            secondaryBiasTags: option.secondaryBiasTags.filter(
                              (item) => item !== tag,
                            ),
                          });
                        }}
                      />
                      {bias ? (
                        <p className="text-sm text-fg-muted">{bias.distractorDefinition}</p>
                      ) : null}
                      <Disclosure
                        title={text.secondary}
                        summary={String(option.secondaryBiasTags.length)}
                      >
                        <p className="text-sm text-fg-muted">{text.secondaryHint}</p>
                        <div className="grid gap-2 sm:grid-cols-2">
                          {TAGGABLE_BIASES.filter((item) => item.key !== option.biasTag).map(
                            (item) => {
                              const on = option.secondaryBiasTags.includes(item.key);
                              return (
                                <CheckboxField
                                  key={item.key}
                                  label={item.name}
                                  checked={on}
                                  disabled={
                                    !on && option.secondaryBiasTags.length >= MAX_SECONDARY_TAGS
                                  }
                                  onChange={(event) => {
                                    patch(index, {
                                      secondaryBiasTags: event.target.checked
                                        ? [...option.secondaryBiasTags, item.key]
                                        : option.secondaryBiasTags.filter(
                                            (tag) => tag !== item.key,
                                          ),
                                    });
                                  }}
                                />
                              );
                            },
                          )}
                        </div>
                      </Disclosure>
                    </>
                  )}
                  <TextAreaField
                    label={text.rationale}
                    value={option.rationale}
                    rows={2}
                    onChange={(event) => {
                      patch(index, { rationale: event.target.value });
                    }}
                  />
                  <CheckboxField
                    label={text.canonical}
                    hint={text.canonicalHint}
                    checked={option.canonical}
                    disabled={option.isCorrect}
                    onChange={(event) => {
                      patch(index, { canonical: event.target.checked });
                    }}
                  />
                  <div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={options.length <= MIN_OPTIONS}
                      onClick={() => {
                        onChange(options.filter((_, at) => at !== index));
                      }}
                    >
                      <Trash2 aria-hidden />
                      {text.remove}
                    </Button>
                  </div>
                </Disclosure>
              </div>
            </li>
          );
        })}
      </ol>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="secondary"
          disabled={options.length >= MAX_OPTIONS}
          onClick={() => {
            onChange([...options, emptyOption()]);
          }}
        >
          <Plus aria-hidden />
          {text.add}
        </Button>
        {options.length >= MAX_OPTIONS ? (
          <p className="text-sm text-fg-muted">{text.full}</p>
        ) : null}
      </div>
    </Card>
  );
}

export function GpcEditor({
  refs,
  onChange,
}: {
  refs: QuestionDraft['gpcRefs'];
  onChange: (refs: QuestionDraft['gpcRefs']) => void;
}) {
  const text = t.questionEditor.gpc;
  return (
    <Card aria-labelledby="editor-gpc">
      <CardHeader>
        <CardTitle id="editor-gpc">{t.questionEditor.sections.gpc}</CardTitle>
        <CardDescription>{text.hint}</CardDescription>
      </CardHeader>
      {refs.length === 0 ? <p className="mb-3 text-sm text-fg-muted">{text.none}</p> : null}
      <ul className="flex flex-col gap-3">
        {refs.map((ref, index) => (
          <li key={index} className="grid items-end gap-2 sm:grid-cols-[1fr_12rem_auto]">
            <TextField
              label={text.title}
              value={ref.title}
              onChange={(event) => {
                onChange(
                  refs.map((item, at) =>
                    at === index ? { ...item, title: event.target.value } : item,
                  ),
                );
              }}
            />
            <SelectField
              label={text.status}
              value={ref.status}
              options={[
                { value: 'to_verify', label: text.toVerify },
                { value: 'verified', label: text.verified },
              ]}
              onChange={(event) => {
                onChange(
                  refs.map((item, at) =>
                    at === index
                      ? {
                          ...item,
                          status: event.target.value === 'verified' ? 'verified' : 'to_verify',
                        }
                      : item,
                  ),
                );
              }}
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label={`${text.remove} ${index + 1}`}
              onClick={() => {
                onChange(refs.filter((_, at) => at !== index));
              }}
            >
              <Trash2 aria-hidden />
              {text.remove}
            </Button>
          </li>
        ))}
      </ul>
      <div className="mt-3">
        <Button
          type="button"
          variant="secondary"
          disabled={refs.length >= 10}
          onClick={() => {
            onChange([...refs, { title: '', status: 'to_verify' }]);
          }}
        >
          <Plus aria-hidden />
          {text.add}
        </Button>
      </div>
    </Card>
  );
}

export function CluesEditor({
  clues,
  onChange,
}: {
  clues: DraftClue[];
  onChange: (clues: DraftClue[]) => void;
}) {
  const text = t.questionEditor.meta;
  return (
    <Disclosure title={text.clues} summary={String(clues.length)}>
      <p className="text-sm text-fg-muted">{text.cluesHint}</p>
      <ul className="flex flex-col gap-3">
        {clues.map((clue, index) => (
          <li key={index} className="grid items-end gap-2 sm:grid-cols-[1fr_12rem_auto]">
            <TextField
              label={text.clueText}
              value={clue.text}
              onChange={(event) => {
                onChange(
                  clues.map((item, at) =>
                    at === index ? { ...item, text: event.target.value } : item,
                  ),
                );
              }}
            />
            <SelectField
              label={text.clueStrength}
              value={clue.strength}
              options={Object.entries(text.strengths).map(([value, label]) => ({ value, label }))}
              onChange={(event) => {
                const strength = event.target.value as DraftClue['strength'];
                onChange(clues.map((item, at) => (at === index ? { ...item, strength } : item)));
              }}
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label={`${text.removeClue} ${index + 1}`}
              onClick={() => {
                onChange(clues.filter((_, at) => at !== index));
              }}
            >
              <Trash2 aria-hidden />
              {text.removeClue}
            </Button>
          </li>
        ))}
      </ul>
      <div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={clues.length >= 20}
          onClick={() => {
            onChange([...clues, { text: '', strength: 'characteristic' }]);
          }}
        >
          <Plus aria-hidden />
          {text.addClue}
        </Button>
      </div>
    </Disclosure>
  );
}

export function HistoryCard({
  versions,
  drafts,
}: {
  /** De la más vieja a la más nueva */
  versions: readonly Question[];
  drafts: ReadonlyMap<string, QuestionDraft>;
}) {
  const text = t.questionEditor.history;
  const ordered = [...versions].reverse();
  return (
    <Card aria-labelledby="editor-historial">
      <CardHeader>
        <CardTitle id="editor-historial">{t.questionEditor.sections.history}</CardTitle>
        <CardDescription>{text.hint}</CardDescription>
      </CardHeader>
      <ol className="flex flex-col divide-y divide-line">
        {ordered.map((version, index) => {
          const older = ordered[index + 1];
          const after = drafts.get(version.id);
          const before = older ? drafts.get(older.id) : undefined;
          const parts = before && after ? changedParts(before, after) : [];
          return (
            <li key={version.id} className="flex flex-col gap-1 py-2">
              <p className="flex flex-wrap items-center gap-2 font-semibold">
                {t.questionEditor.status.version(version.version)}
                <Badge variant={version.editorialStatus === 'approved' ? 'success' : 'neutral'}>
                  {t.bank.status[version.editorialStatus]}
                </Badge>
                {index === 0 ? <Badge variant="info">{text.current}</Badge> : null}
              </p>
              <p className="text-sm text-fg-muted">
                {text.at(new Date(version.createdAt).toLocaleDateString('es-MX'))}
              </p>
              <p className="text-sm">
                {older === undefined
                  ? text.first
                  : parts.length === 0
                    ? text.noChanges
                    : text.changed(parts.map((part) => text.parts[part] ?? part))}
              </p>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}
