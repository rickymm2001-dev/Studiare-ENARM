// La parte del médico de la auditoría de la IA (B12, 5.3). Ve los textos de su muestra en su propio
// orden, sin lo que puso el otro médico, cada uno como lo vería el alumno junto a su fuente. Cada
// respuesta se guarda al elegirla. Hay barra de avance, filtro de pendientes, teclado (flechas) y
// funciona en el teléfono. Debajo, el respaldo en archivo CSV.
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { fetchMyItems, fetchMySamples, type MyItem } from '@/data/cloud/aiGate';
import { loadCloud } from '@/data/cloud/client';
import { aiAuditText } from '@/i18n/aiAudit';
import { Button } from '@/ui/components/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/ui/components/card';
import { SelectField } from '@/ui/components/field';
import { FileChooser } from '@/ui/components/file-chooser';
import { KeyHint } from '@/ui/components/key-hint';
import { ProgressBar } from '@/ui/components/progress-bar';
import { SegmentedControl } from '@/ui/components/segmented';
import { ErrorState, LoadingState } from '@/ui/states/states';
import { importReviewsCsv, saveDraft, type CsvImportResult } from './aiAuditActions';
import {
  CSV_HEADER,
  answersFrom,
  draftOf,
  failureText,
  nextPending,
  progressOf,
  reviewOf,
  reviewsToCsv,
  sameReview,
  visibleIndexes,
  type AuditFilter,
  type ReviewDraft,
} from './aiAuditView';
import { AuditItem } from './AiAuditItemView';
import { Rubric, type SaveState } from './AiAuditRubric';
import { downloadText } from './bankTemplates';
import { askSecondFactor } from './secondFactor';
import { useAuditQuery } from './useAuditQuery';
import type { AiGateReview } from '@/engines/aiContracts';

const text = aiAuditText.reviewer;
const COMMENT_DELAY_MS = 800;

export function ReviewerSection() {
  const samples = useAuditQuery((cloud, onForbidden) => fetchMySamples(cloud, onForbidden), 'mine');
  const [chosen, setChosen] = useState('');

  if (samples.state.status === 'loading') return <LoadingState />;
  if (samples.state.status === 'failed') {
    return (
      <ErrorState
        description={failureText(samples.state.reason, samples.state.message)}
        onRetry={samples.reload}
      />
    );
  }
  const list = samples.state.value;
  if (list.length === 0) {
    return (
      <Card aria-labelledby="auditoria-medico">
        <CardHeader>
          <CardTitle id="auditoria-medico">{text.title}</CardTitle>
          <CardDescription>{text.empty}</CardDescription>
        </CardHeader>
      </Card>
    );
  }
  const sampleId = list.some((sample) => sample.sampleId === chosen)
    ? chosen
    : (list[0]?.sampleId ?? '');
  return (
    <>
      {list.length > 1 ? (
        <SelectField
          label={text.pickSample}
          value={sampleId}
          options={list.map((sample) => ({ value: sample.sampleId, label: sample.sampleId }))}
          onChange={(event) => {
            setChosen(event.target.value);
          }}
        />
      ) : null}
      <ReviewerSample key={sampleId} sampleId={sampleId} />
    </>
  );
}

function ReviewerSample({ sampleId }: { sampleId: string }) {
  const items = useAuditQuery(
    (cloud, onForbidden) => fetchMyItems(cloud, sampleId, onForbidden),
    sampleId,
  );
  if (items.state.status === 'loading') return <LoadingState />;
  if (items.state.status === 'failed') {
    return (
      <ErrorState
        description={failureText(items.state.reason, items.state.message)}
        onRetry={items.reload}
      />
    );
  }
  const { value } = items.state;
  return (
    <ReviewSession sampleId={sampleId} items={value.items} closed={value.status === 'closed'} />
  );
}

function ReviewSession({
  sampleId,
  items,
  closed,
}: {
  sampleId: string;
  items: readonly MyItem[];
  closed: boolean;
}) {
  const [answers, setAnswers] = useState<ReadonlyMap<string, AiGateReview>>(() =>
    answersFrom(items),
  );
  const [drafts, setDrafts] = useState<ReadonlyMap<string, ReviewDraft>>(new Map());
  const [saveStates, setSaveStates] = useState<ReadonlyMap<string, SaveState>>(new Map());
  const [index, setIndex] = useState(() => nextPending(items, answersFrom(items), -1) ?? 0);
  const [filter, setFilter] = useState<AuditFilter>('all');
  const [problem, setProblem] = useState<string | null>(null);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  // Cada guardado lleva un número, y solo vale la respuesta del último de ese texto
  const sequence = useRef(new Map<string, number>());
  const answersRef = useRef(answers);
  useEffect(() => {
    answersRef.current = answers;
  });

  const item = items[index];
  const progress = progressOf(items, answers);
  const visible = visibleIndexes(items, answers, filter);

  const setSave = useCallback((id: string, state: SaveState) => {
    setSaveStates((current) => new Map(current).set(id, state));
  }, []);

  const persist = useCallback(
    async (id: string, draft: ReviewDraft) => {
      const review = reviewOf(draft);
      if (!review || sameReview(answersRef.current.get(id), review)) return;
      const number = (sequence.current.get(id) ?? 0) + 1;
      sequence.current.set(id, number);
      setSave(id, 'saving');
      const cloud = await loadCloud();
      const result = cloud
        ? await saveDraft(cloud, id, draft, askSecondFactor)
        : ({ ok: false, reason: 'network', message: null } as const);
      if (sequence.current.get(id) !== number) return;
      if (result.ok) {
        setAnswers((current) => new Map(current).set(id, review));
        setSave(id, 'saved');
        setProblem(null);
      } else {
        setSave(id, 'failed');
        setProblem(failureText(result.reason, 'message' in result ? result.message : null));
      }
    },
    [setSave],
  );

  /** Guarda ya lo que está esperando al comentario de un texto */
  const flush = useCallback(
    (id: string, draft: ReviewDraft | undefined) => {
      const timer = timers.current.get(id);
      if (timer === undefined) return;
      clearTimeout(timer);
      timers.current.delete(id);
      if (draft) void persist(id, draft);
    },
    [persist],
  );

  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of pending.values()) clearTimeout(timer);
    };
  }, []);

  const draftFor = (target: MyItem): ReviewDraft =>
    drafts.get(target.id) ?? draftOf(answers.get(target.id));

  const change = (target: MyItem, next: ReviewDraft) => {
    const before = draftFor(target);
    setDrafts((current) => new Map(current).set(target.id, next));
    const onlyComment =
      JSON.stringify({ ...next, comment: '' }) === JSON.stringify({ ...before, comment: '' });
    const existing = timers.current.get(target.id);
    if (existing !== undefined) clearTimeout(existing);
    if (onlyComment) {
      // El comentario se guarda cuando el médico deja de escribir, no en cada letra
      timers.current.set(
        target.id,
        setTimeout(() => {
          timers.current.delete(target.id);
          void persist(target.id, next);
        }, COMMENT_DELAY_MS),
      );
    } else {
      timers.current.delete(target.id);
      void persist(target.id, next);
    }
  };

  const go = useCallback(
    (to: number) => {
      const current = items[index];
      if (current) flush(current.id, drafts.get(current.id));
      setIndex(Math.min(Math.max(to, 0), items.length - 1));
    },
    [drafts, flush, index, items],
  );

  const step = (direction: 1 | -1) => {
    const candidates = visible.filter((position) =>
      direction === 1 ? position > index : position < index,
    );
    const target = direction === 1 ? candidates[0] : candidates.at(-1);
    if (target !== undefined) go(target);
  };

  const pendingNext = nextPending(items, answers, index);

  // Las flechas pasan de un texto a otro, menos al escribir un comentario
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && ['TEXTAREA', 'INPUT', 'SELECT'].includes(target.tagName)) return;
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.key === 'ArrowRight') {
        const next = visible.find((position) => position > index);
        if (next !== undefined) go(next);
      } else if (event.key === 'ArrowLeft') {
        const previous = visible.filter((position) => position < index).at(-1);
        if (previous !== undefined) go(previous);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [go, index, visible]);

  const fileId = useId();
  const [fileName, setFileName] = useState<string | null>(null);
  const [csv, setCsv] = useState<CsvImportResult | 'working' | null>(null);
  const uploadCsv = async (file: File | undefined) => {
    if (!file) return;
    setFileName(file.name);
    setCsv('working');
    const cloud = await loadCloud();
    if (!cloud) {
      setCsv({ ok: false, reason: 'network', message: null });
      return;
    }
    const result = await importReviewsCsv(cloud, await file.text(), items, askSecondFactor);
    setCsv(result);
    if (result.ok && result.saved > 0) {
      // Lo que se subió ya está en la base. La pantalla lo toma como respondido sin volver a leerlo
      setAnswers((current) => new Map([...current, ...result.reviews]));
      setDrafts((current) => {
        const next = new Map(current);
        for (const id of result.reviews.keys()) next.delete(id);
        return next;
      });
    }
  };

  if (!item) {
    return (
      <Card aria-labelledby="auditoria-medico">
        <CardHeader>
          <CardTitle id="auditoria-medico">{text.title}</CardTitle>
          <CardDescription>{text.empty}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <>
      <Card aria-labelledby="auditoria-medico" className="flex flex-col gap-3">
        <CardHeader className="mb-0">
          <CardTitle id="auditoria-medico">{text.title}</CardTitle>
          <CardDescription>
            {text.sample(sampleId)}. {closed ? text.closedNote : text.blindNote}
          </CardDescription>
        </CardHeader>
        <p className="text-sm font-medium" role="status">
          {text.progress(progress.reviewed, progress.total)}
        </p>
        <ProgressBar
          value={progress.reviewed}
          max={progress.total}
          label={text.progressLabel(progress.reviewed, progress.total)}
        />
        <SegmentedControl
          label={text.filterLabel}
          value={filter}
          options={[
            { value: 'all', label: text.filterAll },
            { value: 'pending', label: `${text.filterPending} (${progress.pending})` },
          ]}
          onChange={setFilter}
        />
        {filter === 'pending' && progress.pending === 0 ? (
          <p role="status" className="text-sm font-medium text-success">
            {text.nothingPending}
          </p>
        ) : null}
      </Card>

      <Card aria-labelledby="auditoria-texto" className="flex flex-col gap-4">
        <CardHeader className="mb-0">
          <CardTitle id="auditoria-texto" className="flex flex-wrap items-center gap-2">
            {text.position(index + 1, items.length)}
          </CardTitle>
          <CardDescription>{aiAuditText.engines[item.engine]}</CardDescription>
        </CardHeader>
        <AuditItem item={item} />
        <Rubric
          draft={draftFor(item)}
          disabled={closed}
          saveState={saveStates.get(item.id) ?? (answers.has(item.id) ? 'saved' : 'idle')}
          onChange={(next) => {
            change(item, next);
          }}
        />
        {problem ? (
          <p role="alert" className="text-sm font-medium text-danger">
            {problem}
          </p>
        ) : null}
        <nav aria-label={text.position(index + 1, items.length)} className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            disabled={!visible.some((position) => position < index)}
            onClick={() => {
              step(-1);
            }}
          >
            {text.previous}
          </Button>
          <Button
            variant="secondary"
            disabled={!visible.some((position) => position > index)}
            onClick={() => {
              step(1);
            }}
          >
            {text.next}
          </Button>
          <Button
            disabled={pendingNext === null}
            onClick={() => {
              if (pendingNext !== null) go(pendingNext);
            }}
          >
            {text.nextPending}
          </Button>
        </nav>
        <KeyHint>{text.keys}</KeyHint>
      </Card>

      <Card aria-labelledby="auditoria-archivo" className="flex flex-col gap-3">
        <CardHeader className="mb-0">
          <CardTitle id="auditoria-archivo">{aiAuditText.file.title}</CardTitle>
          <CardDescription>{aiAuditText.file.hint}</CardDescription>
        </CardHeader>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            onClick={() => {
              downloadText(
                aiAuditText.file.fileName(sampleId),
                reviewsToCsv(items, answers),
                'text/csv;charset=utf-8',
              );
            }}
          >
            {aiAuditText.file.download}
          </Button>
        </div>
        {closed ? null : (
          <div className="flex flex-col gap-1">
            <label id={`${fileId}-etiqueta`} htmlFor={fileId} className="font-medium">
              {aiAuditText.file.upload}
            </label>
            <FileChooser
              id={fileId}
              labelledBy={`${fileId}-etiqueta`}
              accept=".csv,text/csv,text/plain"
              disabled={csv === 'working'}
              fileName={fileName}
              chooseText={aiAuditText.file.chooseFile}
              emptyText={aiAuditText.file.noFileChosen}
              onChoose={uploadCsv}
            />
            <p className="text-xs text-fg-muted">{CSV_HEADER.join(', ')}</p>
          </div>
        )}
        <CsvOutcome result={csv} />
      </Card>
    </>
  );
}

function CsvOutcome({ result }: { result: CsvImportResult | 'working' | null }) {
  const file = aiAuditText.file;
  if (result === null) return null;
  if (result === 'working') {
    return (
      <p role="status" className="text-sm font-medium">
        {file.importing}
      </p>
    );
  }
  if (result.ok) {
    return (
      <p role="status" className="text-sm font-medium">
        {file.result(result.saved, result.skipped, result.failed)}
      </p>
    );
  }
  if ('problems' in result) {
    return (
      <div role="alert" className="flex flex-col gap-1 rounded-md border border-danger p-3 text-sm">
        <p className="font-semibold">{file.problems(result.problems.length)}</p>
        <ul className="list-disc pl-5">
          {result.problems.slice(0, 10).map((entry) => (
            <li key={`${entry.line}-${entry.problem}`}>
              {file.rowProblem(entry.line, file.reasons[entry.problem] ?? entry.problem)}
            </li>
          ))}
        </ul>
      </div>
    );
  }
  return (
    <p role="alert" className="text-sm font-medium text-danger">
      {failureText(result.reason, result.message)}
    </p>
  );
}
