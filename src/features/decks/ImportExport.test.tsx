// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SCREENS } from '@/app/screens';
import { renderApp, resetApp, type RenderedApp } from '@/app/testing/renderApp';
import { parseImportFile } from '@/data/import/parseFile';
import { loadSqlForTests } from '@/data/import/testing/fixtures';
import { ImportError } from '@/data/import/types';
import { createManualDeck, saveManualNote } from '@/data/usecases/manualDecks';
import { t } from '@/i18n/es-MX';
import type { ImportParseResult } from '@/workers/importApi';

// jsdom no tiene Worker. El cliente real se cambia por el mismo lector que corre dentro del worker
vi.mock('@/workers/importClient', () => ({
  parseFileInWorker: async (file: File): Promise<ImportParseResult> => {
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      return {
        ok: true,
        parsed: await parseImportFile(file.name, bytes, { loadSql: loadSqlForTests }),
      };
    } catch (error) {
      return { ok: false, code: error instanceof ImportError ? error.code : 'corrupt' };
    }
  },
}));

let app: RenderedApp | undefined;
afterEach(async () => {
  cleanup();
  await resetApp(app?.api);
  app = undefined;
});

const WAIT = { timeout: 10_000 };

async function openDecks(seed?: Parameters<typeof renderApp>[1]) {
  app = await renderApp(SCREENS.decks.path, seed);
  return screen.findByLabelText(t.importer.fileLabel, undefined, WAIT);
}

const file = (name: string, text: string) => new File([text], name, { type: 'text/csv' });

describe('importar desde Mazos', () => {
  it('lee el archivo, muestra qué trae y no guarda sin confirmar el derecho de uso', async () => {
    const typing = userEvent.setup();
    const input = await openDecks();
    await typing.upload(
      input,
      file(
        'Mis_tarjetas.csv',
        'Frente,Reverso\nTriada de Beck,Hipotensión\n,sin frente\nMetformina,Biguanida\n',
      ),
    );
    expect(await screen.findByText(t.importer.previewTitle, undefined, WAIT)).toBeVisible();
    expect(screen.getByText(t.importer.summary(2, 1))).toBeVisible();
    expect(screen.getByText(t.importer.rowErrorsTitle(1))).toBeVisible();
    expect(screen.getByLabelText(t.importer.deckName)).toHaveValue('Mis tarjetas');

    await typing.click(screen.getByRole('button', { name: t.importer.import(2) }));
    expect(await screen.findByText(t.importer.rightsRequired)).toBeVisible();
    expect(await app?.api.repos.notes.list()).toHaveLength(0);

    await typing.click(screen.getByLabelText(t.importer.rights));
    await typing.click(screen.getByRole('button', { name: t.importer.import(2) }));
    expect(await screen.findByText(t.importer.doneTitle, undefined, WAIT)).toBeVisible();
    expect(await app?.api.repos.notes.list()).toHaveLength(2);
  });

  it('exige un nombre de mazo', async () => {
    const typing = userEvent.setup();
    const input = await openDecks();
    await typing.upload(input, file('x.csv', 'Frente,Reverso\na,b\n'));
    const name = await screen.findByLabelText(t.importer.deckName, undefined, WAIT);
    await typing.clear(name);
    await typing.click(screen.getByRole('button', { name: t.importer.import(1) }));
    expect(await screen.findByText(t.importer.nameRequired)).toBeVisible();
  });

  it('un archivo que no se puede leer dice por qué y deja elegir otro', async () => {
    const typing = userEvent.setup();
    const input = await openDecks();
    await typing.upload(input, file('vacio.csv', ''));
    expect(await screen.findByText(t.importer.errors.empty ?? '', undefined, WAIT)).toBeVisible();
    expect(screen.getByLabelText(t.importer.fileLabel)).toBeEnabled();
  });

  it('Elegir otro archivo vuelve al principio sin guardar nada', async () => {
    const typing = userEvent.setup();
    const input = await openDecks();
    await typing.upload(input, file('x.csv', 'Frente,Reverso\na,b\n'));
    await typing.click(await screen.findByRole('button', { name: t.importer.cancel }, WAIT));
    expect(await screen.findByLabelText(t.importer.fileLabel)).toBeVisible();
    expect(await app?.api.repos.notes.list()).toHaveLength(0);
  });

  it('un archivo solo con filas malas avisa que no hay nada que importar', async () => {
    const typing = userEvent.setup();
    const input = await openDecks();
    await typing.upload(input, file('x.csv', 'Frente,Reverso\n,sin frente\nsin reverso,\n'));
    await screen.findByText(t.importer.previewTitle, undefined, WAIT);
    await typing.click(screen.getByLabelText(t.importer.rights));
    expect(screen.getByRole('button', { name: t.importer.import(0) })).toBeDisabled();
  });

  it('la ayuda explica las columnas', async () => {
    await openDecks();
    expect(screen.getByText(t.importer.help.title)).toBeVisible();
  });
});

describe('exportar desde Mazos', () => {
  it('sin mazos propios la tarjeta de exportar no aparece', async () => {
    await openDecks();
    expect(screen.queryByRole('heading', { name: t.exporter.title })).toBeNull();
  });

  it('con un mazo propio ofrece exportar todo o un mazo y descarga un archivo', async () => {
    const typing = userEvent.setup();
    const created = vi.fn(() => 'blob:prueba');
    const revoked = vi.fn();
    vi.stubGlobal(
      'URL',
      Object.assign(URL, { createObjectURL: created, revokeObjectURL: revoked }),
    );
    const clicked = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
    await openDecks({
      seed: async (api, user) => {
        const deck = await createManualDeck(api, user, { name: 'Cardiología' });
        await saveManualNote(api, user, {
          deckId: deck.id,
          draft: { kind: 'basic', front: 'Frente', back: 'Reverso' },
        });
      },
    });
    const card = await screen.findByRole('region', { name: t.exporter.title }, WAIT);
    const select = within(card).getByLabelText(t.exporter.deckLabel);
    expect(
      within(select)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual([t.exporter.all, 'Cardiología']);
    await typing.click(within(card).getByRole('button', { name: t.exporter.button }));
    await waitFor(() => {
      expect(clicked).toHaveBeenCalledTimes(1);
    });
    expect(created).toHaveBeenCalledTimes(1);
    expect(await within(card).findByText(/1 nota exportada en Studiare-/)).toBeVisible();
    clicked.mockRestore();
    vi.unstubAllGlobals();
  });
});
