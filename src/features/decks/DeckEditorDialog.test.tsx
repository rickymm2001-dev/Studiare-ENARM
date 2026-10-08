// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect, useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { useDataApi, type DataApi } from '@/data/context';
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

// La base de pruebas es una sola para todo el archivo, así que cada prueba la deja vacía
let clearData: DataApi['deleteAllData'];
afterEach(async () => {
  // Lo que la pantalla alcanzó a mandar a la base termina antes de borrarla
  await new Promise((resolve) => setTimeout(resolve, 100));
  await clearData?.();
  clearData = null;
});

/** Crea el mazo con el caso de uso real y abre el editor sobre él, como lo hace Mazos */
function Harness() {
  const api = useDataApi();
  const { repos, deleteAllData } = api;
  const [deck, setDeck] = useState<Deck | null>(null);
  // useDataApi devuelve un objeto nuevo en cada render. Solo los repositorios son estables
  useEffect(() => {
    clearData = deleteAllData;
    void createManualDeck({ repos }, user, { name: 'Cardiología' }).then(setDeck);
  }, [repos, deleteAllData]);
  const cards = useLiveData(() => api.repos.cards.list(), [api.repos]);
  if (!deck) return null;
  return (
    <>
      <p data-testid="cartas">{cards?.length ?? 0}</p>
      <p data-testid="cartas-ids">
        {(cards ?? [])
          .map((card) => `${card.ordinal}=${card.id}`)
          .sort()
          .join(' ')}
      </p>
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
  it('avisa de una tarjeta larga tras una pausa y de un duplicado, sin bloquear el guardado', async () => {
    const typing = userEvent.setup();
    renderEditor();
    await screen.findByRole('dialog');
    const front = screen.getByLabelText(t.decks.editor.front);
    const back = screen.getByLabelText(t.decks.editor.back);

    // Una respuesta de más de 50 palabras es un aviso, y la región de estado existe desde antes
    expect(screen.getAllByRole('status').length).toBeGreaterThan(0);
    await typing.type(front, '¿Qué es la FEVI?');
    await typing.click(back);
    await typing.paste(Array.from({ length: 60 }, (_, index) => `palabra${index}`).join(' '));
    expect(
      await screen.findByText(t.cardQuality.footer, undefined, { timeout: 3000 }),
    ).toBeVisible();
    expect(screen.getByText(/La respuesta tiene 60 palabras y es muy larga/)).toBeVisible();

    // El aviso no impide guardar
    await typing.click(screen.getByRole('button', { name: t.decks.editor.save }));
    expect(await screen.findByText(t.decks.editor.saved)).toBeVisible();
    // Al limpiar el formulario los avisos se van, la tarjeta no sale duplicada de sí misma
    await waitFor(() => {
      expect(screen.queryByText(t.cardQuality.footer)).toBeNull();
    });
    expect(screen.queryByText(/Ya tienes una tarjeta con este mismo texto/)).toBeNull();

    // Escribir otra con el mismo frente avisa del duplicado
    await typing.type(screen.getByLabelText(t.decks.editor.front), '¿Qué es la FEVI?');
    expect(
      await screen.findByText(/Ya tienes una tarjeta con este mismo texto/, undefined, {
        timeout: 3000,
      }),
    ).toBeVisible();
  });

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
  it('ofrece tres tipos de tarjeta, cada uno con su ayuda, y el teclado cambia de uno a otro', async () => {
    const typing = userEvent.setup();
    renderEditor();
    await screen.findByRole('dialog');
    const text = t.decks.editor;
    const group = screen.getByRole('group', { name: text.kind });
    const radios = within(group).getAllByRole('radio');
    expect(radios.map((radio) => radio.closest('label')?.textContent)).toEqual([
      text.basic,
      text.basicReverse,
      text.cloze,
    ]);
    expect(text.basic).toBe('Básica');
    expect(text.basicReverse).toBe('Básica con tarjeta inversa');
    expect(text.cloze).toBe('Con huecos (cloze)');

    // La básica es el tipo de entrada y cada tipo explica lo que hace
    expect(screen.getByRole('radio', { name: text.basic })).toBeChecked();
    expect(group).toHaveAccessibleDescription(text.kindHelp.basic);

    // Las flechas pasan de un tipo al siguiente sin soltar el foco
    screen.getByRole('radio', { name: text.basic }).focus();
    await typing.keyboard('{ArrowRight}');
    expect(screen.getByRole('radio', { name: text.basicReverse })).toBeChecked();
    expect(screen.getByRole('radio', { name: text.basicReverse })).toHaveFocus();
    expect(group).toHaveAccessibleDescription(text.kindHelp.basic_reverse);
    expect(screen.getByLabelText(text.reverseFront)).toBeVisible();
    expect(screen.getByLabelText(text.reverseBack)).toBeVisible();
    expect(screen.getByText(text.cards(2))).toBeVisible();

    await typing.keyboard('{ArrowRight}');
    expect(screen.getByRole('radio', { name: text.cloze })).toBeChecked();
    expect(group).toHaveAccessibleDescription(text.kindHelp.cloze);
    // La ayuda del campo explica los huecos y los huecos anidados con un ejemplo
    const field = screen.getByLabelText(text.text);
    expect(field).toHaveAccessibleDescription(text.clozeHint);
    expect(text.clozeHint).toContain('{{c1::respuesta::pista}}');
    expect(text.clozeHint).toContain('{{c1::El {{c2::ventrículo izquierdo}} bombea a la aorta}}');
  });

  it('guarda una básica con tarjeta inversa como dos cartas y al editarla conserva sus IDs', async () => {
    const typing = userEvent.setup();
    renderEditor();
    await screen.findByRole('dialog');
    const text = t.decks.editor;

    await typing.click(screen.getByRole('radio', { name: text.basicReverse }));
    await typing.type(screen.getByLabelText(text.reverseFront), 'Fracción de eyección');
    await typing.type(screen.getByLabelText(text.reverseBack), 'FEVI');
    expect(screen.getByText(text.cards(2))).toBeVisible();
    await typing.click(screen.getByRole('button', { name: text.save }));
    expect(await screen.findByText(text.saved)).toBeVisible();
    await waitFor(() => {
      expect(screen.getByTestId('cartas')).toHaveTextContent('2');
    });
    // Se queda en el mismo tipo para escribir la siguiente
    expect(screen.getByRole('radio', { name: text.basicReverse })).toBeChecked();
    const list = await screen.findByRole('region', { name: text.listTitle(1) });
    expect(within(list).getByText(text.cards(2))).toBeVisible();
    const ids = screen.getByTestId('cartas-ids').textContent;
    expect(ids.split(' ')).toHaveLength(2);

    // Editarla respeta su tipo y deja los dos campos como se escribieron
    await typing.click(screen.getByRole('button', { name: text.editNote('Fracción de eyección') }));
    expect(screen.getByRole('radio', { name: text.basicReverse })).toBeChecked();
    const front = screen.getByLabelText(text.reverseFront);
    expect(front).toHaveValue('Fracción de eyección');
    expect(screen.getByLabelText(text.reverseBack)).toHaveValue('FEVI');
    await typing.clear(front);
    await typing.type(front, 'FEVI en inglés');
    await typing.click(screen.getByRole('button', { name: text.saveChanges }));
    expect(
      await screen.findByRole('button', { name: text.editNote('FEVI en inglés') }),
    ).toBeVisible();
    expect(screen.getByTestId('cartas-ids').textContent).toBe(ids);
  });

  it('cambiar el tipo de una tarjeta guardada conserva lo escrito y ajusta sus cartas', async () => {
    const typing = userEvent.setup();
    renderEditor();
    await screen.findByRole('dialog');
    const text = t.decks.editor;

    await typing.click(screen.getByRole('radio', { name: text.basicReverse }));
    await typing.type(screen.getByLabelText(text.reverseFront), 'Pregunta uno');
    await typing.type(screen.getByLabelText(text.reverseBack), 'Respuesta uno');
    await typing.click(screen.getByRole('button', { name: text.save }));
    await waitFor(() => {
      expect(screen.getByTestId('cartas')).toHaveTextContent('2');
    });
    const before = screen.getByTestId('cartas-ids').textContent;
    const zero = before.split(' ').find((entry) => entry.startsWith('0='));

    await typing.click(screen.getByRole('button', { name: text.editNote('Pregunta uno') }));
    await typing.click(screen.getByRole('radio', { name: text.basic }));
    expect(screen.getByLabelText(text.front)).toHaveValue('Pregunta uno');
    expect(screen.getByLabelText(text.back)).toHaveValue('Respuesta uno');
    await typing.click(screen.getByRole('button', { name: text.saveChanges }));
    await waitFor(() => {
      expect(screen.getByTestId('cartas')).toHaveTextContent('1');
    });
    // La carta que sigue es la misma, con su ID
    expect(screen.getByTestId('cartas-ids').textContent).toBe(zero);

    // Y a cloze se lleva el frente al texto y el reverso a la nota extra
    await typing.click(screen.getByRole('button', { name: text.editNote('Pregunta uno') }));
    await typing.click(screen.getByRole('radio', { name: text.cloze }));
    expect(screen.getByLabelText(text.text)).toHaveValue('Pregunta uno');
    expect(screen.getByLabelText(text.extra)).toHaveValue('Respuesta uno');
  });

  it('acepta un hueco dentro de otro, cuenta sus cartas y rechaza uno sin cerrar', async () => {
    const typing = userEvent.setup();
    renderEditor();
    await screen.findByRole('dialog');
    const text = t.decks.editor;
    await typing.click(screen.getByRole('radio', { name: text.cloze }));
    const field = screen.getByLabelText(text.text);

    // Sin cerrar el de afuera. Se rechaza y dice por qué
    await typing.click(field);
    await typing.paste('{{c1::El {{c2::ventrículo izquierdo}} bombea');
    await typing.click(screen.getByRole('button', { name: text.save }));
    expect(await screen.findByText(text.errors.unclosed_cloze)).toBeVisible();
    expect(screen.getByTestId('cartas')).toHaveTextContent('0');

    // Con los dos cerrados son dos cartas
    await typing.clear(field);
    await typing.paste('{{c1::El {{c2::ventrículo izquierdo}} bombea a la aorta}}');
    expect(await screen.findByText(text.cards(2))).toBeVisible();
    await typing.click(screen.getByRole('button', { name: text.save }));
    await waitFor(() => {
      expect(screen.getByTestId('cartas')).toHaveTextContent('2');
    });
    expect(screen.queryByText(text.errors.unclosed_cloze)).toBeNull();
  });
});
