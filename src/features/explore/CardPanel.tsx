// El panel de una tarjeta en Buscar tarjetas (B4 del plan del cambio). En la computadora vive al
// lado de la tabla, así se revisan tarjetas una tras otra sin perder la lista, y en el teléfono se
// abre como hoja. Muestra sus dos caras, su mazo, su tema y su estado, y deja suspenderla,
// reanudarla, reiniciarla y editarla. Editar usa el mismo caso de uso que el editor de mazos, así
// que solo se editan las tarjetas del alumno. Las precargadas y las que arma la app solo se
// suspenden o se reinician, que son eventos que se suman a la bitácora sin tocar el contenido.
import { Pause, Pencil, Play, RotateCcw, X } from 'lucide-react';
import { useId, useState } from 'react';
import { Link } from 'react-router';
import { screenPath } from '@/app/screens';
import { useDataApi } from '@/data/context';
import { isEditableDeck, type Deck, type Note } from '@/data/schemas/decks';
import { resolveControversy, saveNoteAndSignals } from '@/data/usecases/aiCards';
import {
  convertDraft,
  draftOf,
  isFromOutline,
  validateDraft,
  type DraftError,
  type NoteDraft,
  type NoteKind,
} from '@/data/usecases/manualDecks';
import { resetCards, setSuspended } from '@/data/usecases/organize';
import { PATH_SEPARATOR, type CardSearchRow } from '@/engines/cardSearch';
import { normalizeTags } from '@/engines/tagPath';
import { t } from '@/i18n/es-MX';
import { Badge } from '@/ui/components/badge';
import { Button } from '@/ui/components/button';
import { TextAreaField, TextField } from '@/ui/components/field';
import { segmentedItem, segmentedList } from '@/ui/components/segmented-classes';
import { CardHtml } from '../shared/CardHtml';
import { ControversySignal } from '../shared/ControversySignal';
import type { ReadySession } from '../shared/RequireSession';
import type { CardFaces } from '../review/study';
import { DueText, IntervalText, StatusBadges } from './cardLabels';
import { frontOf } from './rowText';

const KINDS: readonly NoteKind[] = ['basic', 'basic_reverse', 'cloze'];

type Notice = { text: string; failed: boolean } | null;

/** Por qué no se edita una tarjeta aquí, o null si sí se edita */
function lockReason(note: Note | undefined, deck: Deck | undefined, userId: string) {
  if (!note) return 'notEditable' as const;
  if (note.origin === 'preloaded') return 'preloaded' as const;
  if (isFromOutline(note)) return 'fromOutline' as const;
  if (!deck || !isEditableDeck(deck, userId)) return 'notEditable' as const;
  return null;
}

export function CardPanel({
  session,
  row,
  note,
  deck,
  faces,
  nowMs,
  titleId,
  onClose,
}: {
  session: ReadySession;
  row: CardSearchRow;
  note: Note | undefined;
  /** El mazo de la nota, para saber si el alumno lo puede editar */
  deck: Deck | undefined;
  faces: CardFaces | null;
  nowMs: number;
  /** ID del título, para que la hoja del teléfono y el panel se nombren con él */
  titleId: string;
  onClose: () => void;
}) {
  const api = useDataApi();
  const text = t.cardSearch.panel;
  const editorText = t.decks.editor;
  const kindName = useId();
  const [draft, setDraft] = useState<NoteDraft | null>(null);
  const [tagsText, setTagsText] = useState('');
  const [error, setError] = useState<DraftError | 'save' | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const actor = { id: session.user.id, timeZone: session.user.timeZone };
  const locked = lockReason(note, deck, session.user.id);

  const run = async (action: () => Promise<string>) => {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    try {
      setNotice({ text: await action(), failed: false });
    } catch {
      setNotice({ text: text.actionError, failed: true });
    } finally {
      setBusy(false);
    }
  };

  const startEditing = () => {
    if (!note) return;
    setDraft(draftOf(note));
    setTagsText(note.tags.join(' '));
    setError(null);
    setNotice(null);
  };

  const save = async () => {
    if (!note || !draft || busy) return;
    const problem = validateDraft(draft);
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    try {
      await saveNoteAndSignals(api, session.user, {
        deckId: note.deckId,
        noteId: note.id,
        draft,
        tags: normalizeTags(tagsText.split(/[\s,]+/)),
      });
      setDraft(null);
      setError(null);
      setNotice({ text: text.saved, failed: false });
    } catch {
      setError('save');
    } finally {
      setBusy(false);
    }
  };

  const errorText =
    error === null ? null : error === 'save' ? text.saveError : editorText.errors[error];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-2">
        <h2 id={titleId} className="min-w-0 text-base font-semibold break-words">
          {frontOf(row)}
        </h2>
        <Button
          variant="ghost"
          size="icon"
          aria-label={text.close}
          className="shrink-0"
          onClick={onClose}
        >
          <X aria-hidden />
        </Button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <StatusBadges row={row} />
        {row.origin === 'preloaded' ? (
          <Badge variant="neutral">{t.cardSearch.preloaded}</Badge>
        ) : null}
      </div>

      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-sm">
        <dt className="text-fg-muted">{text.deck}</dt>
        <dd className="break-words">{row.deckLabel}</dd>
        <dt className="text-fg-muted">{text.topic}</dt>
        <dd className="break-words">
          {row.topicPath.length === 0 ? t.cardSearch.noTopic : row.topicPath.join(PATH_SEPARATOR)}
        </dd>
        <dt className="text-fg-muted">{text.due}</dt>
        <dd>
          <DueText row={row} nowMs={nowMs} timeZone={session.user.timeZone} />
        </dd>
        <dt className="text-fg-muted">{text.interval}</dt>
        <dd>
          <IntervalText row={row} />
        </dd>
        <dt className="text-fg-muted">{text.lapses}</dt>
        <dd className="tabular-nums">{row.lapses.toLocaleString('es-MX')}</dd>
        <dt className="text-fg-muted">{text.tags}</dt>
        <dd className="flex min-w-0 flex-wrap gap-1">
          {row.tags.length === 0 ? (
            <span className="text-fg-muted">{text.noTags}</span>
          ) : (
            row.tags.map((tag) => (
              <Badge key={tag} variant="neutral" className="whitespace-normal break-all">
                {tag}
              </Badge>
            ))
          )}
        </dd>
      </dl>

      {draft ? (
        <form
          aria-label={text.editTitle}
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <fieldset>
            <legend className="mb-1 text-sm font-medium">{editorText.kind}</legend>
            <div className={segmentedList}>
              {KINDS.map((kind) => (
                <label
                  key={kind}
                  className={segmentedItem(
                    draft.kind === kind,
                    'grow cursor-pointer has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-primary',
                  )}
                >
                  <input
                    type="radio"
                    name={kindName}
                    className="sr-only"
                    checked={draft.kind === kind}
                    onChange={() => {
                      setDraft(convertDraft(draft, kind));
                      setError(null);
                    }}
                  />
                  {kind === 'basic'
                    ? editorText.basic
                    : kind === 'basic_reverse'
                      ? editorText.basicReverse
                      : editorText.cloze}
                </label>
              ))}
            </div>
          </fieldset>
          {draft.kind === 'cloze' ? (
            <>
              <TextAreaField
                label={editorText.text}
                hint={editorText.clozeHint}
                value={draft.text}
                maxLength={3000}
                onChange={(event) => {
                  setDraft({ ...draft, text: event.target.value });
                }}
              />
              <TextAreaField
                label={editorText.extra}
                value={draft.extra}
                maxLength={3000}
                onChange={(event) => {
                  setDraft({ ...draft, extra: event.target.value });
                }}
              />
            </>
          ) : (
            <>
              <TextAreaField
                label={draft.kind === 'basic' ? editorText.front : editorText.reverseFront}
                value={draft.front}
                maxLength={3000}
                onChange={(event) => {
                  setDraft({ ...draft, front: event.target.value });
                }}
              />
              <TextAreaField
                label={draft.kind === 'basic' ? editorText.back : editorText.reverseBack}
                value={draft.back}
                maxLength={3000}
                onChange={(event) => {
                  setDraft({ ...draft, back: event.target.value });
                }}
              />
            </>
          )}
          <TextField
            label={text.tagsLabel}
            hint={text.tagsHint}
            value={tagsText}
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => {
              setTagsText(event.target.value);
            }}
          />
          {errorText ? (
            <p role="alert" className="text-sm font-medium text-danger">
              {errorText}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" size="sm" disabled={busy}>
              {busy ? text.saving : text.save}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => {
                setDraft(null);
                setError(null);
              }}
            >
              {text.cancel}
            </Button>
          </div>
        </form>
      ) : faces ? (
        <div className="flex flex-col gap-3 rounded-lg border border-line bg-muted/40 p-3">
          <div>
            <p className="text-xs font-semibold text-fg-muted">{text.front}</p>
            <CardHtml html={faces.front} className="text-base" />
          </div>
          <div>
            <p className="text-xs font-semibold text-fg-muted">{text.back}</p>
            <CardHtml html={faces.back} className="text-base" />
          </div>
        </div>
      ) : null}

      {row.controversy && note && !draft ? (
        <ControversySignal
          controversy={row.controversy}
          onVerify={async () => {
            await resolveControversy(api, session.user, note.id, 'verified');
          }}
          {...(locked === null ? { onEdit: startEditing } : {})}
        />
      ) : null}

      {draft ? null : (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-2">
            {locked === null ? (
              <Button size="sm" variant="secondary" onClick={startEditing}>
                <Pencil aria-hidden />
                {text.edit}
              </Button>
            ) : null}
            <Button
              size="sm"
              variant="secondary"
              disabled={busy}
              onClick={() => {
                void run(async () => {
                  await setSuspended(api, actor, [row.cardId], !row.suspended);
                  return row.suspended ? text.resumed : text.suspended;
                });
              }}
            >
              {row.suspended ? <Play aria-hidden /> : <Pause aria-hidden />}
              {row.suspended ? text.resume : text.suspend}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={busy || confirmingReset}
              aria-expanded={confirmingReset}
              onClick={() => {
                setConfirmingReset(true);
              }}
            >
              <RotateCcw aria-hidden />
              {text.reset}
            </Button>
          </div>
          {confirmingReset ? (
            <div className="flex flex-col gap-2 rounded-md border border-line p-3">
              <p className="text-sm">{text.resetConfirm}</p>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="danger"
                  disabled={busy}
                  onClick={() => {
                    setConfirmingReset(false);
                    void run(async () => {
                      await resetCards(api, actor, [row.cardId]);
                      return text.wasReset;
                    });
                  }}
                >
                  {text.resetYes}
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setConfirmingReset(false);
                  }}
                >
                  {text.resetNo}
                </Button>
              </div>
            </div>
          ) : null}
          {locked === 'preloaded' ? (
            <p className="text-sm text-fg-muted">{text.preloaded}</p>
          ) : null}
          {locked === 'notEditable' ? (
            <p className="text-sm text-fg-muted">{text.notEditable}</p>
          ) : null}
          {locked === 'fromOutline' && note && isFromOutline(note) ? (
            <div className="flex flex-col items-start gap-2">
              <p className="text-sm text-fg-muted">{text.fromOutline}</p>
              <Button asChild size="sm" variant="secondary">
                <Link to={`${screenPath('outlines')}?apunte=${encodeURIComponent(note.outlineId)}`}>
                  {t.outlines.fromOutline.open}
                </Link>
              </Button>
            </div>
          ) : null}
        </div>
      )}

      <p
        role="status"
        className={notice?.failed ? 'text-sm text-danger' : 'text-sm font-medium text-fg-muted'}
      >
        {notice?.text ?? ''}
      </p>
    </div>
  );
}
