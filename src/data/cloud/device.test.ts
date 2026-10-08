// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeAccessToken, makeFakeCloud } from '../testing/fakeCloud';
import {
  checkDevice,
  claimDevice,
  claimedSessionId,
  DEVICE_CLAIM_STORAGE_KEY,
  DEVICE_ID_STORAGE_KEY,
  DEVICE_LIMIT_ERROR_CODE,
  DEVICE_SESSION_STORAGE_KEY,
  describeUserAgent,
  deviceLabel,
  deviceVerdict,
  forgetDeviceClaim,
  hasClaimedDevice,
  rememberClaimedSession,
  rememberDeviceClaim,
  sessionIdFromToken,
} from './device';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const AUTH_ID = '6f1c0f1e-6b4a-4d2a-9d55-6f2f3f6a1b10';

/** Almacenamiento en memoria con la forma de localStorage */
function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    removeItem: (key: string) => {
      data.delete(key);
    },
    data,
  };
}

/** Almacenamiento bloqueado, como con los datos de sitios desactivados */
const blockedStorage = {
  getItem: () => {
    throw new Error('bloqueado');
  },
  setItem: () => {
    throw new Error('bloqueado');
  },
  removeItem: () => {
    throw new Error('bloqueado');
  },
};

/** Módulo nuevo, sin el id ni la marca en memoria de pruebas anteriores. Es un navegador nuevo */
async function freshDevice() {
  vi.resetModules();
  return import('./device');
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('veredicto del dispositivo', () => {
  it('sin fila nadie ha reclamado la cuenta', () => {
    expect(deviceVerdict(null, 'dev-a')).toBe('unclaimed');
    expect(deviceVerdict(undefined, 'dev-a')).toBe('unclaimed');
  });

  it('la fila con este id es mine y con otro id es other', () => {
    expect(deviceVerdict({ device_id: 'dev-a' }, 'dev-a')).toBe('mine');
    expect(deviceVerdict({ device_id: 'dev-b' }, 'dev-a')).toBe('other');
  });

  it('distingue mayúsculas y no recorta espacios', () => {
    expect(deviceVerdict({ device_id: 'DEV-A' }, 'dev-a')).toBe('other');
    expect(deviceVerdict({ device_id: 'dev-a ' }, 'dev-a')).toBe('other');
  });

  it('un id vacío, de la fila o de este navegador, nunca saca a nadie', () => {
    expect(deviceVerdict({ device_id: '' }, 'dev-a')).toBe('unclaimed');
    expect(deviceVerdict({ device_id: 'dev-b' }, '')).toBe('unclaimed');
  });
});

describe('id del dispositivo', () => {
  it('crea un id aleatorio, lo guarda con la clave enarm.device-id.v1 y lo reutiliza', async () => {
    const { getDeviceId } = await freshDevice();
    const storage = memoryStorage();
    const id = getDeviceId(storage);
    expect(id).toMatch(UUID);
    expect(storage.data.get('enarm.device-id.v1')).toBe(id);
    expect(DEVICE_ID_STORAGE_KEY).toBe('enarm.device-id.v1');
    expect(getDeviceId(storage)).toBe(id);
  });

  it('tras recargar la página lee el mismo id guardado', async () => {
    const storage = memoryStorage();
    const first = (await freshDevice()).getDeviceId(storage);
    const second = (await freshDevice()).getDeviceId(storage);
    expect(second).toBe(first);
  });

  it('dos navegadores distintos no comparten id', async () => {
    const first = (await freshDevice()).getDeviceId(memoryStorage());
    const second = (await freshDevice()).getDeviceId(memoryStorage());
    expect(second).not.toBe(first);
  });

  it('por defecto usa localStorage', async () => {
    const { getDeviceId } = await freshDevice();
    const id = getDeviceId();
    expect(localStorage.getItem('enarm.device-id.v1')).toBe(id);
  });

  it('sin almacenamiento usa un id en memoria que no cambia durante la página', async () => {
    const { getDeviceId } = await freshDevice();
    const id = getDeviceId(null);
    expect(id).toMatch(UUID);
    expect(getDeviceId(null)).toBe(id);
  });

  it('con el almacenamiento bloqueado no lanza y el id en memoria no cambia', async () => {
    const { getDeviceId } = await freshDevice();
    const id = getDeviceId(blockedStorage);
    expect(id).toMatch(UUID);
    expect(getDeviceId(blockedStorage)).toBe(id);
  });

  it('un valor guardado vacío o demasiado largo se reemplaza por un id nuevo', async () => {
    for (const bad of ['', '   ', 'x'.repeat(81)]) {
      const { getDeviceId } = await freshDevice();
      const storage = memoryStorage({ [DEVICE_ID_STORAGE_KEY]: bad });
      const id = getDeviceId(storage);
      expect(id).toMatch(UUID);
      expect(storage.data.get(DEVICE_ID_STORAGE_KEY)).toBe(id);
    }
  });

  it('en una página sin randomUUID usa getRandomValues y el id es válido para el servidor', async () => {
    vi.stubGlobal('crypto', {
      getRandomValues: (bytes: Uint8Array) => {
        bytes.fill(171);
        return bytes;
      },
    });
    const { getDeviceId } = await freshDevice();
    const id = getDeviceId(memoryStorage());
    expect(id).toBe('ab'.repeat(16));
    expect(id.length).toBeLessThanOrEqual(80);
  });
});

describe('etiqueta del dispositivo', () => {
  const chromeWindows =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
  const cases: [string, string][] = [
    [chromeWindows, 'Chrome en Windows'],
    [`${chromeWindows} Edg/130.0.0.0`, 'Edge en Windows'],
    [`${chromeWindows} OPR/115.0.0.0`, 'Opera en Windows'],
    [
      'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0',
      'Firefox en Linux',
    ],
    [
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15',
      'Safari en macOS',
    ],
    [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Mobile/15E148 Safari/604.1',
      'Safari en iOS',
    ],
    [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.0.0 Mobile/15E148 Safari/604.1',
      'Chrome en iOS',
    ],
    [
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
      'Chrome en Android',
    ],
    [
      'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36',
      'Samsung Internet en Android',
    ],
    [
      'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
      'Chrome en ChromeOS',
    ],
  ];

  it.each(cases)('describe %#', (userAgent, expected) => {
    expect(describeUserAgent(userAgent)).toBe(expected);
  });

  it('un user agent desconocido o vacío queda en Navegador', () => {
    expect(describeUserAgent('')).toBe('Navegador');
    expect(describeUserAgent('curl/8.0')).toBe('Navegador');
  });

  it('es corta, sin versiones, modelos ni datos personales, y cabe en el límite del servidor', () => {
    for (const [userAgent] of cases) {
      const label = deviceLabel(userAgent);
      expect(label.length).toBeLessThanOrEqual(80);
      expect(label).not.toMatch(/\d/);
      expect(label).not.toMatch(/Pixel|SM-|x86|rv:/);
    }
  });

  it('sin argumento lee el navegador actual', () => {
    const label = deviceLabel();
    expect(label.length).toBeGreaterThan(0);
    expect(label.length).toBeLessThanOrEqual(80);
  });
});

describe('claimDevice', () => {
  it('llama a la función claim_device con el id y la etiqueta', async () => {
    const fake = makeFakeCloud();
    expect(await claimDevice(fake.cloud, 'dev-a', 'Chrome en Windows')).toEqual({ ok: true });
    expect(fake.claims).toEqual([{ p_device_id: 'dev-a', p_label: 'Chrome en Windows' }]);
    expect(fake.row?.device_id).toBe('dev-a');
  });

  it('reclamar desde otro dispositivo reemplaza al anterior', async () => {
    const fake = makeFakeCloud();
    await claimDevice(fake.cloud, 'dev-a', 'Chrome en Windows');
    await claimDevice(fake.cloud, 'dev-b', 'Safari en iOS');
    expect(fake.row).toEqual({ device_id: 'dev-b', label: 'Safari en iOS' });
  });

  it('recorta la etiqueta a 80 caracteres para que el servidor no la rechace', async () => {
    const fake = makeFakeCloud();
    await claimDevice(fake.cloud, 'dev-a', 'x'.repeat(200));
    expect(fake.claims[0]?.p_label).toHaveLength(80);
  });

  it('un fallo de red devuelve error y no lanza', async () => {
    const failing = makeFakeCloud();
    failing.failClaim = 'error';
    expect(await claimDevice(failing.cloud, 'dev-a', 'x')).toEqual({ ok: false, reason: 'failed' });
    const throwing = makeFakeCloud();
    throwing.failClaim = 'throw';
    expect(await claimDevice(throwing.cloud, 'dev-a', 'x')).toEqual({
      ok: false,
      reason: 'failed',
    });
  });

  it('no llama al servidor con un id vacío o de más de 80 caracteres', async () => {
    const fake = makeFakeCloud();
    for (const id of ['', '   ', 'x'.repeat(81)]) {
      expect(await claimDevice(fake.cloud, id, 'x')).toEqual({ ok: false, reason: 'failed' });
    }
    expect(fake.claims).toHaveLength(0);
  });
});

describe('claimDevice y el límite de cambios', () => {
  const RETRY = '2030-01-02T09:30:00Z';

  it('el error DV001 es el límite, no un fallo de red, y trae la hora de reintento', async () => {
    expect(DEVICE_LIMIT_ERROR_CODE).toBe('DV001');
    const fake = makeFakeCloud();
    fake.failClaim = 'limit';
    fake.limitRetryAt = RETRY;
    expect(await claimDevice(fake.cloud, 'dev-a', 'Chrome en Windows')).toEqual({
      ok: false,
      reason: 'limit',
      retryAt: Date.parse(RETRY),
    });
    // No cambió la cuenta
    expect(fake.row).toBeNull();
    expect(fake.claims).toHaveLength(0);
  });

  it('al rechazarlo pide al servidor que lo asiente, con el mismo id y etiqueta', async () => {
    const fake = makeFakeCloud();
    fake.failClaim = 'limit';
    await claimDevice(fake.cloud, 'dev-a', 'Chrome en Windows');
    expect(fake.rejections).toEqual([{ p_device_id: 'dev-a', p_label: 'Chrome en Windows' }]);
  });

  it('si no se pudo asentar el rechazo, el alumno recibe el límite igual', async () => {
    for (const failure of ['error', 'throw'] as const) {
      const fake = makeFakeCloud();
      fake.failClaim = 'limit';
      fake.failReport = failure;
      expect(await claimDevice(fake.cloud, 'dev-a', 'x')).toMatchObject({
        ok: false,
        reason: 'limit',
      });
    }
  });

  it('si el servidor no responde al asentar el rechazo, no espera más de unos segundos', async () => {
    vi.useFakeTimers();
    try {
      const fake = makeFakeCloud();
      fake.failClaim = 'limit';
      fake.failReport = 'hang';
      const pending = claimDevice(fake.cloud, 'dev-a', 'x');
      await vi.advanceTimersByTimeAsync(3_000);
      await expect(pending).resolves.toMatchObject({ ok: false, reason: 'limit' });
    } finally {
      vi.useRealTimers();
    }
  });

  it('sin hora de reintento entendible, retryAt es null', async () => {
    for (const details of [null, '', 'mañana', '31 de febrero']) {
      const fake = makeFakeCloud();
      fake.failClaim = 'limit';
      fake.limitRetryAt = details;
      expect(await claimDevice(fake.cloud, 'dev-a', 'x')).toEqual({
        ok: false,
        reason: 'limit',
        retryAt: null,
      });
    }
  });

  it('otro error del servidor, con o sin código, sigue siendo un fallo y no asienta nada', async () => {
    const rpc = vi.fn<(name: string, args: unknown) => Promise<unknown>>();
    const cloud = { rpc } as never;
    rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'sin permiso' } });
    expect(await claimDevice(cloud, 'dev-a', 'x')).toEqual({ ok: false, reason: 'failed' });
    rpc.mockResolvedValue({ data: null, error: { message: 'Failed to fetch' } });
    expect(await claimDevice(cloud, 'dev-a', 'x')).toEqual({ ok: false, reason: 'failed' });
    // Solo se llamó a claim_device. Nunca a log_rejected_claim
    expect(rpc.mock.calls.map((call) => call[0])).toEqual(['claim_device', 'claim_device']);
  });

  it('un fallo de red nunca es el límite', async () => {
    for (const failure of ['error', 'throw'] as const) {
      const fake = makeFakeCloud();
      fake.failClaim = failure;
      expect(await claimDevice(fake.cloud, 'dev-a', 'x')).toEqual({ ok: false, reason: 'failed' });
      expect(fake.rejections).toHaveLength(0);
    }
  });
});

describe('sessionIdFromToken', () => {
  // base64url de un JSON en UTF-8, como lo arma Supabase
  const encode = (value: unknown) => {
    let binary = '';
    new TextEncoder().encode(JSON.stringify(value)).forEach((byte) => {
      binary += String.fromCharCode(byte);
    });
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  };

  it('lee el session_id del token de acceso', () => {
    expect(sessionIdFromToken(fakeAccessToken('3b0f2a6e-1111-4222-8333-444455556666'))).toBe(
      '3b0f2a6e-1111-4222-8333-444455556666',
    );
  });

  it('entiende el relleno de base64url y los acentos en otros campos', () => {
    const payload = { session_id: 'ses-1', user_metadata: { alias: 'Médica Ñandú' } };
    expect(sessionIdFromToken(`${encode({ alg: 'HS256' })}.${encode(payload)}.firma`)).toBe(
      'ses-1',
    );
  });

  it('un token sin el claim, mal formado o ausente da null y no lanza', () => {
    expect(sessionIdFromToken(fakeAccessToken())).toBeNull();
    for (const bad of [undefined, null, '', 'abc', 'a.b.c', 'a..c', 'a.%%%.c']) {
      expect(sessionIdFromToken(bad)).toBeNull();
    }
    expect(sessionIdFromToken(`x.${encode({ session_id: 42 })}.y`)).toBeNull();
    expect(sessionIdFromToken(`x.${encode({ session_id: '' })}.y`)).toBeNull();
    expect(sessionIdFromToken(`x.${encode({ session_id: 'a'.repeat(81) })}.y`)).toBeNull();
    expect(sessionIdFromToken(`x.${encode(['session_id'])}.y`)).toBeNull();
  });
});

describe('sesión con la que se reclamó', () => {
  it('se recuerda, se lee y se olvida junto con la marca de la cuenta', async () => {
    const device = await freshDevice();
    const storage = memoryStorage();
    expect(device.claimedSessionId(storage)).toBeNull();
    device.rememberClaimedSession('ses-1', storage);
    expect(storage.data.get(DEVICE_SESSION_STORAGE_KEY)).toBe('ses-1');
    expect(DEVICE_SESSION_STORAGE_KEY).toBe('enarm.device-session.v1');
    expect(device.claimedSessionId(storage)).toBe('ses-1');
    device.rememberClaimedSession(null, storage);
    expect(device.claimedSessionId(storage)).toBeNull();
    device.rememberClaimedSession('ses-2', storage);
    device.forgetDeviceClaim(storage);
    expect(device.claimedSessionId(storage)).toBeNull();
  });

  it('con el almacenamiento bloqueado sigue funcionando en memoria', async () => {
    const device = await freshDevice();
    expect(device.claimedSessionId(blockedStorage)).toBeNull();
    device.rememberClaimedSession('ses-1', blockedStorage);
    expect(device.claimedSessionId(blockedStorage)).toBe('ses-1');
    device.forgetDeviceClaim(blockedStorage);
    expect(device.claimedSessionId(blockedStorage)).toBeNull();
  });

  it('las funciones exportadas usan localStorage por defecto', () => {
    rememberClaimedSession('ses-9');
    expect(localStorage.getItem(DEVICE_SESSION_STORAGE_KEY)).toBe('ses-9');
    expect(claimedSessionId()).toBe('ses-9');
    forgetDeviceClaim();
    expect(localStorage.getItem(DEVICE_SESSION_STORAGE_KEY)).toBeNull();
  });
});

describe('checkDevice', () => {
  it('lee la fila propia y devuelve mine, other o unclaimed', async () => {
    const fake = makeFakeCloud({ row: { device_id: 'dev-a' } });
    expect(await checkDevice(fake.cloud, AUTH_ID, 'dev-a')).toEqual({ ok: true, verdict: 'mine' });
    expect(await checkDevice(fake.cloud, AUTH_ID, 'dev-b')).toEqual({ ok: true, verdict: 'other' });
    fake.row = null;
    expect(await checkDevice(fake.cloud, AUTH_ID, 'dev-a')).toEqual({
      ok: true,
      verdict: 'unclaimed',
    });
    expect(fake.filters).toEqual(Array(3).fill(['user_id', AUTH_ID]));
  });

  it('un fallo de red devuelve error y nunca other', async () => {
    const failing = makeFakeCloud({ row: { device_id: 'dev-b' } });
    failing.failCheck = 'error';
    expect(await checkDevice(failing.cloud, AUTH_ID, 'dev-a')).toEqual({
      ok: false,
      reason: 'failed',
    });
    const throwing = makeFakeCloud({ row: { device_id: 'dev-b' } });
    throwing.failCheck = 'throw';
    expect(await checkDevice(throwing.cloud, AUTH_ID, 'dev-a')).toEqual({
      ok: false,
      reason: 'failed',
    });
  });

  it('una fila que no se entiende devuelve error y no saca al alumno', async () => {
    const fake = makeFakeCloud();
    (fake as { row: unknown }).row = { device_id: 42 };
    expect(await checkDevice(fake.cloud, AUTH_ID, 'dev-a')).toEqual({
      ok: false,
      reason: 'failed',
    });
  });
});

describe('marca de cuenta reclamada', () => {
  it('recuerda la cuenta y la olvida al salir', async () => {
    const {
      hasClaimedDevice: has,
      rememberDeviceClaim: remember,
      forgetDeviceClaim: forget,
    } = await freshDevice();
    const storage = memoryStorage();
    expect(has(AUTH_ID, storage)).toBe(false);
    remember(AUTH_ID, storage);
    expect(storage.data.get(DEVICE_CLAIM_STORAGE_KEY)).toBe(AUTH_ID);
    expect(has(AUTH_ID, storage)).toBe(true);
    expect(has('otra-cuenta', storage)).toBe(false);
    forget(storage);
    expect(has(AUTH_ID, storage)).toBe(false);
  });

  it('con el almacenamiento bloqueado sigue funcionando en memoria', async () => {
    const {
      hasClaimedDevice: has,
      rememberDeviceClaim: remember,
      forgetDeviceClaim: forget,
    } = await freshDevice();
    expect(has(AUTH_ID, blockedStorage)).toBe(false);
    remember(AUTH_ID, blockedStorage);
    expect(has(AUTH_ID, blockedStorage)).toBe(true);
    forget(blockedStorage);
    expect(has(AUTH_ID, blockedStorage)).toBe(false);
  });

  it('las funciones exportadas usan localStorage por defecto', () => {
    expect(hasClaimedDevice(AUTH_ID)).toBe(false);
    rememberDeviceClaim(AUTH_ID);
    expect(localStorage.getItem(DEVICE_CLAIM_STORAGE_KEY)).toBe(AUTH_ID);
    forgetDeviceClaim();
    expect(localStorage.getItem(DEVICE_CLAIM_STORAGE_KEY)).toBeNull();
  });
});

describe('reconcileDevice', () => {
  it('al entrar reclama la cuenta y después solo revisa', async () => {
    const { reconcileDevice, getDeviceId } = await freshDevice();
    const fake = makeFakeCloud();
    expect(await reconcileDevice(fake.cloud, AUTH_ID)).toEqual({ status: 'claimed' });
    expect(fake.row?.device_id).toBe(getDeviceId());
    expect(await reconcileDevice(fake.cloud, AUTH_ID)).toEqual({ status: 'mine' });
    expect(await reconcileDevice(fake.cloud, AUTH_ID)).toEqual({ status: 'mine' });
    expect(fake.claims).toHaveLength(1);
  });

  it('si otro dispositivo ganó la cuenta responde other y no se la quita', async () => {
    const { reconcileDevice } = await freshDevice();
    const fake = makeFakeCloud();
    await reconcileDevice(fake.cloud, AUTH_ID);
    fake.row = { device_id: 'otro-navegador' };
    expect(await reconcileDevice(fake.cloud, AUTH_ID)).toEqual({ status: 'other' });
    expect(fake.claims).toHaveLength(1);
    expect(fake.row.device_id).toBe('otro-navegador');
  });

  it('gana el último en entrar y el anterior se entera al volver a abrir la app', async () => {
    const fake = makeFakeCloud();
    // Navegador A entra y reclama
    let browserA = await freshDevice();
    expect(await browserA.reconcileDevice(fake.cloud, AUTH_ID)).toEqual({ status: 'claimed' });
    const savedA = Object.keys(localStorage).map((key): [string, string] => [
      key,
      localStorage.getItem(key) ?? '',
    ]);
    // Navegador B, con su propio almacenamiento, entra después y se queda la cuenta
    localStorage.clear();
    const browserB = await freshDevice();
    expect(await browserB.reconcileDevice(fake.cloud, AUTH_ID)).toEqual({ status: 'claimed' });
    const idB = browserB.getDeviceId();
    expect(fake.row?.device_id).toBe(idB);
    expect(await browserB.reconcileDevice(fake.cloud, AUTH_ID)).toEqual({ status: 'mine' });
    // A vuelve a abrir la app con su sesión guardada. No reclama, ve que perdió
    localStorage.clear();
    for (const [key, value] of savedA) localStorage.setItem(key, value);
    browserA = await freshDevice();
    expect(await browserA.reconcileDevice(fake.cloud, AUTH_ID)).toEqual({ status: 'other' });
    expect(fake.row?.device_id).toBe(idB);
    expect(fake.claims).toHaveLength(2);
  });

  it('tras salir, volver a entrar en el mismo navegador sí reclama la cuenta', async () => {
    const { reconcileDevice, forgetDeviceClaim: forget } = await freshDevice();
    const fake = makeFakeCloud();
    await reconcileDevice(fake.cloud, AUTH_ID);
    fake.row = { device_id: 'otro-navegador' };
    forget();
    expect(await reconcileDevice(fake.cloud, AUTH_ID)).toEqual({ status: 'claimed' });
    expect(fake.row.device_id).not.toBe('otro-navegador');
  });

  it('si la fila desaparece, por ejemplo si se borró para liberar la cuenta, la reclama', async () => {
    const { reconcileDevice } = await freshDevice();
    const fake = makeFakeCloud();
    await reconcileDevice(fake.cloud, AUTH_ID);
    fake.row = null;
    expect(await reconcileDevice(fake.cloud, AUTH_ID)).toEqual({ status: 'claimed' });
    expect(fake.claims).toHaveLength(2);
  });

  it('si no se pudo reclamar, falla sin marcar la cuenta y el siguiente intento reclama', async () => {
    const { reconcileDevice, hasClaimedDevice: has } = await freshDevice();
    const fake = makeFakeCloud();
    fake.failClaim = 'error';
    expect(await reconcileDevice(fake.cloud, AUTH_ID)).toEqual({ status: 'failed' });
    expect(has(AUTH_ID)).toBe(false);
    fake.failClaim = 'none';
    expect(await reconcileDevice(fake.cloud, AUTH_ID)).toEqual({ status: 'claimed' });
  });

  it('si la red falla al revisar responde failed, aunque otro ya tenga la cuenta', async () => {
    const { reconcileDevice } = await freshDevice();
    const fake = makeFakeCloud();
    await reconcileDevice(fake.cloud, AUTH_ID);
    fake.row = { device_id: 'otro-navegador' };
    fake.failCheck = 'error';
    expect(await reconcileDevice(fake.cloud, AUTH_ID)).toEqual({ status: 'failed' });
    fake.failCheck = 'throw';
    expect(await reconcileDevice(fake.cloud, AUTH_ID)).toEqual({ status: 'failed' });
    expect(fake.claims).toHaveLength(1);
  });
});

describe('reconcileDevice con la barrera del servidor', () => {
  const session = (sessionId?: string) => ({
    id: AUTH_ID,
    email: 'rick@example.com',
    ...(sessionId ? { sessionId } : {}),
  });

  it('al entrar reclama y recuerda con qué sesión lo hizo', async () => {
    const device = await freshDevice();
    const fake = makeFakeCloud({ session: session('ses-1') });
    expect(await device.reconcileDevice(fake.cloud, AUTH_ID)).toEqual({ status: 'claimed' });
    expect(device.claimedSessionId()).toBe('ses-1');
    expect(fake.row).toMatchObject({ device_id: device.getDeviceId(), session_id: 'ses-1' });
    // Después solo revisa
    expect(await device.reconcileDevice(fake.cloud, AUTH_ID)).toEqual({ status: 'mine' });
    expect(fake.claims).toHaveLength(1);
  });

  it('si el servidor aún no tiene la sesión de este navegador, la confirma sin gastar un cambio', async () => {
    const device = await freshDevice();
    // Este navegador reclamó antes de la barrera. No recuerda con qué sesión
    const fake = makeFakeCloud({
      session: session('ses-1'),
      row: { device_id: device.getDeviceId() },
    });
    device.rememberDeviceClaim(AUTH_ID);
    expect(await device.reconcileDevice(fake.cloud, AUTH_ID)).toEqual({ status: 'mine' });
    expect(fake.claims).toHaveLength(1);
    expect(fake.row).toMatchObject({ device_id: device.getDeviceId(), session_id: 'ses-1' });
    expect(device.claimedSessionId()).toBe('ses-1');
    // Ya confirmado, no vuelve a hacerlo
    expect(await device.reconcileDevice(fake.cloud, AUTH_ID)).toEqual({ status: 'mine' });
    expect(fake.claims).toHaveLength(1);
  });

  it('si la confirmación falla por la red sigue siendo mine y lo intenta en la siguiente revisión', async () => {
    const device = await freshDevice();
    const fake = makeFakeCloud({
      session: session('ses-1'),
      row: { device_id: device.getDeviceId() },
    });
    device.rememberDeviceClaim(AUTH_ID);
    fake.failClaim = 'throw';
    expect(await device.reconcileDevice(fake.cloud, AUTH_ID)).toEqual({ status: 'mine' });
    expect(device.claimedSessionId()).toBeNull();
    fake.failClaim = 'none';
    expect(await device.reconcileDevice(fake.cloud, AUTH_ID)).toEqual({ status: 'mine' });
    expect(fake.claims).toHaveLength(1);
    expect(device.claimedSessionId()).toBe('ses-1');
  });

  it('entrar de nuevo aquí con otra sesión es una entrada, aunque otro dispositivo tenga la cuenta', async () => {
    const device = await freshDevice();
    const fake = makeFakeCloud({ session: session('ses-1') });
    await device.reconcileDevice(fake.cloud, AUTH_ID);
    fake.row = { device_id: 'otro-navegador', session_id: 'ses-otro' };
    // Mientras la sesión no cambie, este navegador pierde
    expect(await device.reconcileDevice(fake.cloud, AUTH_ID)).toEqual({ status: 'other' });
    // Abre un enlace nuevo del correo en este mismo navegador y Supabase le da otra sesión
    fake.session = session('ses-2');
    expect(await device.reconcileDevice(fake.cloud, AUTH_ID)).toEqual({ status: 'claimed' });
    expect(fake.row.session_id).toBe('ses-2');
    expect(device.claimedSessionId()).toBe('ses-2');
  });

  it('un navegador que reclamó antes de la barrera y perdió sigue perdiendo y no le quita la cuenta al ganador', async () => {
    const device = await freshDevice();
    const fake = makeFakeCloud({
      session: session('ses-1'),
      row: { device_id: 'otro-navegador', session_id: 'ses-otro' },
    });
    device.rememberDeviceClaim(AUTH_ID);
    expect(await device.reconcileDevice(fake.cloud, AUTH_ID)).toEqual({ status: 'other' });
    expect(fake.claims).toHaveLength(0);
  });

  it('un token sin session_id se porta como antes de la barrera', async () => {
    const device = await freshDevice();
    const fake = makeFakeCloud({ session: session() });
    expect(await device.reconcileDevice(fake.cloud, AUTH_ID)).toEqual({ status: 'claimed' });
    expect(await device.reconcileDevice(fake.cloud, AUTH_ID)).toEqual({ status: 'mine' });
    expect(fake.claims).toHaveLength(1);
    fake.row = { device_id: 'otro-navegador' };
    expect(await device.reconcileDevice(fake.cloud, AUTH_ID)).toEqual({ status: 'other' });
  });

  it('si el servidor rechaza el cambio por el límite lo dice con la hora y no marca la cuenta como reclamada', async () => {
    const device = await freshDevice();
    const fake = makeFakeCloud({ session: session('ses-1') });
    fake.failClaim = 'limit';
    fake.limitRetryAt = '2030-01-02T09:30:00Z';
    expect(await device.reconcileDevice(fake.cloud, AUTH_ID)).toEqual({
      status: 'limit',
      retryAt: Date.parse('2030-01-02T09:30:00Z'),
    });
    expect(device.hasClaimedDevice(AUTH_ID)).toBe(false);
    expect(fake.rejections).toHaveLength(1);
    // Un fallo de red, en cambio, es solo un fallo
    fake.failClaim = 'error';
    expect(await device.reconcileDevice(fake.cloud, AUTH_ID)).toEqual({ status: 'failed' });
  });

  it('el límite también aplica al volver a entrar con una sesión nueva', async () => {
    const device = await freshDevice();
    const fake = makeFakeCloud({ session: session('ses-1') });
    await device.reconcileDevice(fake.cloud, AUTH_ID);
    fake.row = { device_id: 'otro-navegador', session_id: 'ses-otro' };
    fake.session = session('ses-2');
    fake.failClaim = 'limit';
    expect(await device.reconcileDevice(fake.cloud, AUTH_ID)).toMatchObject({ status: 'limit' });
  });
});
