// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect, useState } from 'react';
import { describe, expect, it } from 'vitest';
import { useDataApi } from '@/data/context';
import { DataProvider } from '@/data/DataProvider';
import { useLiveData } from '@/data/hooks';
import type { Deck } from '@/data/schemas/decks';
import { makeUser } from '@/data/testing/fixtures';
import { createManualDeck } from '@/data/usecases/manualDecks';
import { t } from '@/i18n/es-MX';
import type { ReadySession } from '../shared/RequireSession';
import { DeckEditorDialog } from './DeckEditorDialog';

const user = makeUser();
const session: ReadySession = { status: 'ready', user, settings: user.settings, isDemo: false };

/** Crea el mazo con el caso de uso real y abre el editor sobre él, como lo hace Mazos */
function Harness() {
  const api = useDataApi();
  const [deck, setDeck] = useState<Deck | null>(null);
  // useDataApi devuelve un objeto nuevo en cada render. Solo los repositorios son estables
  useEffect(() => {
    void createManualDeck({ repos: api.repos }, user, { name: 'Cardiología' }).then(setDeck);
  }, [api.repos]);
  const cards = useLiveData(() => api.repos.cards.list(), [api.repos]);
  if (!deck) return null;
  return (
    <>
      <p data-testid="cartas">{cards?.length ?? 0}</p>
      <DeckEditorDialog session={session} deck={deck} onClose={() => undefined} />
    </>
  );
}

function renderEditor() {
  render(
    <DataProvider kind="real">
      <Harness />
    </DataProvider>,
  );
}

describe('editor de tarjetas del mazo', () => {
  it('pide lo que falta antes de guardar y avisa de un texto sin huecos', async () => {
    const typing = userEvent.setup();
    renderEditor();
    await screen.findByRole('dialog', { name: t.decks.editor.title('Cardiología') });
    await typing.click(screen.getByRole('button', { name: t.decks.editor.save }));
    expect(await screen.findByText(t.decks.editor.errors.empty_front)).toBeVisible();

    await typing.type(screen.getByLabelText(t.decks.editor.front), '¿Qué es la FEVI?');
    await typing.click(screen.getByRole('button', { name: t.decks.editor.save }));
    expect(await screen.findByText(t.decks.editor.errors.empty_back)).toBeVisible();

    await typing.click(screen.getByRole('radio', { name: t.decks.editor.cloze }));
    await typing.type(screen.getByLabelText(t.decks.editor.text), 'Sin ningún hueco');
    await typing.click(screen.getByRole('button', { name: t.decks.editor.save }));
    expect(await screen.findByText(t.decks.editor.errors.no_cloze)).toBeVisible();
  });

  it('guarda una tarjeta básica y una con huecos, las lista, las edita y las borra', async () => {
    const typing = userEvent.setup();
    renderEditor();
    await screen.findByRole('dialog');

    // Básica
    await typing.type(screen.getByLabelText(t.decks.editor.front), '¿Qué es la FEVI?');
    await typing.type(screen.getByLabelText(t.decks.editor.back), 'La fracción de eyección');
    await typing.click(screen.getByRole('button', { name: t.decks.editor.save }));
    expect(await screen.findByText(t.decks.editor.saved)).toBeVisible();
    await waitFor(() => {
      expect(screen.getByTestId('cartas')).toHaveTextContent('1');
    });

    // Con dos huecos, que son dos cartas
    await typing.click(screen.getByRole('radio', { name: t.decks.editor.cloze }));
    // Las llaves son teclas especiales de user-event, así que se pega el texto tal cual
    await typing.click(screen.getByLabelText(t.decks.editor.text));
    await typing.paste('El {{c1::bisoprolol}} y el {{c2::carvedilol}} son betabloqueadores');
    expect(await screen.findByText(t.decks.editor.cards(2))).toBeVisible();
    await typing.click(screen.getByRole('button', { name: t.decks.editor.save }));
    await waitFor(() => {
      expect(screen.getByTestId('cartas')).toHaveTextContent('3');
    });

    const list = await screen.findByRole('region', { name: t.decks.editor.listTitle(2) });
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);

    // Editar la básica y guardar los cambios
    await typing.click(
      screen.getByRole('button', { name: t.decks.editor.editNote('¿Qué es la FEVI?') }),
    );
    const front = screen.getByLabelText(t.decks.editor.front);
    expect(front).toHaveValue('¿Qué es la FEVI?');
    await typing.clear(front);
    await typing.type(front, '¿Qué mide la FEVI?');
    await typing.click(screen.getByRole('button', { name: t.decks.editor.saveChanges }));
    expect(
      await screen.findByRole('button', { name: t.decks.editor.editNote('¿Qué mide la FEVI?') }),
    ).toBeVisible();

    // Borrar pide confirmar y quita la tarjeta con sus cartas
    await typing.click(
      screen.getByRole('button', { name: t.decks.editor.deleteNote('¿Qué mide la FEVI?') }),
    );
    await typing.click(screen.getByRole('button', { name: t.decks.confirmDeleteYes }));
    await waitFor(() => {
      expect(screen.getByTestId('cartas')).toHaveTextContent('2');
    });
    expect(screen.queryByText('¿Qué mide la FEVI?')).toBeNull();
  });
});
