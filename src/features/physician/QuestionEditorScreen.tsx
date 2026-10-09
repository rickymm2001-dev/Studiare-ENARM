// Editor de pregunta (pantalla 18, 10.2). Caso, enunciado, de 4 a 10 opciones con su etiqueta y su
// definición a la vista, set canónico, explicación, referencias de GPC, tema, estructura, dificultad
// e historial de versiones. Cada guardado crea una versión nueva en borrador y las anteriores no
// cambian (6.1). El médico edita solo lo que le asignaron y, si la pregunta está en el doble
// etiquetado, primero etiqueta a ciegas (7.11).
import { useEffect, useMemo, useState, type SyntheticEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import { ArrowLeft, Sparkles } from 'lucide-react';
import { usePreferences } from '@/app/preferences';
import { ScreenHeader } from '@/app/layout/ScreenHeader';
import { SCREENS } from '@/app/screens';
import { useSession } from '@/app/session';
import { useDataApi } from '@/data/context';
import { useLiveData } from '@/data/hooks';
import type { Question } from '@/data/schemas/bank';
import { ensureDemoBank } from '@/data/usecases/bank';
import { TAGGABLE_BIASES } from '@/data/usecases/labeling';
import { structureDictionary, topicTaxonomy } from '@/demo/content';
import { analyzeStructure } from '@/engines/structure';
import { t } from '@/i18n/es-MX';
import { Badge } from '@/ui/components/badge';
import { Button } from '@/ui/components/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/ui/components/card';
import { CheckboxField, SelectField, TextAreaField } from '@/ui/components/field';
import { DemoContentLabel } from '@/ui/components/labels';
import { SaveBar } from '@/ui/components/save-bar';
import { EmptyState, LoadingState } from '@/ui/states/states';
import {
  canMoveTo,
  draftFromVersion,
  isBlindLocked,
  STATUS_FLOW,
  taxonomyViewFrom,
  type DraftIssue,
  type QuestionDraft,
} from './editorDraft';
import {
  InvalidDraftError,
  moveQuestionStatus,
  saveQuestionVersion,
  StaleVersionError,
} from './editorActions';
import { sampleQuestionIds } from './agreementView';
import { CluesEditor, GpcEditor, HistoryCard, OptionsEditor } from './EditorSections';

const taxonomy = taxonomyViewFrom({
  branches: topicTaxonomy.branches,
  taggable: TAGGABLE_BIASES.map((bias) => bias.key),
});

const options = (entries: Record<string, string>) =>
  Object.entries(entries).map(([value, label]) => ({ value, label }));

const sameDraft = (a: QuestionDraft, b: QuestionDraft) => JSON.stringify(a) === JSON.stringify(b);

export function QuestionEditorScreen() {
  const text = t.questionEditor;
  const api = useDataApi();
  const role = usePreferences((state) => state.role);
  const session = useSession();
  const me = session.status === 'ready' ? session.user.id : null;
  const [params] = useSearchParams();
  const questionId = params.get('pregunta');
  const [bankReady, setBankReady] = useState(false);
  // El aviso vive aquí y no en el formulario, porque al guardar sale una versión y el formulario
  // se vuelve a armar con ella
  const [notice, setNotice] = useState('');
  useEffect(() => {
    void ensureDemoBank(api).then(() => {
      setBankReady(true);
    });
  }, [api]);

  const data = useLiveData(async () => {
    if (!questionId) return null;
    const versions = await api.repos.questions.listVersions(questionId);
    const latest = versions.at(-1);
    if (!latest) return null;
    const optionsByVersion = new Map(
      await Promise.all(
        versions.map(
          async (version) =>
            [version.id, await api.repos.options.listForQuestionVersion(version.id)] as const,
        ),
      ),
    );
    const [assignments, labels, all, linkedCase] = await Promise.all([
      api.repos.reviewAssignments.list(),
      api.repos.biasLabels.list(),
      api.repos.questions.listLatest(),
      latest.caseId ? api.repos.cases.get(latest.caseId) : Promise.resolve(undefined),
    ]);
    return { versions, optionsByVersion, assignments, labels, all, linkedCase };
  }, [api.repos, questionId, bankReady]);

  const header = (
    <ScreenHeader
      title={t.screens.questionEditor.title}
      description={t.screens.questionEditor.description}
      badges={<DemoContentLabel />}
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
  const state = (title: string, description: string, action?: React.ReactNode) => (
    <>
      {header}
      <EmptyState title={title} description={description} action={action ?? backToBank} />
    </>
  );

  if (!questionId) return state(text.noQuestion.title, text.noQuestion.description);
  if (data === undefined || !bankReady) {
    return (
      <>
        {header}
        <LoadingState />
      </>
    );
  }
  const latest = data?.versions.at(-1);
  if (!data || !latest) return state(text.notFound.title, text.notFound.description);

  const isPhysician = role === 'physician';
  if (
    isPhysician &&
    !data.assignments.some(
      (assignment) => assignment.questionId === questionId && assignment.physicianId === me,
    )
  ) {
    return state(text.notAssigned.title, text.notAssigned.description);
  }

  const latestOptions = data.optionsByVersion.get(latest.id) ?? [];
  const blind = isBlindLocked({
    role: isPhysician ? 'physician' : 'admin',
    inSample: sampleQuestionIds(data.all).includes(questionId),
    distractorOptionIds: latestOptions
      .filter((option) => !option.isCorrect)
      .map((option) => option.optionId),
    labeledByMe: new Set(
      data.labels.filter((label) => label.physicianId === me).map((label) => label.optionId),
    ),
  });
  if (blind) {
    return state(
      text.blind.title,
      text.blind.description,
      <Button asChild>
        <Link to={SCREENS.agreement.path}>{text.blind.cta}</Link>
      </Button>,
    );
  }

  const drafts = new Map(
    data.versions.map((version) => [
      version.id,
      draftFromVersion(version, data.optionsByVersion.get(version.id) ?? []),
    ]),
  );
  return (
    <>
      {header}
      <EditorForm
        key={latest.id}
        latest={latest}
        initial={drafts.get(latest.id) ?? draftFromVersion(latest, latestOptions)}
        linkedVignette={data.linkedCase?.vignette ?? null}
        versions={data.versions}
        drafts={drafts}
        back={backToBank}
        notice={notice}
        onNotice={setNotice}
      />
    </>
  );
}

function EditorForm({
  latest,
  initial,
  linkedVignette,
  versions,
  drafts,
  back,
  notice,
  onNotice: setNotice,
}: {
  latest: Question;
  initial: QuestionDraft;
  linkedVignette: string | null;
  versions: readonly Question[];
  drafts: ReadonlyMap<string, QuestionDraft>;
  back: React.ReactNode;
  notice: string;
  onNotice: (notice: string) => void;
}) {
  const text = t.questionEditor;
  const api = useDataApi();
  const [draft, setDraft] = useState(initial);
  const [issues, setIssues] = useState<DraftIssue[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const dirty = !sameDraft(draft, initial);
  const patch = (change: Partial<QuestionDraft>) => {
    setDraft((current) => ({ ...current, ...change }));
    setNotice('');
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
    setBusy(true);
    setError('');
    try {
      await saveQuestionVersion(api, { current: latest, draft, taxonomy });
      setIssues([]);
      setNotice(text.save.saved);
    } catch (caught) {
      if (caught instanceof InvalidDraftError) setIssues([...caught.issues]);
      else setError(caught instanceof StaleVersionError ? text.status.stale : text.save.failed);
    } finally {
      setBusy(false);
    }
  };

  const move = async (to: Question['editorialStatus']) => {
    setBusy(true);
    setError('');
    try {
      await moveQuestionStatus(api, latest, to);
      setNotice(text.status.moved(t.bank.status[to]));
    } catch (caught) {
      setError(caught instanceof StaleVersionError ? text.status.stale : text.status.failed);
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
      <Card aria-labelledby="editor-estado">
        <CardHeader>
          <CardTitle id="editor-estado" className="flex flex-wrap items-center gap-2">
            {text.status.title}
            <Badge variant="info">{text.status.version(latest.version)}</Badge>
            <Badge variant={latest.editorialStatus === 'approved' ? 'success' : 'neutral'}>
              {t.bank.status[latest.editorialStatus]}
            </Badge>
          </CardTitle>
          <CardDescription>{text.status.hint}</CardDescription>
        </CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          {STATUS_FLOW[latest.editorialStatus].map((to) => (
            <Button
              key={to}
              type="button"
              variant={
                to === 'rejected' ? 'secondary' : to === 'approved' ? 'primary' : 'secondary'
              }
              disabled={busy || dirty || !canMoveTo(latest.editorialStatus, to)}
              onClick={() => {
                void move(to);
              }}
            >
              {latest.editorialStatus === 'approved' && to === 'in_review'
                ? text.status.reopen
                : (text.status.move[to] ?? to)}
            </Button>
          ))}
          {back}
        </div>
        {dirty ? <p className="mt-2 text-sm text-fg-muted">{text.status.unsaved}</p> : null}
        {unverified > 0 ? (
          <p className="mt-2 text-sm text-fg-muted">{text.status.unverifiedGpc(unverified)}</p>
        ) : null}
        <p role="status" className="mt-2 text-sm font-medium text-success">
          {notice}
        </p>
        {error ? (
          <p role="alert" className="mt-2 text-sm text-danger">
            {error}
          </p>
        ) : null}
      </Card>

      <Card aria-labelledby="editor-caso">
        <CardHeader>
          <CardTitle id="editor-caso">{text.sections.case}</CardTitle>
        </CardHeader>
        <div className="flex flex-col gap-3">
          {latest.caseId !== null ? (
            <>
              <p className="font-medium">{text.case.vignette}</p>
              <p className="rounded-md bg-muted p-3 text-sm">{linkedVignette ?? ''}</p>
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

      <HistoryCard versions={versions} drafts={drafts} />
    </form>
  );
}
