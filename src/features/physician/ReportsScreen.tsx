// Bandeja de reportes de contenido (pantalla 21, 10.2). Los errores que los alumnos reportan en las
// preguntas, agrupados por pregunta y con lo más grave primero. El médico ve los de las preguntas que
// le asignaron y el admin todos. Cada reporte se resuelve, se descarta o se reabre (4.5).
import { useState } from 'react';
import { Link } from 'react-router';
import { CheckCircle2, Hourglass, XCircle } from 'lucide-react';
import { usePreferences } from '@/app/preferences';
import { ScreenHeader } from '@/app/layout/ScreenHeader';
import { SCREENS } from '@/app/screens';
import { useSession } from '@/app/session';
import { useDataApi } from '@/data/context';
import { useLiveData } from '@/data/hooks';
import { setReportsStatus, type ReportStatus } from '@/data/usecases/contentReports';
import { topicTaxonomy } from '@/demo/content';
import { t } from '@/i18n/es-MX';
import { useBankReady } from '../shared/useBankReady';
import { toneClasses } from '@/ui/branches';
import { cn } from '@/ui/cn';
import { Badge } from '@/ui/components/badge';
import { Button } from '@/ui/components/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/ui/components/card';
import { Disclosure } from '@/ui/components/disclosure';
import { SelectField } from '@/ui/components/field';
import { DemoContentLabel } from '@/ui/components/labels';
import { StatCell, StatPanel } from '@/ui/components/stat-panel';
import { EmptyState, LoadingState } from '@/ui/states/states';
import { QuestionPreview } from './QuestionPreview';
import {
  buildReportsView,
  reasonsBySeverity,
  type ReportGroup,
  type StatusFilter,
} from './reportsView';

const branchName = new Map(topicTaxonomy.branches.map((branch) => [branch.key, branch.name]));
const topicName = new Map(
  topicTaxonomy.branches.flatMap((branch) =>
    branch.topics.map((topic) => [topic.key, topic.name] as const),
  ),
);
const reasonName = t.simulator.reportReasons;
const date = (iso: string) => new Date(iso).toLocaleDateString('es-MX');

export function ReportsScreen() {
  const text = t.reportsScreen;
  const api = useDataApi();
  const role = usePreferences((state) => state.role);
  const session = useSession();
  const me = session.status === 'ready' ? session.user.id : null;
  const [status, setStatus] = useState<StatusFilter>('open');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const bankReady = useBankReady();

  const data = useLiveData(async () => {
    const [reports, latest, assignments] = await Promise.all([
      api.repos.contentReports.list(),
      api.repos.questions.listLatest(),
      api.repos.reviewAssignments.list(),
    ]);
    // Solo las versiones de las preguntas reportadas, que son pocas
    const reported = new Set<string>();
    const versions = await Promise.all(
      reports
        .filter((report) => report.targetKind === 'question')
        .map((report) => api.repos.questions.get(report.targetId)),
    );
    for (const version of versions) if (version) reported.add(version.questionId);
    const all = await Promise.all([...reported].map((id) => api.repos.questions.listVersions(id)));
    return { reports, latest, assignments, versions: all.flat() };
  }, [api.repos, bankReady]);

  const header = (
    <ScreenHeader
      title={t.screens.contentReports.title}
      description={role === 'physician' ? text.hintPhysician : text.hintAdmin}
      badges={<DemoContentLabel />}
    />
  );
  if (data === undefined || !bankReady) {
    return (
      <>
        {header}
        <LoadingState />
      </>
    );
  }

  const view = buildReportsView({
    reports: data.reports,
    versionsById: new Map(data.versions.map((version) => [version.id, version])),
    latestByStableId: new Map(data.latest.map((question) => [question.questionId, question])),
    allowed:
      role === 'physician'
        ? new Set(
            data.assignments
              .filter((assignment) => assignment.physicianId === me)
              .map((assignment) => assignment.questionId),
          )
        : null,
    status,
  });

  const change = async (ids: readonly string[], to: ReportStatus) => {
    setError('');
    try {
      const changed = await setReportsStatus(api, ids, to);
      setNotice(text.changed(changed, text.row.status[to] ?? to));
    } catch {
      setError(text.failed);
    }
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
  const text = t.reportsScreen;
  const { latest } = group;
  const openIds = group.rows
    .filter((row) => row.report.status === 'open')
    .map((row) => row.report.id);
  const hasOutdated = group.rows.some((row) => row.outdated && row.report.status === 'open');
  const titleId = `reporte-${group.questionId}`;
  return (
    <Card aria-labelledby={titleId}>
      <CardHeader>
        <CardTitle id={titleId} className="text-base">
          {latest.prompt}
        </CardTitle>
        <CardDescription className="flex flex-wrap items-center gap-2">
          <span
            className={cn(
              'rounded-full px-2 py-0.5 text-xs font-semibold',
              toneClasses(latest.branch).chip,
            )}
          >
            {branchName.get(latest.branch) ?? latest.branch}
          </span>
          <span>{topicName.get(latest.topic) ?? latest.topic}</span>
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
                {text.row.version(row.version?.version ?? null)}
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
      <div className="mt-3">
        <Disclosure title={text.group.showQuestion}>
          <QuestionPreview question={latest} hideEdit />
        </Disclosure>
      </div>
    </Card>
  );
}
