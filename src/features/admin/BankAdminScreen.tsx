// Banco y Sheet (pantalla 35, 4.3 del plan de B11). Avance del banco contra la meta de 300 por rama, con
// Inglés aparte, y el interruptor que abre el banco a los alumnos con su confirmación. La
// sincronización con el Google Sheet con su estado, Sincronizar ahora contra el Sheet real o el de
// prueba, las últimas corridas y la tabla de renglones con su CSV. Conflictos y faltantes con sus
// acciones, asignaciones por subespecialidad y avisos de lectura. Todo con la sesión de admin y segundo
// factor (B9). El admin no aprueba ni edita contenido (1.7).
import { useState } from 'react';
import { Link } from 'react-router';
import { useCloud } from '@/app/cloudState';
import { ScreenHeader } from '@/app/layout/ScreenHeader';
import { SCREENS } from '@/app/screens';
import type { EditorListItem, SyncRunSummary } from '@/data/bank/contracts';
import { listCloudUsers } from '@/data/cloud/adminUsers';
import {
  assignQuestions,
  confirmMissing,
  questionsOfTopic,
  readAttention,
  readBankOverview,
  readBankSettings,
  readReadAlerts,
  readSyncRows,
  readSyncRuns,
  resolveConflict,
  setBankOpen,
  readBankTeam,
  setTopicReviewer,
  startBankSync,
  type SyncTarget,
} from '@/data/cloud/bankAdmin';
import { topicTaxonomy } from '@/demo/content';
import { bankAdminText } from '@/i18n/bankAdmin';
import { t } from '@/i18n/es-MX';
import { BranchBadge } from '@/ui/components/branch-tag';
import { Badge } from '@/ui/components/badge';
import { Button } from '@/ui/components/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/ui/components/card';
import { ProgressBar } from '@/ui/components/progress-bar';
import { SelectField } from '@/ui/components/field';
import { ErrorState, LoadingState } from '@/ui/states/states';
import { downloadText } from '../physician/bankTemplates';
import { meridaDay } from '../physician/meridaMonth';
import { sourceKeyLabel } from '../physician/reviewSteps';
import { incompleteText } from '../physician/reviewTexts';
import { askSecondFactor } from '../physician/secondFactor';
import { bankCodeText, bankErrorText } from './bankErrors';
import { rowLabel, rowMessages, syncRowsCsv } from './syncReport';
import { requireCloud, useBankAdminQuery } from './useBankAdminQuery';

const text = bankAdminText;
const branchName = new Map(topicTaxonomy.branches.map((branch) => [branch.key, branch.name]));
const num = (value: number) => value.toLocaleString('es-MX');
const when = (iso: string) =>
  new Date(iso).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' });

/** El motivo de una corrida en español. sheet_error:read:500 se lee como sheet_error */
const reasonText = (reason: string | null) =>
  reason === null ? '' : (text.sync.reasons[reason.split(':')[0] ?? reason] ?? reason);

/** Un aviso de lo que pasó al hacer algo, en verde, o del error, en rojo */
function Feedback({ notice, error }: { notice: string; error: string }) {
  return (
    <>
      <p role="status" className="text-sm font-medium text-success">
        {notice}
      </p>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
    </>
  );
}

/** Corre una acción con su aviso. Devuelve si salió bien */
function useAction() {
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const run = async (work: () => Promise<string>): Promise<boolean> => {
    setBusy(true);
    setNotice('');
    setError('');
    try {
      setNotice(await work());
      return true;
    } catch (caught) {
      setError(bankErrorText(caught));
      return false;
    } finally {
      setBusy(false);
    }
  };
  return { notice, error, busy, run };
}

export function BankAdminScreen() {
  const linked = useCloud((store) => store.state.status === 'linked');
  return (
    <>
      <ScreenHeader
        title={t.screens.bankAdmin.title}
        description={bankAdminText.descriptions.bankAdmin}
      />
      {linked ? (
        <>
          <OverviewCard />
          <SyncCard />
          <AttentionCard />
          <AssignCard />
          <AlertsCard />
        </>
      ) : (
        <Card>
          <p className="text-sm text-fg-muted">{text.needsCloud}</p>
        </Card>
      )}
    </>
  );
}

function OverviewCard() {
  const { state, reload } = useBankAdminQuery(
    (cloud, onForbidden) => readBankOverview(cloud, onForbidden),
    'overview',
  );
  const overview = text.overview;
  return (
    <Card aria-labelledby="banco-avance" className="flex flex-col gap-3">
      <CardHeader>
        <CardTitle id="banco-avance">{overview.title}</CardTitle>
      </CardHeader>
      {state.status === 'loading' ? <LoadingState /> : null}
      {state.status === 'failed' ? (
        <ErrorState description={bankCodeText(state.code)} onRetry={reload} />
      ) : null}
      {state.status === 'ready' ? (
        <>
          <p className="text-sm font-medium">
            {overview.goal(state.value.published, state.value.goal)}
          </p>
          <ProgressBar
            value={state.value.published}
            max={state.value.goal}
            label={overview.title}
            tone="accent"
          />
          <p className="text-sm text-fg-muted">{overview.english(state.value.englishPublished)}</p>
          <div>
            <p className="text-sm font-medium">{overview.byBranch}</p>
            {state.value.byBranch.length === 0 ? (
              <p className="text-sm text-fg-muted">{overview.noBranch}</p>
            ) : (
              <ul className="mt-1 flex flex-wrap gap-2">
                {state.value.byBranch.map((entry) => (
                  <li key={entry.branch}>
                    <BranchBadge branch={entry.branch}>
                      {branchName.get(entry.branch) ?? entry.branch} · {num(entry.published)}
                    </BranchBadge>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {(
              [
                'drafts',
                'incomplete',
                'inReview',
                'conflicts',
                'missing',
                'retireRequested',
                'retired',
              ] as const
            ).map((key) => (
              <div key={key} className="flex flex-col gap-1 rounded-md border border-line p-3">
                <dt className="text-xs leading-tight font-medium text-fg-muted">
                  {overview.counts[key]}
                </dt>
                <dd className="text-xl font-bold tabular-nums">{num(state.value[key])}</dd>
              </div>
            ))}
          </dl>
          <OpenBankControl
            open={state.value.open}
            approved={state.value.published}
            goal={state.value.goal}
            onChanged={reload}
          />
        </>
      ) : null}
    </Card>
  );
}

/** El interruptor de cloudBank con su confirmación, que dice cuántas aprobadas hay (respuesta 68) */
function OpenBankControl({
  open,
  approved,
  goal,
  onChanged,
}: {
  open: boolean;
  approved: number;
  goal: number;
  onChanged: () => void;
}) {
  const copy = text.open;
  const [confirming, setConfirming] = useState(false);
  const action = useAction();
  const change = () =>
    void action
      .run(async () => {
        const cloud = await requireCloud();
        if (!(await setBankOpen(cloud, !open))) throw new Error('flags');
        return open ? copy.closed : copy.opened;
      })
      .then((ok) => {
        setConfirming(false);
        if (ok) onChanged();
      });
  return (
    <section
      aria-labelledby="banco-abrir"
      className="flex flex-col gap-2 border-t border-line pt-3"
    >
      <h3 id="banco-abrir" className="font-semibold">
        {copy.title}
      </h3>
      <p className="text-sm">{open ? copy.openNow : copy.closedNow}</p>
      {confirming ? (
        <>
          <p className="text-sm font-medium">
            {open ? copy.confirmClose : copy.confirmOpen(approved, goal)}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button disabled={action.busy} onClick={change}>
              {copy.confirm}
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setConfirming(false);
              }}
            >
              {copy.cancel}
            </Button>
          </div>
        </>
      ) : (
        <div>
          <Button
            variant={open ? 'secondary' : 'primary'}
            onClick={() => {
              setConfirming(true);
            }}
          >
            {open ? copy.close : copy.open}
          </Button>
        </div>
      )}
      <Feedback notice={action.notice} error={action.error === '' ? '' : copy.failed} />
    </section>
  );
}

function SyncCard() {
  const copy = text.sync;
  const settings = useBankAdminQuery((cloud) => readBankSettings(cloud), 'settings');
  const runs = useBankAdminQuery((cloud, onForbidden) => readSyncRuns(cloud, onForbidden), 'runs');
  const [target, setTarget] = useState<SyncTarget>('test');
  const [selected, setSelected] = useState<string | null>(null);
  const action = useAction();
  const sync = settings.state.status === 'ready' ? settings.state.value?.sync : undefined;

  const start = () =>
    void action
      .run(async () => {
        const result = await startBankSync(await requireCloud(), target, askSecondFactor);
        if (result.runId) setSelected(result.runId);
        return result.status === 'skipped'
          ? copy.skipped(reasonText(result.reason ?? null))
          : copy.started;
      })
      .then(() => {
        runs.reload();
      });

  return (
    <Card aria-labelledby="banco-sync" className="flex flex-col gap-3">
      <CardHeader>
        <CardTitle id="banco-sync">{copy.title}</CardTitle>
        <CardDescription>{copy.hint}</CardDescription>
      </CardHeader>
      {sync ? (
        <p className="flex flex-wrap items-center gap-2 text-sm">
          <Badge variant={sync.enabled ? 'success' : 'neutral'}>
            {sync.enabled ? copy.enabled : copy.disabled}
          </Badge>
          <span>{copy.modeLabel(copy.mode[sync.mode] ?? sync.mode)}</span>
        </p>
      ) : null}
      <div className="flex flex-wrap items-end gap-2">
        <SelectField
          label={copy.target}
          value={target}
          options={(['test', 'real'] as const).map((value) => ({
            value,
            label: copy.targets[value] ?? value,
          }))}
          onChange={(event) => {
            setTarget(event.target.value === 'real' ? 'real' : 'test');
          }}
        />
        <Button disabled={action.busy} onClick={start}>
          {copy.now}
        </Button>
        <Button variant="ghost" onClick={runs.reload}>
          {copy.refresh}
        </Button>
      </div>
      <Feedback notice={action.notice} error={action.error} />
      <h3 className="font-semibold">{copy.runs}</h3>
      {runs.state.status === 'loading' ? <LoadingState /> : null}
      {runs.state.status === 'failed' ? (
        <ErrorState description={bankCodeText(runs.state.code)} onRetry={runs.reload} />
      ) : null}
      {runs.state.status === 'ready' ? (
        runs.state.value.length === 0 ? (
          <p className="text-sm text-fg-muted">{copy.noRuns}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-line">
            {runs.state.value.slice(0, 10).map((run) => (
              <li key={run.id} className="py-2">
                <RunLine
                  run={run}
                  selected={selected === run.id}
                  onSelect={() => {
                    setSelected(run.id);
                  }}
                />
              </li>
            ))}
          </ul>
        )
      ) : null}
      {selected ? (
        <RunRows
          runId={selected}
          finishedAt={
            runs.state.status === 'ready'
              ? (runs.state.value.find((run) => run.id === selected)?.finishedAt ?? null)
              : null
          }
        />
      ) : null}
    </Card>
  );
}

function RunLine({
  run,
  selected,
  onSelect,
}: {
  run: SyncRunSummary;
  selected: boolean;
  onSelect: () => void;
}) {
  const copy = text.sync;
  const counts = Object.entries(run.counts).filter(
    ([key, value]) => copy.counts[key] !== undefined && value > 0,
  );
  return (
    <div className="flex flex-wrap items-start gap-2">
      <div className="flex min-w-0 flex-1 flex-col gap-1 text-sm">
        <p className="flex flex-wrap items-center gap-2 font-medium">
          {copy.run.at(when(run.startedAt))}
          <Badge
            variant={
              run.status === 'ok' ? 'success' : run.status === 'failed' ? 'danger' : 'neutral'
            }
          >
            {copy.run.status[run.status] ?? run.status}
          </Badge>
        </p>
        <p className="text-fg-muted">
          {[
            copy.run.trigger[run.trigger] ?? run.trigger,
            copy.run.target[run.target] ?? run.target,
            copy.mode[run.mode] ?? run.mode,
          ].join(' · ')}
        </p>
        {run.reason ? <p className="text-fg-muted">{reasonText(run.reason)}</p> : null}
        {counts.length > 0 ? (
          <p className="text-fg-muted">
            {counts.map(([key, value]) => `${copy.counts[key] ?? key} ${num(value)}`).join(', ')}
          </p>
        ) : null}
      </div>
      <Button size="sm" variant={selected ? 'primary' : 'secondary'} onClick={onSelect}>
        {copy.run.show}
      </Button>
    </div>
  );
}

/**
 * Los renglones de una corrida con lo que hay que hacer en cada uno, y su CSV. Se vuelven a leer cuando
 * la corrida termina, porque mientras corre todavía no tiene todos
 */
function RunRows({ runId, finishedAt }: { runId: string; finishedAt: string | null }) {
  const copy = text.sync.rows;
  const { state, reload } = useBankAdminQuery(
    (cloud, onForbidden) => readSyncRows(cloud, runId, onForbidden),
    `rows|${runId}|${finishedAt ?? 'running'}`,
  );
  return (
    <section
      aria-labelledby="banco-renglones"
      className="flex flex-col gap-2 border-t border-line pt-3"
    >
      <h3 id="banco-renglones" className="font-semibold">
        {text.sync.run.selected}
      </h3>
      <p className="text-sm text-fg-muted">{copy.hint}</p>
      {state.status === 'loading' ? <LoadingState /> : null}
      {state.status === 'failed' ? (
        <ErrorState description={bankCodeText(state.code)} onRetry={reload} />
      ) : null}
      {state.status === 'ready' ? (
        state.value.length === 0 ? (
          <p className="text-sm text-fg-muted">{copy.none}</p>
        ) : (
          <>
            <div>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  downloadText(
                    copy.csvFile(meridaDay(new Date())),
                    syncRowsCsv(state.value, incompleteText),
                    'text/csv;charset=utf-8',
                  );
                }}
              >
                {copy.csv}
              </Button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-fg-muted">
                    <th scope="col" className="py-1 pr-2">
                      {copy.csvColumns[0]}
                    </th>
                    <th scope="col" className="py-1 pr-2">
                      {copy.key}
                    </th>
                    <th scope="col" className="py-1 pr-2">
                      {copy.outcome}
                    </th>
                    <th scope="col" className="py-1">
                      {copy.detail}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {state.value.map((row, index) => (
                    <tr
                      key={`${String(row.rowNumber)}-${row.sheetKey ?? ''}-${index}`}
                      className="border-t border-line align-top"
                    >
                      <th
                        scope="row"
                        className="py-1.5 pr-2 text-left font-medium whitespace-nowrap"
                      >
                        {rowLabel(row)}
                      </th>
                      <td className="py-1.5 pr-2 whitespace-nowrap">{row.sheetKey ?? ''}</td>
                      <td className="py-1.5 pr-2">{copy.outcomes[row.outcome] ?? row.outcome}</td>
                      <td className="py-1.5">
                        <ul className="flex flex-col gap-0.5">
                          {rowMessages(row, incompleteText).map((message, at) => (
                            <li key={at}>{copy.line(rowLabel(row), message)}</li>
                          ))}
                        </ul>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )
      ) : null}
    </section>
  );
}

function AttentionCard() {
  const copy = text.attention;
  const { state, reload } = useBankAdminQuery(
    (cloud, onForbidden) => readAttention(cloud, onForbidden),
    'attention',
  );
  const action = useAction();
  const act = (work: () => Promise<unknown>) =>
    void action
      .run(async () => {
        await work();
        return copy.resolved;
      })
      .then(reload);
  return (
    <Card aria-labelledby="banco-atencion" className="flex flex-col gap-3">
      <CardHeader>
        <CardTitle id="banco-atencion">{copy.conflicts}</CardTitle>
        <CardDescription>{copy.conflictsHint}</CardDescription>
      </CardHeader>
      {state.status === 'loading' ? <LoadingState /> : null}
      {state.status === 'failed' ? (
        <ErrorState description={bankCodeText(state.code)} onRetry={reload} />
      ) : null}
      {state.status === 'ready' ? (
        <>
          <QuestionLines
            items={state.value.conflicts}
            empty={copy.noConflicts}
            actions={(item) => (
              <>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={action.busy}
                  onClick={() => {
                    act(async () =>
                      resolveConflict(
                        await requireCloud(),
                        item.questionId,
                        'keep_app',
                        askSecondFactor,
                      ),
                    );
                  }}
                >
                  {copy.keepApp}
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={action.busy}
                  onClick={() => {
                    act(async () =>
                      resolveConflict(
                        await requireCloud(),
                        item.questionId,
                        'take_sheet',
                        askSecondFactor,
                      ),
                    );
                  }}
                >
                  {copy.takeSheet}
                </Button>
              </>
            )}
          />
          <h3 className="font-semibold">{copy.missing}</h3>
          <p className="text-sm text-fg-muted">{copy.missingHint}</p>
          <QuestionLines
            items={state.value.missing}
            empty={copy.noMissing}
            actions={(item) => (
              <>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={action.busy}
                  onClick={() => {
                    act(async () =>
                      confirmMissing(
                        await requireCloud(),
                        [item.questionId],
                        'retire',
                        askSecondFactor,
                      ),
                    );
                  }}
                >
                  {copy.retire}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={action.busy}
                  onClick={() => {
                    act(async () =>
                      confirmMissing(
                        await requireCloud(),
                        [item.questionId],
                        'keep',
                        askSecondFactor,
                      ),
                    );
                  }}
                >
                  {copy.keep}
                </Button>
              </>
            )}
          />
        </>
      ) : null}
      <Feedback notice={action.notice} error={action.error} />
    </Card>
  );
}

function QuestionLines({
  items,
  empty,
  actions,
}: {
  items: readonly EditorListItem[];
  empty: string;
  actions: (item: EditorListItem) => React.ReactNode;
}) {
  if (items.length === 0) return <p className="text-sm text-fg-muted">{empty}</p>;
  return (
    <ul className="flex flex-col divide-y divide-line">
      {items.map((item) => {
        const key = sourceKeyLabel(item.sourceKey);
        return (
          <li key={item.questionId} className="flex flex-wrap items-center gap-2 py-2">
            <span className="min-w-0 flex-1 text-sm">
              {key ? <span className="mr-2 font-semibold">{key}</span> : null}
              {item.promptPreview}
            </span>
            {actions(item)}
            <Button asChild size="sm" variant="ghost">
              <Link to={`${SCREENS.questionEditor.path}?pregunta=${item.questionId}`}>
                {text.attention.open}
              </Link>
            </Button>
          </li>
        );
      })}
    </ul>
  );
}

function AssignCard() {
  const copy = text.assign;
  const physicians = useBankAdminQuery(async (cloud) => {
    const result = await listCloudUsers(cloud, { query: '', role: 'physician', page: 0 });
    if (!result.ok) throw new Error(result.reason);
    return result.users;
  }, 'physicians');
  const [branch, setBranch] = useState(topicTaxonomy.branches[0]?.key ?? '');
  const topics = topicTaxonomy.branches.find((item) => item.key === branch)?.topics ?? [];
  const [topic, setTopic] = useState(topics[0]?.key ?? '');
  const [author, setAuthor] = useState('');
  const [reviewer, setReviewer] = useState('');
  const [fallback, setFallback] = useState('');
  const action = useAction();
  const team = useBankAdminQuery((cloud, onForbidden) => readBankTeam(cloud, onForbidden), 'team');
  const people = physicians.state.status === 'ready' ? physicians.state.value : [];
  const defaults = team.state.status === 'ready' ? team.state.value.topicReviewers : [];
  const current = defaults.find((entry) => entry.branch === branch && entry.topic === topic);
  const topicNameOf = (branchKey: string, topicKey: string) =>
    topicTaxonomy.branches
      .find((item) => item.key === branchKey)
      ?.topics.find((item) => item.key === topicKey)?.name ?? topicKey;
  const choices = [
    { value: '', label: copy.keep },
    ...people.map((person) => ({ value: person.id, label: person.alias })),
  ];

  return (
    <Card aria-labelledby="banco-asignar" className="flex flex-col gap-3">
      <CardHeader>
        <CardTitle id="banco-asignar">{copy.title}</CardTitle>
        <CardDescription>{copy.hint}</CardDescription>
      </CardHeader>
      {physicians.state.status === 'loading' ? <LoadingState /> : null}
      {physicians.state.status === 'ready' && people.length === 0 ? (
        <p className="text-sm text-fg-muted">{copy.noPhysicians}</p>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <SelectField
          label={copy.branch}
          value={branch}
          options={topicTaxonomy.branches.map((item) => ({ value: item.key, label: item.name }))}
          onChange={(event) => {
            setBranch(event.target.value);
            const first = topicTaxonomy.branches.find((item) => item.key === event.target.value)
              ?.topics[0];
            setTopic(first?.key ?? '');
          }}
        />
        <SelectField
          label={copy.topic}
          value={topic}
          options={topics.map((item) => ({ value: item.key, label: item.name }))}
          onChange={(event) => {
            setTopic(event.target.value);
          }}
        />
        <SelectField
          label={copy.author}
          value={author}
          options={choices}
          onChange={(event) => {
            setAuthor(event.target.value);
          }}
        />
        <SelectField
          label={copy.reviewer}
          value={reviewer}
          options={choices}
          onChange={(event) => {
            setReviewer(event.target.value);
          }}
        />
      </div>
      <div>
        <Button
          disabled={action.busy || topic === '' || (author === '' && reviewer === '')}
          onClick={() => {
            void action.run(async () => {
              const cloud = await requireCloud();
              const ids = await questionsOfTopic(cloud, branch, topic, askSecondFactor);
              const changed = await assignQuestions(
                cloud,
                { questionIds: ids, author: author || null, reviewer: reviewer || null },
                askSecondFactor,
              );
              return copy.assigned(changed);
            });
          }}
        >
          {copy.assign}
        </Button>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <SelectField
          label={copy.defaultReviewer}
          value={fallback}
          options={[
            { value: '', label: copy.keep },
            ...people.map((person) => ({ value: person.id, label: person.alias })),
          ]}
          onChange={(event) => {
            setFallback(event.target.value);
          }}
        />
        <Button
          variant="secondary"
          disabled={action.busy || fallback === '' || topic === ''}
          onClick={() => {
            void action
              .run(async () => {
                await setTopicReviewer(
                  await requireCloud(),
                  { branch, topic, physician: fallback },
                  askSecondFactor,
                );
                return copy.defaultSaved;
              })
              .then(team.reload);
          }}
        >
          {copy.setDefault}
        </Button>
      </div>
      <p className="text-sm text-fg-muted">
        {current
          ? current.active
            ? copy.currentDefault(current.alias)
            : copy.inactiveDefault(current.alias)
          : copy.noDefault}
      </p>
      {defaults.length > 0 ? (
        <section aria-labelledby="banco-omision" className="flex flex-col gap-1">
          <h3 id="banco-omision" className="text-sm font-semibold">
            {copy.defaults}
          </h3>
          <ul className="flex flex-col gap-0.5 text-sm">
            {defaults.map((entry) => (
              <li key={`${entry.branch}/${entry.topic}`}>
                {topicNameOf(entry.branch, entry.topic)} · {entry.alias}
                {entry.active ? '' : ` · ${copy.inactive}`}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <Feedback notice={action.notice} error={action.error} />
    </Card>
  );
}

function AlertsCard() {
  const copy = text.alerts;
  const { state, reload } = useBankAdminQuery(
    (cloud, onForbidden) => readReadAlerts(cloud, onForbidden),
    'alerts',
  );
  return (
    <Card aria-labelledby="banco-avisos" className="flex flex-col gap-3">
      <CardHeader>
        <CardTitle id="banco-avisos">{copy.title}</CardTitle>
        <CardDescription>{copy.hint}</CardDescription>
      </CardHeader>
      {state.status === 'loading' ? <LoadingState /> : null}
      {state.status === 'failed' ? (
        <ErrorState description={bankCodeText(state.code)} onRetry={reload} />
      ) : null}
      {state.status === 'ready' ? (
        state.value.length === 0 ? (
          <p className="text-sm text-fg-muted">{copy.none}</p>
        ) : (
          <ul className="flex flex-col gap-1 text-sm">
            {state.value.map((alert) => (
              <li key={alert.id}>
                {copy.line(
                  alert.alias,
                  copy.kinds[alert.kind] ?? alert.kind,
                  alert.day,
                  alert.kind === 'week_share'
                    ? `${num(Math.round(alert.value * 100))} %`
                    : num(alert.value),
                )}
              </li>
            ))}
          </ul>
        )
      ) : null}
    </Card>
  );
}
