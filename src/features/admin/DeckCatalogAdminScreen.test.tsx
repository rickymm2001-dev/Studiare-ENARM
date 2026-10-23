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

// El .apkg se abre en el worker. Aquí llega ya leído, con dos notas simuladas de un submazo
vi.mock('@/workers/importClient', () => ({
  parseFileInWorker: () =>
    Promise.resolve({
      ok: true,
      parsed: {
        source: 'apkg',
        notes: [1, 2].map((n) => ({
          guid: `guid-${String(n)}`,
          kind: 'basic',
          front: `[Prueba] Frente ${String(n)}`,
          back: `[Prueba] Reverso ${String(n)}`,
          html: true,
          tags: ['Prueba::Uno'],
          deckPath: ['Prueba', 'Uno'],
          position: n,
        })),
      },
    }),
}));
vi.mock('@/data/import/zip', () => ({ readZip: () => ({}) }));

const text = bankAdminText.decks;
const AT = '2026-10-14T15:00:00.000Z';

function fakeCloud(options: { note?: string; version?: boolean } = {}): {
  calls: [string, unknown][];
  confirmed: boolean;
  newerVersion: boolean;
} {
  const state = {
    calls: [] as [string, unknown][],
    confirmed: false,
    note: options.note ?? null,
    free: false,
    newerVersion: false,
  };
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
              authorizationNote: state.note,
              authorizationConfirmedAt: state.confirmed ? AT : null,
              // Un servidor anterior no manda los campos nuevos. Con version se mandan como los manda el actual
              ...(options.version
                ? {
                    authorizationConfirmedVersion: state.confirmed ? 1 : null,
                    pendingConfirmationVersion: state.confirmed ? null : 1,
                    freeAccess: state.free,
                  }
                : {}),
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
      if (name === 'admin_deck_catalog_register') {
        const manifest = (args as { p_manifest: { license: string } }).p_manifest;
        return Promise.resolve(
          manifest.license === 'own'
            ? { data: null, error: { code: '42501', details: 'license_owner_only' } }
            : { data: null, error: { code: '22023', details: null } },
        );
      }
      if (name === 'admin_deck_catalog_set_free_access') {
        state.free = (args as { p_free: boolean }).p_free;
        return Promise.resolve({ data: state.free ? 'free' : 'paid', error: null });
      }
      if (name === 'owner_confirm_deck_version') {
        // El servidor ya tiene una versión más nueva que la que ve el dueño
        if (state.newerVersion) {
          return Promise.resolve({ data: null, error: { code: 'BK002', details: null } });
        }
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
        'owner_confirm_deck_version',
        {
          p_deck_key: 'paco-pediatria',
          p_note: 'Correo de Paco del 3 de octubre, carpeta Mazos',
          p_version: 1,
        },
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

  it('si el mazo ya tiene una versión más nueva que la que ve el dueño, avisa que recargue y no confirma', async () => {
    usePreferences.setState({ role: 'owner' });
    const state = fakeCloud();
    state.newerVersion = true;
    const typing = userEvent.setup();
    showScreen();
    const deck = await screen.findByRole('region', { name: /Pediatría de Paco/ });
    await typing.type(within(deck).getByLabelText(text.authorization.note), 'Correo de Paco');
    await typing.click(within(deck).getByRole('button', { name: text.authorization.confirm }));
    expect(await within(deck).findByRole('alert')).toHaveTextContent(
      bankAdminText.errors.BK002 ?? '',
    );
    expect(state.confirmed).toBe(false);
    expect(state.calls).toContainEqual([
      'owner_confirm_deck_version',
      { p_deck_key: 'paco-pediatria', p_note: 'Correo de Paco', p_version: 1 },
    ]);
  });

  it('al volver a subir un mazo precarga su licencia y su nota, y pasarlo a propio es solo del dueño', async () => {
    // El mazo ya está en el catálogo con la nota de su autorización
    const state = fakeCloud({ note: '[Prueba] Nota del dueño' });
    const typing = userEvent.setup();
    showScreen();
    await screen.findByRole('region', { name: /Pediatría de Paco/ });
    await typing.upload(
      screen.getByLabelText(text.upload.file),
      new File([new Uint8Array([1, 2, 3])], 'paco-pediatria.apkg'),
    );
    const key = await screen.findByLabelText(text.upload.key);
    await typing.clear(key);
    await typing.type(key, 'paco-pediatria');
    expect(screen.getByLabelText(text.upload.name, { exact: true })).toHaveValue(
      'Pediatría de Paco',
    );
    expect(screen.getByLabelText(text.upload.license)).toHaveValue('third_party');
    expect(screen.getByLabelText(text.upload.note)).toHaveValue('[Prueba] Nota del dueño');

    await typing.selectOptions(screen.getByLabelText(text.upload.license), 'own');
    await typing.click(screen.getByRole('button', { name: text.upload.register }));
    const card = screen.getByRole('region', { name: text.upload.title });
    expect(await within(card).findByRole('alert')).toHaveTextContent(text.upload.licenseOwnerOnly);
    expect(state.calls.map(([name]) => name)).toContain('admin_deck_catalog_register');
  });
  it('el admin abre un mazo en Gratis y lo ve en su etiqueta', async () => {
    const typing = userEvent.setup();
    const state = fakeCloud({ version: true });
    showScreen();
    const deck = await screen.findByRole('region', { name: /Pediatría de Paco/ });
    const toggle = within(deck).getByRole('checkbox', { name: text.freeAccess.label });
    expect(toggle).not.toBeChecked();
    expect(within(deck).queryByText(text.freeAccess.badge)).toBeNull();
    await typing.click(toggle);
    await waitFor(() => {
      expect(state.calls).toContainEqual([
        'admin_deck_catalog_set_free_access',
        { p_deck_key: 'paco-pediatria', p_free: true },
      ]);
    });
    expect(await within(deck).findByText(text.freeAccess.opened)).toBeVisible();
    expect(await within(deck).findByText(text.freeAccess.badge)).toBeVisible();
    expect(within(deck).getByRole('checkbox', { name: text.freeAccess.label })).toBeChecked();
  });

  it('dice qué versión espera la confirmación del dueño, y hasta cuál confirmó', async () => {
    const typing = userEvent.setup();
    usePreferences.setState({ role: 'owner' });
    fakeCloud({ version: true, note: '[Prueba] Nota' });
    showScreen();
    const deck = await screen.findByRole('region', { name: /Pediatría de Paco/ });
    expect(within(deck).getByText(text.authorization.pendingVersion(1))).toBeVisible();
    await typing.type(within(deck).getByLabelText(text.authorization.note), ' extra');
    await typing.click(within(deck).getByRole('button', { name: text.authorization.confirm }));
    expect(
      await within(deck).findByText(text.authorization.confirmedUpTo('14/10/2026', 1)),
    ).toBeVisible();
    expect(within(deck).queryByText(text.authorization.pendingVersion(1))).toBeNull();
  });

  it('con un servidor anterior sin los campos nuevos el mazo va cerrado y sin versión pendiente', async () => {
    fakeCloud();
    showScreen();
    const deck = await screen.findByRole('region', { name: /Pediatría de Paco/ });
    expect(within(deck).getByRole('checkbox', { name: text.freeAccess.label })).not.toBeChecked();
    expect(within(deck).queryByText(/espera que el dueño la confirme/)).toBeNull();
  });
});
