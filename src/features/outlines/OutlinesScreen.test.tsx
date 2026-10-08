// @vitest-environment jsdom
// Pantalla de Apuntes. La lista, crear un apunte, buscar, abrir uno y las tarjetas que dice que dará.
import 'fake-indexeddb/auto';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { SCREENS } from '@/app/screens';
import { renderApp, resetApp, type RenderedApp } from '@/app/testing/renderApp';
import { newId } from '@/data/ids';
import { createManualDeck, deleteManualDeck } from '@/data/usecases/manualDecks';
import { createOutline, saveOutline } from '@/data/usecases/outlines';
import { t } from '@/i18n/es-MX';

vi.mock('@/ui/celebrate', () => ({ celebrate: () => undefined }));

// Abrir un apunte carga el editor y sus pruebas tardan más que los 5 segundos por defecto
vi.setConfig({ testTimeout: 30_000 });

// ProseMirror mide rectángulos que jsdom no calcula
beforeAll(() => {
  const rect = {
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    toJSON: () => ({}),
  };
  Range.prototype.getBoundingClientRect = () => rect;
  Range.prototype.getClientRects = () => ({
    length: 0,
    item: () => null,
    [Symbol.iterator]: [][Symbol.iterator],
  });
  document.elementFromPoint = () => null;
});

let app: RenderedApp | undefined;
afterEach(async () => {
  cleanup();
  await resetApp(app?.api);
  app = undefined;
});

const node = (text: string) => ({ id: newId(), text, children: [] });

describe('pantalla de Apuntes', () => {
  it('sin apuntes dice cómo empezar y deja crear el primero', async () => {
    const typing = userEvent.setup();
    app = await renderApp(SCREENS.outlines.path);
    expect(await screen.findByText(t.outlines.empty, {}, { timeout: 10_000 })).toBeInTheDocument();
    // Un título vacío se avisa y no crea nada
    await typing.click(screen.getByRole('button', { name: t.outlines.create }));
    expect(await screen.findByText(t.outlines.titleRequired)).toBeInTheDocument();
    expect(await app.api.repos.outlines.list()).toHaveLength(0);

    await typing.type(screen.getByLabelText(t.outlines.newTitle), 'Asma');
    await typing.click(screen.getByRole('button', { name: t.outlines.create }));
    // Se abre el editor del apunte nuevo, con su título y su mazo
    expect(
      await screen.findByRole('textbox', { name: t.outlines.editor.label }, { timeout: 10_000 }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(t.outlines.editor.titleLabel)).toHaveValue('Asma');
    const [outline] = await app.api.repos.outlines.list();
    expect(outline?.title).toBe('Asma');
    const deck = (await app.api.repos.decks.list()).find((entry) => entry.id === outline?.deckId);
    expect(deck?.name).toBe('Asma');
    expect(await screen.findByText(t.outlines.editor.deck('Asma'))).toBeInTheDocument();
  });

  it('la lista dice cuántas líneas y tarjetas tiene cada apunte y se puede buscar', async () => {
    const typing = userEvent.setup();
    app = await renderApp(SCREENS.outlines.path, {
      seed: async (api, user) => {
        const asma = await createOutline(api, user, { title: 'Asma' });
        await saveOutline(api, user, {
          outlineId: asma.id,
          nodes: [node('Asma :: Obstrucción reversible'), node('Primera línea >> Salbutamol')],
        });
        const sodio = await createOutline(api, user, { title: 'Sodio' });
        await saveOutline(api, user, {
          outlineId: sodio.id,
          nodes: [node('El {{sodio}} es el catión principal')],
        });
      },
    });
    const asmaRow = await screen.findByRole(
      'link',
      { name: t.outlines.open('Asma') },
      { timeout: 10_000 },
    );
    // Un :: da dos tarjetas y un >> una
    expect(asmaRow).toHaveTextContent(t.outlines.summary(2, 3));
    expect(screen.getByRole('link', { name: t.outlines.open('Sodio') })).toHaveTextContent(
      t.outlines.summary(1, 1),
    );

    // Busca dentro de las líneas, sin acentos ni mayúsculas
    await typing.type(screen.getByRole('searchbox', { name: t.outlines.search }), 'SALBUTAMOL');
    await waitFor(() => {
      expect(
        screen.queryByRole('link', { name: t.outlines.open('Sodio') }),
      ).not.toBeInTheDocument();
    });
    expect(screen.getByRole('link', { name: t.outlines.open('Asma') })).toBeInTheDocument();
    await typing.clear(screen.getByRole('searchbox', { name: t.outlines.search }));
    await typing.type(screen.getByRole('searchbox', { name: t.outlines.search }), 'zzzz');
    expect(await screen.findByText(t.outlines.noMatches)).toBeInTheDocument();
  });

  it('un apunte abierto muestra sus tarjetas, sus enlaces y los apuntes que lo mencionan', async () => {
    const typing = userEvent.setup();
    app = await renderApp(SCREENS.outlines.path, {
      seed: async (api, user) => {
        const asma = await createOutline(api, user, { title: 'Asma' });
        const epoc = await createOutline(api, user, { title: 'EPOC' });
        await saveOutline(api, user, {
          outlineId: asma.id,
          nodes: [node('Ver [[EPOC]] y [[Tos crónica]]'), node('Salbutamol >> Broncodilatador')],
        });
        await saveOutline(api, user, {
          outlineId: epoc.id,
          nodes: [node('Parecido a [[asma]]')],
        });
      },
    });
    await typing.click(
      await screen.findByRole('link', { name: t.outlines.open('Asma') }, { timeout: 10_000 }),
    );
    const links = await screen.findByRole(
      'region',
      { name: t.outlines.links.title },
      { timeout: 10_000 },
    );
    // A EPOC sí lo enlaza y Tos crónica todavía no existe
    expect(within(links).getByText('Tos crónica')).toBeInTheDocument();
    expect(within(links).getByText(t.outlines.links.missing)).toBeInTheDocument();
    // EPOC aparece dos veces, porque Asma lo enlaza y él menciona a Asma aunque lo escribió en
    // minúsculas, y el título se resuelve sin importar mayúsculas
    expect(within(links).getAllByRole('link', { name: 'EPOC' })).toHaveLength(2);
    const preview = screen.getByRole('region', { name: t.outlines.preview.title });
    expect(within(preview).getByText(t.outlines.preview.count(1))).toBeInTheDocument();
    expect(within(preview).getByText('Broncodilatador')).toBeInTheDocument();
  });

  it('si el mazo del apunte se borró deja elegir otro y pasa el apunte con sus tarjetas', async () => {
    const typing = userEvent.setup();
    let outlineId = '';
    let newDeckId = '';
    app = await renderApp(SCREENS.outlines.path, {
      seed: async (api, user) => {
        const asma = await createOutline(api, user, { title: 'Asma' });
        outlineId = asma.id;
        await saveOutline(api, user, {
          outlineId,
          nodes: [node('Salbutamol >> Broncodilatador')],
        });
        await deleteManualDeck(api, user, asma.deckId);
        newDeckId = (await createManualDeck(api, user, { name: 'Neumología' })).id;
      },
    });
    await typing.click(
      await screen.findByRole('link', { name: t.outlines.open('Asma') }, { timeout: 10_000 }),
    );
    expect(await screen.findByText(t.outlines.editor.deckMissing)).toBeInTheDocument();
    await typing.selectOptions(screen.getByLabelText(t.outlines.editor.deckLabel), newDeckId);
    await typing.click(screen.getByRole('button', { name: t.outlines.editor.deckMove }));
    await waitFor(async () => {
      expect((await app?.api.repos.outlines.get(outlineId))?.deckId).toBe(newDeckId);
    });
    // Las tarjetas regresan al mazo nuevo y el aviso desaparece
    await waitFor(async () => {
      const notes = (await app?.api.repos.notes.listAllByOutline(outlineId))?.filter(
        (note) => note.deletedAt == null,
      );
      expect(notes).toHaveLength(1);
      expect(notes?.[0]?.deckId).toBe(newDeckId);
    });
    await waitFor(() => {
      expect(screen.queryByText(t.outlines.editor.deckMissing)).not.toBeInTheDocument();
    });
  });

  it('si otra ventana guardó antes, avisa en lugar de pisar el apunte', async () => {
    const typing = userEvent.setup();
    let outlineId = '';
    app = await renderApp(SCREENS.outlines.path, {
      seed: async (api, user) => {
        const asma = await createOutline(api, user, { title: 'Asma' });
        outlineId = asma.id;
        await saveOutline(api, user, { outlineId, nodes: [node('Salbutamol >> Broncodilatador')] });
      },
    });
    await typing.click(
      await screen.findByRole('link', { name: t.outlines.open('Asma') }, { timeout: 10_000 }),
    );
    const titleField = await screen.findByLabelText(t.outlines.editor.titleLabel);
    // Otra ventana agrega una línea con tarjeta mientras esta sigue con la copia vieja
    const user = (await app.api.repos.outlines.get(outlineId))?.ownerId ?? '';
    await saveOutline(
      app.api,
      { id: user },
      { outlineId, nodes: [node('Salbutamol >> Broncodilatador'), node('Otra >> Cosa')] },
      new Date(Date.now() + 60_000),
    );
    await typing.type(titleField, ' crónica');
    expect(
      await screen.findByText(t.outlines.editor.conflict, {}, { timeout: 10_000 }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: t.outlines.editor.reload })).toBeInTheDocument();
    // Lo que guardó la otra ventana sigue intacto
    const stored = await app.api.repos.outlines.get(outlineId);
    expect(stored?.title).toBe('Asma');
    expect(stored?.nodes).toHaveLength(2);
  });

  it('un apunte que no existe lo dice y regresa a la lista', async () => {
    app = await renderApp(`${SCREENS.outlines.path}?apunte=${newId()}`);
    expect(
      await screen.findByText(t.outlines.notFound, {}, { timeout: 10_000 }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: t.outlines.backToList })).toHaveAttribute(
      'href',
      SCREENS.outlines.path,
    );
  });
});
