// Crea tarjetas con IA desde un texto o PDF (D-085, fila 10, opción B). El alumno pega un texto o
// sube un PDF o un archivo de texto, el generador propone tarjetas y solo se le muestran las que
// pasan el validador, cada una con la frase de su material que la respalda. Elige cuáles guardar y
// quedan siempre en borrador y sin validar por un médico. Los datos personales se ocultan antes de
// procesar. Es una función de pago con cuota diaria.
import { Sparkles } from 'lucide-react';
import { useId, useState } from 'react';
import { Link } from 'react-router';
import { screenPath } from '@/app/screens';
import {
  generatorFor,
  generateFlashcards,
  type FlashcardProposal,
  type GenerationResult,
} from '@/ai/flashcards';
import { useAiStatus } from '@/ai/useAiStatus';
import { PLANS } from '@/config/billing';
import { useDataApi } from '@/data/context';
import { useLiveData } from '@/data/hooks';
import { extractPdfText } from '@/data/import/pdf';
import { ImportError } from '@/data/import/types';
import {
  GenerationLimitError,
  generationsLeft,
  recordGeneration,
  saveProposals,
  type SavedProposals,
} from '@/data/usecases/aiCards';
import { checkCard } from '@/engines/cardGen';
import { t } from '@/i18n/es-MX';
import { Badge } from '@/ui/components/badge';
import { Button } from '@/ui/components/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/ui/components/card';
import { Disclosure } from '@/ui/components/disclosure';
import { TextAreaField, TextField } from '@/ui/components/field';
import { ControversySignal } from '../shared/ControversySignal';
import { FeatureGate } from '../shared/FeatureGate';
import type { ReadySession } from '../shared/RequireSession';
import { useActivePlan } from '../shared/useActivePlan';

export function AiCardsCard({ session }: { session: ReadySession }) {
  return (
    <FeatureGate userId={session.user.id} feature="aiCards">
      <AiCards session={session} />
    </FeatureGate>
  );
}

type Step =
  | { name: 'idle' }
  | { name: 'generating' }
  | { name: 'results'; result: GenerationResult; artifactId: string; sourceTitle: string }
  | { name: 'saving' }
  | { name: 'saved'; saved: SavedProposals };

function AiCards({ session }: { session: ReadySession }) {
  const api = useDataApi();
  const status = useAiStatus();
  const plan = useActivePlan(session.user.id);
  const fileId = useId();
  const [text, setText] = useState('');
  const [source, setSource] = useState('');
  const [step, setStep] = useState<Step>({ name: 'idle' });
  const [problem, setProblem] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [proposals, setProposals] = useState<FlashcardProposal[]>([]);
  const [chosen, setChosen] = useState<ReadonlySet<string>>(() => new Set());

  const left = useLiveData(
    async () => (plan ? generationsLeft(api, session.user, plan) : null),
    [api.repos, plan, session.user],
  );
  const perDay = plan ? PLANS[plan].aiCardsPerDay : 0;

  const loadFile = async (file: File | undefined) => {
    if (!file) return;
    setProblem(null);
    setNotice(null);
    setReading(true);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const isPdf =
        bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46;
      if (isPdf) {
        const read = await extractPdfText(bytes);
        setText(read.text);
        if (read.truncated) setNotice(t.aiCards.pdfTruncated);
      } else {
        setText(new TextDecoder('utf-8').decode(bytes));
      }
      setSource(file.name);
    } catch (error) {
      setProblem(
        (error instanceof ImportError ? t.aiCards.fileErrors[error.code] : undefined) ??
          t.aiCards.fileErrors.corrupt ??
          t.aiCards.error,
      );
    } finally {
      setReading(false);
    }
  };

  const generate = async () => {
    setProblem(null);
    if (text.trim() === '') {
      setProblem(t.aiCards.textRequired);
      return;
    }
    if (text.trim().length < 80) {
      setProblem(t.aiCards.textTooShort);
      return;
    }
    if (plan === undefined) return;
    setStep({ name: 'generating' });
    try {
      const sourceTitle = source.trim() === '' ? t.aiCards.defaultSource : source.trim();
      const [notes] = await Promise.all([api.repos.notes.list()]);
      const result = await generateFlashcards({
        text,
        names: [session.user.alias],
        existing: notes.map((note) =>
          note.kind === 'cloze'
            ? { id: note.id, kind: 'cloze' as const, text: note.text }
            : { id: note.id, kind: note.kind, front: note.front },
        ),
        generator: generatorFor(status),
      });
      const recorded = await recordGeneration(api, session.user, plan, result, sourceTitle);
      setProposals([...result.proposals]);
      setChosen(
        new Set(result.proposals.filter((entry) => !entry.duplicate).map((entry) => entry.id)),
      );
      setStep({ name: 'results', result, artifactId: recorded.artifactId, sourceTitle });
    } catch (error) {
      setProblem(error instanceof GenerationLimitError ? t.aiCards.limitReached : t.aiCards.error);
      setStep({ name: 'idle' });
    }
  };

  const save = async () => {
    if (step.name !== 'results') return;
    const { result, artifactId, sourceTitle } = step;
    setProblem(null);
    setStep({ name: 'saving' });
    try {
      const saved = await saveProposals(api, session.user, {
        proposals: proposals.filter((entry) => chosen.has(entry.id)),
        sourceTitle,
        artifactId,
        simulated: result.mode !== 'real',
      });
      setStep({ name: 'saved', saved });
    } catch {
      setProblem(t.aiCards.saveError);
      setStep({ name: 'results', result, artifactId, sourceTitle });
    }
  };

  const reset = () => {
    setStep({ name: 'idle' });
    setProposals([]);
    setChosen(new Set());
    setText('');
    setSource('');
    setProblem(null);
    setNotice(null);
  };

  const toggle = (id: string) => {
    setChosen((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const edit = (id: string, patch: Partial<Pick<FlashcardProposal, 'front' | 'back'>>) => {
    setProposals((current) =>
      current.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)),
    );
  };

  const busy = step.name === 'generating' || step.name === 'saving';

  return (
    <Card aria-labelledby="ia-tarjetas-titulo">
      <CardHeader>
        <CardTitle id="ia-tarjetas-titulo" className="flex items-center gap-2">
          <Sparkles aria-hidden className="size-5 text-primary" />
          {t.aiCards.title}
        </CardTitle>
        <CardDescription>{t.aiCards.intro}</CardDescription>
      </CardHeader>
      <p className="text-sm text-fg-muted">
        {t.aiCards.modes[status.kind === 'real' ? 'real' : 'template']}
      </p>

      {step.name === 'saved' ? (
        <div className="flex flex-col gap-2">
          <p role="status" className="font-semibold">
            {t.aiCards.savedTitle}
          </p>
          <p className="text-sm">{t.aiCards.saved(step.saved.notes, step.saved.flagged)}</p>
          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm">
              <Link to={screenPath('explore')}>{t.aiCards.seeInExplore}</Link>
            </Button>
            <Button size="sm" variant="ghost" onClick={reset}>
              {t.aiCards.again}
            </Button>
          </div>
        </div>
      ) : step.name === 'results' || step.name === 'saving' ? (
        <Results
          step={step}
          proposals={proposals}
          chosen={chosen}
          saving={step.name === 'saving'}
          onToggle={toggle}
          onEdit={edit}
          onAll={(all) => {
            setChosen(all ? new Set(proposals.map((entry) => entry.id)) : new Set());
          }}
          onSave={() => {
            void save();
          }}
          onCancel={reset}
          processedText={step.name === 'results' ? step.result.processedText : ''}
        />
      ) : (
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            void generate();
          }}
        >
          {left !== undefined && left !== null ? (
            <p role="status" className="text-sm font-medium">
              {t.aiCards.left(left, perDay)}
            </p>
          ) : null}
          <TextAreaField
            label={t.aiCards.textLabel}
            hint={t.aiCards.textHint}
            value={text}
            rows={6}
            onChange={(event) => {
              setText(event.target.value);
            }}
          />
          <div className="flex flex-col gap-1">
            <label htmlFor={fileId} className="font-medium">
              {t.aiCards.fileLabel}
            </label>
            <input
              id={fileId}
              type="file"
              accept=".pdf,.txt,.md,text/plain,application/pdf"
              disabled={reading || busy}
              aria-describedby={`${fileId}-ayuda`}
              className="block w-full text-sm file:mr-3 file:min-h-touch file:rounded-full file:border-0 file:bg-primary file:px-4 file:font-semibold file:text-primary-fg"
              onChange={(event) => {
                const input = event.target;
                void loadFile(input.files?.[0]).finally(() => {
                  input.value = '';
                });
              }}
            />
            <p id={`${fileId}-ayuda`} className="text-sm text-fg-muted">
              {t.aiCards.fileHint}
            </p>
            {reading ? (
              <p role="status" className="text-sm font-medium">
                {t.aiCards.readingFile}
              </p>
            ) : null}
          </div>
          <TextField
            label={t.aiCards.sourceName}
            hint={t.aiCards.sourceNameHint}
            value={source}
            maxLength={200}
            onChange={(event) => {
              setSource(event.target.value);
            }}
          />
          {notice ? <p className="text-sm text-fg-muted">{notice}</p> : null}
          <Button
            type="submit"
            className="self-start"
            disabled={busy || reading || left === 0 || plan === undefined}
          >
            {step.name === 'generating' ? t.aiCards.generating : t.aiCards.generate}
          </Button>
        </form>
      )}
      {problem ? (
        <p role="alert" className="text-sm font-medium text-danger">
          {problem}
        </p>
      ) : null}
      <p className="text-xs text-fg-muted">{t.aiCards.rules}</p>
    </Card>
  );
}

function Results({
  step,
  proposals,
  chosen,
  saving,
  onToggle,
  onEdit,
  onAll,
  onSave,
  onCancel,
  processedText,
}: {
  step: Extract<Step, { name: 'results' | 'saving' }>;
  proposals: readonly FlashcardProposal[];
  chosen: ReadonlySet<string>;
  saving: boolean;
  onToggle: (id: string) => void;
  onEdit: (id: string, patch: Partial<Pick<FlashcardProposal, 'front' | 'back'>>) => void;
  onAll: (all: boolean) => void;
  onSave: () => void;
  onCancel: () => void;
  processedText: string;
}) {
  if (step.name !== 'results') {
    return (
      <p role="status" className="text-sm font-medium">
        {t.aiCards.saving}
      </p>
    );
  }
  const { result } = step;
  return (
    <section aria-label={t.aiCards.resultTitle} className="flex flex-col gap-3">
      <h3 className="font-semibold">{t.aiCards.resultTitle}</h3>
      <p className="text-sm">{t.aiCards.resultSummary(proposals.length, result.sections)}</p>
      <ul className="flex flex-col gap-1 text-sm text-fg-muted">
        {result.scrubbedTotal > 0 ? <li>{t.aiCards.scrubbed(result.scrubbedTotal)}</li> : null}
        {result.rejected > 0 ? <li>{t.aiCards.rejected(result.rejected)}</li> : null}
        {result.sectionsCut ? <li>{t.aiCards.cut(result.sections)}</li> : null}
        {result.fellBack ? <li>{t.aiCards.fellBack}</li> : null}
      </ul>
      {proposals.length === 0 ? (
        <p className="text-sm">{t.aiCards.nothing}</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                onAll(true);
              }}
            >
              {t.aiCards.selectAll}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                onAll(false);
              }}
            >
              {t.aiCards.selectNone}
            </Button>
          </div>
          <ul className="flex flex-col gap-3">
            {proposals.map((proposal, index) => {
              const issues = checkCard(
                {
                  kind: proposal.kind,
                  front: proposal.front,
                  back: proposal.back,
                  quote: proposal.quote,
                },
                processedText,
              );
              return (
                <li
                  key={proposal.id}
                  className="flex flex-col gap-2 rounded-lg border border-line bg-surface p-3 shadow-card"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="checkbox"
                      className="size-5 accent-[var(--color-primary)]"
                      aria-label={t.aiCards.select(index + 1)}
                      checked={chosen.has(proposal.id)}
                      onChange={() => {
                        onToggle(proposal.id);
                      }}
                    />
                    <Badge variant="info">{t.aiCards.kinds[proposal.kind]}</Badge>
                    <Badge variant="warning">{t.aiCards.draftLabel}</Badge>
                    {proposal.sectionTitle ? (
                      <span className="text-xs text-fg-muted">
                        {t.aiCards.section(proposal.sectionTitle)}
                      </span>
                    ) : null}
                  </div>
                  <p className="font-medium">{proposal.front}</p>
                  {proposal.back !== '' ? <p>{proposal.back}</p> : null}
                  <blockquote className="border-l-2 border-line-strong pl-3 text-sm text-fg-muted">
                    <span className="block text-xs font-semibold uppercase">{t.aiCards.quote}</span>
                    {proposal.quote}
                  </blockquote>
                  {proposal.duplicate ? (
                    <p className="text-sm text-warning">{t.aiCards.duplicate}</p>
                  ) : null}
                  {proposal.controversy ? (
                    <ControversySignal
                      controversy={{ ...proposal.controversy, simulated: result.mode !== 'real' }}
                    />
                  ) : null}
                  <Disclosure title={t.aiCards.edit} bodyClassName="gap-2">
                    <TextAreaField
                      label={t.aiCards.front}
                      value={proposal.front}
                      rows={2}
                      onChange={(event) => {
                        onEdit(proposal.id, { front: event.target.value });
                      }}
                    />
                    {proposal.kind === 'basic' || proposal.back !== '' ? (
                      <TextAreaField
                        label={t.aiCards.back}
                        value={proposal.back}
                        rows={2}
                        onChange={(event) => {
                          onEdit(proposal.id, { back: event.target.value });
                        }}
                      />
                    ) : null}
                    {issues.length > 0 ? (
                      <p role="status" className="text-sm text-warning">
                        {t.aiCards.editedIssues}
                      </p>
                    ) : null}
                  </Disclosure>
                </li>
              );
            })}
          </ul>
          <div className="flex flex-wrap gap-2">
            <Button disabled={saving || chosen.size === 0} onClick={onSave}>
              {t.aiCards.save(chosen.size)}
            </Button>
            <Button variant="ghost" onClick={onCancel}>
              {t.aiCards.again}
            </Button>
          </div>
        </>
      )}
      {proposals.length === 0 ? (
        <Button variant="ghost" size="sm" className="self-start" onClick={onCancel}>
          {t.aiCards.again}
        </Button>
      ) : null}
    </section>
  );
}
