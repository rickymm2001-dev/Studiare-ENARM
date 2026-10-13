// Acciones por lote sobre las tarjetas marcadas en Buscar tarjetas (B4 del plan del cambio).
// Suspender, reanudar y reiniciar sirven para todas, también las precargadas, porque solo suman un
// evento a la bitácora. Etiquetar y mover cambian la nota, así que solo aplican a las del alumno y
// el resultado dice cuántas precargadas se quedaron sin cambio. Etiquetar, mover y reiniciar abren
// su parte debajo de la barra, y reiniciar pide confirmar antes.
import { Layers, Pause, Play, RotateCcw, Tag, Tags, X } from 'lucide-react';
import { useState } from 'react';
import { useDataApi } from '@/data/context';
import type { Deck } from '@/data/schemas/decks';
import { addTags, moveNotes, removeTag, resetCards, setSuspended } from '@/data/usecases/organize';
import type { CardSearchRow } from '@/engines/cardSearch';
import { deckIndent, flattenDeckTree } from '@/engines/deckTree';
import { sanitizeTag } from '@/engines/tagPath';
import { t } from '@/i18n/es-MX';
import { Button } from '@/ui/components/button';
import { SelectField, TextField } from '@/ui/components/field';
import type { ReadySession } from '../shared/RequireSession';

export interface Notice {
  text: string;
  failed: boolean;
}

type Mode = 'tag' | 'move' | 'reset' | null;

export function BulkActions({
  session,
  selected,
  ownDecks,
  onNotice,
  onClear,
}: {
  session: ReadySession;
  /** Las tarjetas marcadas que siguen cumpliendo la búsqueda */
  selected: readonly CardSearchRow[];
  /** Los mazos del alumno a los que se pueden mover notas */
  ownDecks: readonly Deck[];
  /** El resultado lo muestra la pantalla, porque al terminar las marcadas pueden dejar de coincidir */
  onNotice: (notice: Notice | null) => void;
  onClear: () => void;
}) {
  const api = useDataApi();
  const text = t.cardSearch.actions;
  const [mode, setMode] = useState<Mode>(null);
  const [tag, setTag] = useState('');
  const [target, setTarget] = useState('');
  const [busy, setBusy] = useState(false);

  const actor = { id: session.user.id, timeZone: session.user.timeZone };
  const cardIds = selected.map((row) => row.cardId);
  const toSuspend = selected.filter((row) => !row.suspended).map((row) => row.cardId);
  const toResume = selected.filter((row) => row.suspended).map((row) => row.cardId);
  const noteIds = [...new Set(selected.map((row) => row.noteId))];
  const targets = flattenDeckTree(ownDecks);
  const cleanTag = sanitizeTag(tag);

  const run = async (action: () => Promise<string>) => {
    if (busy) return;
    setBusy(true);
    onNotice(null);
    try {
      onNotice({ text: await action(), failed: false });
    } catch {
      onNotice({ text: text.error, failed: true });
    } finally {
      setBusy(false);
    }
  };
  const describe = (result: { changed: number; skipped: number }, done: (n: number) => string) =>
    [
      result.changed > 0 ? done(result.changed) : text.nothingChanged,
      result.skipped > 0 ? text.skipped(result.skipped) : '',
    ]
      .filter((part) => part !== '')
      .join(' ');
  const toggle = (next: Exclude<Mode, null>) => {
    setMode(mode === next ? null : next);
  };

  return (
    <section
      aria-label={text.title}
      className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-3"
    >
      <div className="flex flex-wrap items-center gap-2">
        <p className="mr-1 text-sm font-semibold">{t.cardSearch.selected(selected.length)}</p>
        <Button
          size="sm"
          variant="secondary"
          disabled={busy || toSuspend.length === 0}
          onClick={() => {
            void run(async () => text.suspended(await setSuspended(api, actor, toSuspend, true)));
          }}
        >
          <Pause aria-hidden />
          {text.suspend}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={busy || toResume.length === 0}
          onClick={() => {
            void run(async () => text.unsuspended(await setSuspended(api, actor, toResume, false)));
          }}
        >
          <Play aria-hidden />
          {text.unsuspend}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          aria-expanded={mode === 'tag'}
          disabled={busy}
          onClick={() => {
            toggle('tag');
          }}
        >
          <Tag aria-hidden />
          {text.tag}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          aria-expanded={mode === 'move'}
          disabled={busy}
          onClick={() => {
            toggle('move');
          }}
        >
          <Layers aria-hidden />
          {text.move}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          aria-expanded={mode === 'reset'}
          disabled={busy}
          onClick={() => {
            toggle('reset');
          }}
        >
          <RotateCcw aria-hidden />
          {text.reset}
        </Button>
        <Button size="sm" variant="ghost" onClick={onClear}>
          <X aria-hidden />
          {t.cardSearch.clearSelection}
        </Button>
      </div>

      {mode === 'tag' ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <TextField
            label={text.tagLabel}
            hint={text.tagHint}
            value={tag}
            autoComplete="off"
            spellCheck={false}
            className="sm:flex-1"
            onChange={(event) => {
              setTag(event.target.value);
            }}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="secondary"
              disabled={busy || cleanTag === ''}
              onClick={() => {
                void run(async () =>
                  describe(await addTags(api, session.user, noteIds, [cleanTag]), text.tagged),
                );
              }}
            >
              <Tag aria-hidden />
              {text.addTag}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={busy || cleanTag === ''}
              onClick={() => {
                void run(async () =>
                  describe(await removeTag(api, session.user, noteIds, cleanTag), text.untagged),
                );
              }}
            >
              <Tags aria-hidden />
              {text.removeTag}
            </Button>
          </div>
        </div>
      ) : null}

      {mode === 'move' ? (
        targets.length === 0 ? (
          <p className="text-sm text-fg-muted">{text.noOwnDecks}</p>
        ) : (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <SelectField
              label={text.moveLabel}
              value={target}
              className="sm:flex-1"
              options={[
                { value: '', label: text.chooseDeck },
                ...targets.map(({ deck, depth }) => ({
                  value: deck.id,
                  label: `${deckIndent(depth)}${deck.name}`,
                })),
              ]}
              onChange={(event) => {
                setTarget(event.target.value);
              }}
            />
            <Button
              size="sm"
              variant="secondary"
              disabled={busy || target === ''}
              onClick={() => {
                void run(async () =>
                  describe(await moveNotes(api, session.user, noteIds, target), text.moved),
                );
              }}
            >
              <Layers aria-hidden />
              {text.moveHere}
            </Button>
          </div>
        )
      ) : null}

      {mode === 'reset' ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm">{text.resetConfirm(cardIds.length)}</p>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="danger"
              disabled={busy}
              onClick={() => {
                setMode(null);
                void run(async () => text.wasReset(await resetCards(api, actor, cardIds)));
              }}
            >
              {text.resetYes}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setMode(null);
              }}
            >
              {text.resetNo}
            </Button>
          </div>
        </div>
      ) : null}

      {busy ? <p className="text-sm text-fg-muted">{text.working}</p> : null}
    </section>
  );
}
