// Banco de preguntas (pantalla 17, 4.2 del plan de B11). Lista de editor_list con los filtros Por
// revisar, Mis borradores, Incompletas, Con reporte, Con conflicto y Publicadas, además de rama,
// subespecialidad y estado. Cada fila trae el ID del Sheet, la versión, el estado, autor y revisor,
// pendientes, avisos y la marca Viene del Sheet, y abre el editor. Arriba, Mis revisiones del mes.
// El médico ve lo que tiene asignado y el admin todo. La búsqueda y las páginas son de lo ya leído,
// hasta 500 preguntas por vista. Con la nube el médico no importa, escribe en el Sheet.
import { useState } from 'react';
import { Link } from 'react-router';
import { BadgeCheck, ClipboardCheck, FilePen, Hourglass, PenLine, Undo2 } from 'lucide-react';
import { ScreenHeader } from '@/app/layout/ScreenHeader';
import { usePreferences } from '@/app/preferences';
import { SCREENS } from '@/app/screens';
import type { EditorFilter, EditorListItem } from '@/data/bank/contracts';
import { topicTaxonomy } from '@/demo/content';
import { t } from '@/i18n/es-MX';
import { physicianText } from '@/i18n/physician';
import { Badge } from '@/ui/components/badge';
import { BranchBadge } from '@/ui/components/branch-tag';
import { Button } from '@/ui/components/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/ui/components/card';
import { SelectField, TextField } from '@/ui/components/field';
import { StatCell, StatPanel } from '@/ui/components/stat-panel';
import { EmptyState, ErrorState, LoadingState } from '@/ui/states/states';
import { meridaMonthToDate } from './meridaMonth';
import { sourceKeyLabel } from './reviewSteps';
import { useEditorialRepo } from './useEditorialRepo';
import { useRepoQuery } from './useRepoQuery';

const topicName = new Map(
  topicTaxonomy.branches.flatMap((branch) =>
    branch.topics.map((topic) => [topic.key, topic.name] as const),
  ),
);
const branchName = new Map(topicTaxonomy.branches.map((branch) => [branch.key, branch.name]));

const BANK_VIEWS = [
  'all',
  'to_review',
  'my_drafts',
  'incomplete',
  'reported',
  'conflict',
  'published',
] as const;
type View = (typeof BANK_VIEWS)[number];

const LIST_LIMIT = 500;
const PAGE_SIZE = 25;
const normalize = (text: string) => text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

export function QuestionBankScreen() {
  const text = physicianText.bankScreen;
  const role = usePreferences((state) => state.role);
  const isPhysician = role === 'physician';
  const { repo, ready, key } = useEditorialRepo();
  const [filter, setFilter] = useState<Required<Pick<EditorFilter, 'view'>> & EditorFilter>({
    view: 'all',
  });
  const { state, reload } = useRepoQuery(
    () => repo.list(filter, { limit: LIST_LIMIT, offset: 0 }),
    `${key}|${JSON.stringify(filter)}`,
    ready,
  );
  const showImport = repo.kind === 'local' || !isPhysician;

  const header = (
    <ScreenHeader
      title={t.screens.questionBank.title}
      description={isPhysician ? physicianText.bank.physicianHint : physicianText.bank.adminHint}
      actions={
        showImport ? (
          <Button asChild variant="secondary" size="sm">
            <Link to={SCREENS.bankImport.path}>{physicianText.bank.importBank}</Link>
          </Button>
        ) : undefined
      }
    />
  );

  const filters = (
    <Filters
      filter={filter}
      onChange={(next) => {
        setFilter(next);
      }}
    />
  );
  // Sin filtros y sin nada asignado, el médico todavía no tiene preguntas
  const untouched = filter.view === 'all' && !filter.branch && !filter.status;
  if (state.status === 'ready' && state.value.items.length === 0 && untouched) {
    return (
      <>
        {header}
        {isPhysician && repo.kind === 'cloud' ? (
          <p className="text-sm text-fg-muted">{text.importHint}</p>
        ) : null}
        <EmptyState
          title={physicianText.bank.emptyTitle}
          description={physicianText.bank.emptyBody}
        />
      </>
    );
  }
  const items = state.status === 'ready' ? state.value.items : [];
  const countOf = (status: EditorListItem['status']) =>
    items.filter((item) => item.status === status).length;

  return (
    <>
      {header}
      {repo.kind === 'local' ? <p className="text-sm text-fg-muted">{text.demoNote}</p> : null}
      {isPhysician && repo.kind === 'cloud' ? <MyReviewsCard /> : null}
      {state.status === 'ready' ? (
        <StatPanel label={physicianText.bank.statsLabel}>
          <StatCell
            icon={<FilePen />}
            label={physicianText.bank.status.draft}
            value={countOf('draft').toLocaleString('es-MX')}
          />
          <StatCell
            icon={<Hourglass />}
            label={physicianText.bank.status.in_review}
            value={countOf('in_review').toLocaleString('es-MX')}
          />
          <StatCell
            icon={<BadgeCheck />}
            label={physicianText.bank.status.approved}
            value={countOf('approved').toLocaleString('es-MX')}
          />
        </StatPanel>
      ) : null}
      <Card aria-labelledby="banco-lista">
        <CardHeader>
          <CardTitle id="banco-lista">{physicianText.bank.listTitle}</CardTitle>
          {state.status === 'ready' ? (
            <CardDescription>{physicianText.bank.count(items.length)}</CardDescription>
          ) : null}
        </CardHeader>
        {filters}
        {state.status === 'loading' ? <LoadingState /> : null}
        {state.status === 'failed' ? (
          <ErrorState
            title={text.failed}
            description={physicianText.errors[state.code] ?? ''}
            onRetry={reload}
          />
        ) : null}
        {state.status === 'ready' ? <BankList items={items} showPeople={!isPhysician} /> : null}
      </Card>
    </>
  );
}

/** Mis revisiones del mes en curso, de editor_my_reviews */
function MyReviewsCard() {
  const text = physicianText.bankScreen.myReviews;
  const { repo, ready, key } = useEditorialRepo();
  const range = meridaMonthToDate(new Date());
  const { state } = useRepoQuery(
    () => repo.myReviews(range.from, range.to),
    `${key}|${range.from}|${range.to}`,
    ready,
  );
  if (state.status !== 'ready') return null;
  const value = state.value;
  return (
    <StatPanel label={text.title} quad>
      <StatCell
        icon={<ClipboardCheck />}
        label={text.reviewed}
        value={value.reviewed.toLocaleString('es-MX')}
      />
      <StatCell
        icon={<BadgeCheck />}
        label={text.approved}
        value={value.approved.toLocaleString('es-MX')}
      />
      <StatCell
        icon={<Undo2 />}
        label={text.changesRequested}
        value={value.changesRequested.toLocaleString('es-MX')}
      />
      <StatCell
        icon={<PenLine />}
        label={text.distractors}
        value={value.distractorsResolved.toLocaleString('es-MX')}
      />
    </StatPanel>
  );
}

type FilterState = Required<Pick<EditorFilter, 'view'>> & EditorFilter;

function Filters({
  filter,
  onChange,
}: {
  filter: FilterState;
  onChange: (next: FilterState) => void;
}) {
  const text = physicianText.bankScreen;
  const topics = topicTaxonomy.branches.find((item) => item.key === filter.branch)?.topics ?? [];
  const without = (next: FilterState, field: keyof FilterState) => {
    const { [field]: _removed, ...rest } = next;
    return rest as FilterState;
  };
  return (
    <div className="mb-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <SelectField
        label={text.views.label ?? ''}
        value={filter.view}
        options={BANK_VIEWS.map((view) => ({ value: view, label: text.views[view] ?? view }))}
        onChange={(event) => {
          onChange({ ...filter, view: event.target.value as View });
        }}
      />
      <SelectField
        label={t.topicPicker.trunks}
        value={filter.branch ?? ''}
        options={[
          { value: '', label: physicianText.bank.all },
          ...topicTaxonomy.branches.map((item) => ({ value: item.key, label: item.name })),
        ]}
        onChange={(event) => {
          const next = without(without(filter, 'topic'), 'branch');
          onChange(event.target.value ? { ...next, branch: event.target.value } : next);
        }}
      />
      <SelectField
        label={t.topicPicker.subspecialties}
        value={filter.topic ?? ''}
        disabled={!filter.branch}
        options={[
          { value: '', label: physicianText.bank.all },
          ...topics.map((item) => ({ value: item.key, label: item.name })),
        ]}
        onChange={(event) => {
          const next = without(filter, 'topic');
          onChange(event.target.value ? { ...next, topic: event.target.value } : next);
        }}
      />
      <SelectField
        label={physicianText.bank.statusLabel}
        value={filter.status ?? ''}
        options={[
          { value: '', label: physicianText.bank.all },
          ...(
            Object.keys(physicianText.bank.status) as (keyof typeof physicianText.bank.status)[]
          ).map((key) => ({
            value: key,
            label: physicianText.bank.status[key],
          })),
        ]}
        onChange={(event) => {
          const next = without(filter, 'status');
          onChange(
            event.target.value
              ? { ...next, status: event.target.value as EditorListItem['status'] }
              : next,
          );
        }}
      />
    </div>
  );
}

/** Lista con búsqueda y páginas. Cada pregunta se abre en el editor */
function BankList({
  items,
  showPeople,
}: {
  items: readonly EditorListItem[];
  showPeople: boolean;
}) {
  const text = physicianText.bankScreen;
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const needle = normalize(query.trim());
  const rows = items.filter(
    (item) =>
      !needle || normalize(`${item.promptPreview} ${item.sourceKey ?? ''}`).includes(needle),
  );
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const current = Math.min(page, pages - 1);
  return (
    <>
      <div className="mb-3">
        <TextField
          label={physicianText.bank.search}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setPage(0);
          }}
        />
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-fg-muted">{text.emptyView}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-line">
          {rows.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE).map((item) => (
            <li key={item.questionId} className="py-2">
              <BankRow item={item} showPeople={showPeople} />
            </li>
          ))}
        </ul>
      )}
      {pages > 1 ? (
        <nav aria-label={physicianText.bank.pages} className="mt-3 flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            disabled={current === 0}
            onClick={() => {
              setPage(current - 1);
            }}
          >
            {physicianText.bank.previous}
          </Button>
          <span className="text-sm text-fg-muted">
            {physicianText.bank.pageOf(current + 1, pages)}
          </span>
          <Button
            variant="secondary"
            size="sm"
            disabled={current >= pages - 1}
            onClick={() => {
              setPage(current + 1);
            }}
          >
            {physicianText.bank.next}
          </Button>
        </nav>
      ) : null}
    </>
  );
}

function BankRow({ item, showPeople }: { item: EditorListItem; showPeople: boolean }) {
  const text = physicianText.bankScreen;
  const sheetKey = sourceKeyLabel(item.sourceKey);
  const fromSheet = item.sourceKey?.startsWith('sheet:') === true;
  const label = item.promptPreview || text.noPreview;
  return (
    <div className="flex flex-wrap items-start gap-2">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-sm font-medium">
          {sheetKey ? <span className="mr-2 font-semibold">{sheetKey}</span> : null}
          {label}
        </span>
        <span className="flex flex-wrap items-center gap-2 text-xs text-fg-muted">
          <BranchBadge branch={item.branch}>
            {branchName.get(item.branch) ?? item.branch}
          </BranchBadge>
          <span>{topicName.get(item.topic) ?? item.topic}</span>
          <span>· {text.version(item.version)}</span>
          <span>· {physicianText.bank.status[item.status]}</span>
          {item.publishedVersion !== null && item.publishedVersion !== item.version ? (
            <span>· {text.published(item.publishedVersion)}</span>
          ) : null}
          {showPeople && item.author ? <span>· {text.author(item.author.alias)}</span> : null}
          {showPeople && item.reviewer ? <span>· {text.reviewer(item.reviewer.alias)}</span> : null}
          {showPeople && !item.author && !item.reviewer ? (
            <span>· {physicianText.bank.unassigned}</span>
          ) : null}
        </span>
        <span className="flex flex-wrap gap-1.5">
          {fromSheet ? <Badge>{text.fromSheet}</Badge> : null}
          {item.reviewState === 'blind_pending' ? (
            <Badge variant="warning">{text.blindPending}</Badge>
          ) : null}
          {item.incomplete.length > 0 ? (
            <Badge variant="warning">{text.pending(item.incomplete.length)}</Badge>
          ) : null}
          {item.flags.length > 0 ? <Badge>{text.flags(item.flags.length)}</Badge> : null}
          {item.openReports > 0 ? (
            <Badge variant="danger">{text.reports(item.openReports)}</Badge>
          ) : null}
          {item.openDistractorFlags > 0 ? (
            <Badge variant="warning">{text.distractors(item.openDistractorFlags)}</Badge>
          ) : null}
          {item.conflict ? <Badge variant="danger">{text.conflict}</Badge> : null}
          {item.missing ? <Badge variant="warning">{text.missing}</Badge> : null}
          {item.retireRequested ? <Badge variant="warning">{text.retireRequested}</Badge> : null}
          {item.retired ? <Badge>{text.retired}</Badge> : null}
        </span>
      </div>
      <Button asChild size="sm" variant="secondary">
        <Link
          to={`${SCREENS.questionEditor.path}?pregunta=${item.questionId}`}
          aria-label={text.openQuestion(sheetKey ?? label)}
        >
          {text.open}
        </Link>
      </Button>
    </div>
  );
}
