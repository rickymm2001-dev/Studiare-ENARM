// Acciones por lote sobre las tarjetas marcadas en Explorar. Suspender y reanudar sirven para todas,
// también las precargadas, porque solo suman un evento. Etiquetar y mover cambian la nota, así que
// solo aplican a las del alumno y el resultado dice cuántas precargadas se quedaron sin cambio.
import { Layers, Pause, Play, Tag, Tags } from 'lucide-react';
import { useState } from 'react';
import { useDataApi } from '@/data/context';
import type { Deck } from '@/data/schemas/decks';
import { addTags, moveNotes, removeTag, setSuspended } from '@/data/usecases/organize';
import { flattenDeckTree } from '@/engines/deckTree';
import { sanitizeTag } from '@/engines/tagPath';
import type { ExploreRow } from '@/engines/explore';
import { t } from '@/i18n/es-MX';
import { Button } from '@/ui/components/button';
import { SelectField, TextField } from '@/ui/components/field';
import type { ReadySession } from '../shared/RequireSession';

export interface Notice {
  text: string;
  failed: boolean;
}

export function BulkActions({
  session,
  selected,
  decks,
  onNotice,
}: {
  session: ReadySession;
  /** Las tarjetas marcadas que siguen cumpliendo los filtros */
  selected: readonly ExploreRow[];
  decks: readonly Deck[];
  /** El resultado de la acción lo muestra la pantalla, porque al terminar las marcadas pueden dejar de coincidir con los filtros */
  onNotice: (notice: Notice | null) => void;
}) {
  const api = useDataApi();
  const [tag, setTag] = useState('');
  const [target, setTarget] = useState('');
  const [busy, setBusy] = useState(false);

  const actor = { id: session.user.id, timeZone: session.user.timeZone };
  const toSuspend = selected.filter((row) => !row.suspended).map((row) => row.cardId);
  const toResume = selected.filter((row) => row.suspended).map((row) => row.cardId);
  const noteIds = [...new Set(selected.map((row) => row.noteId))];
  const ownDecks = flattenDeckTree(
    decks.filter((deck) => deck.ownerId === session.user.id && deck.origin === 'manual'),
  );
  const cleanTag = sanitizeTag(tag);

  const run = async (action: () => Promise<string>) => {
    setBusy(true);
    onNotice(null);
    try {
      onNotice({ text: await action(), failed: false });
    } catch {
      onNotice({ text: t.explore.actions.error, failed: true });
    } finally {
      setBusy(false);
    }
  };
  const describe = (result: { changed: number; skipped: number }, done: (n: number) => string) =>
    [
      result.changed > 0 ? done(result.changed) : t.explore.actions.nothingChanged,
      result.skipped > 0 ? t.explore.actions.skipped(result.skipped) : '',
    ]
      .filter((part) => part !== '')
      .join(' ');

  return (
    <section
      aria-label={t.explore.actions.title}
      className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-3 shadow-card"
    >
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="secondary"
          disabled={busy || toSuspend.length === 0}
          onClick={() => {
            void run(async () =>
              t.explore.actions.suspended(await setSuspended(api, actor, toSuspend, true)),
            );
          }}
        >
          <Pause aria-hidden />
          {t.explore.actions.suspend}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={busy || toResume.length === 0}
          onClick={() => {
            void run(async () =>
              t.explore.actions.unsuspended(await setSuspended(api, actor, toResume, false)),
            );
          }}
        >
          <Play aria-hidden />
          {t.explore.actions.unsuspend}
        </Button>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <TextField
          label={t.explore.actions.tagLabel}
          hint={t.explore.actions.tagHint}
          value={tag}
          autoComplete="off"
          className="sm:flex-1"
          onChange={(event) => {
            setTag(event.target.value);
          }}
        />
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="secondary"
            disabled={busy || cleanTag === ''}
            onClick={() => {
              void run(async () =>
                describe(
                  await addTags(api, session.user, noteIds, [cleanTag]),
                  t.explore.actions.tagged,
                ),
              );
            }}
          >
            <Tag aria-hidden />
            {t.explore.actions.addTag}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={busy || cleanTag === ''}
            onClick={() => {
              void run(async () =>
                describe(
                  await removeTag(api, session.user, noteIds, cleanTag),
                  t.explore.actions.untagged,
                ),
              );
            }}
          >
            <Tags aria-hidden />
            {t.explore.actions.removeTag}
          </Button>
        </div>
      </div>
      {ownDecks.length === 0 ? (
        <p className="text-sm text-fg-muted">{t.explore.actions.noOwnDecks}</p>
      ) : (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <SelectField
            label={t.explore.actions.moveLabel}
            value={target}
            className="sm:flex-1"
            options={[
              { value: '', label: t.explore.actions.chooseDeck },
              ...ownDecks.map(({ deck, depth }) => ({
                value: deck.id,
                label: `${'  '.repeat(depth)}${deck.name}`,
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
                describe(
                  await moveNotes(api, session.user, noteIds, target),
                  t.explore.actions.moved,
                ),
              );
            }}
          >
            <Layers aria-hidden />
            {t.explore.actions.move}
          </Button>
        </div>
      )}
      {busy ? <p className="text-sm text-fg-muted">{t.explore.actions.working}</p> : null}
    </section>
  );
}
