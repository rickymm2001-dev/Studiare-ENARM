// Editor de las tarjetas de un mazo hecho a mano (3.1). Lista las tarjetas del mazo y deja agregar,
// editar y borrar, básicas con pregunta y respuesta o con huecos al estilo Anki. Todo es texto plano
// que se guarda escapado. Una tarjeta nueva aparece en Repasar al guardarla.
import { Pencil, Trash2, X } from 'lucide-react';
import { Dialog } from 'radix-ui';
import { useState } from 'react';
import { htmlToText } from '@/data/content/plainText';
import { useDataApi } from '@/data/context';
import { useLiveData } from '@/data/hooks';
import type { Deck, Note } from '@/data/schemas/decks';
import {
  clozeOrdinals,
  deleteManualNote,
  draftOf,
  saveManualNote,
  validateDraft,
  type DraftError,
  type NoteDraft,
} from '@/data/usecases/manualDecks';
import { t } from '@/i18n/es-MX';
import { cn } from '@/ui/cn';
import { Button } from '@/ui/components/button';
import { TextAreaField } from '@/ui/components/field';
import type { ReadySession } from '../shared/RequireSession';

const emptyDraft = (kind: NoteDraft['kind']): NoteDraft =>
  kind === 'basic'
    ? { kind: 'basic', front: '', back: '' }
    : { kind: 'cloze', text: '', extra: '' };

/** Primeras palabras de una tarjeta, para nombrar sus botones */
function previewOf(note: Note): string {
  const text = htmlToText(note.kind === 'basic' ? note.front : note.text).replace(/\s+/g, ' ');
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
  const text = t.decks.editor;
  const notes = useLiveData(
    async () => (await api.repos.notes.list()).filter((note) => note.deckId === deck.id),
    [api.repos, deck.id],
  );
  const cards = useLiveData(
    async () => (await api.repos.cards.list()).filter((card) => card.deckId === deck.id),
    [api.repos, deck.id],
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<NoteDraft>(emptyDraft('basic'));
  const [error, setError] = useState<DraftError | 'save' | null>(null);
  const [saved, setSaved] = useState(false);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const cardsOf = (noteId: string) => (cards ?? []).filter((card) => card.noteId === noteId).length;

  const startNew = (kind: NoteDraft['kind']) => {
    setEditingId(null);
    setDraft(emptyDraft(kind));
    setError(null);
  };

  const submit = async () => {
    const problem = validateDraft(draft);
    setSaved(false);
    if (problem) {
      setError(problem);
      return;
    }
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

  const errorText = error === null ? null : error === 'save' ? text.saveError : text.errors[error];
  const holes = draft.kind === 'cloze' ? clozeOrdinals(draft.text).length : 0;

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
            <fieldset className="flex flex-wrap gap-2">
              <legend className="mb-1 font-medium">{text.kind}</legend>
              {(['basic', 'cloze'] as const).map((kind) => (
                <label
                  key={kind}
                  className={cn(
                    'flex min-h-9 cursor-pointer items-center gap-2 rounded-full border-2 px-3 text-sm font-semibold',
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
                    // Cambiar de tipo conserva lo escrito en el primer campo para no perderlo
                    onChange={() => {
                      setDraft(
                        kind === 'basic'
                          ? {
                              kind: 'basic',
                              front: draft.kind === 'cloze' ? draft.text : '',
                              back: '',
                            }
                          : {
                              kind: 'cloze',
                              text: draft.kind === 'basic' ? draft.front : '',
                              extra: '',
                            },
                      );
                      setError(null);
                    }}
                  />
                  {text[kind]}
                </label>
              ))}
            </fieldset>

            {draft.kind === 'basic' ? (
              <>
                <TextAreaField
                  label={text.front}
                  value={draft.front}
                  maxLength={3000}
                  onChange={(event) => {
                    setDraft({ ...draft, front: event.target.value });
                  }}
                />
                <TextAreaField
                  label={text.back}
                  value={draft.back}
                  maxLength={3000}
                  onChange={(event) => {
                    setDraft({ ...draft, back: event.target.value });
                  }}
                />
              </>
            ) : (
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
                {holes > 0 ? <p className="text-sm text-fg-muted">{text.cards(holes)}</p> : null}
              </>
            )}

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
              <Button type="submit">{editingId ? text.saveChanges : text.save}</Button>
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
