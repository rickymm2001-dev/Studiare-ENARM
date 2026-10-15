// La parte del administrador de la auditoría de la IA (B12, 5.3 y 5.5). Importa la muestra y asigna a
// exactamente dos médicos, ve el avance de cada uno, cierra la muestra, ve el veredicto por motor que
// calcula la base y abre o cierra cada motor para los alumnos. También la pausa global. Todo pasa por
// funciones de la base que revisan que seas admin y, con el segundo factor, que lo hayas dado.
import { useId, useState } from 'react';
import { useAiStatus } from '@/ai/useAiStatus';
import { useCloud } from '@/app/cloudState';
import { useSession } from '@/app/session';
import { listCloudUsers } from '@/data/cloud/adminUsers';
import {
  closeSample,
  fetchGateState,
  fetchProgress,
  listSamples,
  setEngineOpen,
  setPaused,
  type AiRpcResult,
  type SampleRow,
  type Verdict,
} from '@/data/cloud/aiGate';
import { loadCloud } from '@/data/cloud/client';
import { AI_ENGINES, type AiEngine, type AiGateState } from '@/engines/aiContracts';
import { aiAuditText } from '@/i18n/aiAudit';
import { Badge } from '@/ui/components/badge';
import { Button } from '@/ui/components/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/ui/components/card';
import { SelectField } from '@/ui/components/field';
import { FileChooser } from '@/ui/components/file-chooser';
import { ProgressBar } from '@/ui/components/progress-bar';
import { ErrorState, LoadingState } from '@/ui/states/states';
import { formatDateTime } from '../admin/format';
import {
  importSample,
  readSampleFile,
  type SampleFileResult,
  type SampleSummary,
} from './aiAuditActions';
import { failureText } from './aiAuditView';
import { askSecondFactor } from './secondFactor';
import { useAuditQuery, type AuditQueryState } from './useAuditQuery';

const text = aiAuditText.admin;

/** Los médicos que se pueden asignar, por su id de la nube y su alias */
interface Person {
  id: string;
  alias: string;
}

export function AdminSection() {
  const gate = useAuditQuery((cloud) => fetchGateState(cloud), 'gate');
  const samples = useAuditQuery((cloud, onForbidden) => listSamples(cloud, onForbidden), 'samples');
  const people = useAuditQuery(async (cloud): Promise<AiRpcResult<Person[]>> => {
    const result = await listCloudUsers(cloud, { query: '', role: 'physician', page: 0 });
    if (result.ok) {
      return {
        ok: true,
        value: result.users.map((user) => ({ id: user.id, alias: user.alias })),
      };
    }
    const reason = result.reason === 'not_admin' ? 'forbidden' : result.reason;
    return { ok: false, reason, message: null };
  }, 'people');
  const [selected, setSelected] = useState('');
  const [notice, setNotice] = useState('');

  const reloadAll = () => {
    gate.reload();
    samples.reload();
  };

  return (
    <>
      <GateCard
        gate={gate.state}
        onChanged={(message) => {
          setNotice(message);
          gate.reload();
        }}
        onRetry={gate.reload}
      />
      {notice ? (
        <p role="status" className="text-sm font-medium text-success">
          {notice}
        </p>
      ) : null}
      <SamplesCard
        samples={samples.state}
        gate={gate.state}
        people={people.state.status === 'ready' ? people.state.value : []}
        selected={selected}
        onSelect={setSelected}
        onRetry={samples.reload}
        onChanged={(message) => {
          setNotice(message);
          reloadAll();
        }}
      />
      <ImportCard
        people={people.state}
        onImported={(id) => {
          setNotice(text.imported(id));
          setSelected(id);
          samples.reload();
        }}
      />
    </>
  );
}

// ===================================================================== La compuerta

type Acting = { engine: AiEngine | 'pause' } | null;

function GateCard({
  gate,
  onChanged,
  onRetry,
}: {
  gate: AuditQueryState<AiGateState>;
  onChanged: (message: string) => void;
  onRetry: () => void;
}) {
  // Lo que ven los alumnos se vuelve a preguntar cada vez que cambia la compuerta, para que el aviso de
  // un motor abierto sin auditoría vigente sea el de ahora y no el de cuando se abrió la pantalla
  const status = useAiStatus({
    refreshKey: gate.status === 'ready' ? JSON.stringify(gate.value) : '',
  });
  const [acting, setActing] = useState<Acting>(null);
  const [problem, setProblem] = useState('');

  const run = async (
    who: NonNullable<Acting>,
    action: (
      cloud: NonNullable<Awaited<ReturnType<typeof loadCloud>>>,
    ) => Promise<AiRpcResult<AiGateState>>,
    done: string,
  ) => {
    setActing(who);
    setProblem('');
    const cloud = await loadCloud();
    const result = cloud
      ? await action(cloud)
      : ({ ok: false, reason: 'network', message: null } as const);
    setActing(null);
    if (result.ok) onChanged(done);
    else setProblem(failureText(result.reason, result.message));
  };

  return (
    <Card aria-labelledby="compuerta-ia" className="flex flex-col gap-3">
      <CardHeader className="mb-0">
        <CardTitle id="compuerta-ia">{text.gateTitle}</CardTitle>
        <CardDescription>{text.gateHint}</CardDescription>
      </CardHeader>
      {gate.status === 'loading' ? <LoadingState /> : null}
      {gate.status === 'failed' ? (
        <ErrorState description={text.gateUnreadable} onRetry={onRetry} />
      ) : null}
      {gate.status === 'ready' ? (
        <>
          <ul className="flex flex-col divide-y divide-line">
            {AI_ENGINES.map((engine) => {
              const entry = gate.value.engines[engine];
              const open = entry?.open === true;
              // El servidor la cuenta cerrada para alumnos si cambió el modelo o el prompt
              const stale = open && 'engines' in status && status.engines?.[engine] === 'gated';
              const name = aiAuditText.engines[engine];
              return (
                <li key={engine} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3">
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <p className="flex flex-wrap items-center gap-2 font-medium">
                      {name}
                      <Badge variant={open && !stale ? 'success' : 'neutral'}>
                        {open ? (stale ? text.state.stale : text.state.open) : text.state.closed}
                      </Badge>
                    </p>
                    <p className="text-sm text-fg-muted">
                      {entry
                        ? `${text.auditedWith(entry.model, entry.promptVersion, entry.sampleId)}. ${formatDateTime(entry.at)}`
                        : text.notAudited}
                    </p>
                  </div>
                  {open ? (
                    <Button
                      variant="secondary"
                      size="sm"
                      aria-label={text.closeLabel(name)}
                      disabled={acting !== null}
                      onClick={() => {
                        void run(
                          { engine },
                          (cloud) =>
                            setEngineOpen(cloud, engine, false, entry.sampleId, askSecondFactor),
                          text.closed(name),
                        );
                      }}
                    >
                      {text.close}
                    </Button>
                  ) : null}
                </li>
              );
            })}
          </ul>
          <div className="flex flex-col gap-2 border-t border-line pt-3">
            <h3 className="font-semibold">{text.pauseTitle}</h3>
            <p className="text-sm text-fg-muted">{text.pauseHint}</p>
            <p role="status" className="text-sm font-medium">
              {gate.value.paused ? text.paused : text.notPaused}
            </p>
            <Button
              variant={gate.value.paused ? 'primary' : 'secondary'}
              className="self-start"
              disabled={acting !== null}
              onClick={() => {
                const next = !gate.value.paused;
                void run(
                  { engine: 'pause' },
                  (cloud) => setPaused(cloud, next, askSecondFactor),
                  next ? text.pausedDone : text.unpausedDone,
                );
              }}
            >
              {gate.value.paused ? text.unpause : text.pause}
            </Button>
          </div>
        </>
      ) : null}
      {problem ? (
        <p role="alert" className="text-sm font-medium text-danger">
          {problem}
        </p>
      ) : null}
    </Card>
  );
}

// ===================================================================== Las muestras

function SamplesCard({
  samples,
  gate,
  people,
  selected,
  onSelect,
  onRetry,
  onChanged,
}: {
  samples: AuditQueryState<SampleRow[]>;
  gate: AuditQueryState<AiGateState>;
  people: readonly Person[];
  selected: string;
  onSelect: (id: string) => void;
  onRetry: () => void;
  onChanged: (message: string) => void;
}) {
  return (
    <Card aria-labelledby="muestras-ia" className="flex flex-col gap-3">
      <CardHeader className="mb-0">
        <CardTitle id="muestras-ia">{text.samplesTitle}</CardTitle>
        <CardDescription>{text.samplesHint}</CardDescription>
      </CardHeader>
      {samples.status === 'loading' ? <LoadingState /> : null}
      {samples.status === 'failed' ? (
        <ErrorState description={failureText(samples.reason, samples.message)} onRetry={onRetry} />
      ) : null}
      {samples.status === 'ready' && samples.value.length === 0 ? (
        <p className="text-sm text-fg-muted">{text.samplesEmpty}</p>
      ) : null}
      {samples.status === 'ready' && samples.value.length > 0 ? (
        <ul className="flex flex-col divide-y divide-line">
          {samples.value.map((sample) => (
            <li key={sample.sampleId} className="flex flex-wrap items-center gap-2 py-2">
              <span className="min-w-0 flex-1 text-sm">
                {text.sampleRow(
                  sample.sampleId,
                  sample.total,
                  sample.status === 'open' ? text.statusOpen : text.statusClosed,
                )}
                <span className="block text-xs text-fg-muted">
                  {formatDateTime(sample.createdAt)}
                </span>
              </span>
              <Button
                size="sm"
                variant={selected === sample.sampleId ? 'primary' : 'secondary'}
                aria-pressed={selected === sample.sampleId}
                aria-label={text.selectLabel(sample.sampleId)}
                onClick={() => {
                  onSelect(sample.sampleId);
                }}
              >
                {text.select}
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      {samples.status === 'ready' && selected !== '' ? (
        <SampleDetail
          key={selected}
          sampleId={selected}
          gate={gate.status === 'ready' ? gate.value : null}
          people={people}
          onChanged={onChanged}
        />
      ) : null}
    </Card>
  );
}

function SampleDetail({
  sampleId,
  gate,
  people,
  onChanged,
}: {
  sampleId: string;
  gate: AiGateState | null;
  people: readonly Person[];
  onChanged: (message: string) => void;
}) {
  const progress = useAuditQuery(
    (cloud, onForbidden) => fetchProgress(cloud, sampleId, onForbidden),
    sampleId,
  );
  const session = useSession();
  const authId = useCloud((store) =>
    store.state.status === 'linked' ? store.state.identity.authId : null,
  );
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');

  const names = new Map(people.map((person) => [person.id, person.alias]));
  if (authId && session.status === 'ready') names.set(authId, session.user.alias);
  const nameOf = (id: string | null) =>
    id ? (names.get(id) ?? text.unknownReviewer) : text.unknownReviewer;

  const act = async <T,>(
    action: (cloud: NonNullable<Awaited<ReturnType<typeof loadCloud>>>) => Promise<AiRpcResult<T>>,
    done: string,
  ) => {
    setBusy(true);
    setProblem('');
    const cloud = await loadCloud();
    const result = cloud
      ? await action(cloud)
      : ({ ok: false, reason: 'network', message: null } as const);
    setBusy(false);
    setConfirming(false);
    if (result.ok) {
      onChanged(done);
      progress.reload();
    } else {
      setProblem(failureText(result.reason, result.message));
    }
  };

  if (progress.state.status === 'loading') return <LoadingState />;
  if (progress.state.status === 'failed') {
    return (
      <ErrorState
        description={failureText(progress.state.reason, progress.state.message)}
        onRetry={progress.reload}
      />
    );
  }
  const data = progress.state.value;
  const closed = data.status === 'closed';
  return (
    <section
      aria-label={text.selected(sampleId)}
      className="flex flex-col gap-3 rounded-lg border border-line p-3"
    >
      <h3 className="font-semibold">{text.selected(sampleId)}</h3>
      <ul className="flex flex-col gap-2">
        {data.reviewers.map((reviewer, position) => (
          <li key={reviewer.reviewerId ?? position} className="flex flex-col gap-1">
            <p className="text-sm">
              {text.reviewerProgress(
                nameOf(reviewer.reviewerId),
                reviewer.reviewed,
                data.total,
                reviewer.severe,
              )}
            </p>
            <ProgressBar
              value={reviewer.reviewed}
              max={data.total}
              label={text.reviewerProgress(
                nameOf(reviewer.reviewerId),
                reviewer.reviewed,
                data.total,
                reviewer.severe,
              )}
            />
          </li>
        ))}
      </ul>

      {closed ? null : confirming ? (
        <div className="flex flex-col gap-2 rounded-md bg-muted p-3">
          <p className="text-sm">{text.closeSampleHint}</p>
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={busy}
              onClick={() => {
                void act(
                  (cloud) => closeSample(cloud, sampleId, askSecondFactor),
                  text.sampleClosed,
                );
              }}
            >
              {text.confirmClose}
            </Button>
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => {
                setConfirming(false);
              }}
            >
              {text.cancel}
            </Button>
          </div>
        </div>
      ) : (
        <Button
          variant="secondary"
          className="self-start"
          onClick={() => {
            setConfirming(true);
          }}
        >
          {text.closeSample}
        </Button>
      )}

      {data.verdict ? (
        <VerdictTable
          verdict={data.verdict}
          sampleId={sampleId}
          gate={gate}
          busy={busy}
          onOpen={(engine) => {
            void act(
              (cloud) => setEngineOpen(cloud, engine, true, sampleId, askSecondFactor),
              text.opened(aiAuditText.engines[engine]),
            );
          }}
        />
      ) : null}
      {problem ? (
        <p role="alert" className="text-sm font-medium text-danger">
          {problem}
        </p>
      ) : null}
    </section>
  );
}

function VerdictTable({
  verdict,
  sampleId,
  gate,
  busy,
  onOpen,
}: {
  verdict: Verdict;
  sampleId: string;
  gate: AiGateState | null;
  busy: boolean;
  onOpen: (engine: AiEngine) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <h4 className="font-semibold">{text.verdictTitle}</h4>
      <p className="text-sm text-fg-muted">{text.verdictHint}</p>
      <ul className="flex flex-col divide-y divide-line">
        {AI_ENGINES.filter((engine) => verdict.engines[engine] !== undefined).map((engine) => {
          const entry = verdict.engines[engine];
          if (!entry) return null;
          const name = aiAuditText.engines[engine];
          const current = gate?.engines[engine];
          const alreadyOpen = current?.open === true && current.sampleId === sampleId;
          return (
            <li key={engine} className="flex flex-col gap-1.5 py-3">
              <p className="flex flex-wrap items-center gap-2 font-medium">
                {name}
                <Badge variant={entry.passed ? 'success' : 'warning'}>
                  {entry.passed ? text.verdictPassed : text.verdictFailed}
                </Badge>
              </p>
              <p className="text-sm text-fg-muted">
                {text.metrics({
                  items: entry.items,
                  groundedMin: entry.groundedMin,
                  approvedMin: entry.approvedMin,
                  usefulness: entry.usefulnessMean,
                  clarity: entry.clarityMean,
                  agreement: entry.agreement,
                  kappa: entry.kappa,
                })}
              </p>
              {entry.reasons.length > 0 ? (
                <ul className="list-disc pl-5 text-sm">
                  {entry.reasons.map((reason) => (
                    <li key={reason}>{text.reasons[reason] ?? reason}</li>
                  ))}
                </ul>
              ) : null}
              {entry.passed ? (
                alreadyOpen ? (
                  <p className="text-sm font-medium text-success">{text.alreadyOpen}</p>
                ) : (
                  <Button
                    size="sm"
                    className="self-start"
                    disabled={busy}
                    aria-label={text.openWith(name, sampleId)}
                    onClick={() => {
                      onOpen(engine);
                    }}
                  >
                    {text.open}
                  </Button>
                )
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ===================================================================== Importar

function ImportCard({
  people,
  onImported,
}: {
  people: AuditQueryState<Person[]>;
  onImported: (sampleId: string) => void;
}) {
  const fileId = useId();
  const session = useSession();
  const authId = useCloud((store) =>
    store.state.status === 'linked' ? store.state.identity.authId : null,
  );
  const [fileName, setFileName] = useState<string | null>(null);
  const [read, setRead] = useState<SampleFileResult | null>(null);
  const [first, setFirst] = useState('');
  const [second, setSecond] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');

  const options: Person[] = people.status === 'ready' ? [...people.value] : [];
  // El admin también es médico y puede calificar, así que se ofrece a sí mismo
  if (authId && session.status === 'ready' && !options.some((person) => person.id === authId)) {
    options.push({ id: authId, alias: session.user.alias });
  }
  const choices = [
    { value: '', label: text.reviewerPlaceholder },
    ...options.map((person) => ({
      value: person.id,
      label: person.id === authId ? text.youLabel(person.alias) : person.alias,
    })),
  ];

  const choose = async (file: File | undefined) => {
    if (!file) return;
    setFileName(file.name);
    setProblem('');
    setRead(readSampleFile(await file.text()));
  };

  const sameReviewer = first !== '' && first === second;
  const ready = read?.ok === true && first !== '' && second !== '' && !sameReviewer;

  const submit = async () => {
    if (!read?.ok) return;
    setBusy(true);
    setProblem('');
    const cloud = await loadCloud();
    const result = cloud
      ? await importSample(cloud, read.file, [first, second], askSecondFactor)
      : ({ ok: false, reason: 'network', message: null } as const);
    setBusy(false);
    if (result.ok) {
      setRead(null);
      setFileName(null);
      setFirst('');
      setSecond('');
      onImported(result.value);
    } else {
      setProblem(failureText(result.reason, result.message));
    }
  };

  const summary: SampleSummary | null = read?.ok ? read.summary : null;
  return (
    <Card aria-labelledby="importar-muestra" className="flex flex-col gap-3">
      <CardHeader className="mb-0">
        <CardTitle id="importar-muestra">{text.importTitle}</CardTitle>
        <CardDescription>{text.importHint}</CardDescription>
      </CardHeader>
      <div className="flex flex-col gap-1">
        <label id={`${fileId}-etiqueta`} htmlFor={fileId} className="font-medium">
          {text.fileLabel}
        </label>
        <FileChooser
          id={fileId}
          labelledBy={`${fileId}-etiqueta`}
          accept=".json,application/json"
          disabled={busy}
          fileName={fileName}
          chooseText={text.chooseFile}
          emptyText={text.noFileChosen}
          onChoose={choose}
        />
      </div>
      {read && !read.ok ? (
        <p role="alert" className="text-sm font-medium text-danger">
          {text.fileProblem[read.problem]}
        </p>
      ) : null}
      {summary ? (
        <div role="status" className="flex flex-col gap-1 text-sm">
          <p className="font-medium">{text.fileSummary(summary.id, summary.total)}</p>
          <ul className="list-disc pl-5 text-fg-muted">
            {AI_ENGINES.filter((engine) => summary.byEngine[engine]).map((engine) => (
              <li key={engine}>
                {text.fileEngines(aiAuditText.engines[engine], summary.byEngine[engine] ?? 0)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {people.status === 'ready' && options.length === 0 ? (
        <p className="text-sm text-fg-muted">{text.noPhysicians}</p>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <SelectField
          label={text.reviewer1}
          value={first}
          options={choices}
          onChange={(event) => {
            setFirst(event.target.value);
          }}
        />
        <SelectField
          label={text.reviewer2}
          value={second}
          options={choices}
          error={sameReviewer ? text.sameReviewer : null}
          onChange={(event) => {
            setSecond(event.target.value);
          }}
        />
      </div>
      <p className="text-xs text-fg-muted">{text.reviewersHint}</p>
      <Button
        className="self-start"
        disabled={!ready || busy}
        onClick={() => {
          void submit();
        }}
      >
        {busy ? text.importing : text.import}
      </Button>
      {problem ? (
        <p role="alert" className="text-sm font-medium text-danger">
          {problem}
        </p>
      ) : null}
    </Card>
  );
}
