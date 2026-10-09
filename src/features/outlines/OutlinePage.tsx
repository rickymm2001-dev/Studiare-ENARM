// Un apunte abierto. El editor en esquema a la izquierda y, a un lado, las tarjetas que salen de él,
// sus enlaces y las marcas rápidas. Todo se guarda solo. El editor es una pieza de carga diferida
// porque TipTap pesa y no hace falta fuera de esta pantalla.
import { ArrowLeft, Trash2 } from 'lucide-react';
import { lazy, Suspense, useDeferredValue, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { screenPath } from '@/app/screens';
import { useDataApi } from '@/data/context';
import type { Deck } from '@/data/schemas/decks';
import type { Outline } from '@/data/schemas/outlines';
import {
  OutlineConflictError,
  createOutline,
  deleteOutline,
  moveOutline,
  saveOutline,
} from '@/data/usecases/outlines';
import { deckPath } from '@/engines/deckTree';
import { backlinks, planCards, resolveLinks, type OutlineNode } from '@/engines/outline';
import { t } from '@/i18n/es-MX';
import { Button } from '@/ui/components/button';
import { Card } from '@/ui/components/card';
import { CheckboxField, SelectField, TextField } from '@/ui/components/field';
import { LoadingState } from '@/ui/states/states';
import type { ReadySession } from '../shared/RequireSession';
import { CardPreview } from './CardPreview';
import { CheatSheet } from './CheatSheet';
import { lineBadge } from './lineBadge';
import { OutlineLinks } from './OutlineLinks';
import { useOutlineAutosave, type SaveStatus } from './useOutlineAutosave';

const OutlineEditor = lazy(() =>
  import('./OutlineEditor').then((module) => ({ default: module.OutlineEditor })),
);

const STATUS_TEXT: Record<SaveStatus, string> = {
  saved: t.outlines.editor.saved,
  saving: t.outlines.editor.saving,
  unsaved: t.outlines.editor.unsaved,
  error: t.outlines.editor.saveFailed,
};

export function OutlinePage({
  session,
  outline,
  outlines,
  decks,
}: {
  session: ReadySession;
  outline: Outline;
  /** Todos los apuntes del alumno, para resolver enlaces */
  outlines: readonly Outline[];
  decks: readonly Deck[];
}) {
  const api = useDataApi();
  const navigate = useNavigate();
  const text = t.outlines;

  // El editor y el título se alimentan una sola vez del apunte guardado y de ahí en adelante mandan
  // ellos. Si no, cada guardado volvería a cargar el editor y le quitaría el cursor
  const [nodes, setNodes] = useState<OutlineNode[]>(() => [...outline.nodes]);
  const [title, setTitle] = useState(outline.title);
  const [titleError, setTitleError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [keepCards, setKeepCards] = useState(false);

  // La fecha del apunte que esta ventana tiene abierto. Si otra ventana lo guardó después, guardar
  // aquí lo pisaría, así que el guardado avisa en lugar de escribir
  const baseUpdatedAt = useRef(outline.updatedAt);
  const { status, error, schedule, flush } = useOutlineAutosave(async (payload) => {
    const saved = await saveOutline(api, session.user, {
      outlineId: outline.id,
      title: payload.title,
      nodes: payload.nodes,
      expectedUpdatedAt: baseUpdatedAt.current,
    });
    baseUpdatedAt.current = saved.outline.updatedAt;
  });
  const conflict = error instanceof OutlineConflictError;

  const deferredNodes = useDeferredValue(nodes);
  const plan = useMemo(() => planCards(deferredNodes), [deferredNodes]);
  const cardTotal = plan.plans.length;
  const others = useMemo(
    () => outlines.filter((entry) => entry.id !== outline.id),
    [outlines, outline.id],
  );
  const links = useMemo(() => {
    const current = { id: outline.id, title, nodes: deferredNodes };
    const resolved = resolveLinks(current, [current, ...others]);
    return {
      targets: resolved.targets.flatMap((id) => {
        const target = others.find((entry) => entry.id === id);
        return target ? [{ id, title: target.title }] : [];
      }),
      missing: resolved.missing,
      backlinks: backlinks(current, [current, ...others]),
    };
  }, [outline.id, title, deferredNodes, others]);

  const deck = decks.find((entry) => entry.id === outline.deckId);
  const ownDecks = useMemo(
    () =>
      decks
        .filter((entry) => entry.ownerId === session.user.id && entry.origin === 'manual')
        .map((entry) => ({ value: entry.id, label: deckPath(decks, entry.id).join(' › ') }))
        .sort((a, b) => a.label.localeCompare(b.label, 'es')),
    [decks, session.user.id],
  );
  const [pickedDeck, setPickedDeck] = useState('');
  const targetDeck = pickedDeck || (deck ? deck.id : '');

  // Un título vacío no se guarda, el anterior se queda hasta que se escriba otro
  const onNodes = (next: OutlineNode[]) => {
    setNodes(next);
    schedule({ nodes: next, title: title.trim() || outline.title });
  };
  const onTitle = (next: string) => {
    setTitle(next);
    const clean = next.trim();
    setTitleError(clean === '');
    // Un título vacío no se guarda, el anterior se queda hasta que se escriba otro
    if (clean !== '') schedule({ nodes, title: clean });
  };

  const moveDeck = async () => {
    if (targetDeck === '' || targetDeck === outline.deckId) return;
    setBusy(true);
    setProblem(null);
    try {
      // Primero se guarda lo pendiente, así el cambio de mazo ve lo último que escribiste
      await flush();
      const moved = await moveOutline(api, session.user, outline.id, targetDeck);
      baseUpdatedAt.current = moved.outline.updatedAt;
      setPickedDeck('');
      // Si algo no se pudo guardar por el mazo, ahora sí se guarda
      void flush();
    } catch {
      setProblem(text.editor.deckMoveFailed);
    } finally {
      setBusy(false);
    }
  };

  const createMissing = async (missingTitle: string) => {
    setBusy(true);
    setProblem(null);
    try {
      await createOutline(api, session.user, { title: missingTitle });
    } catch {
      setProblem(text.createFailed);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    setProblem(null);
    try {
      // Lo pendiente se guarda antes, para que borrar vea las tarjetas más recientes
      await flush();
      await deleteOutline(api, session.user, outline.id, { keepCards });
      void navigate(screenPath('outlines'));
    } catch {
      setProblem(text.remove.failed);
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link to={screenPath('outlines')}>
            <ArrowLeft aria-hidden />
            {text.backToList}
          </Link>
        </Button>
        <p
          role="status"
          className={
            status === 'error' ? 'text-sm font-medium text-danger' : 'text-sm text-fg-muted'
          }
        >
          {status === 'error' && !conflict && error instanceof RangeError
            ? text.editor.saveInvalid
            : STATUS_TEXT[status]}
        </p>
      </div>
      {conflict ? (
        <div role="alert" className="flex flex-col items-start gap-2 text-sm text-danger">
          <p>{text.editor.conflict}</p>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => {
              window.location.reload();
            }}
          >
            {text.editor.reload}
          </Button>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <Card className="gap-3" aria-label={title}>
          <TextField
            label={text.editor.titleLabel}
            value={title}
            maxLength={120}
            error={titleError ? text.titleRequired : null}
            onChange={(event) => {
              onTitle(event.target.value);
            }}
          />
          {deck ? (
            <p className="text-sm text-fg-muted">{text.editor.deck(deck.name)}</p>
          ) : (
            <p role="alert" className="text-sm font-medium text-danger">
              {text.editor.deckMissing}
            </p>
          )}
          {ownDecks.length === 0 ? (
            <p className="text-sm text-fg-muted">{text.editor.deckNone}</p>
          ) : (
            // Con el mazo en su lugar el selector queda plegado. Si el mazo ya no existe sale abierto
            <details open={!deck} className="text-sm">
              <summary className="min-h-touch w-fit cursor-pointer py-2 font-medium text-primary">
                {text.editor.deckChange}
              </summary>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                <SelectField
                  className="min-w-0 flex-1"
                  label={text.editor.deckLabel}
                  value={targetDeck}
                  onChange={(event) => {
                    setPickedDeck(event.target.value);
                  }}
                  options={[...(deck ? [] : [{ value: '', label: '—' }]), ...ownDecks]}
                />
                <Button
                  type="button"
                  variant="secondary"
                  className="self-start sm:self-auto"
                  disabled={busy || targetDeck === '' || targetDeck === outline.deckId}
                  onClick={() => {
                    void moveDeck();
                  }}
                >
                  {busy ? text.editor.deckMoving : text.editor.deckMove}
                </Button>
              </div>
            </details>
          )}
          <Suspense fallback={<LoadingState label={text.loading} />}>
            <OutlineEditor nodes={nodes} onChange={onNodes} badgeOf={lineBadge} />
          </Suspense>
        </Card>

        <div className="flex flex-col gap-4">
          <Card>
            <CardPreview plans={plan.plans} issues={plan.issues} />
          </Card>
          <Card>
            <OutlineLinks
              targets={links.targets}
              missing={links.missing}
              backlinks={links.backlinks}
              busy={busy}
              onCreate={(missingTitle) => {
                void createMissing(missingTitle);
              }}
            />
          </Card>
          <CheatSheet />
        </div>
      </div>

      {problem ? (
        <p role="alert" className="text-sm text-danger">
          {problem}
        </p>
      ) : null}

      <div className="flex flex-col items-start gap-3 border-t border-line pt-4">
        {confirmingDelete ? (
          <div className="flex flex-col gap-3" role="group" aria-label={text.remove.title}>
            <p className="text-sm">{text.remove.body(cardTotal)}</p>
            {cardTotal > 0 ? (
              <CheckboxField
                label={text.remove.keepCards}
                checked={keepCards}
                onChange={(event) => {
                  setKeepCards(event.target.checked);
                }}
              />
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="danger"
                disabled={busy}
                onClick={() => {
                  void remove();
                }}
              >
                {text.remove.confirm}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setConfirmingDelete(false);
                }}
              >
                {text.remove.cancel}
              </Button>
            </div>
          </div>
        ) : (
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setConfirmingDelete(true);
            }}
          >
            <Trash2 aria-hidden />
            {text.remove.button}
          </Button>
        )}
      </div>
    </div>
  );
}
