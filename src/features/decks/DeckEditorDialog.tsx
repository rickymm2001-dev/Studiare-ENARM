// Editor de las tarjetas de un mazo hecho a mano (3.1). Lista las tarjetas del mazo y deja agregar,
// editar y borrar, básicas, básicas con tarjeta inversa o con huecos al estilo Anki. Todo es texto
// plano que se guarda escapado. Una tarjeta nueva aparece en Repasar al guardarla.
import { Pencil, Trash2, X } from 'lucide-react';
import { Dialog } from 'radix-ui';
import { useId, useMemo, useState } from 'react';
import { htmlToText } from '@/data/content/plainText';
import { useDataApi } from '@/data/context';
import { useLiveData } from '@/data/hooks';
import type { Deck, Note } from '@/data/schemas/decks';
import {
  cardOrdinals,
  convertDraft,
  deleteManualNote,
  draftOf,
  saveManualNote,
  validateDraft,
  type DraftError,
  type NoteDraft,
  type NoteKind,
} from '@/data/usecases/manualDecks';
import { checkCardQuality } from '@/engines/cardQuality';
import { buildDuplicateIndex, findDuplicates } from '@/engines/duplicates';
import { t } from '@/i18n/es-MX';
import { cn } from '@/ui/cn';
import { Button } from '@/ui/components/button';
import { TextAreaField } from '@/ui/components/field';
import type { ReadySession } from '../shared/RequireSession';
import { useDebouncedValue } from '../shared/useDebouncedValue';
import { CardQualityHints } from './CardQualityHints';
import { followedDeckIds } from './followed';

/** Los tipos de tarjeta en el orden en que se ofrecen */
const KINDS: readonly NoteKind[] = ['basic', 'basic_reverse', 'cloze'];

/** Pausa tras teclear antes de revisar la tarjeta, para no anunciar cada letra al lector de pantalla */
const HINTS_DELAY_MS = 500;

const emptyDraft = (kind: NoteKind): NoteDraft => {
  switch (kind) {
    case 'basic':
    case 'basic_reverse':
      return { kind, front: '', back: '' };
    case 'cloze':
      return { kind, text: '', extra: '' };
  }
};

/** Primeras palabras de una tarjeta, para nombrar sus botones */
function previewOf(note: Note): string {
  const text = htmlToText(note.kind === 'cloze' ? note.text : note.front).replace(/\s+/g, ' ');
  return text.length > 60 ? `${text.slice(0, 57)}…` : text;
}

export function DeckEditorDialog({
  session,
  deck,
  onClose,
}: {
  session: ReadySession;
  deck: Deck;
  onClose: () => void;
}) {
  const api = useDataApi();
  const kindHelpId = useId();
  const text = t.decks.editor;
  const notes = useLiveData(
    async () => (await api.repos.notes.list()).filter((note) => note.deckId === deck.id),
    [api.repos, deck.id],
  );
  const cards = useLiveData(
    async () => (await api.repos.cards.list()).filter((card) => card.deckId === deck.id),
    [api.repos, deck.id],
  );
  // Los duplicados se buscan entre tus tarjetas y las de los mazos que sigues, no solo en este mazo
  const { isDemo } = session;
  const userId = session.user.id;
  const followedKey = session.settings.followedDecks.join(',');
  const everyNote = useLiveData(async () => {
    const [decks, all] = await Promise.all([api.repos.decks.list(), api.repos.notes.list()]);
    const followed = followedDeckIds(
      {
        isDemo,
        user: { id: userId },
        settings: { followedDecks: followedKey === '' ? [] : followedKey.split(',') },
      },
      decks,
    );
    return all.filter((note) => followed.has(note.deckId));
  }, [api.repos, isDemo, userId, followedKey]);
  const duplicateIndex = useMemo(
    () => (everyNote ? buildDuplicateIndex(everyNote) : null),
    [everyNote],
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<NoteDraft>(emptyDraft('basic'));
  const [error, setError] = useState<DraftError | 'save' | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const cardsOf = (noteId: string) => (cards ?? []).filter((card) => card.noteId === noteId).length;

  const startNew = (kind: NoteKind) => {
    setEditingId(null);
    setDraft(emptyDraft(kind));
    setError(null);
  };

  const submit = async () => {
    // Un doble toque no guarda dos veces la misma tarjeta
    if (saving) return;
    const problem = validateDraft(draft);
    setSaved(false);
    if (problem) {
      setError(problem);
      return;
    }
    setSaving(true);
    try {
      await saveManualNote(api, session.user, {
        deckId: deck.id,
        draft,
        ...(editingId ? { noteId: editingId } : {}),
      });
      setError(null);
      setSaved(true);
      // Se queda en el mismo tipo para escribir la siguiente tarjeta seguida
      startNew(draft.kind);
    } catch {
      setError('save');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (noteId: string) => {
    try {
      await deleteManualNote(api, session.user, noteId);
      setConfirmingId(null);
      if (editingId === noteId) startNew(draft.kind);
    } catch {
      setError('save');
    }
  };

  // Al limpiar el formulario tras guardar los avisos se van de una vez y no esperan la pausa, si no
  // la tarjeta recién guardada saldría como duplicada de sí misma
  const pausedDraft = useDebouncedValue(draft, HINTS_DELAY_MS);
  const isBlank =
    draft.kind === 'cloze'
      ? draft.text === '' && draft.extra === ''
      : draft.front === '' && draft.back === '';
  const settledDraft = isBlank ? draft : pausedDraft;
  const issues = useMemo(() => checkCardQuality(settledDraft), [settledDraft]);
  const duplicates = useMemo(
    () =>
      duplicateIndex
        ? findDuplicates(settledDraft, duplicateIndex, editingId ? { excludeId: editingId } : {})
        : null,
    [duplicateIndex, settledDraft, editingId],
  );

  const errorText = error === null ? null : error === 'save' ? text.saveError : text.errors[error];
  // La cuenta de cartas avisa lo que no es obvio, los huecos de una cloze y las dos de una inversa
  const cardCount = draft.kind === 'basic' ? 0 : cardOrdinals(draft).length;
  const kindLabels: Record<NoteKind, string> = {
    basic: text.basic,
    basic_reverse: text.basicReverse,
    cloze: text.cloze,
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
        <Dialog.Content className="animate-rise fixed top-1/2 left-1/2 z-50 flex max-h-[92dvh] w-[calc(100%-1.5rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 flex-col gap-4 overflow-y-auto rounded-xl border border-line bg-surface p-4 shadow-raised sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <Dialog.Title className="text-xl font-extrabold">
                {text.title(deck.name)}
              </Dialog.Title>
              <Dialog.Description className="text-sm text-fg-muted">
                {text.description}
              </Dialog.Description>
            </div>
            <Dialog.Close
              className="flex size-touch shrink-0 items-center justify-center rounded-full hover:bg-muted"
              aria-label={text.close}
            >
              <X aria-hidden className="size-5" />
            </Dialog.Close>
          </div>

          <form
            className="flex flex-col gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            <fieldset className="flex flex-wrap gap-2" aria-describedby={kindHelpId}>
              <legend className="mb-1 font-medium">{text.kind}</legend>
              {KINDS.map((kind) => (
                <label
                  key={kind}
                  className={cn(
                    'flex min-h-9 cursor-pointer items-center gap-2 rounded-full border-2 px-3 text-sm font-semibold has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-primary',
                    draft.kind === kind
                      ? 'border-primary bg-primary-soft text-primary'
                      : 'border-line bg-surface',
                  )}
                >
                  <input
                    type="radio"
                    name="tipo-tarjeta"
                    className="sr-only"
                    checked={draft.kind === kind}
                    // Cambiar de tipo conserva lo escrito, como Cambiar tipo de nota en Anki
                    onChange={() => {
                      setDraft(convertDraft(draft, kind));
                      setError(null);
                    }}
                  />
                  {kindLabels[kind]}
                </label>
              ))}
            </fieldset>
            <p id={kindHelpId} className="-mt-1 text-sm text-fg-muted">
              {text.kindHelp[draft.kind]}
            </p>

            {draft.kind === 'cloze' ? (
              <>
                <TextAreaField
                  label={text.text}
                  hint={text.clozeHint}
                  value={draft.text}
                  maxLength={3000}
                  onChange={(event) => {
                    setDraft({ ...draft, text: event.target.value });
                  }}
                />
                <TextAreaField
                  label={text.extra}
                  value={draft.extra}
                  maxLength={3000}
                  className="[&_textarea]:min-h-16"
                  onChange={(event) => {
                    setDraft({ ...draft, extra: event.target.value });
                  }}
                />
              </>
            ) : (
              <>
                <TextAreaField
                  label={draft.kind === 'basic' ? text.front : text.reverseFront}
                  value={draft.front}
                  maxLength={3000}
                  onChange={(event) => {
                    setDraft({ ...draft, front: event.target.value });
                  }}
                />
                <TextAreaField
                  label={draft.kind === 'basic' ? text.back : text.reverseBack}
                  value={draft.back}
                  maxLength={3000}
                  onChange={(event) => {
                    setDraft({ ...draft, back: event.target.value });
                  }}
                />
              </>
            )}
            {cardCount > 0 ? (
              <p className="text-sm text-fg-muted">{text.cards(cardCount)}</p>
            ) : null}
            <CardQualityHints issues={issues} duplicates={duplicates} />

            {errorText ? (
              <p role="alert" className="text-sm font-medium text-danger">
                {errorText}
              </p>
            ) : null}
            {saved && error === null ? (
              <p role="status" className="text-sm font-medium text-success">
                {text.saved}
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={saving}>
                {editingId ? text.saveChanges : text.save}
              </Button>
              {editingId ? (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    startNew(draft.kind);
                  }}
                >
                  {text.cancel}
                </Button>
              ) : null}
            </div>
          </form>

          <section aria-labelledby="tarjetas-del-mazo" className="flex flex-col gap-2">
            <h3 id="tarjetas-del-mazo" className="font-semibold">
              {text.listTitle(notes?.length ?? 0)}
            </h3>
            {notes === undefined || notes.length > 0 ? null : (
              <p className="text-sm text-fg-muted">{text.empty}</p>
            )}
            <ul className="flex flex-col gap-2">
              {(notes ?? []).map((note) => {
                const preview = previewOf(note);
                return (
                  <li
                    key={note.id}
                    className={cn(
                      'flex flex-wrap items-center gap-2 rounded-md border border-line p-2',
                      editingId === note.id && 'border-primary bg-primary-soft',
                    )}
                  >
                    <span className="min-w-0 flex-1 text-sm">
                      {preview}
                      <span className="ml-2 text-xs text-fg-muted">
                        {text.cards(cardsOf(note.id))}
                      </span>
                    </span>
                    {confirmingId === note.id ? (
                      <>
                        <Button
                          size="sm"
                          variant="danger"
                          onClick={() => {
                            void remove(note.id);
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
                      </>
                    ) : (
                      <>
                        <Button
                          size="sm"
                          variant="secondary"
                          aria-label={text.editNote(preview)}
                          onClick={() => {
                            setEditingId(note.id);
                            setDraft(draftOf(note));
                            setError(null);
                            setSaved(false);
                          }}
                        >
                          <Pencil aria-hidden />
                          {text.edit}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-label={text.deleteNote(preview)}
                          onClick={() => {
                            setConfirmingId(note.id);
                          }}
                        >
                          <Trash2 aria-hidden />
                          {text.delete}
                        </Button>
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
