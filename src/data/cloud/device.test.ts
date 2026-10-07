// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeFakeCloud } from '../testing/fakeCloud';
import {
  checkDevice,
  claimDevice,
  DEVICE_CLAIM_STORAGE_KEY,
  DEVICE_ID_STORAGE_KEY,
  describeUserAgent,
  deviceLabel,
  deviceVerdict,
  forgetDeviceClaim,
  hasClaimedDevice,
  rememberDeviceClaim,
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
    expect(await reconcileDevice(fake.cloud, AUTH_ID)).toBe('claimed');
    expect(fake.row?.device_id).toBe(getDeviceId());
    expect(await reconcileDevice(fake.cloud, AUTH_ID)).toBe('mine');
    expect(await reconcileDevice(fake.cloud, AUTH_ID)).toBe('mine');
    expect(fake.claims).toHaveLength(1);
  });

  it('si otro dispositivo ganó la cuenta responde other y no se la quita', async () => {
    const { reconcileDevice } = await freshDevice();
    const fake = makeFakeCloud();
    await reconcileDevice(fake.cloud, AUTH_ID);
    fake.row = { device_id: 'otro-navegador' };
    expect(await reconcileDevice(fake.cloud, AUTH_ID)).toBe('other');
    expect(fake.claims).toHaveLength(1);
    expect(fake.row.device_id).toBe('otro-navegador');
  });

  it('gana el último en entrar y el anterior se entera al volver a abrir la app', async () => {
    const fake = makeFakeCloud();
    // Navegador A entra y reclama
    let browserA = await freshDevice();
    expect(await browserA.reconcileDevice(fake.cloud, AUTH_ID)).toBe('claimed');
    const savedA = Object.keys(localStorage).map((key): [string, string] => [
      key,
      localStorage.getItem(key) ?? '',
    ]);
    // Navegador B, con su propio almacenamiento, entra después y se queda la cuenta
    localStorage.clear();
    const browserB = await freshDevice();
    expect(await browserB.reconcileDevice(fake.cloud, AUTH_ID)).toBe('claimed');
    const idB = browserB.getDeviceId();
    expect(fake.row?.device_id).toBe(idB);
    expect(await browserB.reconcileDevice(fake.cloud, AUTH_ID)).toBe('mine');
    // A vuelve a abrir la app con su sesión guardada. No reclama, ve que perdió
    localStorage.clear();
    for (const [key, value] of savedA) localStorage.setItem(key, value);
    browserA = await freshDevice();
    expect(await browserA.reconcileDevice(fake.cloud, AUTH_ID)).toBe('other');
    expect(fake.row?.device_id).toBe(idB);
    expect(fake.claims).toHaveLength(2);
  });

  it('tras salir, volver a entrar en el mismo navegador sí reclama la cuenta', async () => {
    const { reconcileDevice, forgetDeviceClaim: forget } = await freshDevice();
    const fake = makeFakeCloud();
    await reconcileDevice(fake.cloud, AUTH_ID);
    fake.row = { device_id: 'otro-navegador' };
    forget();
    expect(await reconcileDevice(fake.cloud, AUTH_ID)).toBe('claimed');
    expect(fake.row.device_id).not.toBe('otro-navegador');
  });

  it('si la fila desaparece, por ejemplo si se borró para liberar la cuenta, la reclama', async () => {
    const { reconcileDevice } = await freshDevice();
    const fake = makeFakeCloud();
    await reconcileDevice(fake.cloud, AUTH_ID);
    fake.row = null;
    expect(await reconcileDevice(fake.cloud, AUTH_ID)).toBe('claimed');
    expect(fake.claims).toHaveLength(2);
  });

  it('si no se pudo reclamar, falla sin marcar la cuenta y el siguiente intento reclama', async () => {
    const { reconcileDevice, hasClaimedDevice: has } = await freshDevice();
    const fake = makeFakeCloud();
    fake.failClaim = 'error';
    expect(await reconcileDevice(fake.cloud, AUTH_ID)).toBe('failed');
    expect(has(AUTH_ID)).toBe(false);
    fake.failClaim = 'none';
    expect(await reconcileDevice(fake.cloud, AUTH_ID)).toBe('claimed');
  });

  it('si la red falla al revisar responde failed, aunque otro ya tenga la cuenta', async () => {
    const { reconcileDevice } = await freshDevice();
    const fake = makeFakeCloud();
    await reconcileDevice(fake.cloud, AUTH_ID);
    fake.row = { device_id: 'otro-navegador' };
    fake.failCheck = 'error';
    expect(await reconcileDevice(fake.cloud, AUTH_ID)).toBe('failed');
    fake.failCheck = 'throw';
    expect(await reconcileDevice(fake.cloud, AUTH_ID)).toBe('failed');
    expect(fake.claims).toHaveLength(1);
  });
});
