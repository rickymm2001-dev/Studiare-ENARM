// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEVICE_CLAIM_STORAGE_KEY, forgetDeviceClaim, getDeviceId } from '@/data/cloud/device';
import { GOOGLE_REDIRECT_KEY } from '@/data/cloud/oauth';
import { PENDING_SIGNUP_KEY, savePendingSignup } from '@/data/cloud/pendingSignup';
import { useDataApi, type DataApi } from '@/data/context';
import {
  completeSignup,
  EMPTY_DETAILS,
  findAccountByEmail,
  registerAccount,
} from '@/data/usecases/account';
import { acceptedNoticeVersion, decideAllConsents } from '@/data/usecases/profile';
import { DataProvider } from '@/data/DataProvider';
import { makeFakeCloud, type FakeCloud } from '@/data/testing/fakeCloud';
import { PRIVACY_NOTICE_VERSION } from '@/config/legal';
import { FLAGS_KEY } from '@/config/featureFlags';
import { OVERRIDES_KEY } from '@/config/overridesStore';
import { useAccess } from './accessState';
import { CloudBridge } from './cloud';
import { useCloud } from './cloudState';
import { useConfigUpdate } from './configUpdate';
import { DEFAULT_PREFERENCES, usePreferences } from './preferences';

// getCloud devuelve el cliente falso que cada prueba arma. Sin él es como no tener nube configurada
const holder = vi.hoisted((): { cloud: unknown } => ({ cloud: null }));
vi.mock('@/data/cloud/client', () => ({
  getCloud: () => holder.cloud,
  cloudConfigured: () => holder.cloud !== null,
  loadCloud: () => Promise.resolve(holder.cloud),
}));

const AUTH_ID = '6f1c0f1e-6b4a-4d2a-9d55-6f2f3f6a1b10';
const captured: { api?: DataApi } = {};

function Capture() {
  const value = useDataApi();
  useEffect(() => {
    captured.api = value;
  });
  return null;
}

function mount(kind: 'real' | 'demo' = 'real') {
  return render(
    <DataProvider kind={kind}>
      <Capture />
      <CloudBridge />
    </DataProvider>,
  );
}

/**
 * La nube de la prueba. Por omisión la cuenta ya completó su registro en otro dispositivo y aceptó el
 * aviso, como las cuentas de antes de B9. Con registered en false la cuenta nunca lo completó
 */
function useFake(fake: FakeCloud, options: { registered?: boolean } = {}) {
  if (options.registered ?? true) fake.acceptances = [PRIVACY_NOTICE_VERSION];
  holder.cloud = fake.cloud;
  return fake;
}

const linked = () => useCloud.getState().state.status === 'linked';

beforeEach(() => {
  localStorage.clear();
  forgetDeviceClaim();
  usePreferences.setState(DEFAULT_PREFERENCES);
  useCloud.setState({ state: { status: 'checking' } });
  useConfigUpdate.setState({ pending: false });
});

afterEach(() => {
  cleanup();
  useConfigUpdate.setState({ pending: false });
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
    // El perfil se abre cuando se sabe que la cuenta ya completó su registro (B9)
    await waitFor(() => {
      expect(usePreferences.getState().sessionUserId).not.toBeNull();
    });
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
    // El perfil se abre cuando se sabe que la cuenta ya completó su registro (B9)
    await waitFor(() => {
      expect(usePreferences.getState().sessionUserId).not.toBeNull();
    });
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
    // El cierre de la sesión no termina hasta que la prueba lo suelte. Así el SIGNED_IN rezagado
    // llega siempre a la mitad del cierre, sin depender de un temporizador que pierde la carrera
    // cuando la máquina está cargada (B1 del plan del cambio)
    fake.holdSignOut = true;
    localStorage.setItem(DEVICE_CLAIM_STORAGE_KEY, AUTH_ID);
    usePreferences.setState({ sessionUserId: 'perfil-local' });
    mount();
    await waitFor(() => {
      expect(useCloud.getState().state).toEqual({ status: 'signed-out', reason: 'other_device' });
    });
    await waitFor(() => {
      expect(fake.signOuts).toHaveLength(1);
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
    act(() => {
      fake.releaseSignOut();
    });
    await waitFor(() => {
      expect(fake.session).toBeNull();
    });
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(useCloud.getState().state).toEqual({ status: 'signed-out', reason: 'other_device' });
    expect(fake.claims).toHaveLength(0);
  });

  it('cerrar sesión mientras la revisión de la nube espera respuesta no la vuelve a abrir', async () => {
    const fake = useFake(makeFakeCloud());
    // La nube tarda en responder a la primera revisión, como al abrir la app con una red lenta
    fake.holdSession = true;
    usePreferences.setState({ sessionUserId: 'perfil-local' });
    mount();
    await waitFor(() => {
      expect(fake.heldSessionReads).toBe(1);
    });
    // El alumno cierra la sesión antes de que llegue la respuesta, que todavía trae su sesión
    fake.holdSession = false;
    act(() => {
      usePreferences.getState().signOut();
    });
    await waitFor(() => {
      expect(fake.signOuts).toEqual([{ scope: 'local' }]);
    });
    await waitFor(() => {
      expect(useCloud.getState().state).toEqual({ status: 'signed-out' });
    });
    // Llega la respuesta de la primera revisión, que sí traía la sesión y lee el rol de la cuenta
    act(() => {
      fake.releaseSession();
    });
    await waitFor(() => {
      expect(fake.roleReads).toBe(1);
    });
    // Unir la cuenta con el perfil local tarda lo que tarda la base del navegador, así que se le da
    // tiempo de sobra para que, si la revisión siguiera, se notara
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(usePreferences.getState().sessionUserId).toBeNull();
    expect(fake.claims).toHaveLength(0);
    expect(useCloud.getState().state).toEqual({ status: 'signed-out' });
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
    // El perfil se abre cuando se sabe que la cuenta ya completó su registro (B9)
    await waitFor(() => {
      expect(usePreferences.getState().sessionUserId).not.toBeNull();
    });
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
    // El perfil se abre cuando se sabe que la cuenta ya completó su registro (B9)
    await waitFor(() => {
      expect(usePreferences.getState().sessionUserId).not.toBeNull();
    });
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

describe('CloudBridge y el aviso de privacidad', () => {
  it('registra la versión del aviso bajo la que se creó su perfil en Crear cuenta, una sola vez', async () => {
    const EMAIL = 'con.formulario@example.com';
    const fake = useFake(makeFakeCloud({ session: null }), { registered: false });
    mount();
    await waitFor(() => {
      expect(captured.api).toBeDefined();
    });
    const created = await registerAccount(captured.api as DataApi, {
      alias: 'Formulario',
      email: EMAIL,
      dailyGoal: { metric: 'cards', value: 20 },
      details: EMPTY_DETAILS,
      signup: { adultConfirmedAt: '2026-10-13T09:00:00.000Z' },
    });
    if (!created.ok) throw new Error('no se creó');
    // Abre el enlace en este mismo navegador
    fake.session = { id: AUTH_ID, email: EMAIL };
    act(() => {
      fake.emit('SIGNED_IN');
    });
    await waitFor(() => {
      expect(fake.acceptances).toEqual([PRIVACY_NOTICE_VERSION]);
    });
    expect(usePreferences.getState().sessionUserId).toBe(created.user.id);
    act(() => {
      fake.emit('SIGNED_IN');
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(fake.acceptances).toEqual([PRIVACY_NOTICE_VERSION]);
  });

  it('un perfil que nació sin formulario no acepta el aviso por la persona', async () => {
    const fake = useFake(
      makeFakeCloud({ session: { id: AUTH_ID, email: 'sin.formulario@example.com' } }),
      { registered: false },
    );
    mount();
    await waitFor(() => {
      expect(useAccess.getState().signup.status).toBe('required');
    });
    expect(fake.claims).toHaveLength(1);
    expect(fake.acceptances).toEqual([]);
  });
});

describe('CloudBridge y el rol de la cuenta', () => {
  it('aplica el rol que da el servidor', async () => {
    const fake = useFake(makeFakeCloud());
    fake.role = 'physician';
    mount();
    await waitFor(() => {
      expect(usePreferences.getState().role).toBe('physician');
    });
    expect(linked()).toBe(true);
  });

  it('si no se puede leer el rol no baja a alumno a un médico que solo perdió la conexión', async () => {
    const fake = useFake(makeFakeCloud());
    fake.failRole = 'error';
    usePreferences.setState({ role: 'physician' });
    mount();
    await waitFor(() => {
      expect(useCloud.getState().state.status).toBe('error');
    });
    expect(usePreferences.getState().role).toBe('physician');
  });

  it('con el token vencido y sin red no cierra la sesión ni baja de rol, y se reconecta al volver la red', async () => {
    const fake = useFake(makeFakeCloud());
    fake.failSession = true;
    fake.role = 'physician';
    usePreferences.setState({ role: 'physician' });
    mount();
    await waitFor(() => {
      expect(useCloud.getState().state.status).toBe('error');
    });
    expect(usePreferences.getState().role).toBe('physician');
    fake.failSession = false;
    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    await waitFor(() => {
      expect(linked()).toBe(true);
    });
    expect(usePreferences.getState().role).toBe('physician');
  });

  it('cuando vuelve la conexión lee el rol y se conecta sin recargar', async () => {
    const fake = useFake(makeFakeCloud());
    fake.failRole = 'throw';
    fake.role = 'admin';
    usePreferences.setState({ role: 'admin' });
    mount();
    await waitFor(() => {
      expect(useCloud.getState().state.status).toBe('error');
    });
    fake.failRole = 'none';
    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    await waitFor(() => {
      expect(linked()).toBe(true);
    });
    expect(usePreferences.getState().role).toBe('admin');
  });

  it('sin sesión nadie tiene un rol, aunque este dispositivo guarde otro', async () => {
    useFake(makeFakeCloud({ session: null }));
    usePreferences.setState({ role: 'admin' });
    mount();
    await waitFor(() => {
      expect(useCloud.getState().state.status).toBe('signed-out');
    });
    expect(usePreferences.getState().role).toBe('student');
  });
});

describe('CloudBridge y la configuración del admin', () => {
  it('copia la configuración del servidor al navegador y pide recargar para aplicarla', async () => {
    const fake = useFake(makeFakeCloud());
    fake.overrides = { aiCostEstimateUsd: 4 };
    mount();
    await waitFor(() => {
      expect(useConfigUpdate.getState().pending).toBe(true);
    });
    expect(JSON.parse(localStorage.getItem(OVERRIDES_KEY) ?? 'null')).toEqual({
      aiCostEstimateUsd: 4,
    });
  });

  it('si el navegador ya tiene la misma configuración no pide recargar', async () => {
    const fake = useFake(makeFakeCloud());
    fake.overrides = { aiCostEstimateUsd: 4 };
    localStorage.setItem(OVERRIDES_KEY, JSON.stringify({ aiCostEstimateUsd: 4 }));
    mount();
    await waitFor(() => {
      expect(linked()).toBe(true);
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(useConfigUpdate.getState().pending).toBe(false);
  });

  it('si el servidor no tiene cambios borra los que quedaron en el navegador', async () => {
    useFake(makeFakeCloud());
    localStorage.setItem(OVERRIDES_KEY, JSON.stringify({ aiCostEstimateUsd: 9 }));
    mount();
    await waitFor(() => {
      expect(useConfigUpdate.getState().pending).toBe(true);
    });
    expect(localStorage.getItem(OVERRIDES_KEY)).toBeNull();
  });
});

describe('CloudBridge y las banderas de lanzamiento (D-119)', () => {
  it('copia las banderas del servidor al navegador y pide recargar para aplicarlas', async () => {
    const fake = useFake(makeFakeCloud());
    fake.flags = { demoTools: false };
    mount();
    await waitFor(() => {
      expect(JSON.parse(localStorage.getItem(FLAGS_KEY) ?? 'null')).toEqual({ demoTools: false });
    });
    await waitFor(() => {
      expect(useConfigUpdate.getState().pending).toBe(true);
    });
  });

  it('también las recibe quien no ha entrado, porque la tabla se lee sin sesión', async () => {
    const fake = useFake(makeFakeCloud());
    fake.session = null;
    fake.flags = { demoTools: false };
    mount();
    await waitFor(() => {
      expect(JSON.parse(localStorage.getItem(FLAGS_KEY) ?? 'null')).toEqual({ demoTools: false });
    });
    expect(linked()).toBe(false);
  });

  it('con las mismas banderas en el navegador no pide recargar, y sin banderas en el servidor borra la copia', async () => {
    const fake = useFake(makeFakeCloud());
    fake.flags = { demoTools: true };
    localStorage.setItem(FLAGS_KEY, JSON.stringify({ demoTools: true }));
    mount();
    await waitFor(() => {
      expect(linked()).toBe(true);
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(useConfigUpdate.getState().pending).toBe(false);

    cleanup();
    localStorage.setItem(FLAGS_KEY, JSON.stringify({ demoTools: false }));
    useFake(makeFakeCloud());
    mount();
    await waitFor(() => {
      expect(localStorage.getItem(FLAGS_KEY)).toBeNull();
    });
  });
});

describe('CloudBridge y el acceso (B9)', () => {
  /** Prende el segundo factor del equipo en el servidor y en la copia del navegador */
  const requireMfa = (fake: FakeCloud) => {
    fake.flags = { requireMfa: true };
    localStorage.setItem(FLAGS_KEY, JSON.stringify({ requireMfa: true }));
  };

  afterEach(() => {
    useAccess.setState({
      mfa: { status: 'not-required' },
      signup: { status: 'none' },
      oauthError: null,
    });
    sessionStorage.clear();
    window.history.replaceState(null, '', '/');
  });

  it('con la bandera, un médico sin factor ve el alta y uno con factor ve el código', async () => {
    const fake = useFake(makeFakeCloud());
    fake.role = 'physician';
    requireMfa(fake);
    mount();
    await waitFor(() => {
      expect(useAccess.getState().mfa).toEqual({ status: 'enroll' });
    });

    cleanup();
    useAccess.setState({ mfa: { status: 'not-required' } });
    fake.mfa.factors = [{ id: 'f1', factor_type: 'totp', status: 'verified' }];
    mount();
    await waitFor(() => {
      expect(useAccess.getState().mfa).toEqual({ status: 'challenge', factorId: 'f1' });
    });
  });

  it('una sesión que ya dio su código no se vuelve a bloquear', async () => {
    const fake = useFake(makeFakeCloud());
    fake.role = 'admin';
    fake.mfa.level = 'aal2';
    fake.mfa.factors = [{ id: 'f1', factor_type: 'totp', status: 'verified' }];
    requireMfa(fake);
    mount();
    await waitFor(() => {
      expect(useAccess.getState().mfa).toEqual({ status: 'verified' });
    });
  });

  it('el alumno nunca pasa por el segundo factor, y sin la bandera tampoco el equipo', async () => {
    const student = useFake(makeFakeCloud());
    requireMfa(student);
    mount();
    await waitFor(() => {
      expect(student.claims).toHaveLength(1);
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(useAccess.getState().mfa).toEqual({ status: 'not-required' });
    expect(student.mfa.enrollCalls).toBe(0);

    cleanup();
    localStorage.clear();
    const admin = useFake(makeFakeCloud());
    admin.role = 'admin';
    mount();
    await waitFor(() => {
      expect(admin.claims).toHaveLength(1);
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(useAccess.getState().mfa).toEqual({ status: 'not-required' });
  });

  // Cada prueba con su propio correo, porque los perfiles de este navegador quedan entre pruebas
  const googleSession = (email: string) =>
    makeFakeCloud({ session: { id: AUTH_ID, email, provider: 'google' } });

  it('una cuenta de Google nace con lo que el alumno llenó en Crear cuenta antes de ir a Google', async () => {
    const fake = useFake(googleSession('nueva.google@example.com'), { registered: false });
    savePendingSignup({
      alias: 'Ricky',
      dailyGoal: { metric: 'cards', value: 30 },
      details: { ...EMPTY_DETAILS, targetSpecialty: 'pediatrics' },
      adultConfirmedAt: '2026-10-13T09:00:00.000Z',
      heardFrom: { channel: 'friend', influencerCode: null },
      consents: {},
    });
    mount();
    await waitFor(() => {
      expect(fake.accountUpdates.length).toBeGreaterThan(0);
    });
    const userId = usePreferences.getState().sessionUserId ?? '';
    expect(useAccess.getState().signup).toEqual({ status: 'none' });
    expect(sessionStorage.getItem(PENDING_SIGNUP_KEY)).toBeNull();
    // La confirmación de edad llega a la nube y el aviso queda aceptado
    await waitFor(() => {
      expect(fake.acceptances).toEqual([PRIVACY_NOTICE_VERSION]);
    });
    expect(
      fake.accountUpdates.some((row) => row.adult_confirmed_at === '2026-10-13T09:00:00.000Z'),
    ).toBe(true);
    expect(userId).not.toBe('');
  });

  it.each([
    ['google', 'sin.registro@example.com'],
    ['email', 'correo.invitado@example.com'],
  ] as const)(
    'una cuenta nueva que entra sin formulario con %s completa su registro antes de nada',
    async (provider, email) => {
      const fake = useFake(makeFakeCloud({ session: { id: AUTH_ID, email, provider } }), {
        registered: false,
      });
      fake.remoteAccount = { adult_confirmed_at: null };
      fake.sync = 'ok';
      mount();
      await waitFor(() => {
        expect(useAccess.getState().signup.status).toBe('required');
      });
      // Reclama el dispositivo, pero no abre el perfil, no sube la cuenta, no acepta el aviso por la
      // persona y no sincroniza
      expect(fake.claims).toHaveLength(1);
      expect(usePreferences.getState().sessionUserId).toBeNull();
      expect(fake.accountUpdates).toEqual([]);
      expect(fake.acceptances).toEqual([]);
      expect(fake.rpcCalls.filter((name) => name.startsWith('sync_'))).toEqual([]);
      const account = await findAccountByEmail(captured.api as DataApi, email);
      expect(useAccess.getState().signup).toEqual({ status: 'required', userId: account?.userId });
      expect(
        await acceptedNoticeVersion(captured.api as DataApi, account?.userId ?? ''),
      ).toBeNull();
    },
  );

  it('al guardar Completa tu registro el puente abre el perfil, sube la cuenta, registra el aviso y sincroniza', async () => {
    const EMAIL = 'completa@example.com';
    const fake = useFake(makeFakeCloud({ session: { id: AUTH_ID, email: EMAIL } }), {
      registered: false,
    });
    fake.remoteAccount = { adult_confirmed_at: null };
    fake.sync = 'ok';
    mount();
    await waitFor(() => {
      expect(useAccess.getState().signup.status).toBe('required');
    });
    const api = captured.api as DataApi;
    const account = await findAccountByEmail(api, EMAIL);
    const user = account ? await api.repos.users.get(account.userId) : undefined;
    if (!account || !user) throw new Error('falta el perfil');
    // Lo que guarda la pantalla
    await completeSignup(api, account, { adultConfirmedAt: '2026-10-13T11:00:00.000Z' });
    await decideAllConsents(api, user, { party: true });
    act(() => {
      useAccess.getState().finishSignup();
    });
    await waitFor(() => {
      expect(usePreferences.getState().sessionUserId).toBe(account.userId);
    });
    await waitFor(() => {
      expect(fake.acceptances).toEqual([PRIVACY_NOTICE_VERSION]);
    });
    expect(
      fake.accountUpdates.some((row) => row.adult_confirmed_at === '2026-10-13T11:00:00.000Z'),
    ).toBe(true);
    await waitFor(() => {
      expect(fake.rpcCalls).toContain('sync_clock');
    });
    expect(useAccess.getState().signup).toEqual({ status: 'none' });
  });

  it('si otro dispositivo ya completó el registro, copia la edad y entra sin pedirlo', async () => {
    const EMAIL = 'otro.dispositivo@example.com';
    const fake = useFake(makeFakeCloud({ session: { id: AUTH_ID, email: EMAIL } }));
    fake.remoteAccount = { adult_confirmed_at: '2026-10-12T09:00:00.000Z' };
    mount();
    await waitFor(() => {
      expect(usePreferences.getState().sessionUserId).not.toBeNull();
    });
    expect(useAccess.getState().signup).toEqual({ status: 'none' });
    const account = await findAccountByEmail(captured.api as DataApi, EMAIL);
    expect(account?.adultConfirmedAt).toBe('2026-10-12T09:00:00.000Z');
    // No agrega otra aceptación, la que ya había basta
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(fake.acceptances).toEqual([PRIVACY_NOTICE_VERSION]);
  });

  it('si la nube no se puede leer no deja pasar, y al volver a intentarlo sigue', async () => {
    const EMAIL = 'sin.red@example.com';
    const fake = useFake(makeFakeCloud({ session: { id: AUTH_ID, email: EMAIL } }), {
      registered: false,
    });
    fake.failAccountRead = 'error';
    mount();
    await waitFor(() => {
      expect(useAccess.getState().signup.status).toBe('unknown');
    });
    expect(usePreferences.getState().sessionUserId).toBeNull();
    expect(useCloud.getState().state.status).toBe('linked');
    expect(fake.accountUpdates).toEqual([]);

    fake.failAccountRead = 'none';
    fake.remoteAccount = { adult_confirmed_at: '2026-10-12T09:00:00.000Z' };
    act(() => {
      useAccess.getState().recheck?.();
    });
    await waitFor(() => {
      expect(useAccess.getState().signup).toEqual({ status: 'none' });
    });
    expect(usePreferences.getState().sessionUserId).not.toBeNull();
  });

  it('mientras revisa el registro no deja abierto el perfil de otra persona en este navegador', async () => {
    const fake = useFake(
      makeFakeCloud({ session: { id: AUTH_ID, email: 'nueva.persona@example.com' } }),
      { registered: false },
    );
    usePreferences.setState({ sessionUserId: 'perfil-de-otra-persona' });
    mount();
    await waitFor(() => {
      expect(useAccess.getState().signup.status).toBe('required');
    });
    expect(usePreferences.getState().sessionUserId).toBeNull();
    expect(fake.signOuts).toEqual([]);
  });

  it('un registro pendiente no se aplica a una cuenta que entró con el correo', async () => {
    useFake(makeFakeCloud());
    savePendingSignup({
      alias: 'Intruso',
      dailyGoal: { metric: 'cards', value: 30 },
      details: EMPTY_DETAILS,
      adultConfirmedAt: '2026-10-13T09:00:00.000Z',
      heardFrom: null,
      consents: {},
    });
    mount();
    await waitFor(() => {
      expect(linked()).toBe(true);
    });
    expect(sessionStorage.getItem(PENDING_SIGNUP_KEY)).toBeNull();
  });

  it('si Google regresó con un error lo deja para el aviso, olvida el registro pendiente y limpia la dirección', async () => {
    useFake(makeFakeCloud({ session: null }));
    savePendingSignup({
      alias: 'Ricky',
      dailyGoal: { metric: 'cards', value: 30 },
      details: EMPTY_DETAILS,
      adultConfirmedAt: '2026-10-13T09:00:00.000Z',
      heardFrom: null,
      consents: {},
    });
    // Esta pestaña salió a Google
    sessionStorage.setItem(GOOGLE_REDIRECT_KEY, String(Date.now()));
    window.history.replaceState(
      null,
      '',
      '/?error=access_denied&error_code=&error_description=no+tiene+una+(invitation_required)#error=access_denied&error_description=no+tiene+una+(invitation_required)&sb=',
    );
    mount();
    await waitFor(() => {
      expect(useAccess.getState().oauthError).toBe('invitation_required');
    });
    expect(window.location.search).toBe('');
    expect(window.location.hash).toBe('');
    expect(sessionStorage.getItem(PENDING_SIGNUP_KEY)).toBeNull();
    expect(sessionStorage.getItem(GOOGLE_REDIRECT_KEY)).toBeNull();
  });

  it('el enlace del correo vencido se avisa como del correo, también con Google apagado', async () => {
    useFake(makeFakeCloud({ session: null }));
    window.history.replaceState(
      null,
      '',
      '/#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired&sb=',
    );
    mount();
    await waitFor(() => {
      expect(useAccess.getState().oauthError).toBe('link_expired');
    });
    expect(window.location.hash).toBe('');
  });

  it('si Google regresó con éxito la marca de la salida se borra', async () => {
    useFake(makeFakeCloud({ session: null }));
    sessionStorage.setItem(GOOGLE_REDIRECT_KEY, String(Date.now()));
    mount();
    await waitFor(() => {
      expect(useCloud.getState().state.status).toBe('signed-out');
    });
    expect(sessionStorage.getItem(GOOGLE_REDIRECT_KEY)).toBeNull();
    expect(useAccess.getState().oauthError).toBeNull();
  });
});
