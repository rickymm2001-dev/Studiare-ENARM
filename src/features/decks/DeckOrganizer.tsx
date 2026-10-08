// Organizar un mazo propio hecho a mano (D-085, fila 3). Cambiar su nombre y colgarlo de otro mazo
// tuyo o regresarlo al primer nivel. Un mazo no puede ir dentro de sí mismo ni de sus submazos, y el
// árbol tiene un tope de niveles. Los mazos precargados y Mis errores no se reorganizan.
import { useState } from 'react';
import { useDataApi } from '@/data/context';
import { isEditableDeck, type Deck } from '@/data/schemas/decks';
import { moveDeck, renameDeck } from '@/data/usecases/organize';
import { DECK_NAME_MAX } from '@/data/usecases/manualDecks';
import { canMoveDeck, deckIndent, flattenDeckTree } from '@/engines/deckTree';
import { t } from '@/i18n/es-MX';
import { Button } from '@/ui/components/button';
import { SelectField, TextField } from '@/ui/components/field';
import type { ReadySession } from '../shared/RequireSession';

export function DeckOrganizer({
  session,
  deck,
  decks,
}: {
  session: ReadySession;
  deck: Deck;
  /** Los mazos del alumno, para ofrecer a dónde moverlo */
  decks: readonly Deck[];
}) {
  const api = useDataApi();
  const [name, setName] = useState(deck.name);
  const [parent, setParent] = useState(deck.parentId ?? '');
  const [notice, setNotice] = useState<{ text: string; failed: boolean } | null>(null);

  // Solo los mazos propios, hechos a mano o importados, y a los que este mazo puede ir sin hacer un ciclo
  const targets = flattenDeckTree(
    decks.filter((entry) => isEditableDeck(entry, session.user.id)),
  ).filter(
    ({ deck: target }) => target.id !== deck.id && canMoveDeck(decks, deck.id, target.id) === 'ok',
  );
  const fail = () => {
    setNotice({ text: t.decks.organizeError, failed: true });
  };

  return (
    <div className="flex w-full flex-col gap-3 rounded-lg border border-line bg-muted/40 p-3">
      <form
        className="flex flex-col gap-2 sm:flex-row sm:items-end"
        onSubmit={(event) => {
          event.preventDefault();
          setNotice(null);
          renameDeck(api, session.user, deck.id, name)
            .then(() => {
              setNotice({ text: t.decks.renamed, failed: false });
            })
            .catch(fail);
        }}
      >
        <TextField
          label={t.decks.renameLabel}
          value={name}
          maxLength={DECK_NAME_MAX}
          className="sm:flex-1"
          onChange={(event) => {
            setName(event.target.value);
          }}
        />
        <Button type="submit" size="sm" variant="secondary" disabled={name.trim() === ''}>
          {t.decks.rename}
        </Button>
      </form>
      <form
        className="flex flex-col gap-2 sm:flex-row sm:items-end"
        onSubmit={(event) => {
          event.preventDefault();
          setNotice(null);
          moveDeck(api, session.user, deck.id, parent === '' ? null : parent)
            .then((error) => {
              setNotice(
                error
                  ? { text: t.decks.moveErrors[error], failed: true }
                  : { text: t.decks.moved, failed: false },
              );
            })
            .catch(fail);
        }}
      >
        <SelectField
          label={t.decks.moveLabel}
          value={parent}
          className="sm:flex-1"
          options={[
            { value: '', label: t.decks.topLevel },
            ...targets.map(({ deck: target, depth }) => ({
              value: target.id,
              label: `${deckIndent(depth)}${target.name}`,
            })),
          ]}
          onChange={(event) => {
            setParent(event.target.value);
          }}
        />
        <Button type="submit" size="sm" variant="secondary">
          {t.decks.move}
        </Button>
      </form>
      <p
        role="status"
        className={notice?.failed ? 'text-sm font-medium text-danger' : 'text-sm text-fg-muted'}
      >
        {notice?.text ?? ''}
      </p>
    </div>
  );
}
