// @vitest-environment jsdom
// Catálogo de mazos (pantalla 37, 4.8 del plan de B11). La lista con sus versiones, publicar con el
// aviso de BK010 cuando falta la autorización y la confirmación de la autorización, que solo hace el
// dueño con su nota.
import 'fake-indexeddb/auto';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCloud } from '@/app/cloudState';
import { usePreferences } from '@/app/preferences';
import { DataProvider } from '@/data/DataProvider';
import { bankAdminText } from '@/i18n/bankAdmin';
import { t } from '@/i18n/es-MX';
import { DeckCatalogAdminScreen } from './DeckCatalogAdminScreen';

vi.setConfig({ testTimeout: 30_000 });

const holder = vi.hoisted((): { cloud: unknown } => ({ cloud: null }));
vi.mock('@/data/cloud/client', () => ({
  getCloud: () => holder.cloud,
  cloudConfigured: () => holder.cloud !== null,
  loadCloud: () => Promise.resolve(holder.cloud),
}));

const text = bankAdminText.decks;
const AT = '2026-10-14T15:00:00.000Z';

function fakeCloud(): { calls: [string, unknown][] } {
  const state = { calls: [] as [string, unknown][], confirmed: false };
  holder.cloud = {
    rpc: (name: string, args: unknown) => {
      state.calls.push([name, args]);
      if (name === 'admin_deck_catalog_overview') {
        return Promise.resolve({
          data: [
            {
              deckKey: 'paco-pediatria',
              name: 'Pediatría de Paco',
              author: 'Paco',
              description: '',
              license: 'third_party',
              authorizationNote: null,
              authorizationConfirmedAt: state.confirmed ? AT : null,
              status: 'draft',
              publishedVersion: null,
              versions: [
                {
                  version: 1,
                  status: 'uploading',
                  createdAt: AT,
                  publishedAt: null,
                  files: 3,
                  uploaded: 3,
                },
              ],
              downloads: 0,
            },
          ],
          error: null,
        });
      }
      if (name === 'admin_deck_catalog_publish') {
        return Promise.resolve({
          data: null,
          error: { code: state.confirmed ? 'BK011' : 'BK010', details: null },
        });
      }
      if (name === 'owner_confirm_deck_authorization') {
        state.confirmed = true;
        return Promise.resolve({ data: null, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    },
  };
  return state;
}

const showScreen = () =>
  render(
    <DataProvider kind="real">
      <MemoryRouter>
        <DeckCatalogAdminScreen />
      </MemoryRouter>
    </DataProvider>,
  );

beforeEach(() => {
  useCloud.setState({
    state: {
      status: 'linked',
      identity: { authId: 'yo', email: 'yo@ejemplo.mx', role: 'admin', alias: null },
    },
  });
  usePreferences.setState({ role: 'admin' });
});
afterEach(() => {
  cleanup();
  holder.cloud = null;
  useCloud.setState({ state: { status: 'off' } });
  usePreferences.setState({ role: 'student' });
});

describe('Catálogo de mazos', () => {
  it('sin la nube dice que necesita la cuenta de un admin', () => {
    useCloud.setState({ state: { status: 'off' } });
    showScreen();
    expect(
      screen.getByRole('heading', { level: 1, name: t.screens.deckCatalogAdmin.title }),
    ).toBeVisible();
    expect(screen.getByText(bankAdminText.needsCloud)).toBeVisible();
  });

  it('el admin ve la versión en subida y publicar sin autorización avisa con BK010', async () => {
    const state = fakeCloud();
    const typing = userEvent.setup();
    showScreen();
    const deck = await screen.findByRole('region', { name: /Pediatría de Paco/ });
    expect(within(deck).getByText(text.version(1, 'Subiendo', 3, 3))).toBeVisible();
    expect(within(deck).getByText(text.authorization.pending)).toBeVisible();
    expect(within(deck).getByText(text.authorization.ownerOnly)).toBeVisible();
    expect(
      within(deck).queryByRole('button', { name: text.authorization.confirm }),
    ).not.toBeInTheDocument();

    await typing.click(within(deck).getByRole('button', { name: text.publish }));
    expect(await within(deck).findByRole('alert')).toHaveTextContent(
      bankAdminText.errors.BK010 ?? '',
    );
    expect(state.calls).toContainEqual([
      'admin_deck_catalog_publish',
      { p_deck_key: 'paco-pediatria', p_version: 1 },
    ]);
  });

  it('el dueño confirma la autorización con su nota y publicar ya revisa los archivos', async () => {
    usePreferences.setState({ role: 'owner' });
    const state = fakeCloud();
    const typing = userEvent.setup();
    showScreen();
    const deck = await screen.findByRole('region', { name: /Pediatría de Paco/ });
    const confirm = within(deck).getByRole('button', { name: text.authorization.confirm });
    expect(confirm).toBeDisabled();
    await typing.type(
      within(deck).getByLabelText(text.authorization.note),
      '  Correo de Paco del 3 de octubre, carpeta Mazos  ',
    );
    await typing.click(confirm);
    await waitFor(() => {
      expect(state.calls).toContainEqual([
        'owner_confirm_deck_authorization',
        { p_deck_key: 'paco-pediatria', p_note: 'Correo de Paco del 3 de octubre, carpeta Mazos' },
      ]);
    });
    const refreshed = await screen.findByRole('region', { name: /Pediatría de Paco/ });
    expect(
      await within(refreshed).findByText(
        text.authorization.confirmed(new Date(AT).toLocaleDateString('es-MX')),
      ),
    ).toBeVisible();
    expect(within(refreshed).getByRole('status')).toHaveTextContent(
      text.authorization.confirmed_notice,
    );

    await typing.click(within(refreshed).getByRole('button', { name: text.publish }));
    expect(await within(refreshed).findByRole('alert')).toHaveTextContent(
      bankAdminText.errors.BK011 ?? '',
    );
  });
});
