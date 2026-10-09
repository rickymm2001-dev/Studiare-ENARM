// @vitest-environment jsdom
// Borrar mis datos y eliminar mi cuenta (D-101). Con la nube conectada se borra primero la copia de
// allá y solo si sale bien se limpia el dispositivo. Si falla, no se toca nada y se dice por qué.
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCloud } from '@/app/cloudState';
import { t } from '@/i18n/es-MX';
import { DeleteAccountCard, DeleteDataCard } from './DeleteCards';

interface RpcResult {
  error: { code?: string; message?: string } | null;
}

function setup(result: RpcResult | 'throw' = { error: null }) {
  const rpc = vi.fn(() =>
    result === 'throw' ? Promise.reject(new Error('sin red')) : Promise.resolve(result),
  );
  const wipeLocal = vi.fn(() => Promise.resolve());
  const onDone = vi.fn();
  return { cloud: { rpc } as never, rpc, wipeLocal, onDone };
}

const link = () => {
  useCloud.getState().set({
    status: 'linked',
    identity: { authId: 'a1', email: 'ana@example.com', role: 'student', alias: null },
  });
};

beforeEach(() => {
  useCloud.getState().set({ status: 'signed-out' });
});
afterEach(cleanup);

describe('Borrar mis datos', () => {
  it('sin la nube conectada solo limpia el dispositivo y no llama al servidor', async () => {
    const user = userEvent.setup();
    const { cloud, rpc, wipeLocal, onDone } = setup();
    render(<DeleteDataCard cloud={cloud} wipeLocal={wipeLocal} onDone={onDone} />);
    expect(screen.queryByText(t.settings.deleteCloudNote)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: t.settings.delete }));
    expect(screen.getByText(t.settings.deleteConfirmText)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: t.settings.deleteConfirm }));

    expect(wipeLocal).toHaveBeenCalledTimes(1);
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('con la nube conectada borra primero la copia de allá y después el dispositivo', async () => {
    link();
    const user = userEvent.setup();
    const { cloud, rpc, wipeLocal, onDone } = setup();
    const order: string[] = [];
    rpc.mockImplementation(() => {
      order.push('nube');
      return Promise.resolve({ error: null });
    });
    wipeLocal.mockImplementation(() => {
      order.push('local');
      return Promise.resolve();
    });
    render(<DeleteDataCard cloud={cloud} wipeLocal={wipeLocal} onDone={onDone} />);
    expect(screen.getByText(t.settings.deleteCloudNote)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: t.settings.delete }));
    expect(screen.getByText(t.settings.deleteCloudConfirmText)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: t.settings.deleteConfirm }));

    expect(rpc).toHaveBeenCalledWith('delete_my_data');
    expect(order).toEqual(['nube', 'local']);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('si el servidor rechaza el borrado no toca el dispositivo y explica por qué', async () => {
    link();
    const user = userEvent.setup();
    const { cloud, wipeLocal, onDone } = setup({
      error: { code: '42501', message: 'Este dispositivo no es el activo de la cuenta' },
    });
    render(<DeleteDataCard cloud={cloud} wipeLocal={wipeLocal} onDone={onDone} />);
    await user.click(screen.getByRole('button', { name: t.settings.delete }));
    await user.click(screen.getByRole('button', { name: t.settings.deleteConfirm }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      t.settings.eraseErrors.not_active_device,
    );
    expect(wipeLocal).not.toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
    // Se puede volver a intentar
    expect(screen.getByRole('button', { name: t.settings.deleteConfirm })).toBeEnabled();
  });

  it('sin red tampoco borra nada del dispositivo', async () => {
    link();
    const user = userEvent.setup();
    const { cloud, wipeLocal, onDone } = setup('throw');
    render(<DeleteDataCard cloud={cloud} wipeLocal={wipeLocal} onDone={onDone} />);
    await user.click(screen.getByRole('button', { name: t.settings.delete }));
    await user.click(screen.getByRole('button', { name: t.settings.deleteConfirm }));

    expect(await screen.findByRole('alert')).toHaveTextContent(t.settings.eraseErrors.network);
    expect(wipeLocal).not.toHaveBeenCalled();
  });

  it('cancelar vuelve al botón inicial sin llamar a nadie', async () => {
    link();
    const user = userEvent.setup();
    const { cloud, rpc, wipeLocal, onDone } = setup();
    render(<DeleteDataCard cloud={cloud} wipeLocal={wipeLocal} onDone={onDone} />);
    await user.click(screen.getByRole('button', { name: t.settings.delete }));
    await user.click(screen.getByRole('button', { name: t.settings.cancel }));

    expect(screen.getByRole('button', { name: t.settings.delete })).toBeInTheDocument();
    expect(rpc).not.toHaveBeenCalled();
    expect(wipeLocal).not.toHaveBeenCalled();
  });
});

describe('Eliminar mi cuenta', () => {
  it('no aparece si no hay cuenta en la nube conectada', () => {
    const { cloud, wipeLocal, onDone } = setup();
    render(<DeleteAccountCard cloud={cloud} wipeLocal={wipeLocal} onDone={onDone} />);
    expect(screen.queryByText(t.settings.accountDeleteTitle)).not.toBeInTheDocument();
  });

  it('pide escribir la palabra y solo entonces borra la cuenta, el dispositivo y cierra la sesión', async () => {
    link();
    const user = userEvent.setup();
    const { cloud, rpc, wipeLocal, onDone } = setup();
    render(<DeleteAccountCard cloud={cloud} wipeLocal={wipeLocal} onDone={onDone} />);
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

  it('el dueño no puede eliminarse y no se borra nada', async () => {
    link();
    const user = userEvent.setup();
    const { cloud, wipeLocal, onDone } = setup({
      error: { code: '42501', message: 'El dueño no puede borrar su propia cuenta' },
    });
    render(<DeleteAccountCard cloud={cloud} wipeLocal={wipeLocal} onDone={onDone} />);
    await user.type(
      screen.getByLabelText(t.settings.accountDeleteConfirmLabel),
      t.settings.accountDeleteWord,
    );
    await user.click(screen.getByRole('button', { name: t.settings.accountDeleteAction }));

    expect(await screen.findByRole('alert')).toHaveTextContent(t.settings.eraseErrors.owner);
    expect(wipeLocal).not.toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
  });
});
