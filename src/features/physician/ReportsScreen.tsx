// Bandeja de reportes de contenido (pantalla 21, 10.2 y 4.2 del plan de B11). Los errores que los
// alumnos reportan en las preguntas, agrupados por pregunta y con lo más grave primero, sin nada del
// alumno. El médico ve los de lo que tiene asignado y el admin todos. Cada reporte se resuelve, se
// descarta o se reabre. Debajo, la cola de distractores que casi nadie elige, que llena la calibración
// de B14. Mientras no mande cifras la sección dice calibrando.
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { CheckCircle2, Hourglass, XCircle } from 'lucide-react';
import { ScreenHeader } from '@/app/layout/ScreenHeader';
import { usePreferences } from '@/app/preferences';
import { SCREENS } from '@/app/screens';
import {
  errorCodeOf,
  type DistractorResolution,
  type EditorDistractorFlag,
  type ReportStatus,
} from '@/data/editorial/editorialRepo';
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
import {
  buildReportsView,
  reasonsBySeverity,
  type ReportGroup,
  type StatusFilter,
} from './reportsView';
import { useEditorialRepo } from './useEditorialRepo';
import { useRepoQuery } from './useRepoQuery';

const branchName = new Map(topicTaxonomy.branches.map((branch) => [branch.key, branch.name]));
const topicName = new Map(
  topicTaxonomy.branches.flatMap((branch) =>
    branch.topics.map((topic) => [topic.key, topic.name] as const),
  ),
);
const reasonName = t.simulator.reportReasons;
const date = (iso: string) => new Date(iso).toLocaleDateString('es-MX');

export function ReportsScreen() {
  const text = physicianText.reportsScreen;
  const role = usePreferences((state) => state.role);
  const { repo, ready, key } = useEditorialRepo();
  const [status, setStatus] = useState<StatusFilter>('open');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const { state, reload } = useRepoQuery(() => repo.reports(), key, ready);

  const header = (
    <ScreenHeader
      title={t.screens.contentReports.title}
      description={role === 'physician' ? text.hintPhysician : text.hintAdmin}
    />
  );
  if (state.status === 'loading') {
    return (
      <>
        {header}
        <LoadingState />
      </>
    );
  }
  if (state.status === 'failed') {
    return (
      <>
        {header}
        <ErrorState description={physicianText.errors[state.code] ?? ''} onRetry={reload} />
      </>
    );
  }

  const view = buildReportsView(state.value, status);

  const change = async (ids: readonly string[], to: ReportStatus) => {
    setError('');
    try {
      const changed = await repo.setReportsStatus(ids, to);
      setNotice(text.changed(changed, text.row.status[to] ?? to));
    } catch {
      setError(text.failed);
    }
    reload();
  };

  return (
    <>
      {header}
      <StatPanel label={text.stats.label}>
        <StatCell
          icon={<Hourglass />}
          label={text.stats.open}
          value={view.counts.open.toLocaleString('es-MX')}
        />
        <StatCell
          icon={<CheckCircle2 />}
          label={text.stats.resolved}
          value={view.counts.resolved.toLocaleString('es-MX')}
        />
        <StatCell
          icon={<XCircle />}
          label={text.stats.dismissed}
          value={view.counts.dismissed.toLocaleString('es-MX')}
        />
      </StatPanel>

      <SelectField
        label={text.filter.label}
        value={status}
        options={(['open', 'resolved', 'dismissed', 'all'] as const).map((value) => ({
          value,
          label: text.filter[value],
        }))}
        onChange={(event) => {
          setStatus(event.target.value as StatusFilter);
          setNotice('');
        }}
      />
      <p role="status" className="text-sm font-medium text-success">
        {notice}
      </p>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
      {view.notes > 0 && role !== 'physician' ? (
        <p className="text-sm text-fg-muted">{text.notes(view.notes)}</p>
      ) : null}

      {view.groups.length === 0 ? (
        status === 'open' ? (
          <EmptyState title={text.empty.openTitle} description={text.empty.openDescription} />
        ) : (
          <EmptyState title={text.empty.otherTitle} description={text.empty.otherDescription} />
        )
      ) : (
        <ul className="flex flex-col gap-3">
          {view.groups.map((group) => (
            <li key={group.questionId}>
              <GroupCard group={group} onChange={change} />
            </li>
          ))}
        </ul>
      )}

      <DistractorQueue />
    </>
  );
}

function GroupCard({
  group,
  onChange,
}: {
  group: ReportGroup;
  onChange: (ids: readonly string[], to: ReportStatus) => Promise<void>;
}) {
  const text = physicianText.reportsScreen;
  const { question } = group;
  const openIds = group.rows
    .filter((row) => row.report.status === 'open')
    .map((row) => row.report.id);
  const hasOutdated = group.rows.some((row) => row.outdated && row.report.status === 'open');
  const titleId = `reporte-${group.questionId}`;
  return (
    <Card aria-labelledby={titleId}>
      <CardHeader>
        <CardTitle id={titleId} className="text-base">
          {question.promptPreview ?? question.questionKey}
        </CardTitle>
        <CardDescription className="flex flex-wrap items-center gap-2">
          <span className="font-semibold">{question.questionKey}</span>
          {question.branch ? (
            <BranchBadge branch={question.branch}>
              {branchName.get(question.branch) ?? question.branch}
            </BranchBadge>
          ) : null}
          {question.topic ? <span>{topicName.get(question.topic) ?? question.topic}</span> : null}
          <span>· {text.group.total(group.rows.length)}</span>
          {group.openCount > 0 ? (
            <Badge variant="warning">{text.group.open(group.openCount)}</Badge>
          ) : null}
        </CardDescription>
      </CardHeader>
      <ul className="mb-3 flex flex-wrap gap-2" aria-label={text.group.title}>
        {reasonsBySeverity(group.reasons).map(({ reason, count }) => (
          <li key={reason}>
            <Badge
              variant={reason === 'wrong_key' || reason === 'clinical_error' ? 'danger' : 'neutral'}
            >
              {reasonName[reason]} ×{count}
            </Badge>
          </li>
        ))}
      </ul>
      {hasOutdated ? <p className="mb-3 text-sm text-fg-muted">{text.group.outdatedHint}</p> : null}
      <ul className="flex flex-col divide-y divide-line">
        {group.rows.map((row) => (
          <li key={row.report.id} className="flex flex-wrap items-center gap-2 py-2">
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                {reasonName[row.report.reason]}
                <Badge variant={row.report.status === 'open' ? 'warning' : 'neutral'}>
                  {text.row.status[row.report.status]}
                </Badge>
                {row.outdated ? <Badge variant="info">{text.row.outdated}</Badge> : null}
              </p>
              <p className="text-xs text-fg-muted">
                {text.row.reportedOn(date(row.report.createdAt))} ·{' '}
                {text.row.version(row.report.version)}
                {row.report.resolvedAt
                  ? ` · ${text.row.resolvedOn(date(row.report.resolvedAt))}`
                  : ''}
              </p>
            </div>
            {row.report.status === 'open' ? (
              <>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    void onChange([row.report.id], 'resolved');
                  }}
                >
                  {text.row.resolve}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    void onChange([row.report.id], 'dismissed');
                  }}
                >
                  {text.row.dismiss}
                </Button>
              </>
            ) : (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  void onChange([row.report.id], 'open');
                }}
              >
                {text.row.reopen}
              </Button>
            )}
          </li>
        ))}
      </ul>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button asChild size="sm">
          <Link to={`${SCREENS.questionEditor.path}?pregunta=${group.questionId}`}>
            {text.group.edit}
          </Link>
        </Button>
        {openIds.length > 1 ? (
          <>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                void onChange(openIds, 'resolved');
              }}
            >
              {text.group.resolveOpen(openIds.length)}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                void onChange(openIds, 'dismissed');
              }}
            >
              {text.group.dismissOpen(openIds.length)}
            </Button>
          </>
        ) : null}
      </div>
    </Card>
  );
}

/** Distractores que casi nadie elige (4.7). Editar la pregunta, dejarla así o descartar la marca */
function DistractorQueue() {
  const text = physicianText.distractors;
  const { repo, ready, key } = useEditorialRepo();
  const { state, reload } = useRepoQuery(() => repo.distractorQueue('open'), key, ready);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const resolve = async (
    flag: EditorDistractorFlag,
    resolution: DistractorResolution,
    note: string,
  ) => {
    setError('');
    try {
      await repo.resolveDistractor(flag.id, resolution, note);
      setNotice(text.resolved[resolution] ?? '');
      if (resolution === 'edited') {
        void navigate(`${SCREENS.questionEditor.path}?pregunta=${flag.questionId}`);
        return;
      }
    } catch (caught) {
      setError(physicianText.errors[errorCodeOf(caught)] ?? text.failed);
    }
    reload();
  };

  return (
    <Card aria-labelledby="reportes-distractores">
      <CardHeader>
        <CardTitle id="reportes-distractores">{text.title}</CardTitle>
        <CardDescription>{text.hint}</CardDescription>
      </CardHeader>
      {state.status === 'loading' ? <LoadingState /> : null}
      {state.status === 'failed' ? (
        <ErrorState description={physicianText.errors[state.code] ?? ''} onRetry={reload} />
      ) : null}
      {state.status === 'ready' && state.value.length === 0 ? (
        <p role="status" className="text-sm text-fg-muted">
          {text.calibrating}
        </p>
      ) : null}
      {state.status === 'ready' && state.value.length > 0 ? (
        <ul className="flex flex-col divide-y divide-line">
          {state.value.map((flag) => (
            <li key={flag.id}>
              <DistractorRow flag={flag} onResolve={resolve} />
            </li>
          ))}
        </ul>
      ) : null}
      <p role="status" className="mt-2 text-sm font-medium text-success">
        {notice}
      </p>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
    </Card>
  );
}

function DistractorRow({
  flag,
  onResolve,
}: {
  flag: EditorDistractorFlag;
  onResolve: (
    flag: EditorDistractorFlag,
    resolution: DistractorResolution,
    note: string,
  ) => Promise<void>;
}) {
  const text = physicianText.distractors;
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const act = (resolution: DistractorResolution) => {
    setBusy(true);
    void onResolve(flag, resolution, note).finally(() => {
      setBusy(false);
    });
  };
  const attraction = (flag.attraction * 100).toLocaleString('es-MX', {
    maximumFractionDigits: 1,
  });
  return (
    <div className="flex flex-col gap-2 py-3">
      <p className="text-sm font-medium">{text.question(flag.questionKey)}</p>
      <p className="text-sm text-fg-muted">
        {text.figures(flag.exposures, flag.choices, `${attraction} %`)}
      </p>
      <TextField
        label={text.note}
        value={note}
        maxLength={500}
        onChange={(event) => {
          setNote(event.target.value);
        }}
      />
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          disabled={busy}
          onClick={() => {
            act('edited');
          }}
        >
          {text.edit}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={busy}
          onClick={() => {
            act('kept');
          }}
        >
          {text.keep}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={busy}
          onClick={() => {
            act('dismissed');
          }}
        >
          {text.dismiss}
        </Button>
      </div>
    </div>
  );
}
