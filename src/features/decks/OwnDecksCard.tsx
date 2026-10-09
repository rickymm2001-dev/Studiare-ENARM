// Tus mazos (pantalla 12). Los mazos del alumno, como Mis errores que arma la app con sus preguntas
// falladas y los que crea a mano, que se pueden llenar de tarjetas y borrar. Subir mazos de otras
// apps llega con la Fase E.
import { Layers, PencilLine } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { screenPath } from '@/app/screens';
import { useDataApi } from '@/data/context';
import { useLiveData } from '@/data/hooks';
import { isEditableDeck, type Deck } from '@/data/schemas/decks';
import type { FsrsCardState } from '@/data/schemas/common';
import { createManualDeck, deleteManualDeck, DECK_NAME_MAX } from '@/data/usecases/manualDecks';
import {
  MAX_DECK_DEPTH,
  deckDepth,
  descendantIds,
  deckPath,
  deckIndent,
  flattenDeckTree,
} from '@/engines/deckTree';
import { t } from '@/i18n/es-MX';
import { Button } from '@/ui/components/button';
import { Card, CardHeader, CardTitle } from '@/ui/components/card';
import { SelectField, TextField } from '@/ui/components/field';
import { DemoContentLabel } from '@/ui/components/labels';
import type { ReadySession } from '../shared/RequireSession';
import { DeckEditorDialog } from './DeckEditorDialog';
import { DeckOrganizer } from './DeckOrganizer';

export function OwnDecksCard({
  session,
  decks,
  cardsByDeck,
  states,
}: {
  session: ReadySession;
  /** Los mazos del alumno, de Mis errores y a mano */
  decks: readonly Deck[];
  cardsByDeck: ReadonlyMap<string, readonly string[]>;
  states: ReadonlyMap<string, FsrsCardState>;
}) {
  const api = useDataApi();
  const [editing, setEditing] = useState<Deck | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [organizingId, setOrganizingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [parentId, setParentId] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  // Los apuntes que viven en un mazo no se borran con él, pero sus tarjetas sí. Se avisa antes
  const outlines = useLiveData(() => api.repos.outlines.list(), [api.repos]);
  const outlinesIn = (deckId: string) => {
    const doomed = descendantIds(decks, deckId);
    return (outlines ?? []).filter(
      (outline) => outline.ownerId === session.user.id && doomed.has(outline.deckId),
    ).length;
  };

  const create = async () => {
    if (name.trim() === '') {
      setNameError(t.decks.nameError);
      return;
    }
    setNameError(null);
    setProblem(null);
    setBusy(true);
    try {
      const deck = await createManualDeck(api, session.user, {
        name,
        parentId: validParent === '' ? null : validParent,
      });
      setName('');
      // Al crearlo se abre el editor, para escribir la primera tarjeta de una vez
      setEditing(deck);
    } catch {
      setProblem(t.decks.createError);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (deck: Deck) => {
    setProblem(null);
    try {
      await deleteManualDeck(api, session.user, deck.id);
      setConfirmingId(null);
    } catch {
      setProblem(t.decks.deleteError);
    }
  };

  // En orden de árbol, cada mazo después del que lo contiene. El destino solo ofrece mazos a mano
  const ordered = flattenDeckTree(decks);
  // Un mazo del último nivel ya no admite submazos
  const manualTargets = flattenDeckTree(
    decks.filter((deck) => isEditableDeck(deck, session.user.id)),
  ).filter(({ deck }) => deckDepth(decks, deck.id) < MAX_DECK_DEPTH - 1);
  // Si el mazo elegido ya no existe, se crea en el primer nivel
  const validParent = manualTargets.some(({ deck }) => deck.id === parentId) ? parentId : '';

  return (
    <Card aria-labelledby="tus-mazos-titulo">
      <CardHeader>
        <CardTitle id="tus-mazos-titulo">{t.decks.yoursTitle}</CardTitle>
      </CardHeader>
      <ul className="grid gap-3 md:grid-cols-2">
        {ordered.map(({ deck }) => {
          const cardIds = cardsByDeck.get(deck.id) ?? [];
          const studied = cardIds.filter((cardId) => states.has(cardId)).length;
          const manual = isEditableDeck(deck, session.user.id);
          return (
            <li key={deck.id} className="flex items-start gap-3">
              <Layers aria-hidden className="mt-0.5 size-5 shrink-0 text-primary" />
              <div className="flex min-w-0 flex-1 flex-col items-start gap-1">
                <span className="flex flex-wrap items-center gap-2 font-semibold">
                  {deck.name}
                  {deck.isDemo ? <DemoContentLabel /> : null}
                </span>
                {deck.parentId ? (
                  <span className="text-xs text-fg-muted">
                    {t.decks.inside(deckPath(decks, deck.parentId).join(' › '))}
                  </span>
                ) : null}
                <span className="text-sm text-fg-muted">
                  {manual && cardIds.length === 0
                    ? t.decks.editor.empty
                    : t.decks.progress(studied, cardIds.length)}
                </span>
                {confirmingId === deck.id ? (
                  <div className="flex flex-col gap-2">
                    <p className="text-sm font-medium">{t.decks.confirmDelete(deck.name)}</p>
                    {outlinesIn(deck.id) > 0 ? (
                      <p className="text-sm text-warning">
                        {t.decks.confirmDeleteOutlines(outlinesIn(deck.id))}
                      </p>
                    ) : null}
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() => {
                          void remove(deck);
                        }}
                      >
                        {t.decks.confirmDeleteYes}
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          setConfirmingId(null);
                        }}
                      >
                        {t.decks.confirmDeleteNo}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-1">
                    <Button asChild size="sm" variant="ghost">
                      <Link to={screenPath('review')}>{t.widgets.today.review}</Link>
                    </Button>
                    {manual ? (
                      <>
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-label={`${t.decks.editCards}. ${deck.name}`}
                          onClick={() => {
                            setEditing(deck);
                          }}
                        >
                          {t.decks.editCards}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-label={t.decks.organizeLabel(deck.name)}
                          aria-expanded={organizingId === deck.id}
                          onClick={() => {
                            setOrganizingId(organizingId === deck.id ? null : deck.id);
                          }}
                        >
                          {t.decks.organize}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-label={`${t.decks.deleteDeck}. ${deck.name}`}
                          onClick={() => {
                            setConfirmingId(deck.id);
                          }}
                        >
                          {t.decks.deleteDeck}
                        </Button>
                      </>
                    ) : null}
                  </div>
                )}
                {organizingId === deck.id ? (
                  <DeckOrganizer key={deck.id} session={session} deck={deck} decks={decks} />
                ) : null}
              </div>
            </li>
          );
        })}
        <li className="flex items-start gap-3">
          <PencilLine aria-hidden className="mt-0.5 size-5 shrink-0 text-primary" />
          <form
            className="flex min-w-0 flex-1 flex-col gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              void create();
            }}
          >
            <div className="flex flex-col">
              <span className="font-semibold">{t.decks.createTitle}</span>
              <span className="text-sm text-fg-muted">{t.decks.createBody}</span>
            </div>
            <TextField
              label={t.decks.nameLabel}
              value={name}
              maxLength={DECK_NAME_MAX}
              error={nameError}
              onChange={(event) => {
                setName(event.target.value);
              }}
            />
            {manualTargets.length > 0 ? (
              <SelectField
                label={t.decks.parentLabel}
                value={validParent}
                options={[
                  { value: '', label: t.decks.topLevel },
                  ...manualTargets.map(({ deck, depth }) => ({
                    value: deck.id,
                    label: `${deckIndent(depth)}${deck.name}`,
                  })),
                ]}
                onChange={(event) => {
                  setParentId(event.target.value);
                }}
              />
            ) : null}
            <Button type="submit" size="sm" className="self-start" disabled={busy}>
              {busy ? t.decks.creating : t.decks.createButton}
            </Button>
          </form>
        </li>
      </ul>
      {problem ? (
        <p role="alert" className="mt-2 text-sm font-medium text-danger">
          {problem}
        </p>
      ) : null}
      {editing ? (
        <DeckEditorDialog
          session={session}
          deck={editing}
          onClose={() => {
            setEditing(null);
          }}
        />
      ) : null}
    </Card>
  );
}
