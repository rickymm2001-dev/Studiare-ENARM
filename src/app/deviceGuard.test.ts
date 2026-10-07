// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { forgetDeviceClaim, getDeviceId } from '@/data/cloud/device';
import { makeFakeCloud } from '@/data/testing/fakeCloud';
import { DEVICE_CHECK_INTERVAL_MS, startDeviceGuard, type DeviceGuard } from './deviceGuard';

const AUTH_ID = '6f1c0f1e-6b4a-4d2a-9d55-6f2f3f6a1b10';

function setVisibility(state: 'hidden' | 'visible') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: state });
  document.dispatchEvent(new Event('visibilitychange'));
}

const guards: DeviceGuard[] = [];
function start(fake: ReturnType<typeof makeFakeCloud>, onOtherDevice = vi.fn()) {
  const guard = startDeviceGuard({ cloud: fake.cloud, authId: AUTH_ID, onOtherDevice });
  guards.push(guard);
  return { guard, onOtherDevice };
}

/** Deja correr las promesas pendientes sin mover el reloj */
const settle = () => vi.advanceTimersByTimeAsync(0);

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  forgetDeviceClaim();
  setVisibility('visible');
});

afterEach(() => {
  guards.splice(0).forEach((guard) => {
    guard.stop();
  });
  vi.useRealTimers();
  setVisibility('visible');
});

describe('vigilante del dispositivo', () => {
  it('al empezar reclama la cuenta si este navegador acaba de entrar', async () => {
    const fake = makeFakeCloud();
    const { guard, onOtherDevice } = start(fake);
    await expect(guard.first).resolves.toBe('claimed');
    expect(fake.claims).toHaveLength(1);
    expect(fake.row?.device_id).toBe(getDeviceId());
    expect(onOtherDevice).not.toHaveBeenCalled();
  });

  it('revisa cada 60 segundos mientras la pestaña está visible, sin reclamar otra vez', async () => {
    const fake = makeFakeCloud();
    const { onOtherDevice } = start(fake);
    await settle();
    expect(fake.checks).toBe(0);
    await vi.advanceTimersByTimeAsync(DEVICE_CHECK_INTERVAL_MS);
    expect(fake.checks).toBe(1);
    await vi.advanceTimersByTimeAsync(DEVICE_CHECK_INTERVAL_MS);
    expect(fake.checks).toBe(2);
    expect(fake.claims).toHaveLength(1);
    expect(onOtherDevice).not.toHaveBeenCalled();
  });

  it('con la pestaña oculta no revisa, y al volver a verla revisa de inmediato', async () => {
    const fake = makeFakeCloud();
    start(fake);
    await settle();
    setVisibility('hidden');
    await vi.advanceTimersByTimeAsync(DEVICE_CHECK_INTERVAL_MS * 3);
    expect(fake.checks).toBe(0);
    setVisibility('visible');
    await settle();
    expect(fake.checks).toBe(1);
  });

  it('al volver a enfocar la ventana revisa', async () => {
    const fake = makeFakeCloud();
    start(fake);
    await vi.advanceTimersByTimeAsync(10_000);
    window.dispatchEvent(new Event('focus'));
    await settle();
    expect(fake.checks).toBe(1);
  });

  it('un cambio de visibilidad y un foco seguidos hacen una sola revisión', async () => {
    const fake = makeFakeCloud();
    start(fake);
    await vi.advanceTimersByTimeAsync(10_000);
    setVisibility('visible');
    window.dispatchEvent(new Event('focus'));
    await settle();
    expect(fake.checks).toBe(1);
    // Aun con la primera ya terminada, un foco poco después no repite la consulta
    await vi.advanceTimersByTimeAsync(1_000);
    window.dispatchEvent(new Event('focus'));
    await settle();
    expect(fake.checks).toBe(1);
    // Pasados unos segundos sí vuelve a revisar
    await vi.advanceTimersByTimeAsync(5_000);
    window.dispatchEvent(new Event('focus'));
    await settle();
    expect(fake.checks).toBe(2);
  });

  it('si ganó otro dispositivo avisa una sola vez y deja de revisar', async () => {
    const fake = makeFakeCloud();
    const { onOtherDevice } = start(fake);
    await settle();
    fake.row = { device_id: 'otro-navegador' };
    await vi.advanceTimersByTimeAsync(DEVICE_CHECK_INTERVAL_MS);
    expect(onOtherDevice).toHaveBeenCalledTimes(1);
    const checks = fake.checks;
    await vi.advanceTimersByTimeAsync(DEVICE_CHECK_INTERVAL_MS * 3);
    window.dispatchEvent(new Event('focus'));
    setVisibility('visible');
    await settle();
    expect(fake.checks).toBe(checks);
    expect(onOtherDevice).toHaveBeenCalledTimes(1);
    // No le quitó la cuenta al otro
    expect(fake.row.device_id).toBe('otro-navegador');
  });

  it('si al abrir la app otro dispositivo ya tenía la cuenta, avisa en la primera revisión', async () => {
    const fake = makeFakeCloud();
    // Este navegador ya había reclamado antes, así que no reclama de nuevo
    const first = start(fake);
    await first.guard.first;
    first.guard.stop();
    fake.row = { device_id: 'otro-navegador' };
    const { guard, onOtherDevice } = start(fake);
    await expect(guard.first).resolves.toBe('other');
    expect(onOtherDevice).toHaveBeenCalledTimes(1);
  });

  it('un fallo de red no avisa ni se detiene, y el siguiente intento sí revisa', async () => {
    const fake = makeFakeCloud();
    const { onOtherDevice } = start(fake);
    await settle();
    fake.row = { device_id: 'otro-navegador' };
    fake.failCheck = 'error';
    await vi.advanceTimersByTimeAsync(DEVICE_CHECK_INTERVAL_MS);
    fake.failCheck = 'throw';
    await vi.advanceTimersByTimeAsync(DEVICE_CHECK_INTERVAL_MS);
    expect(onOtherDevice).not.toHaveBeenCalled();
    fake.failCheck = 'none';
    await vi.advanceTimersByTimeAsync(DEVICE_CHECK_INTERVAL_MS);
    expect(onOtherDevice).toHaveBeenCalledTimes(1);
  });

  it('si no se pudo reclamar al empezar, lo reintenta en la siguiente revisión', async () => {
    const fake = makeFakeCloud();
    fake.failClaim = 'error';
    const { guard } = start(fake);
    await expect(guard.first).resolves.toBe('failed');
    fake.failClaim = 'none';
    await vi.advanceTimersByTimeAsync(DEVICE_CHECK_INTERVAL_MS);
    expect(fake.claims).toHaveLength(1);
  });

  it('un error al avisar no deja una promesa sin atender', async () => {
    const fake = makeFakeCloud();
    const failing = vi.fn(() => {
      throw new Error('falló al salir');
    });
    const { guard } = start(fake, failing);
    await guard.first;
    fake.row = { device_id: 'otro-navegador' };
    await vi.advanceTimersByTimeAsync(DEVICE_CHECK_INTERVAL_MS);
    expect(failing).toHaveBeenCalledTimes(1);
  });

  it('stop quita el reloj y los avisos del navegador', async () => {
    const fake = makeFakeCloud();
    const { guard } = start(fake);
    await settle();
    guard.stop();
    await vi.advanceTimersByTimeAsync(DEVICE_CHECK_INTERVAL_MS * 3);
    window.dispatchEvent(new Event('focus'));
    setVisibility('visible');
    await settle();
    expect(fake.checks).toBe(0);
  });
});
