// Un apunte abierto. El editor en esquema a la izquierda y, a un lado, las tarjetas que salen de él,
// las tarjetas con IA, sus enlaces y las marcas rápidas. Todo se guarda solo. El editor es una pieza
// de carga diferida porque TipTap pesa y no hace falta fuera de esta pantalla.
//
// B6 del plan del cambio. Arriba del editor van el mazo y el tema del apunte y su esquema para saltar
// a una sección. El modo clase deja solo el editor, a todo lo ancho, para escribir rápido.
import { ArrowLeft, Maximize2, Minimize2, Trash2 } from 'lucide-react';
import { lazy, Suspense, useCallback, useDeferredValue, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { screenPath } from '@/app/screens';
import { useDataApi } from '@/data/context';
import type { Deck } from '@/data/schemas/decks';
import type { Outline } from '@/data/schemas/outlines';
import {
  OutlineConflictError,
  createOutline,
  deleteOutline,
  saveOutline,
  updateOutlineSettings,
  type OutlineDeckChoice,
} from '@/data/usecases/outlines';
import { deckPath } from '@/engines/deckTree';
import {
  backlinks,
  freeSubjects,
  planCards,
  resolveLinks,
  type OutlineNode,
  type OutlineSubject,
} from '@/engines/outline';
import { t } from '@/i18n/es-MX';
import { cn } from '@/ui/cn';
import { Button } from '@/ui/components/button';
import { Card } from '@/ui/components/card';
import { CheckboxField, TextField } from '@/ui/components/field';
import { LoadingState } from '@/ui/states/states';
import type { ReadySession } from '../shared/RequireSession';
import { CardPreview } from './CardPreview';
import { CheatSheet } from './CheatSheet';
import { lineBadge } from './lineBadge';
import { OutlineAiCards } from './OutlineAiCards';
import { OutlineLinks } from './OutlineLinks';
import { OutlineSettings, type SettingsResult } from './OutlineSettings';
import { OutlineStructure } from './OutlineStructure';
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
  initialLine = null,
}: {
  session: ReadySession;
  outline: Outline;
  /** Todos los apuntes del alumno, para resolver enlaces y sugerir materias */
  outlines: readonly Outline[];
  decks: readonly Deck[];
  /** Línea donde queda el cursor al abrir, como la de un resultado de la búsqueda */
  initialLine?: string | null;
}) {
  const api = useDataApi();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const text = t.outlines;
  const classMode = params.get('modo') === 'clase';

  // El editor y el título se alimentan una sola vez del apunte guardado y de ahí en adelante mandan
  // ellos. Si no, cada guardado volvería a cargar el editor y le quitaría el cursor
  const [nodes, setNodes] = useState<OutlineNode[]>(() => [...outline.nodes]);
  const [title, setTitle] = useState(outline.title);
  const [titleError, setTitleError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [keepCards, setKeepCards] = useState(false);
  // El editor deja aquí cómo saltar a una línea. Así esta pantalla no carga ProseMirror, que llega
  // con el editor en su pieza diferida
  const jumpRef = useRef<((nodeId: string) => void) | null>(null);
  const jump = useCallback((nodeId: string) => {
    jumpRef.current?.(nodeId);
  }, []);

  // La fecha del apunte que esta ventana tiene abierto. Si otra ventana lo guardó después, guardar
  // aquí lo pisaría, así que el guardado avisa en lugar de escribir. Lo mismo el mazo y el tema
  const baseUpdatedAt = useRef(outline.updatedAt);
  const { status, error, schedule, flush, flushThen } = useOutlineAutosave(async (payload) => {
    const saved = await saveOutline(api, session.user, {
      outlineId: outline.id,
      title: payload.title,
      nodes: payload.nodes,
      expectedUpdatedAt: baseUpdatedAt.current,
    });
    baseUpdatedAt.current = saved.outline.updatedAt;
  });
  // El mazo y el tema no se guardaron porque otra ventana cambió el apunte. Sale el mismo aviso
  // que cuando choca el guardado del editor
  const [settingsConflict, setSettingsConflict] = useState(false);
  const conflict = error instanceof OutlineConflictError || settingsConflict;

  const deferredNodes = useDeferredValue(nodes);
  const plan = useMemo(() => planCards(deferredNodes), [deferredNodes]);
  const cardTotal = plan.plans.length;
  const others = useMemo(
    () => outlines.filter((entry) => entry.id !== outline.id),
    [outlines, outline.id],
  );
  const suggestions = useMemo(() => freeSubjects(outlines), [outlines]);
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
  const deckName = deck ? deckPath(decks, deck.id).join(' › ') : '';

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

  const saveSettings = async (
    choice: OutlineDeckChoice,
    subject: OutlineSubject | null,
  ): Promise<SettingsResult> => {
    setBusy(true);
    setProblem(null);
    try {
      // Primero se guarda lo pendiente, así el cambio de mazo y tema ve lo último que escribiste. Va
      // en la fila del guardado automático, así ninguno de los dos pisa la fecha que espera el otro
      await flushThen(async (flushed) => {
        // Lo pendiente chocó con otra ventana. Seguir pisaría sus líneas en el siguiente guardado.
        // Otra falla, como la del mazo borrado, sí sigue, porque elegir otro mazo la arregla
        if (!flushed.saved && flushed.error instanceof OutlineConflictError) throw flushed.error;
        const updated = await updateOutlineSettings(api, session.user, {
          outlineId: outline.id,
          deck: choice,
          subject,
          expectedUpdatedAt: baseUpdatedAt.current,
        });
        baseUpdatedAt.current = updated.outline.updatedAt;
      });
      // Si algo no se pudo guardar por el mazo, ahora sí se guarda
      void flush();
      return 'saved';
    } catch (failure) {
      if (failure instanceof OutlineConflictError) {
        setSettingsConflict(true);
        return 'conflict';
      }
      return 'failed';
    } finally {
      setBusy(false);
    }
  };

  const setClassMode = (on: boolean) => {
    const next = new URLSearchParams(params);
    if (on) next.set('modo', 'clase');
    else next.delete('modo');
    next.delete('linea');
    setParams(next, { replace: true });
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
        <Button
          type="button"
          variant="secondary"
          className="ml-auto"
          aria-pressed={classMode}
          title={text.editor.classModeHint}
          onClick={() => {
            setClassMode(!classMode);
          }}
        >
          {classMode ? <Minimize2 aria-hidden /> : <Maximize2 aria-hidden />}
          {text.editor.classMode}
        </Button>
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

      <div
        className={cn(
          'grid gap-4',
          !classMode && 'lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start',
        )}
      >
        <Card className="flex min-w-0 flex-col gap-3 p-3 sm:p-4" aria-label={title}>
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
          <OutlineSettings
            outline={outline}
            decks={decks}
            userId={session.user.id}
            suggestions={suggestions}
            busy={busy}
            onSave={saveSettings}
          />
          <OutlineStructure nodes={deferredNodes} onJump={jump} />
          <Suspense fallback={<LoadingState label={text.loading} />}>
            <OutlineEditor
              nodes={nodes}
              onChange={onNodes}
              badgeOf={lineBadge}
              autoFocus={classMode}
              initialLine={initialLine}
              jumpRef={jumpRef}
            />
          </Suspense>
        </Card>

        {classMode ? null : (
          <div className="flex min-w-0 flex-col gap-4">
            <Card>
              <CardPreview plans={plan.plans} issues={plan.issues} />
            </Card>
            <Card>
              <OutlineAiCards
                session={session}
                outline={outline}
                nodes={deferredNodes}
                deckName={deckName}
                onJump={jump}
              />
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
            <Card>
              <CheatSheet />
            </Card>
          </div>
        )}
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
