// Editor de pregunta (pantalla 18, 10.2 y 4.2 del plan de B11). Caso, enunciado, de 4 a 10 opciones con
// su etiqueta y su definición a la vista, set canónico, explicación, referencias de GPC, tema,
// estructura, dificultad e historial de versiones con sus decisiones. Cada guardado crea una versión
// nueva en borrador y las anteriores no cambian (6.1). Con la versión en revisión el revisor pasa por
// dos pasos. Primero etiqueta a ciegas los distractores, sin ver lo del autor. Después ve la pregunta
// completa, lo que cambió, sus pendientes y las casillas por confirmar, y decide. El autor manda a
// revisión. El admin y el dueño solo leen. Lo que viene del Sheet se corrige en el Sheet, y un
// conflicto con el Sheet se resuelve aquí sin pisar nada.
import { useMemo, useState, type SyntheticEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import { ArrowLeft, Sparkles } from 'lucide-react';
import { ScreenHeader } from '@/app/layout/ScreenHeader';
import { SCREENS } from '@/app/screens';
import type { EditorQuestion, EditorVersion } from '@/data/bank/contracts';
import {
  errorCodeOf,
  type EditorialRepo,
  type ReviewDecision,
} from '@/data/editorial/editorialRepo';
import { TAGGABLE_BIASES } from '@/data/usecases/labeling';
import { structureDictionary, topicTaxonomy } from '@/demo/content';
import { analyzeStructure } from '@/engines/structure';
import { t } from '@/i18n/es-MX';
import { physicianText } from '@/i18n/physician';
import { Badge } from '@/ui/components/badge';
import { Button } from '@/ui/components/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/ui/components/card';
import { CheckboxField, SelectField, TextAreaField } from '@/ui/components/field';
import { SaveBar } from '@/ui/components/save-bar';
import { EmptyState, ErrorState, LoadingState } from '@/ui/states/states';
import { bankTaxonomy } from './bankTaxonomy';
import { InvalidDraftError } from './editorActions';
import {
  blockingIssues,
  draftFromEditorVersion,
  validateDraft,
  type DraftIssue,
  type QuestionDraft,
} from './editorDraft';
import { CluesEditor, GpcEditor, HistoryCard, OptionsEditor } from './EditorSections';
import { VersionPreview } from './QuestionPreview';
import { approvalBlockers, reviewViewOf, type ReviewView } from './reviewSteps';
import { flagText, incompleteText } from './reviewTexts';
import { useEditorialRepo } from './useEditorialRepo';
import { useRepoQuery } from './useRepoQuery';

const options = (entries: Record<string, string>) =>
  Object.entries(entries).map(([value, label]) => ({ value, label }));

const sameDraft = (a: QuestionDraft, b: QuestionDraft) => JSON.stringify(a) === JSON.stringify(b);

const biasName = new Map(TAGGABLE_BIASES.map((bias) => [bias.key, bias.name]));
const biasDefinition = new Map(
  TAGGABLE_BIASES.map((bias) => [bias.key, bias.distractorDefinition]),
);

/** El aviso de un error de las funciones del banco */
const errorText = (error: unknown) =>
  physicianText.errors[errorCodeOf(error)] ?? physicianText.errors.unknown ?? '';

export function QuestionEditorScreen() {
  const text = physicianText.questionEditor;
  const [params] = useSearchParams();
  const questionId = params.get('pregunta');
  const { repo, ready, key } = useEditorialRepo();
  // Los avisos viven aquí y no en los paneles, porque al guardar o decidir la pregunta se vuelve a
  // leer y los paneles se arman otra vez
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const { state, reload } = useRepoQuery(
    () => (questionId ? repo.question(questionId) : Promise.resolve(null)),
    `${key}|${questionId ?? ''}`,
    ready,
  );

  const header = (
    <ScreenHeader
      title={t.screens.questionEditor.title}
      description={physicianText.descriptions.questionEditor}
    />
  );
  const backToBank = (
    <Button asChild variant="secondary">
      <Link to={SCREENS.questionBank.path}>
        <ArrowLeft aria-hidden />
        {text.back}
      </Link>
    </Button>
  );
  const empty = (title: string, description: string) => (
    <>
      {header}
      <EmptyState title={title} description={description} action={backToBank} />
    </>
  );

  if (!questionId) return empty(text.noQuestion.title, text.noQuestion.description);
  if (state.status === 'loading') {
    return (
      <>
        {header}
        <LoadingState />
      </>
    );
  }
  if (state.status === 'failed') {
    if (state.code === 'not_assigned') {
      return empty(text.notAssigned.title, text.notAssigned.description);
    }
    if (state.code === 'not_found' || state.code === 'invalid') {
      return empty(text.notFound.title, text.notFound.description);
    }
    return (
      <>
        {header}
        <ErrorState description={physicianText.errors[state.code] ?? ''} onRetry={reload} />
      </>
    );
  }
  const question = state.value;
  const view = question ? reviewViewOf(question) : null;
  if (!question || !view) return empty(text.notFound.title, text.notFound.description);

  const act = async (work: () => Promise<string>) => {
    setError('');
    setNotice('');
    try {
      setNotice(await work());
    } catch (caught) {
      setError(errorText(caught));
    }
    reload();
  };

  return (
    <>
      {header}
      <StatusCard question={question} view={view} back={backToBank} notice={notice} error={error} />
      {view.conflict && view.step !== 'read_only' ? (
        <ConflictCard
          onChoose={(choice) =>
            act(async () => {
              await repo.resolveSyncConflict(question.question.questionId, choice);
              return choice === 'keep_app'
                ? physicianText.review.conflict.keptApp
                : physicianText.review.conflict.tookSheet;
            })
          }
        />
      ) : null}
      {view.step === 'blind' ? (
        <BlindStep
          key={view.latest.versionId}
          repo={repo}
          question={question}
          view={view}
          onSaved={(message) => {
            setError('');
            setNotice(message);
            reload();
          }}
          onFailed={(message) => {
            setError(message);
            reload();
          }}
        />
      ) : (
        <ReviewBody
          repo={repo}
          question={question}
          view={view}
          act={act}
          onSaved={(message) => {
            setError('');
            setNotice(message);
            reload();
          }}
          onFailed={(message) => {
            setNotice('');
            setError(message);
          }}
          onStale={() => {
            setNotice('');
            setError(physicianText.errors.stale ?? '');
            reload();
          }}
        />
      )}
    </>
  );
}

function StatusCard({
  question,
  view,
  back,
  notice,
  error,
}: {
  question: EditorQuestion;
  view: ReviewView;
  back: React.ReactNode;
  notice: string;
  error: string;
}) {
  const text = physicianText.questionEditor;
  const review = physicianText.review;
  const { latest } = view;
  return (
    <Card aria-labelledby="editor-estado">
      <CardHeader>
        <CardTitle id="editor-estado" className="flex flex-wrap items-center gap-2">
          {text.status.title}
          {view.sheetKey ? <Badge>{physicianText.bankScreen.sheetId(view.sheetKey)}</Badge> : null}
          <Badge variant="info">{text.status.version(latest.version)}</Badge>
          <Badge variant={latest.status === 'approved' ? 'success' : 'neutral'}>
            {physicianText.bank.status[latest.status]}
          </Badge>
          {question.question.publishedVersion !== null ? (
            <Badge variant="success">
              {physicianText.bankScreen.published(question.question.publishedVersion)}
            </Badge>
          ) : null}
        </CardTitle>
        <CardDescription>{text.status.hint}</CardDescription>
      </CardHeader>
      {view.step === 'read_only' ? (
        <p className="text-sm text-fg-muted">{review.readOnly}</p>
      ) : null}
      {view.step === 'waiting' ? <p className="text-sm text-fg-muted">{review.waiting}</p> : null}
      {view.step === 'closed' ? (
        <p className="text-sm text-fg-muted">
          {review.closed(physicianText.bank.status[latest.status])}
        </p>
      ) : null}
      {question.reports.open > 0 ? (
        <p className="text-sm text-fg-muted">
          {physicianText.bankScreen.reports(question.reports.open)}
        </p>
      ) : null}
      {question.distractorFlags.some((flag) => flag.status === 'open') ? (
        <p className="text-sm text-fg-muted">
          {review.distractorFlags(
            question.distractorFlags.filter((flag) => flag.status === 'open').length,
          )}
        </p>
      ) : null}
      <div className="mt-2 flex flex-wrap items-center gap-2">{back}</div>
      <p role="status" className="mt-2 text-sm font-medium text-success">
        {notice}
      </p>
      {error ? (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      ) : null}
    </Card>
  );
}

function ConflictCard({
  onChoose,
}: {
  onChoose: (choice: 'keep_app' | 'take_sheet') => Promise<void>;
}) {
  const text = physicianText.review.conflict;
  const [busy, setBusy] = useState(false);
  const choose = (choice: 'keep_app' | 'take_sheet') => {
    setBusy(true);
    void onChoose(choice).finally(() => {
      setBusy(false);
    });
  };
  return (
    <Card aria-labelledby="editor-conflicto">
      <CardHeader>
        <CardTitle id="editor-conflicto">{text.title}</CardTitle>
        <CardDescription>{text.body}</CardDescription>
      </CardHeader>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          disabled={busy}
          onClick={() => {
            choose('keep_app');
          }}
        >
          {text.keepApp}
        </Button>
        <Button
          variant="secondary"
          disabled={busy}
          onClick={() => {
            choose('take_sheet');
          }}
        >
          {text.takeSheet}
        </Button>
      </div>
    </Card>
  );
}

/** Paso 1. El revisor etiqueta a ciegas cada distractor, sin ver lo del autor (4.4) */
function BlindStep({
  repo,
  question,
  view,
  onSaved,
  onFailed,
}: {
  repo: EditorialRepo;
  question: EditorQuestion;
  view: ReviewView;
  onSaved: (message: string) => void;
  onFailed: (message: string) => void;
}) {
  const text = physicianText.review.blind;
  const { latest } = view;
  const mine = new Map(question.review.myLabels.map((label) => [label.optionId, label.tag]));
  const [busy, setBusy] = useState<string | null>(null);
  const ordered = [...latest.options].sort((a, b) => a.position - b.position);

  const choose = async (optionId: string, letter: string, tag: string) => {
    if (tag === '') return;
    setBusy(optionId);
    try {
      const result = await repo.label(latest.versionId, optionId, tag);
      const saved = text.saved(biasName.get(tag) ?? tag, letter);
      onSaved(result.revealed ? `${saved} ${text.revealed}` : saved);
    } catch (caught) {
      onFailed(errorCodeOf(caught) === 'blind_labels' ? text.locked : errorText(caught));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card aria-labelledby="editor-ciegas">
      <CardHeader>
        <CardTitle id="editor-ciegas">{text.title}</CardTitle>
        <CardDescription>{text.hint}</CardDescription>
      </CardHeader>
      {view.blind ? (
        <p className="mb-2 text-sm font-medium">
          {text.progress(view.blind.done, view.blind.total)}
        </p>
      ) : null}
      <div className="flex flex-col gap-3">
        {question.case ? (
          <p className="rounded-md bg-muted p-3 text-sm">{question.case.vignette}</p>
        ) : null}
        {latest.vignette ? <p className="text-sm">{latest.vignette}</p> : null}
        <p className="font-medium">{latest.prompt}</p>
        <ol className="flex flex-col gap-3">
          {ordered.map((option) => {
            const letter = option.letter ?? String(option.position + 1);
            const current = mine.get(option.optionId) ?? '';
            return (
              <li key={option.id} className="flex flex-col gap-1">
                <p className="text-sm font-medium">
                  {letter}. {option.text}
                </p>
                {option.isCorrect ? (
                  <p className="text-sm text-fg-muted">{text.correct}</p>
                ) : (
                  <>
                    <SelectField
                      label={text.option(letter)}
                      value={current}
                      disabled={busy !== null}
                      options={[
                        { value: '', label: text.choose },
                        ...TAGGABLE_BIASES.map((bias) => ({ value: bias.key, label: bias.name })),
                      ]}
                      onChange={(event) => {
                        void choose(option.optionId, letter, event.target.value);
                      }}
                    />
                    {current ? (
                      <p className="text-sm text-fg-muted">{biasDefinition.get(current)}</p>
                    ) : null}
                  </>
                )}
              </li>
            );
          })}
        </ol>
      </div>
    </Card>
  );
}

/** Todo lo que no es el paso a ciegas. Decidir, mandar a revisión, editar y la historia */
function ReviewBody({
  repo,
  question,
  view,
  act,
  onSaved,
  onFailed,
  onStale,
}: {
  repo: EditorialRepo;
  question: EditorQuestion;
  view: ReviewView;
  act: (work: () => Promise<string>) => Promise<void>;
  onSaved: (message: string) => void;
  onFailed: (message: string) => void;
  onStale: () => void;
}) {
  const review = physicianText.review;
  const [editAnyway, setEditAnyway] = useState(false);
  const { latest } = view;
  const canEdit = view.editable && (!view.fromSheet || editAnyway);
  const initial = useMemo(() => draftFromEditorVersion(latest), [latest]);
  return (
    <>
      {view.step === 'decide' ? (
        <DecidePanel
          view={view}
          onDecide={(decision, comment, checks) =>
            act(async () => {
              const result = await repo.decide(latest.versionId, decision, comment, checks);
              if (decision === 'approve') {
                return result.waitingCase
                  ? review.decide.approvedWaiting
                  : review.decide.approvedPublished;
              }
              return decision === 'reject'
                ? review.decide.rejected
                : review.decide.changesRequested;
            })
          }
        />
      ) : null}
      {view.step === 'draft' ? (
        <SubmitPanel
          view={view}
          onSubmit={() =>
            act(async () => {
              await repo.submit(latest.versionId);
              return review.submit.sent;
            })
          }
        />
      ) : null}
      {view.editable && view.fromSheet && !editAnyway ? (
        <Card aria-labelledby="editor-sheet">
          <CardHeader>
            <CardTitle id="editor-sheet">{review.sheet.title}</CardTitle>
            <CardDescription>{review.sheet.body(view.sheetKey ?? '')}</CardDescription>
          </CardHeader>
          <div>
            <Button
              variant="secondary"
              onClick={() => {
                setEditAnyway(true);
              }}
            >
              {review.sheet.editAnyway}
            </Button>
          </div>
        </Card>
      ) : null}
      {canEdit ? (
        <EditorForm
          key={latest.versionId}
          repo={repo}
          questionId={question.question.questionId}
          latest={latest}
          initial={initial}
          caseVignette={question.case?.vignette ?? null}
          onSaved={onSaved}
          onFailed={onFailed}
          onStale={onStale}
        />
      ) : (
        <Card aria-labelledby="editor-lectura">
          <CardHeader>
            <CardTitle id="editor-lectura">{physicianText.questionEditor.sections.case}</CardTitle>
          </CardHeader>
          <VersionPreview version={latest} caseVignette={question.case?.vignette ?? null} />
        </Card>
      )}
      <HistoryCard versions={question.versions} />
    </>
  );
}

/** Paso 2. La pregunta completa con lo que cambió, sus pendientes y sus casillas, y la decisión */
function DecidePanel({
  view,
  onDecide,
}: {
  view: ReviewView;
  onDecide: (decision: ReviewDecision, comment: string, checks: string[]) => Promise<void>;
}) {
  const text = physicianText.review.decide;
  const history = physicianText.questionEditor.history;
  const [checked, setChecked] = useState<ReadonlySet<string>>(new Set());
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const blockers = approvalBlockers(view, checked);
  const decide = (decision: ReviewDecision) => {
    setBusy(true);
    void onDecide(decision, comment, [...checked]).finally(() => {
      setBusy(false);
    });
  };
  const noComment = comment.trim() === '';
  return (
    <Card aria-labelledby="editor-decidir">
      <CardHeader>
        <CardTitle id="editor-decidir">{text.title}</CardTitle>
        <CardDescription>{text.hint}</CardDescription>
      </CardHeader>
      <div className="flex flex-col gap-3">
        <div>
          <p className="font-medium">{text.changes}</p>
          <p className="text-sm">
            {view.changes === null
              ? text.firstVersion
              : view.changes.length === 0
                ? text.noChanges
                : history.changed(view.changes.map((part) => history.parts[part] ?? part))}
          </p>
        </div>
        <div>
          <p className="font-medium">{text.incompleteTitle}</p>
          {view.incomplete.length === 0 ? (
            <p className="text-sm text-fg-muted">{text.incompleteNone}</p>
          ) : (
            <ul className="list-disc pl-5 text-sm">
              {view.incomplete.map((code) => (
                <li key={code}>{incompleteText(code)}</li>
              ))}
            </ul>
          )}
        </div>
        {view.flags.length > 0 ? (
          <fieldset className="flex flex-col gap-2">
            <legend className="font-medium">{text.flagsTitle}</legend>
            {view.flags.map((flag) => (
              <CheckboxField
                key={flag}
                label={flagText(flag)}
                checked={checked.has(flag)}
                onChange={(event) => {
                  const next = new Set(checked);
                  if (event.target.checked) next.add(flag);
                  else next.delete(flag);
                  setChecked(next);
                }}
              />
            ))}
          </fieldset>
        ) : null}
        <TextAreaField
          label={text.comment}
          hint={text.commentHint}
          rows={3}
          maxLength={2000}
          value={comment}
          onChange={(event) => {
            setComment(event.target.value);
          }}
        />
        {blockers.length > 0 ? (
          <ul className="text-sm text-fg-muted">
            {blockers.map((blocker) => (
              <li key={blocker}>{text.blockers[blocker]}</li>
            ))}
          </ul>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={busy || blockers.length > 0}
            onClick={() => {
              decide('approve');
            }}
          >
            {text.approve}
          </Button>
          <Button
            variant="secondary"
            disabled={busy || noComment}
            onClick={() => {
              decide('request_changes');
            }}
          >
            {text.requestChanges}
          </Button>
          <Button
            variant="secondary"
            disabled={busy || noComment}
            onClick={() => {
              decide('reject');
            }}
          >
            {text.reject}
          </Button>
        </div>
      </div>
    </Card>
  );
}

/** El borrador más reciente va a revisión cuando ya no le falta nada */
function SubmitPanel({ view, onSubmit }: { view: ReviewView; onSubmit: () => Promise<void> }) {
  const text = physicianText.review.submit;
  const [busy, setBusy] = useState(false);
  return (
    <Card aria-labelledby="editor-mandar">
      <CardHeader>
        <CardTitle id="editor-mandar">{text.title}</CardTitle>
        <CardDescription>{text.hint}</CardDescription>
      </CardHeader>
      {view.decided ? <p className="text-sm font-medium">{text.decided}</p> : null}
      {view.incomplete.length > 0 ? (
        <>
          <p className="text-sm font-medium">{text.incomplete}</p>
          <ul className="mb-2 list-disc pl-5 text-sm">
            {view.incomplete.map((code) => (
              <li key={code}>{incompleteText(code)}</li>
            ))}
          </ul>
        </>
      ) : null}
      <div>
        <Button
          disabled={busy || view.decided || view.incomplete.length > 0}
          onClick={() => {
            setBusy(true);
            void onSubmit().finally(() => {
              setBusy(false);
            });
          }}
        >
          {text.action}
        </Button>
      </div>
    </Card>
  );
}

function EditorForm({
  repo,
  questionId,
  latest,
  initial,
  caseVignette,
  onSaved,
  onFailed,
  onStale,
}: {
  repo: EditorialRepo;
  questionId: string;
  latest: EditorVersion;
  initial: QuestionDraft;
  caseVignette: string | null;
  onSaved: (message: string) => void;
  onFailed: (message: string) => void;
  onStale: () => void;
}) {
  const text = physicianText.questionEditor;
  const [draft, setDraft] = useState(initial);
  const [issues, setIssues] = useState<DraftIssue[]>([]);
  const [busy, setBusy] = useState(false);
  const dirty = !sameDraft(draft, initial);
  const patch = (change: Partial<QuestionDraft>) => {
    setDraft((current) => ({ ...current, ...change }));
  };

  const auto = useMemo(
    () =>
      analyzeStructure(
        { vignette: draft.vignette, prompt: draft.prompt, serialCase: latest.caseId !== null },
        structureDictionary,
      ),
    [draft.vignette, draft.prompt, latest.caseId],
  );
  const topics = topicTaxonomy.branches.find((item) => item.key === draft.branch)?.topics ?? [];
  const subtopics = topics.find((item) => item.key === draft.topic)?.subtopics ?? [];
  const unverified = draft.gpcRefs.filter((ref) => ref.status === 'to_verify').length;

  const save = async (event?: SyntheticEvent) => {
    event?.preventDefault();
    if (!dirty || busy) return;
    const blocking = blockingIssues(validateDraft(draft, bankTaxonomy), repo.kind);
    if (blocking.length > 0) {
      setIssues(blocking);
      return;
    }
    setBusy(true);
    try {
      const saved = await repo.saveVersion(questionId, latest.versionId, draft);
      setIssues([]);
      onSaved(
        saved.incomplete.length > 0
          ? physicianText.review.saveNotes.savedIncomplete(saved.incomplete.length)
          : text.save.saved,
      );
    } catch (caught) {
      if (caught instanceof InvalidDraftError) setIssues([...caught.issues]);
      else if (errorCodeOf(caught) === 'stale') onStale();
      else onFailed(errorText(caught));
    } finally {
      setBusy(false);
    }
  };

  const structureSummary = [
    text.meta.polarities[auto.polarity],
    auto.task ? text.meta.tasks[auto.task] : null,
    text.meta.formats[auto.format],
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        void save(event);
      }}
      noValidate
    >
      {dirty ? <p className="text-sm text-fg-muted">{text.status.unsaved}</p> : null}
      {unverified > 0 ? (
        <p className="text-sm text-fg-muted">{text.status.unverifiedGpc(unverified)}</p>
      ) : null}

      <Card aria-labelledby="editor-caso">
        <CardHeader>
          <CardTitle id="editor-caso">{text.sections.case}</CardTitle>
        </CardHeader>
        <div className="flex flex-col gap-3">
          {latest.caseId !== null ? (
            <>
              <p className="font-medium">{text.case.vignette}</p>
              <p className="rounded-md bg-muted p-3 text-sm">{caseVignette ?? ''}</p>
              <p className="text-sm text-fg-muted">{text.case.vignetteSerial}</p>
            </>
          ) : (
            <TextAreaField
              label={text.case.vignette}
              hint={text.case.vignetteHint}
              rows={5}
              value={draft.vignette}
              onChange={(event) => {
                patch({ vignette: event.target.value });
              }}
            />
          )}
          <TextAreaField
            label={text.case.prompt}
            hint={text.case.promptHint}
            rows={2}
            value={draft.prompt}
            onChange={(event) => {
              patch({ prompt: event.target.value });
            }}
          />
        </div>
      </Card>

      <OptionsEditor
        options={draft.options}
        issues={issues}
        onChange={(next) => {
          patch({ options: next });
        }}
      />

      <Card aria-labelledby="editor-meta">
        <CardHeader>
          <CardTitle id="editor-meta">{text.sections.meta}</CardTitle>
        </CardHeader>
        <div className="flex flex-col gap-3">
          <TextAreaField
            label={text.meta.explanation}
            hint={text.meta.explanationHint}
            rows={4}
            value={draft.explanation}
            onChange={(event) => {
              patch({ explanation: event.target.value });
            }}
          />
          <div className="grid gap-3 sm:grid-cols-3">
            <SelectField
              label={text.meta.branch}
              value={draft.branch}
              options={topicTaxonomy.branches.map((item) => ({
                value: item.key,
                label: item.name,
              }))}
              onChange={(event) => {
                const branch = topicTaxonomy.branches.find(
                  (item) => item.key === event.target.value,
                );
                const topic = branch?.topics[0];
                patch({
                  branch: event.target.value,
                  topic: topic?.key ?? '',
                  subtopic: topic?.subtopics[0]?.key ?? '',
                });
              }}
            />
            <SelectField
              label={text.meta.topic}
              value={draft.topic}
              options={topics.map((item) => ({ value: item.key, label: item.name }))}
              onChange={(event) => {
                const topic = topics.find((item) => item.key === event.target.value);
                patch({ topic: event.target.value, subtopic: topic?.subtopics[0]?.key ?? '' });
              }}
            />
            <SelectField
              label={text.meta.subtopic}
              value={draft.subtopic}
              options={subtopics.map((item) => ({ value: item.key, label: item.name }))}
              onChange={(event) => {
                patch({ subtopic: event.target.value });
              }}
            />
          </div>
          <SelectField
            label={text.meta.difficulty}
            value={String(draft.physicianDifficulty)}
            options={[1, 2, 3, 4, 5].map((n) => ({
              value: String(n),
              label: `${n}. ${text.meta.difficultyOption(n)}`,
            }))}
            onChange={(event) => {
              patch({ physicianDifficulty: Number(event.target.value) });
            }}
          />
          <fieldset className="flex flex-col gap-3">
            <legend className="font-medium">{text.meta.structure}</legend>
            <p className="text-sm text-fg-muted">{text.meta.structureHint}</p>
            <div className="grid gap-3 sm:grid-cols-3">
              <SelectField
                label={text.meta.polarity}
                value={draft.structure.polarity}
                options={options(text.meta.polarities)}
                onChange={(event) => {
                  patch({
                    structure: {
                      ...draft.structure,
                      polarity: event.target.value === 'negative' ? 'negative' : 'affirmative',
                    },
                  });
                }}
              />
              <SelectField
                label={text.meta.task}
                value={draft.structure.task}
                options={options(text.meta.tasks)}
                onChange={(event) => {
                  patch({
                    structure: {
                      ...draft.structure,
                      task: event.target.value as QuestionDraft['structure']['task'],
                    },
                  });
                }}
              />
              <SelectField
                label={text.meta.format}
                value={draft.structure.format}
                options={options(text.meta.formats)}
                onChange={(event) => {
                  patch({
                    structure: {
                      ...draft.structure,
                      format: event.target.value as QuestionDraft['structure']['format'],
                    },
                  });
                }}
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm text-fg-muted">
                {auto.task ? text.meta.auto(structureSummary) : text.meta.autoNone}
              </p>
              {auto.task ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    patch({
                      structure: {
                        polarity: auto.polarity,
                        task: auto.task ?? draft.structure.task,
                        format: auto.format,
                      },
                    });
                  }}
                >
                  <Sparkles aria-hidden />
                  {text.meta.useAuto}
                </Button>
              ) : null}
            </div>
          </fieldset>
          <fieldset className="flex flex-col gap-2">
            <legend className="font-medium">{text.meta.kinds}</legend>
            <p className="text-sm text-fg-muted">{text.meta.kindsHint}</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {Object.entries(text.meta.kindNames).map(([kind, label]) => (
                <CheckboxField
                  key={kind}
                  label={label}
                  checked={draft.itemKinds.includes(kind as QuestionDraft['itemKinds'][number])}
                  onChange={(event) => {
                    const value = kind as QuestionDraft['itemKinds'][number];
                    patch({
                      itemKinds: event.target.checked
                        ? [...draft.itemKinds, value]
                        : draft.itemKinds.filter((item) => item !== value),
                    });
                  }}
                />
              ))}
            </div>
          </fieldset>
          <CluesEditor
            clues={draft.clues}
            onChange={(clues) => {
              patch({ clues });
            }}
          />
        </div>
      </Card>

      <GpcEditor
        refs={draft.gpcRefs}
        onChange={(gpcRefs) => {
          patch({ gpcRefs });
        }}
      />

      {issues.length > 0 ? (
        <Card aria-labelledby="editor-problemas" role="alert">
          <CardHeader>
            <CardTitle id="editor-problemas">{text.save.invalid}</CardTitle>
          </CardHeader>
          <ul className="list-disc pl-5 text-sm">
            {issues.map((issue, index) => (
              <li key={index}>
                {issue.option === undefined
                  ? text.issues[issue.code]
                  : text.issueAt(issue.option + 1, text.issues[issue.code] ?? issue.code)}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <SaveBar
        dirty={dirty}
        status=""
        onDiscard={() => {
          setDraft(initial);
          setIssues([]);
        }}
      />
    </form>
  );
}
