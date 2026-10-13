// @vitest-environment jsdom
// Borrar mis datos y eliminar mi cuenta (D-101). Con la nube conectada se borra primero la copia de
// allá y solo si sale bien se limpia el dispositivo. Si falla, no se toca nada y se dice por qué.
// Con la cuenta sin comprobar no se borra, y sin sesión solo se borra el dispositivo y se avisa.
// Eliminar la cuenta quita antes la foto de perfil de Storage (B2).
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCloud } from '@/app/cloudState';
import { useSyncStatus } from '@/app/syncState';
import { dataUrlToBlob, photoHash } from '@/data/cloud/avatars';
import { makeFakeCloud } from '@/data/testing/fakeCloud';
import { t } from '@/i18n/es-MX';
import { DeleteAccountCard, DeleteDataCard } from './DeleteCards';

const AUTH_ID = '6f1c0f1e-6b4a-4d2a-9d55-6f2f3f6a1b10';
const PHOTO = `avatars/${AUTH_ID}/avatar.jpg`;
const JPEG = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';

interface RpcResult {
  error: { code?: string; message?: string } | null;
}

function setup(result: RpcResult | 'throw' = { error: null }) {
  const rpc = vi.fn(() =>
    result === 'throw' ? Promise.reject(new Error('sin red')) : Promise.resolve(result),
  );
  const wipeLocal = vi.fn(() => Promise.resolve());
  const onDone = vi.fn();
  // Storage en memoria del cliente falso y la fila de la cuenta, para la foto de perfil
  const storage = makeFakeCloud();
  storage.remoteAccount = { avatar: { kind: 'initials' }, avatar_changed_at: null };
  const from = (table: string) => storage.cloud.from(table);
  const loadCloud = vi.fn(() =>
    Promise.resolve({ rpc, storage: storage.cloud.storage, from } as never),
  );
  return { loadCloud, rpc, wipeLocal, onDone, storage };
}

/** La cuenta con foto, en la fila y en Storage */
const givePhoto = (storage: ReturnType<typeof setup>['storage']) => {
  storage.remoteAccount = {
    avatar: { kind: 'photo', path: `${AUTH_ID}/avatar.jpg`, hash: photoHash(JPEG) },
    avatar_changed_at: '2026-10-13T10:00:00.000Z',
  };
  storage.objects.set(PHOTO, dataUrlToBlob(JPEG));
};

const link = () => {
  useCloud.getState().set({
    status: 'linked',
    identity: { authId: AUTH_ID, email: 'ana@example.com', role: 'student', alias: null },
  });
};

const confirmAccountDelete = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.type(
    screen.getByLabelText(t.settings.accountDeleteConfirmLabel),
    t.settings.accountDeleteWord,
  );
  await user.click(screen.getByRole('button', { name: t.settings.accountDeleteAction }));
};

beforeEach(() => {
  useCloud.getState().set({ status: 'signed-out' });
  useSyncStatus.getState().reset();
});
afterEach(cleanup);

describe('Borrar mis datos', () => {
  it('sin la nube configurada solo limpia el dispositivo, sin avisos ni llamadas al servidor', async () => {
    useCloud.getState().set({ status: 'off' });
    const user = userEvent.setup();
    const { loadCloud, rpc, wipeLocal, onDone } = setup();
    render(<DeleteDataCard loadCloud={loadCloud} wipeLocal={wipeLocal} onDone={onDone} />);
    expect(screen.queryByText(t.settings.deleteSignedOutNote)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: t.settings.delete }));
    expect(screen.getByText(t.settings.deleteConfirmText)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: t.settings.deleteConfirm }));

    expect(wipeLocal).toHaveBeenCalledTimes(1);
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('con la nube conectada frena la sincronización, borra la copia de allá y después el dispositivo', async () => {
    link();
    const user = userEvent.setup();
    const { loadCloud, rpc, wipeLocal, onDone } = setup();
    const order: string[] = [];
    rpc.mockImplementation(() => {
      order.push(`nube, sincronización en pausa ${String(useSyncStatus.getState().paused)}`);
      return Promise.resolve({ error: null });
    });
    wipeLocal.mockImplementation(() => {
      order.push('local');
      return Promise.resolve();
    });
    render(<DeleteDataCard loadCloud={loadCloud} wipeLocal={wipeLocal} onDone={onDone} />);
    expect(screen.getByText(t.settings.deleteCloudNote)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: t.settings.delete }));
    expect(screen.getByText(t.settings.deleteCloudConfirmText)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: t.settings.deleteConfirm }));

    expect(rpc).toHaveBeenCalledWith('delete_my_data');
    expect(order).toEqual(['nube, sincronización en pausa true', 'local']);
    expect(onDone).toHaveBeenCalledTimes(1);
    // Tras borrar queda en pausa hasta que se cierre la sesión, para no volver a subir lo borrado
    expect(useSyncStatus.getState().paused).toBe(true);
  });

  it('espera a que termine la sincronización que estaba corriendo antes de borrar', async () => {
    link();
    useSyncStatus.getState().set({
      running: true,
      outcome: { status: 'never' },
      lastSyncAt: null,
    });
    const user = userEvent.setup();
    const { loadCloud, rpc, wipeLocal, onDone } = setup();
    render(<DeleteDataCard loadCloud={loadCloud} wipeLocal={wipeLocal} onDone={onDone} />);
    await user.click(screen.getByRole('button', { name: t.settings.delete }));
    await user.click(screen.getByRole('button', { name: t.settings.deleteConfirm }));

    expect(rpc).not.toHaveBeenCalled();
    useSyncStatus
      .getState()
      .set({ running: false, outcome: { status: 'never' }, lastSyncAt: null });
    await vi.waitFor(() => {
      expect(rpc).toHaveBeenCalledTimes(1);
    });
  });

  it('si el servidor rechaza el borrado no toca el dispositivo, reanuda la sincronización y explica por qué', async () => {
    link();
    const syncNow = vi.fn(() => Promise.resolve());
    useSyncStatus.getState().setSyncNow(syncNow);
    const user = userEvent.setup();
    const { loadCloud, wipeLocal, onDone } = setup({
      error: { code: '42501', message: 'Este dispositivo no es el activo de la cuenta' },
    });
    render(<DeleteDataCard loadCloud={loadCloud} wipeLocal={wipeLocal} onDone={onDone} />);
    await user.click(screen.getByRole('button', { name: t.settings.delete }));
    await user.click(screen.getByRole('button', { name: t.settings.deleteConfirm }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      t.settings.eraseErrors.not_active_device,
    );
    expect(wipeLocal).not.toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
    expect(useSyncStatus.getState().paused).toBe(false);
    expect(syncNow).toHaveBeenCalled();
    // Se puede volver a intentar
    expect(screen.getByRole('button', { name: t.settings.deleteConfirm })).toBeEnabled();
  });

  it('sin red tampoco borra nada del dispositivo', async () => {
    link();
    const user = userEvent.setup();
    const { loadCloud, wipeLocal, onDone } = setup('throw');
    render(<DeleteDataCard loadCloud={loadCloud} wipeLocal={wipeLocal} onDone={onDone} />);
    await user.click(screen.getByRole('button', { name: t.settings.delete }));
    await user.click(screen.getByRole('button', { name: t.settings.deleteConfirm }));

    expect(await screen.findByRole('alert')).toHaveTextContent(t.settings.eraseErrors.network);
    expect(wipeLocal).not.toHaveBeenCalled();
  });

  it('si el cliente de la nube no se pudo bajar no borra el dispositivo', async () => {
    link();
    const user = userEvent.setup();
    const { wipeLocal, onDone } = setup();
    render(
      <DeleteDataCard
        loadCloud={() => Promise.resolve(null)}
        wipeLocal={wipeLocal}
        onDone={onDone}
      />,
    );
    await user.click(screen.getByRole('button', { name: t.settings.delete }));
    await user.click(screen.getByRole('button', { name: t.settings.deleteConfirm }));

    expect(await screen.findByRole('alert')).toHaveTextContent(t.settings.eraseErrors.network);
    expect(wipeLocal).not.toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
  });

  it('si la nube se borró y el dispositivo no, lo dice y deja reintentar', async () => {
    link();
    const user = userEvent.setup();
    const { loadCloud, wipeLocal, onDone } = setup();
    wipeLocal.mockRejectedValueOnce(new Error('base cerrada'));
    render(<DeleteDataCard loadCloud={loadCloud} wipeLocal={wipeLocal} onDone={onDone} />);
    await user.click(screen.getByRole('button', { name: t.settings.delete }));
    await user.click(screen.getByRole('button', { name: t.settings.deleteConfirm }));

    expect(await screen.findByRole('alert')).toHaveTextContent(t.settings.eraseErrors.local);
    expect(onDone).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: t.settings.deleteConfirm })).toBeEnabled();
  });

  it('mientras se comprueba la cuenta en la nube no deja borrar, para no dejar la copia de allá', () => {
    useCloud.getState().set({ status: 'checking' });
    const { loadCloud, rpc, wipeLocal, onDone } = setup();
    render(<DeleteDataCard loadCloud={loadCloud} wipeLocal={wipeLocal} onDone={onDone} />);
    expect(screen.getByText(t.settings.deleteCloudChecking)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: t.settings.delete })).toBeDisabled();
    expect(rpc).not.toHaveBeenCalled();
    expect(wipeLocal).not.toHaveBeenCalled();
  });

  it('sin sesión en la nube, o si no se pudo comprobar, borra solo el dispositivo y avisa que la copia se queda', async () => {
    const cases = [
      [{ status: 'signed-out' as const }, t.settings.deleteSignedOutNote],
      [{ status: 'error' as const }, t.settings.deleteCloudUnknownNote],
    ] as const;
    for (const [state, note] of cases) {
      useCloud.getState().set(state);
      const user = userEvent.setup();
      const { loadCloud, rpc, wipeLocal, onDone } = setup();
      render(<DeleteDataCard loadCloud={loadCloud} wipeLocal={wipeLocal} onDone={onDone} />);
      expect(screen.getByText(note)).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: t.settings.delete }));
      await user.click(screen.getByRole('button', { name: t.settings.deleteConfirm }));
      expect(wipeLocal).toHaveBeenCalledTimes(1);
      expect(onDone).toHaveBeenCalledTimes(1);
      expect(rpc).not.toHaveBeenCalled();
      cleanup();
    }
  });

  it('cancelar vuelve al botón inicial sin llamar a nadie', async () => {
    link();
    const user = userEvent.setup();
    const { loadCloud, rpc, wipeLocal, onDone } = setup();
    render(<DeleteDataCard loadCloud={loadCloud} wipeLocal={wipeLocal} onDone={onDone} />);
    await user.click(screen.getByRole('button', { name: t.settings.delete }));
    await user.click(screen.getByRole('button', { name: t.settings.cancel }));

    expect(screen.getByRole('button', { name: t.settings.delete })).toBeInTheDocument();
    expect(rpc).not.toHaveBeenCalled();
    expect(wipeLocal).not.toHaveBeenCalled();
  });
});

describe('Eliminar mi cuenta', () => {
  it('no aparece si no hay cuenta en la nube conectada', () => {
    const { loadCloud, wipeLocal, onDone } = setup();
    render(<DeleteAccountCard loadCloud={loadCloud} wipeLocal={wipeLocal} onDone={onDone} />);
    expect(screen.queryByText(t.settings.accountDeleteTitle)).not.toBeInTheDocument();
  });

  it('pide escribir la palabra y solo entonces borra la cuenta, el dispositivo y cierra la sesión', async () => {
    link();
    const user = userEvent.setup();
    const { loadCloud, rpc, wipeLocal, onDone } = setup();
    render(<DeleteAccountCard loadCloud={loadCloud} wipeLocal={wipeLocal} onDone={onDone} />);
    const action = screen.getByRole('button', { name: t.settings.accountDeleteAction });
    expect(action).toBeDisabled();

    const field = screen.getByLabelText(t.settings.accountDeleteConfirmLabel);
    await user.type(field, 'eliminar');
    expect(action).toBeDisabled();
    await user.clear(field);
    await user.type(field, t.settings.accountDeleteWord);
    expect(action).toBeEnabled();
    await user.click(action);

    expect(rpc).toHaveBeenCalledWith('delete_my_account');
    expect(wipeLocal).toHaveBeenCalledTimes(1);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('con una suscripción con tarjeta activa explica que hay que cancelarla antes y no borra nada', async () => {
    link();
    const user = userEvent.setup();
    const { loadCloud, wipeLocal, onDone } = setup({
      error: { code: 'FR002', message: 'Cancela tu suscripción antes de eliminar tu cuenta' },
    });
    render(<DeleteAccountCard loadCloud={loadCloud} wipeLocal={wipeLocal} onDone={onDone} />);
    await user.type(
      screen.getByLabelText(t.settings.accountDeleteConfirmLabel),
      t.settings.accountDeleteWord,
    );
    await user.click(screen.getByRole('button', { name: t.settings.accountDeleteAction }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      t.settings.eraseErrors.active_subscription,
    );
    expect(wipeLocal).not.toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
  });

  it('el dueño no puede eliminarse y no se borra nada', async () => {
    link();
    const user = userEvent.setup();
    const { loadCloud, wipeLocal, onDone } = setup({
      error: { code: '42501', message: 'El dueño no puede borrar su propia cuenta' },
    });
    render(<DeleteAccountCard loadCloud={loadCloud} wipeLocal={wipeLocal} onDone={onDone} />);
    await user.type(
      screen.getByLabelText(t.settings.accountDeleteConfirmLabel),
      t.settings.accountDeleteWord,
    );
    await user.click(screen.getByRole('button', { name: t.settings.accountDeleteAction }));

    expect(await screen.findByRole('alert')).toHaveTextContent(t.settings.eraseErrors.owner);
    expect(wipeLocal).not.toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
  });

  it('quita la foto de perfil de Storage antes de eliminar la cuenta', async () => {
    link();
    const user = userEvent.setup();
    const { loadCloud, rpc, wipeLocal, onDone, storage } = setup();
    givePhoto(storage);
    const order: string[] = [];
    rpc.mockImplementation(() => {
      order.push(`nube, foto en Storage ${String(storage.objects.has(PHOTO))}`);
      return Promise.resolve({ error: null });
    });
    render(<DeleteAccountCard loadCloud={loadCloud} wipeLocal={wipeLocal} onDone={onDone} />);
    await confirmAccountDelete(user);

    expect(rpc).toHaveBeenCalledWith('delete_my_account');
    expect(order).toEqual(['nube, foto en Storage false']);
    expect(storage.storageCalls).toContain(`remove:${PHOTO}`);
    expect(wipeLocal).toHaveBeenCalledTimes(1);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('si la foto no se pudo quitar no elimina la cuenta, no toca el dispositivo y lo dice', async () => {
    link();
    const user = userEvent.setup();
    const { loadCloud, rpc, wipeLocal, onDone, storage } = setup();
    givePhoto(storage);
    storage.failStorage = 'error';
    render(<DeleteAccountCard loadCloud={loadCloud} wipeLocal={wipeLocal} onDone={onDone} />);
    await confirmAccountDelete(user);

    expect(await screen.findByRole('alert')).toHaveTextContent(t.settings.eraseErrors.network);
    expect(rpc).not.toHaveBeenCalled();
    expect(wipeLocal).not.toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
    expect(storage.objects.has(PHOTO)).toBe(true);
    expect(useSyncStatus.getState().paused).toBe(false);
  });

  it('si la base no deja eliminar la cuenta, la foto vuelve a Storage', async () => {
    link();
    const user = userEvent.setup();
    const { loadCloud, wipeLocal, onDone, storage } = setup({
      error: { code: 'FR002', message: 'Cancela tu suscripción antes de eliminar tu cuenta' },
    });
    givePhoto(storage);
    render(<DeleteAccountCard loadCloud={loadCloud} wipeLocal={wipeLocal} onDone={onDone} />);
    await confirmAccountDelete(user);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      t.settings.eraseErrors.active_subscription,
    );
    expect(storage.objects.has(PHOTO)).toBe(true);
    expect(wipeLocal).not.toHaveBeenCalled();
  });
});

describe('Borrar mis datos y la foto de perfil', () => {
  it('borrar mis datos deja la cuenta, así que no toca la foto de Storage', async () => {
    link();
    const user = userEvent.setup();
    const { loadCloud, rpc, wipeLocal, onDone, storage } = setup();
    render(<DeleteDataCard loadCloud={loadCloud} wipeLocal={wipeLocal} onDone={onDone} />);
    await user.click(screen.getByRole('button', { name: t.settings.delete }));
    await user.click(screen.getByRole('button', { name: t.settings.deleteConfirm }));

    expect(rpc).toHaveBeenCalledWith('delete_my_data');
    expect(storage.storageCalls).toEqual([]);
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});
