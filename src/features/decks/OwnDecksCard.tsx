// Tus mazos (pantalla 12). Los mazos del alumno, como Mis errores que arma la app con sus preguntas
// falladas y los que crea a mano, que se pueden llenar de tarjetas y borrar. Subir mazos de otras
// apps llega con la Fase E.
import { FileUp, Layers, PencilLine } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { screenPath } from '@/app/screens';
import { useDataApi } from '@/data/context';
import type { Deck } from '@/data/schemas/decks';
import type { FsrsCardState } from '@/data/schemas/common';
import { createManualDeck, deleteManualDeck, DECK_NAME_MAX } from '@/data/usecases/manualDecks';
import { t } from '@/i18n/es-MX';
import { Button } from '@/ui/components/button';
import { Card, CardHeader, CardTitle } from '@/ui/components/card';
import { TextField } from '@/ui/components/field';
import { DemoContentLabel } from '@/ui/components/labels';
import type { ReadySession } from '../shared/RequireSession';
import { DeckEditorDialog } from './DeckEditorDialog';

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
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const create = async () => {
    if (name.trim() === '') {
      setNameError(t.decks.nameError);
      return;
    }
    setNameError(null);
    setProblem(null);
    setBusy(true);
    try {
      const deck = await createManualDeck(api, session.user, { name });
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

  return (
    <Card aria-labelledby="tus-mazos-titulo">
      <CardHeader>
        <CardTitle id="tus-mazos-titulo">{t.decks.yoursTitle}</CardTitle>
      </CardHeader>
      <ul className="grid gap-3 md:grid-cols-2">
        {decks.map((deck) => {
          const cardIds = cardsByDeck.get(deck.id) ?? [];
          const studied = cardIds.filter((cardId) => states.has(cardId)).length;
          const manual = deck.origin === 'manual';
          return (
            <li key={deck.id} className="flex items-start gap-3">
              <Layers aria-hidden className="mt-0.5 size-5 shrink-0 text-primary" />
              <div className="flex min-w-0 flex-1 flex-col items-start gap-1">
                <span className="flex flex-wrap items-center gap-2 font-semibold">
                  {deck.name}
                  {deck.isDemo ? <DemoContentLabel /> : null}
                </span>
                <span className="text-sm text-fg-muted">
                  {manual && cardIds.length === 0
                    ? t.decks.editor.empty
                    : t.decks.progress(studied, cardIds.length)}
                </span>
                {confirmingId === deck.id ? (
                  <div className="flex flex-col gap-2">
                    <p className="text-sm font-medium">{t.decks.confirmDelete(deck.name)}</p>
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
              </div>
            </li>
          );
        })}
        <li className="flex items-start gap-3">
          <FileUp aria-hidden className="mt-0.5 size-5 shrink-0 text-primary" />
          <div className="flex flex-col">
            <span className="font-semibold">{t.decks.importTitle}</span>
            <span className="text-sm text-fg-muted">{t.decks.importBody}</span>
          </div>
        </li>
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
