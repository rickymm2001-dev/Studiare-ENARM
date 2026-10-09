// Banco de preguntas (pantalla 17). Primera versión (D-070). El médico ve solo las preguntas que un
// admin le asignó. El admin y el dueño ven todo el banco con a quién está asignada cada pregunta.
// Búsqueda, filtros por rama, subespecialidad y estado, y páginas de 25 (D-076). El editor con
// versiones, etiquetas y decisiones vive en la pantalla 18 (Fase E) y se abre con Editar.
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { Pencil } from 'lucide-react';
import { SCREENS } from '@/app/screens';
import { usePreferences } from '@/app/preferences';
import { BadgeCheck, FilePen, Hourglass } from 'lucide-react';
import { ScreenHeader } from '@/app/layout/ScreenHeader';
import { useSession } from '@/app/session';
import { useDataApi } from '@/data/context';
import { useLiveData } from '@/data/hooks';
import { ensureDemoBank } from '@/data/usecases/bank';
import type { Question } from '@/data/schemas/bank';
import { biasTaxonomy, topicTaxonomy } from '@/demo/content';
import { t } from '@/i18n/es-MX';
import { toneClasses } from '@/ui/branches';
import { cn } from '@/ui/cn';
import { Button } from '@/ui/components/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/ui/components/card';
import { SelectField, TextField } from '@/ui/components/field';
import { StatCell, StatPanel } from '@/ui/components/stat-panel';
import { DemoContentLabel } from '@/ui/components/labels';
import { EmptyState, LoadingState } from '@/ui/states/states';

const topicName = new Map(
  topicTaxonomy.branches.flatMap((branch) =>
    branch.topics.map((topic) => [topic.key, topic.name] as const),
  ),
);

const branchName = new Map(topicTaxonomy.branches.map((branch) => [branch.key, branch.name]));
const biasName = new Map(biasTaxonomy.biases.map((bias) => [bias.key, bias.name]));

export function QuestionBankScreen() {
  const api = useDataApi();
  const role = usePreferences((state) => state.role);
  const session = useSession();
  const me = session.status === 'ready' ? session.user.id : null;
  const [bankReady, setBankReady] = useState(false);
  useEffect(() => {
    void ensureDemoBank(api).then(() => {
      setBankReady(true);
    });
  }, [api]);
  const data = useLiveData(async () => {
    const [questions, assignments, users] = await Promise.all([
      api.repos.questions.listLatest(),
      api.repos.reviewAssignments.list(),
      api.repos.users.list(),
    ]);
    return { questions, assignments, users };
  }, [api.repos, bankReady]);

  const header = (
    <ScreenHeader
      title={t.screens.questionBank.title}
      description={role === 'physician' ? t.bank.physicianHint : t.bank.adminHint}
      badges={<DemoContentLabel />}
    />
  );
  // Espera a que el banco termine de guardarse, así las asignaciones lo ven completo
  if (data === undefined || !bankReady) {
    return (
      <>
        {header}
        <LoadingState />
      </>
    );
  }
  const aliasOf = new Map(data.users.map((user) => [user.id, user.alias]));
  const assignedTo = new Map<string, string[]>();
  for (const assignment of data.assignments)
    assignedTo.set(assignment.questionId, [
      ...(assignedTo.get(assignment.questionId) ?? []),
      aliasOf.get(assignment.physicianId) ?? '?',
    ]);
  const visible =
    role === 'physician'
      ? data.questions.filter((question) =>
          data.assignments.some(
            (assignment) =>
              assignment.questionId === question.questionId && assignment.physicianId === me,
          ),
        )
      : data.questions;

  if (visible.length === 0) {
    return (
      <>
        {header}
        <EmptyState title={t.bank.emptyTitle} description={t.bank.emptyBody} />
      </>
    );
  }

  const countOf = (status: Question['editorialStatus']) =>
    visible.filter((question) => question.editorialStatus === status).length;

  return (
    <>
      {header}
      <StatPanel label={t.bank.statsLabel}>
        <StatCell
          icon={<FilePen />}
          label={t.bank.status.draft}
          value={countOf('draft').toLocaleString('es-MX')}
        />
        <StatCell
          icon={<Hourglass />}
          label={t.bank.status.in_review}
          value={countOf('in_review').toLocaleString('es-MX')}
        />
        <StatCell
          icon={<BadgeCheck />}
          label={t.bank.status.approved}
          value={countOf('approved').toLocaleString('es-MX')}
        />
      </StatPanel>
      <BankList questions={visible} assignedTo={role === 'physician' ? null : assignedTo} />
    </>
  );
}

const PAGE_SIZE = 25;
const normalize = (text: string) =>
  text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

/** Lista con búsqueda, filtros y páginas. Cada pregunta se abre para ver opciones y explicación */
function BankList({
  questions,
  assignedTo,
}: {
  questions: Question[];
  assignedTo: Map<string, string[]> | null;
}) {
  const [query, setQuery] = useState('');
  const [branch, setBranch] = useState('');
  const [topic, setTopic] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(0);
  const topics = topicTaxonomy.branches.find((item) => item.key === branch)?.topics ?? [];
  const needle = normalize(query.trim());
  const rows = questions.filter(
    (question) =>
      (!branch || question.branch === branch) &&
      (!topic || question.topic === topic) &&
      (!status || question.editorialStatus === status) &&
      (!needle || normalize(`${question.prompt} ${question.vignette}`).includes(needle)),
  );
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const current = Math.min(page, pages - 1);
  const reset = () => {
    setPage(0);
  };
  return (
    <Card aria-labelledby="banco-lista">
      <CardHeader>
        <CardTitle id="banco-lista">{t.bank.listTitle}</CardTitle>
        <CardDescription>{t.bank.count(rows.length)}</CardDescription>
      </CardHeader>
      <div className="mb-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <TextField
          label={t.bank.search}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            reset();
          }}
        />
        <SelectField
          label={t.topicPicker.trunks}
          value={branch}
          options={[
            { value: '', label: t.bank.all },
            ...topicTaxonomy.branches.map((item) => ({ value: item.key, label: item.name })),
          ]}
          onChange={(event) => {
            setBranch(event.target.value);
            setTopic('');
            reset();
          }}
        />
        <SelectField
          label={t.topicPicker.subspecialties}
          value={topic}
          disabled={!branch}
          options={[
            { value: '', label: t.bank.all },
            ...topics.map((item) => ({ value: item.key, label: item.name })),
          ]}
          onChange={(event) => {
            setTopic(event.target.value);
            reset();
          }}
        />
        <SelectField
          label={t.bank.statusLabel}
          value={status}
          options={[
            { value: '', label: t.bank.all },
            ...(Object.keys(t.bank.status) as (keyof typeof t.bank.status)[]).map((key) => ({
              value: key,
              label: t.bank.status[key],
            })),
          ]}
          onChange={(event) => {
            setStatus(event.target.value);
            reset();
          }}
        />
      </div>
      <ul className="flex flex-col divide-y divide-line">
        {rows.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE).map((question) => (
          <li key={question.id} className="py-2">
            <details className="group">
              <summary className="flex cursor-pointer list-none flex-col gap-1">
                <span className="text-sm font-medium">{question.prompt}</span>
                {question.vignette ? (
                  <span className="line-clamp-1 text-xs text-fg-muted">{question.vignette}</span>
                ) : null}
                <span className="flex flex-wrap items-center gap-2 text-xs text-fg-muted">
                  <span
                    className={cn(
                      'rounded-full px-2 py-0.5 font-semibold',
                      toneClasses(question.branch).chip,
                    )}
                  >
                    {branchName.get(question.branch) ?? question.branch}
                  </span>
                  <span>{topicName.get(question.topic) ?? question.topic}</span>
                  <span>· {t.bank.difficulty(question.physicianDifficulty)}</span>
                  <span>· {t.bank.status[question.editorialStatus]}</span>
                  {assignedTo ? (
                    <span>
                      ·{' '}
                      {assignedTo.has(question.questionId)
                        ? t.bank.assignedTo((assignedTo.get(question.questionId) ?? []).join(', '))
                        : t.bank.unassigned}
                    </span>
                  ) : null}
                </span>
              </summary>
              <QuestionDetail question={question} />
            </details>
          </li>
        ))}
      </ul>
      {pages > 1 ? (
        <nav aria-label={t.bank.pages} className="mt-3 flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            disabled={current === 0}
            onClick={() => {
              setPage(current - 1);
            }}
          >
            {t.bank.previous}
          </Button>
          <span className="text-sm text-fg-muted">{t.bank.pageOf(current + 1, pages)}</span>
          <Button
            variant="secondary"
            size="sm"
            disabled={current >= pages - 1}
            onClick={() => {
              setPage(current + 1);
            }}
          >
            {t.bank.next}
          </Button>
        </nav>
      ) : null}
    </Card>
  );
}

function QuestionDetail({ question }: { question: Question }) {
  const api = useDataApi();
  const options = useLiveData(
    () => api.repos.options.listForQuestionVersion(question.id),
    [api.repos, question.id],
  );
  return (
    <div className="mt-2 flex flex-col gap-2 rounded-md bg-muted p-3 text-sm">
      {question.vignette ? <p>{question.vignette}</p> : null}
      <ol className="flex flex-col gap-1">
        {(options ?? []).map((option) => (
          <li
            key={option.id}
            className={option.isCorrect ? 'font-semibold text-success' : undefined}
          >
            {option.text}
            {option.biasTag ? (
              <span className="ml-2 text-xs text-fg-muted">
                ({biasName.get(option.biasTag) ?? option.biasTag})
              </span>
            ) : null}
          </li>
        ))}
      </ol>
      <p className="text-fg-muted">{question.explanation}</p>
      <div>
        <Button asChild variant="secondary" size="sm">
          <Link to={`${SCREENS.questionEditor.path}?pregunta=${question.questionId}`}>
            <Pencil aria-hidden />
            {t.questionEditor.edit}
          </Link>
        </Button>
      </div>
    </div>
  );
}
