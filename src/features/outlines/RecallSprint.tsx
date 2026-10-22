// Recall sprint de un apunte (V4-B4). El alumno escribe de memoria lo que recuerda en 3 minutos, sin ver
// el apunte, y después se muestra su apunte junto a lo que escribió para que marque las líneas que le
// faltaron. Las marcadas se vuelven tarjetas básicas en el mazo del apunte. Todo el cálculo vive en
// src/engines/recall.ts. No usa IA ni califica lo escrito, porque comparar con el apunte es el método.
import { X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Dialog } from 'radix-ui';
import { useDataApi } from '@/data/context';
import type { Outline } from '@/data/schemas/outlines';
import { saveManualNote } from '@/data/usecases/manualDecks';
import {
  clockOf,
  MAX_RECALL_CARDS,
  RECALL_SECONDS,
  recallCardDrafts,
  recallLines,
} from '@/engines/recall';
import { t } from '@/i18n/es-MX';
import { Button } from '@/ui/components/button';
import { CheckboxField, TextAreaField } from '@/ui/components/field';
import type { ReadySession } from '../shared/RequireSession';

type Step = 'write' | 'compare';

export function RecallSprint({
  session,
  outline,
  onClose,
}: {
  session: ReadySession;
  outline: Outline;
  onClose: () => void;
}) {
  const api = useDataApi();
  const text = t.recallSprint;
  const lines = useMemo(() => recallLines(outline.title, outline.nodes), [outline]);
  // Termina cuando el alumno lo dice o cuando se acaba el tiempo. El paso se deriva, no se guarda
  const [finished, setFinished] = useState(false);
  const [written, setWritten] = useState('');
  const [secondsLeft, setSecondsLeft] = useState(RECALL_SECONDS);
  const [missed, setMissed] = useState<ReadonlySet<string>>(() => new Set());
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ created: number; skipped: number } | null>(null);
  const [failed, setFailed] = useState(false);

  const step: Step = finished || secondsLeft <= 0 ? 'compare' : 'write';
  // El reloj baja cada segundo mientras se escribe
  useEffect(() => {
    if (step !== 'write') return undefined;
    const timer = setInterval(() => {
      setSecondsLeft((value) => value - 1);
    }, 1000);
    return () => {
      clearInterval(timer);
    };
  }, [step]);

  const { drafts, skipped } = useMemo(() => recallCardDrafts(lines, missed), [lines, missed]);

  const toggle = (id: string, on: boolean) => {
    setMissed((current) => {
      const next = new Set(current);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const create = async () => {
    setBusy(true);
    setFailed(false);
    try {
      for (const draft of drafts) {
        await saveManualNote(api, session.user, {
          deckId: outline.deckId,
          draft: { kind: 'basic', front: draft.front, back: draft.back },
        });
      }
      setResult({ created: drafts.length, skipped });
      setMissed(new Set());
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" />
        <Dialog.Content className="animate-rise fixed top-1/2 left-1/2 z-50 flex max-h-[92dvh] w-[calc(100%-1.5rem)] max-w-5xl -translate-x-1/2 -translate-y-1/2 flex-col gap-4 overflow-y-auto rounded-xl border border-line bg-surface p-4 shadow-raised sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <Dialog.Title className="text-xl font-extrabold">
                {text.title(outline.title)}
              </Dialog.Title>
              <Dialog.Description className="text-sm text-fg-muted">
                {step === 'write' ? text.writeIntro : text.compareIntro}
              </Dialog.Description>
            </div>
            <Dialog.Close
              className="flex size-touch shrink-0 items-center justify-center rounded-full hover:bg-muted"
              aria-label={text.close}
            >
              <X aria-hidden className="size-5" />
            </Dialog.Close>
          </div>

          {step === 'write' ? (
            <div className="flex flex-col gap-3">
              <p role="timer" aria-live="off" className="text-lg font-bold tabular-nums">
                {text.timeLeft(clockOf(secondsLeft))}
              </p>
              <TextAreaField
                label={text.writeLabel}
                placeholder={text.writePlaceholder}
                rows={10}
                value={written}
                autoFocus
                onChange={(event) => {
                  setWritten(event.target.value);
                }}
              />
              <Button
                type="button"
                className="self-start"
                onClick={() => {
                  setFinished(true);
                }}
              >
                {text.done}
              </Button>
            </div>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              <section aria-labelledby="recall-escrito" className="flex min-w-0 flex-col gap-2">
                <h3 id="recall-escrito" className="font-semibold">
                  {text.yours}
                </h3>
                <p className="rounded-lg border border-line bg-muted p-3 text-sm whitespace-pre-wrap">
                  {written.trim() === '' ? text.nothingWritten : written}
                </p>
              </section>
              <section aria-labelledby="recall-apunte" className="flex min-w-0 flex-col gap-2">
                <h3 id="recall-apunte" className="font-semibold">
                  {text.outlineHeading}
                </h3>
                {lines.length === 0 ? (
                  <p className="text-sm text-fg-muted">{text.emptyOutline}</p>
                ) : (
                  <ul className="flex flex-col gap-1">
                    {lines.map((line) => (
                      <li key={line.id} style={{ paddingLeft: `${line.depth * 1.25}rem` }}>
                        <CheckboxField
                          label={line.text}
                          hint={line.hasCard ? text.alreadyCard : undefined}
                          aria-label={text.missed(line.text)}
                          checked={missed.has(line.id)}
                          onChange={(event) => {
                            toggle(line.id, event.target.checked);
                          }}
                        />
                      </li>
                    ))}
                  </ul>
                )}
                <p className="text-xs text-fg-muted">{text.limit(MAX_RECALL_CARDS)}</p>
                <Button
                  type="button"
                  className="self-start"
                  disabled={busy || drafts.length === 0}
                  onClick={() => {
                    void create();
                  }}
                >
                  {busy ? text.creating : text.create(drafts.length)}
                </Button>
                {result ? (
                  <p role="status" className="text-sm font-medium text-success">
                    {text.created(result.created, result.skipped)}
                  </p>
                ) : null}
                {failed ? (
                  <p role="alert" className="text-sm font-medium text-danger">
                    {text.failed}
                  </p>
                ) : null}
              </section>
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
