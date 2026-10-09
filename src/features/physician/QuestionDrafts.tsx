// Preguntas reestructuradas por IA en la cola del médico (8.6, pantalla 20). Pedir una propuesta,
// revisar la que llega con la original al lado, aprobarla como variante o rechazarla.
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { useAiStatus } from '@/ai/useAiStatus';
import { SCREENS } from '@/app/screens';
import { useDataApi } from '@/data/context';
import { useLiveData } from '@/data/hooks';
import type { AiArtifact } from '@/data/schemas/activity';
import type { Question } from '@/data/schemas/bank';
import type { User } from '@/data/schemas/people';
import { t } from '@/i18n/es-MX';
import { Badge } from '@/ui/components/badge';
import { Button } from '@/ui/components/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/ui/components/card';
import { Disclosure } from '@/ui/components/disclosure';
import { SelectField, TextAreaField, TextField } from '@/ui/components/field';
import { LoadingState } from '@/ui/states/states';
import { bankTaxonomy } from './bankTaxonomy';
import { InvalidDraftError } from './editorActions';
import { draftFromVersion, type DraftIssue, type QuestionDraft } from './editorDraft';
import { OptionsEditor } from './EditorSections';
import { draftFromProposal, TRANSFORMS, type Transform } from './restructure';
import {
  decideRestructure,
  DecisionError,
  readContent,
  requestRestructure,
} from './restructureActions';

const normalize = (text: string) => text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const MAX_RESULTS = 6;
const date = (iso: string) => new Date(iso).toLocaleDateString('es-MX');

type Person = Pick<User, 'id' | 'alias'>;

export function QuestionDrafts({
  physician,
  questions,
  artifacts,
  notice,
  onNotice,
}: {
  physician: Person;
  /** Las preguntas que este médico puede reestructurar */
  questions: readonly Question[];
  artifacts: readonly AiArtifact[];
  notice: string;
  onNotice: (message: string) => void;
}) {
  const text = t.draftsScreen.questions;
  const proposals = artifacts.filter((artifact) => artifact.kind === 'restructured_question');
  const pending = proposals.filter((artifact) => artifact.status === 'draft');
  const decided = proposals
    .filter((artifact) => artifact.status !== 'draft')
    .sort((a, b) => (b.decidedAt ?? '').localeCompare(a.decidedAt ?? ''));
  return (
    <>
      <RequestCard physician={physician} questions={questions} onNotice={onNotice} />
      <p role="status" className="text-sm font-medium text-success">
        {notice}
      </p>
      <section aria-labelledby="borradores-pendientes" className="flex flex-col gap-3">
        <h2 id="borradores-pendientes" className="text-lg font-semibold">
          {text.pendingTitle}
        </h2>
        {pending.length === 0 ? (
          <p className="text-sm text-fg-muted">{text.pendingEmpty}</p>
        ) : (
          pending.map((artifact) => (
            <ProposalCard
              key={artifact.id}
              artifact={artifact}
              physician={physician}
              onNotice={onNotice}
            />
          ))
        )}
      </section>
      <Disclosure title={text.decidedTitle} summary={String(decided.length)}>
        {decided.length === 0 ? (
          <p className="text-sm text-fg-muted">{text.decidedEmpty}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-line">
            {decided.map((artifact) => {
              const content = readContent(artifact);
              return (
                <li key={artifact.id} className="flex flex-col gap-1 py-2">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                    {content ? text.transforms[content.transform] : artifact.id}
                    <Badge variant={artifact.status === 'rejected' ? 'neutral' : 'success'}>
                      {text.status[artifact.status]}
                    </Badge>
                  </p>
                  <p className="line-clamp-2 text-sm text-fg-muted">{content?.proposal.stem}</p>
                  <p className="text-xs text-fg-muted">
                    {artifact.decidedAt ? text.decidedOn(date(artifact.decidedAt)) : ''}
                  </p>
                  {content?.variantQuestionId ? (
                    <Button asChild size="sm" variant="ghost" className="self-start">
                      <Link
                        to={`${SCREENS.questionEditor.path}?pregunta=${content.variantQuestionId}`}
                      >
                        {text.openVariant}
                      </Link>
                    </Button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </Disclosure>
    </>
  );
}

function RequestCard({
  physician,
  questions,
  onNotice,
}: {
  physician: Person;
  questions: readonly Question[];
  onNotice: (message: string) => void;
}) {
  const text = t.draftsScreen.questions;
  const api = useDataApi();
  const status = useAiStatus();
  const [query, setQuery] = useState('');
  const [chosen, setChosen] = useState<Question | null>(null);
  const [transform, setTransform] = useState<Transform>('to_except');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const needle = normalize(query.trim());
  const results = needle
    ? questions
        .filter((question) => normalize(`${question.prompt} ${question.vignette}`).includes(needle))
        .slice(0, MAX_RESULTS)
    : [];

  const ask = async () => {
    if (!chosen || busy) return;
    setBusy(true);
    setError('');
    onNotice('');
    try {
      const options = await api.repos.options.listForQuestionVersion(chosen.id);
      const result = await requestRestructure(api, physician, {
        question: chosen,
        options,
        transform,
        status,
      });
      if (result.ok) onNotice(result.reused ? text.reused : text.created);
      else setError(text.failed[result.reason] ?? text.failed.other ?? '');
    } catch {
      setError(text.failed.other ?? '');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card aria-labelledby="pedir-propuesta">
      <CardHeader>
        <CardTitle id="pedir-propuesta">{text.requestTitle}</CardTitle>
        <CardDescription>{text.requestHint}</CardDescription>
      </CardHeader>
      <div className="flex flex-col gap-3">
        <TextField
          label={text.search}
          hint={text.searchHint}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
          }}
        />
        {needle && results.length === 0 ? (
          <p className="text-sm text-fg-muted">{text.noResults}</p>
        ) : null}
        {results.length > 0 ? (
          <ul className="flex flex-col divide-y divide-line">
            {results.map((question) => (
              <li key={question.id} className="flex items-center gap-2 py-2">
                <span className="min-w-0 flex-1 text-sm">{question.prompt}</span>
                <Button
                  size="sm"
                  variant={chosen?.id === question.id ? 'primary' : 'secondary'}
                  aria-pressed={chosen?.id === question.id}
                  aria-label={`${text.pick}. ${question.prompt}`}
                  onClick={() => {
                    setChosen(question);
                  }}
                >
                  {text.pick}
                </Button>
              </li>
            ))}
          </ul>
        ) : null}
        {chosen ? (
          <p className="rounded-md bg-muted p-3 text-sm">
            <span className="font-semibold">{text.chosen}. </span>
            {chosen.prompt}
          </p>
        ) : null}
        <SelectField
          label={text.transform}
          value={transform}
          options={TRANSFORMS.map((value) => ({ value, label: text.transforms[value] ?? value }))}
          onChange={(event) => {
            setTransform(event.target.value as Transform);
          }}
        />
        <div className="flex flex-wrap items-center gap-3">
          <Button
            disabled={!chosen || busy}
            onClick={() => {
              void ask();
            }}
          >
            {busy ? text.asking : text.ask}
          </Button>
          {error ? (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          ) : null}
        </div>
      </div>
    </Card>
  );
}

function ProposalCard({
  artifact,
  physician,
  onNotice,
}: {
  artifact: AiArtifact;
  physician: Person;
  onNotice: (message: string) => void;
}) {
  const text = t.draftsScreen.questions;
  const api = useDataApi();
  const content = readContent(artifact);
  const original = useLiveData(async () => {
    if (!content) return null;
    const question = await api.repos.questions.get(content.questionVersionId);
    if (!question) return null;
    return { question, options: await api.repos.options.listForQuestionVersion(question.id) };
  }, [api.repos, content?.questionVersionId]);

  const [failed, setFailed] = useState(false);
  const reject = async () => {
    try {
      await decideRestructure(api, physician, artifact.id, { kind: 'reject' });
      onNotice(text.rejectedNotice);
    } catch {
      setFailed(true);
    }
  };

  if (original === undefined) return <LoadingState />;
  if (!content || original === null) {
    return (
      <Card aria-label={text.proposal}>
        <p className="mb-3 text-sm">{text.originalGone}</p>
        <Button
          variant="secondary"
          onClick={() => {
            void reject();
          }}
        >
          {text.reject}
        </Button>
        {failed ? (
          <p role="alert" className="mt-2 text-sm text-danger">
            {text.decisionFailed}
          </p>
        ) : null}
      </Card>
    );
  }
  return (
    <ProposalForm
      artifact={artifact}
      content={content}
      original={original}
      physician={physician}
      onNotice={onNotice}
    />
  );
}

function ProposalForm({
  artifact,
  content,
  original,
  physician,
  onNotice,
}: {
  artifact: AiArtifact;
  content: NonNullable<ReturnType<typeof readContent>>;
  original: { question: Question; options: Parameters<typeof draftFromVersion>[1] };
  physician: Person;
  onNotice: (message: string) => void;
}) {
  const text = t.draftsScreen.questions;
  const api = useDataApi();
  const [draft, setDraft] = useState<QuestionDraft>(() =>
    draftFromProposal({
      original: draftFromVersion(original.question, original.options),
      proposal: content.proposal,
    }),
  );
  const [issues, setIssues] = useState<DraftIssue[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const titleId = `propuesta-${artifact.id}`;

  const decide = async (kind: 'approve' | 'reject') => {
    setBusy(true);
    setError('');
    try {
      if (kind === 'reject') {
        await decideRestructure(api, physician, artifact.id, { kind });
        onNotice(text.rejectedNotice);
      } else {
        await decideRestructure(api, physician, artifact.id, {
          kind,
          draft,
          taxonomy: bankTaxonomy,
        });
        onNotice(text.approvedNotice);
      }
    } catch (caught) {
      if (caught instanceof InvalidDraftError) setIssues([...caught.issues]);
      else setError(caught instanceof DecisionError ? caught.message : text.decisionFailed);
    } finally {
      setBusy(false);
    }
  };

  const part = (title: string, children: ReactNode) => (
    <div className="flex flex-col gap-2">
      <h4 className="font-semibold">{title}</h4>
      {children}
    </div>
  );

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
      }}
      aria-labelledby={titleId}
    >
      <Card>
        <CardHeader>
          <CardTitle id={titleId} className="flex flex-wrap items-center gap-2 text-base">
            {text.transforms[content.transform]}
            <Badge variant="warning" className="whitespace-normal">
              {t.draftsScreen.draftLabel}
            </Badge>
            <Badge variant="neutral">{text.modes[artifact.mode]}</Badge>
          </CardTitle>
          <CardDescription>{text.reviewHint}</CardDescription>
        </CardHeader>
        <div className="grid items-start gap-4 lg:grid-cols-2">
          {part(
            text.original,
            <div className="flex flex-col gap-2 rounded-md bg-muted p-3 text-sm">
              <p>{content.original.stem}</p>
              <ol className="flex flex-col gap-1">
                {content.original.options.map((option) => (
                  <li key={option.label} className={option.isKey ? 'font-semibold' : undefined}>
                    {option.label}. {option.text}
                    {option.isKey ? ` · ${t.questionEditor.options.key}` : ''}
                  </li>
                ))}
              </ol>
              <p className="text-fg-muted">{content.original.explanation}</p>
            </div>,
          )}
          {part(
            text.proposal,
            <div className="flex flex-col gap-3">
              <p className="rounded-md bg-primary-soft p-3 text-sm">
                <span className="font-semibold">{text.rationale}. </span>
                {content.proposal.rationale}
              </p>
              <p className="text-xs text-fg-muted">
                {text.quote}. {content.proposal.quote}
              </p>
              {original.question.vignette ? (
                <TextAreaField
                  label={t.questionEditor.case.vignette}
                  rows={3}
                  value={draft.vignette}
                  onChange={(event) => {
                    setDraft({ ...draft, vignette: event.target.value });
                  }}
                />
              ) : null}
              <TextAreaField
                label={t.questionEditor.case.prompt}
                rows={2}
                value={draft.prompt}
                onChange={(event) => {
                  setDraft({ ...draft, prompt: event.target.value });
                }}
              />
              <TextAreaField
                label={t.questionEditor.meta.explanation}
                rows={3}
                value={draft.explanation}
                onChange={(event) => {
                  setDraft({ ...draft, explanation: event.target.value });
                }}
              />
            </div>,
          )}
        </div>
        <div className="mt-3">
          <OptionsEditor
            options={draft.options}
            issues={issues}
            onChange={(options) => {
              setDraft({ ...draft, options });
            }}
          />
        </div>
        {issues.length > 0 ? (
          <div role="alert" className="mt-3 rounded-md border border-danger p-3">
            <p className="font-semibold">{t.questionEditor.save.invalid}</p>
            <ul className="list-disc pl-5 text-sm">
              {issues.map((issue, index) => (
                <li key={index}>
                  {issue.option === undefined
                    ? t.questionEditor.issues[issue.code]
                    : t.questionEditor.issueAt(
                        issue.option + 1,
                        t.questionEditor.issues[issue.code] ?? issue.code,
                      )}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {error ? (
          <p role="alert" className="mt-3 text-sm text-danger">
            {error}
          </p>
        ) : null}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button
            disabled={busy}
            onClick={() => {
              void decide('approve');
            }}
          >
            {text.approve}
          </Button>
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => {
              void decide('reject');
            }}
          >
            {text.reject}
          </Button>
          <p className="text-sm text-fg-muted">{text.approveHint}</p>
        </div>
      </Card>
    </form>
  );
}
