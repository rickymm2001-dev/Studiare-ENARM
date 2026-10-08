// Vigilante del dispositivo único. Revisa con el servidor al empezar, al volver a enfocar la
// pestaña y cada minuto mientras esté visible. Si ganó otro dispositivo, o si el servidor no dejó
// cambiar de dispositivo por el límite diario, avisa una sola vez y se detiene. Los fallos de red no
// hacen nada. No usa React para poder probarlo con relojes falsos.
import type { SupabaseClient } from '@supabase/supabase-js';
import { reconcileDevice, type DeviceOutcome } from '@/data/cloud/device';

/** Cada cuánto revisa mientras la pestaña está visible */
export const DEVICE_CHECK_INTERVAL_MS = 60_000;
/** Dos avisos seguidos de visibilidad y de foco no hacen dos consultas */
const MIN_GAP_MS = 5_000;
/** Una revisión sin respuesta por tanto tiempo ya no bloquea a las siguientes */
const STALE_CHECK_MS = 30_000;

export interface DeviceGuardOptions {
  cloud: SupabaseClient;
  authId: string;
  /** Qué hacer cuando ganó otro dispositivo. Se llama una sola vez */
  onOtherDevice: () => void | Promise<void>;
  /** Qué hacer cuando el servidor rechazó el cambio por el límite diario. retryAt, en ms, o null */
  onDeviceLimit: (retryAt: number | null) => void | Promise<void>;
  intervalMs?: number;
}

export interface DeviceGuard {
  stop: () => void;
  /** Resultado de la primera revisión, que reclama la cuenta si este navegador acaba de entrar */
  first: Promise<DeviceOutcome>;
}

export function startDeviceGuard(options: DeviceGuardOptions): DeviceGuard {
  const {
    cloud,
    authId,
    onOtherDevice,
    onDeviceLimit,
    intervalMs = DEVICE_CHECK_INTERVAL_MS,
  } = options;
  const state = { stopped: false, running: false, lastStart: Number.NEGATIVE_INFINITY };

  const check = async (): Promise<DeviceOutcome> => {
    state.running = true;
    state.lastStart = Date.now();
    try {
      const outcome = await reconcileDevice(cloud, authId);
      if (state.stopped) return { status: 'failed' };
      if (outcome.status === 'other') {
        stop();
        await onOtherDevice();
      } else if (outcome.status === 'limit') {
        stop();
        await onDeviceLimit(outcome.retryAt);
      }
      return outcome;
    } catch {
      // Un error inesperado no saca al alumno
      return { status: 'failed' };
    } finally {
      state.running = false;
    }
  };

  /** Revisión por un aviso del navegador o del reloj. Salta las que se encimarían */
  const tick = () => {
    if (state.stopped || document.visibilityState !== 'visible') return;
    const elapsed = Date.now() - state.lastStart;
    if (elapsed < MIN_GAP_MS || (state.running && elapsed < STALE_CHECK_MS)) return;
    void check();
  };

  const timer = window.setInterval(tick, intervalMs);
  document.addEventListener('visibilitychange', tick);
  window.addEventListener('focus', tick);

  function stop() {
    state.stopped = true;
    window.clearInterval(timer);
    document.removeEventListener('visibilitychange', tick);
    window.removeEventListener('focus', tick);
  }

  return { stop, first: check() };
}
