// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEVICE_CLAIM_STORAGE_KEY, forgetDeviceClaim, getDeviceId } from '@/data/cloud/device';
import { DataProvider } from '@/data/DataProvider';
import { makeFakeCloud, type FakeCloud } from '@/data/testing/fakeCloud';
import { CloudBridge } from './cloud';
import { useCloud } from './cloudState';
import { DEFAULT_PREFERENCES, usePreferences } from './preferences';

// getCloud devuelve el cliente falso que cada prueba arma. Sin él es como no tener nube configurada
const holder = vi.hoisted((): { cloud: unknown } => ({ cloud: null }));
vi.mock('@/data/cloud/client', () => ({
  getCloud: () => holder.cloud,
  cloudConfigured: () => holder.cloud !== null,
}));

const AUTH_ID = '6f1c0f1e-6b4a-4d2a-9d55-6f2f3f6a1b10';

function mount(kind: 'real' | 'demo' = 'real') {
  return render(
    <DataProvider kind={kind}>
      <CloudBridge />
    </DataProvider>,
  );
}

function useFake(fake: FakeCloud) {
  holder.cloud = fake.cloud;
  return fake;
}

const linked = () => useCloud.getState().state.status === 'linked';

beforeEach(() => {
  localStorage.clear();
  forgetDeviceClaim();
  usePreferences.setState(DEFAULT_PREFERENCES);
  useCloud.setState({ state: { status: 'checking' } });
});

afterEach(() => {
  cleanup();
  holder.cloud = null;
  localStorage.clear();
  forgetDeviceClaim();
  usePreferences.setState(DEFAULT_PREFERENCES);
  useCloud.setState({ state: { status: 'off' } });
});

describe('CloudBridge y el dispositivo único', () => {
  it('al entrar une la cuenta y reclama este dispositivo', async () => {
    const fake = useFake(makeFakeCloud());
    mount();
    await waitFor(() => {
      expect(fake.claims).toHaveLength(1);
    });
    expect(linked()).toBe(true);
    expect(usePreferences.getState().sessionUserId).not.toBeNull();
    expect(fake.claims[0]?.p_device_id).toBe(getDeviceId());
    expect(fake.row?.device_id).toBe(getDeviceId());
    expect(fake.signOuts).toHaveLength(0);
  });

  it('Supabase repite SIGNED_IN al volver a enfocar la pestaña y eso no reclama otra vez', async () => {
    const fake = useFake(makeFakeCloud());
    mount();
    await waitFor(() => {
      expect(fake.claims).toHaveLength(1);
    });
    // Otro dispositivo gana la cuenta mientras esta pestaña estaba en segundo plano
    fake.row = { device_id: 'otro-navegador' };
    act(() => {
      fake.emit('SIGNED_IN');
      fake.emit('SIGNED_IN');
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(fake.claims).toHaveLength(1);
    expect(fake.row.device_id).toBe('otro-navegador');
    expect(linked()).toBe(true);
  });

  it('si al abrir la app otro dispositivo tiene la cuenta, sale, avisa y no se la quita', async () => {
    const fake = useFake(makeFakeCloud({ row: { device_id: 'otro-navegador' } }));
    // Este navegador ya había entrado antes con esta cuenta
    localStorage.setItem(DEVICE_CLAIM_STORAGE_KEY, AUTH_ID);
    usePreferences.setState({ sessionUserId: 'perfil-local' });
    mount();
    await waitFor(() => {
      expect(useCloud.getState().state).toEqual({ status: 'signed-out', reason: 'other_device' });
    });
    // Cierra solo la sesión de este navegador. La global dejaría sin sesión al dispositivo ganador
    expect(fake.signOuts).toEqual([{ scope: 'local' }]);
    expect(usePreferences.getState().sessionUserId).toBeNull();
    expect(usePreferences.getState().role).toBe('student');
    expect(fake.claims).toHaveLength(0);
    expect(fake.row?.device_id).toBe('otro-navegador');
    expect(localStorage.getItem(DEVICE_CLAIM_STORAGE_KEY)).toBeNull();
    // El SIGNED_OUT que manda Supabase al terminar no borra el motivo del aviso
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(useCloud.getState().state).toEqual({ status: 'signed-out', reason: 'other_device' });
  });

  it('en una revisión posterior descubre que otro dispositivo ganó y sale', async () => {
    const fake = useFake(makeFakeCloud());
    mount();
    await waitFor(() => {
      expect(fake.claims).toHaveLength(1);
    });
    expect(usePreferences.getState().sessionUserId).not.toBeNull();
    // Otro dispositivo gana y esta pestaña lo ve al volver a enfocarse, pasados unos minutos
    fake.row = { device_id: 'otro-navegador' };
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + 120_000);
    act(() => {
      window.dispatchEvent(new Event('focus'));
    });
    vi.useRealTimers();
    await waitFor(() => {
      expect(useCloud.getState().state).toEqual({ status: 'signed-out', reason: 'other_device' });
    });
    expect(usePreferences.getState().sessionUserId).toBeNull();
    expect(fake.signOuts).toEqual([{ scope: 'local' }]);
    expect(fake.claims).toHaveLength(1);
  });

  it('un SIGNED_IN rezagado mientras se cierra la sesión no reabre el perfil ni reclama de nuevo', async () => {
    const fake = useFake(makeFakeCloud({ row: { device_id: 'otro-navegador' } }));
    fake.signOutDelay = 60;
    localStorage.setItem(DEVICE_CLAIM_STORAGE_KEY, AUTH_ID);
    usePreferences.setState({ sessionUserId: 'perfil-local' });
    mount();
    await waitFor(() => {
      expect(useCloud.getState().state).toEqual({ status: 'signed-out', reason: 'other_device' });
    });
    // La sesión de la nube sigue en el almacenamiento y Supabase repite SIGNED_IN
    expect(fake.session).not.toBeNull();
    act(() => {
      fake.emit('SIGNED_IN');
    });
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(usePreferences.getState().sessionUserId).toBeNull();
    expect(fake.claims).toHaveLength(0);
    // Al llegar el SIGNED_OUT el motivo sigue ahí
    await waitFor(() => {
      expect(fake.session).toBeNull();
    });
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(useCloud.getState().state).toEqual({ status: 'signed-out', reason: 'other_device' });
    expect(fake.claims).toHaveLength(0);
  });

  it('si la red falla al revisar o al reclamar no saca al alumno', async () => {
    const fake = useFake(makeFakeCloud({ row: { device_id: 'otro-navegador' } }));
    fake.failCheck = 'error';
    localStorage.setItem(DEVICE_CLAIM_STORAGE_KEY, AUTH_ID);
    mount();
    await waitFor(() => {
      expect(fake.checks).toBe(1);
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(linked()).toBe(true);
    expect(usePreferences.getState().sessionUserId).not.toBeNull();
    expect(fake.signOuts).toHaveLength(0);

    cleanup();
    localStorage.clear();
    forgetDeviceClaim();
    useCloud.setState({ state: { status: 'checking' } });
    const failingClaim = useFake(makeFakeCloud());
    failingClaim.failClaim = 'throw';
    mount();
    await waitFor(() => {
      expect(linked()).toBe(true);
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(failingClaim.signOuts).toHaveLength(0);
    expect(useCloud.getState().state.status).toBe('linked');
  });

  it('después del aviso, volver a entrar reclama la cuenta y quita el motivo', async () => {
    const fake = useFake(makeFakeCloud({ row: { device_id: 'otro-navegador' } }));
    localStorage.setItem(DEVICE_CLAIM_STORAGE_KEY, AUTH_ID);
    mount();
    await waitFor(() => {
      expect(useCloud.getState().state).toEqual({ status: 'signed-out', reason: 'other_device' });
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    // El alumno abre un enlace nuevo del correo en este mismo navegador
    fake.session = { id: AUTH_ID, email: 'rick@example.com' };
    act(() => {
      fake.emit('SIGNED_IN');
    });
    await waitFor(() => {
      expect(fake.claims).toHaveLength(1);
    });
    expect(fake.row?.device_id).toBe(getDeviceId());
    await waitFor(() => {
      expect(linked()).toBe(true);
    });
  });

  it('si el límite de cambios rechaza el reclamo, sale, avisa con la hora y asienta el rechazo', async () => {
    const fake = useFake(makeFakeCloud());
    fake.failClaim = 'limit';
    fake.limitRetryAt = '2030-01-02T09:30:00Z';
    usePreferences.setState({ sessionUserId: 'perfil-local' });
    mount();
    const expected = {
      status: 'signed-out',
      reason: 'device_limit',
      retryAt: Date.parse('2030-01-02T09:30:00Z'),
    };
    await waitFor(() => {
      expect(useCloud.getState().state).toEqual(expected);
    });
    // Cierra solo la sesión de este navegador y no deja la cuenta marcada como reclamada
    expect(fake.signOuts).toEqual([{ scope: 'local' }]);
    expect(usePreferences.getState().sessionUserId).toBeNull();
    expect(localStorage.getItem(DEVICE_CLAIM_STORAGE_KEY)).toBeNull();
    expect(fake.row).toBeNull();
    expect(fake.rejections).toHaveLength(1);
    // El SIGNED_OUT que manda Supabase al terminar no borra el motivo del aviso
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(useCloud.getState().state).toEqual(expected);
  });

  it('pasada la hora del límite, volver a entrar reclama y quita el motivo', async () => {
    const fake = useFake(makeFakeCloud());
    fake.failClaim = 'limit';
    mount();
    await waitFor(() => {
      expect(useCloud.getState().state).toMatchObject({ reason: 'device_limit' });
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    // Ya pasó el tiempo y el alumno abre un enlace nuevo del correo
    fake.failClaim = 'none';
    fake.session = { id: AUTH_ID, email: 'rick@example.com' };
    act(() => {
      fake.emit('SIGNED_IN');
    });
    await waitFor(() => {
      expect(fake.claims).toHaveLength(1);
    });
    await waitFor(() => {
      expect(linked()).toBe(true);
    });
    expect(fake.row?.device_id).toBe(getDeviceId());
  });

  it('un fallo de red al reclamar no se confunde con el límite ni saca al alumno', async () => {
    const fake = useFake(makeFakeCloud());
    fake.failClaim = 'error';
    mount();
    await waitFor(() => {
      expect(linked()).toBe(true);
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(useCloud.getState().state.status).toBe('linked');
    expect(fake.signOuts).toHaveLength(0);
    expect(fake.rejections).toHaveLength(0);
    expect(usePreferences.getState().sessionUserId).not.toBeNull();
  });

  it('al entrar con una sesión nueva en este navegador reclama aunque ya hubiera reclamado antes', async () => {
    const fake = useFake(
      makeFakeCloud({ session: { id: AUTH_ID, email: 'a@b.mx', sessionId: 'ses-1' } }),
    );
    mount();
    await waitFor(() => {
      expect(fake.claims).toHaveLength(1);
    });
    expect(fake.row?.session_id).toBe('ses-1');
    // Otro dispositivo gana y, en este navegador, se abre un enlace nuevo del correo sin cerrar sesión
    fake.row = { device_id: 'otro-navegador', session_id: 'ses-otro' };
    fake.session = { id: AUTH_ID, email: 'a@b.mx', sessionId: 'ses-2' };
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + 120_000);
    act(() => {
      window.dispatchEvent(new Event('focus'));
    });
    vi.useRealTimers();
    await waitFor(() => {
      expect(fake.claims).toHaveLength(2);
    });
    expect(fake.row.device_id).toBe(getDeviceId());
    expect(fake.row.session_id).toBe('ses-2');
    expect(linked()).toBe(true);
    expect(fake.signOuts).toHaveLength(0);
  });

  it('al salir por voluntad propia no deja motivo y el siguiente ingreso reclama', async () => {
    const fake = useFake(makeFakeCloud());
    mount();
    await waitFor(() => {
      expect(fake.claims).toHaveLength(1);
    });
    expect(localStorage.getItem(DEVICE_CLAIM_STORAGE_KEY)).toBe(AUTH_ID);
    fake.session = null;
    act(() => {
      fake.emit('SIGNED_OUT');
    });
    await waitFor(() => {
      expect(useCloud.getState().state).toEqual({ status: 'signed-out' });
    });
    expect(localStorage.getItem(DEVICE_CLAIM_STORAGE_KEY)).toBeNull();
    fake.row = { device_id: 'otro-navegador' };
    fake.session = { id: AUTH_ID, email: 'rick@example.com' };
    act(() => {
      fake.emit('SIGNED_IN');
    });
    await waitFor(() => {
      expect(fake.claims).toHaveLength(2);
    });
    expect(fake.row.device_id).toBe(getDeviceId());
  });

  it('en la demostración no reclama ni revisa nada', async () => {
    const fake = useFake(makeFakeCloud());
    mount('demo');
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(fake.claims).toHaveLength(0);
    expect(fake.checks).toBe(0);
    expect(useCloud.getState().state.status).toBe('checking');
  });

  it('sin nube configurada nada cambia', async () => {
    holder.cloud = null;
    useCloud.setState({ state: { status: 'off' } });
    mount();
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(useCloud.getState().state).toEqual({ status: 'off' });
    expect(usePreferences.getState().sessionUserId).toBeNull();
  });
});
