// El doble de Stripe.js de las pruebas de punta a punta (B17) contra los orígenes que abre la política de
// seguridad. Comprueba sin navegador que atiende exactamente esos orígenes, que no deja salir nada a Stripe, que
// guarda las peticiones de la app y no las del propio doble, y que el script que sirve en lugar de Stripe.js se
// porta como el SDK de Checkout (se corre en un contexto de node:vm con un documento de mentira). Todo es simulado
import vm from 'node:vm';
import type { BrowserContext, Route } from '@playwright/test';
import { describe, expect, it } from 'vitest';
import { STRIPE_CONNECT_ORIGINS, STRIPE_FRAME_ORIGINS, STRIPE_SCRIPT_ORIGINS } from '@/config/csp';
import { stripePublishableKeyOf } from '@/config/csp';
import {
  DEFAULT_FAKE_WALLET_CONFIG,
  EMPTY_STRIPE_JS_SCRIPT,
  FAKE_STRIPE_JS_SCRIPT,
  FAKE_STRIPE_PUBLISHABLE_KEY,
  FAKE_STRIPE_ROUTE_PATTERNS,
  createFakeStripeJs,
  fakeStripeJsOf,
  installFakeStripeJs,
  type FakeWalletConfig,
} from '../e2e/support/fakeStripeJs';

type Handler = (route: Route) => Promise<void>;

/** Un contexto de Playwright de mentira que solo guarda las rutas que se le registran */
function fakeContext() {
  const routes: { pattern: string; handler: Handler }[] = [];
  const context = {
    route: (pattern: string, handler: Handler) => {
      routes.push({ pattern, handler });
      return Promise.resolve();
    },
  } as unknown as BrowserContext;
  return { context, routes };
}

interface Fulfilled {
  status?: number;
  headers?: Record<string, string>;
  contentType?: string;
  body?: string;
}

/** Una petición de mentira que llega a una ruta. Devuelve con qué respondió el doble */
async function hit(
  handler: Handler,
  url: string,
  method = 'GET',
  headers: Record<string, string> = {},
): Promise<Fulfilled> {
  let reply: Fulfilled = {};
  const route = {
    request: () => ({ url: () => url, method: () => method, headers: () => headers }),
    fulfill: (options: Fulfilled) => {
      reply = options;
      return Promise.resolve();
    },
  } as unknown as Route;
  await handler(route);
  return reply;
}

describe('Stripe.js simulado (B17)', () => {
  it('atiende los mismos orígenes que abre la política con walletPayments, y ningún otro', () => {
    const origins = [
      ...new Set([...STRIPE_SCRIPT_ORIGINS, ...STRIPE_FRAME_ORIGINS, ...STRIPE_CONNECT_ORIGINS]),
    ];
    expect([...FAKE_STRIPE_ROUTE_PATTERNS].sort()).toEqual(
      origins.map((origin) => `${origin}/**`).sort(),
    );
  });

  it('engancha una ruta por origen y no registra las rutas dos veces en el mismo contexto', async () => {
    const { context, routes } = fakeContext();
    const first = await installFakeStripeJs(context);
    const second = await installFakeStripeJs(context);
    expect(second).toBe(first);
    expect(fakeStripeJsOf(context)).toBe(first);
    expect(routes.map((route) => route.pattern)).toEqual([...FAKE_STRIPE_ROUTE_PATTERNS]);
    // Otro contexto es otro doble, con sus propias peticiones
    expect(fakeStripeJsOf(fakeContext().context)).toBeUndefined();
  });

  it('sirve el script simulado en lugar de Stripe.js, un objeto vacío en la API y una página vacía en hooks', async () => {
    const fake = createFakeStripeJs();
    const { context, routes } = fakeContext();
    await fake.attach(context);
    const handler = routes[0]?.handler as Handler;

    const script = await hit(handler, 'https://js.stripe.com/endive/stripe.js');
    expect(script.status).toBe(200);
    expect(script.contentType).toContain('application/javascript');
    expect(script.body).toBe(FAKE_STRIPE_JS_SCRIPT);
    // El script solo habla con la API simulada, nunca con una dirección de verdad
    const urls = [...(script.body ?? '').matchAll(/https?:\/\/[^\s'"`)]+/g)].map(
      (match) => match[0],
    );
    expect(urls).toEqual(['https://api.stripe.com']);

    const api = await hit(handler, 'https://api.stripe.com/v1/payment_methods', 'POST');
    expect(api).toMatchObject({ status: 200, body: '{}' });
    expect(api.contentType).toContain('application/json');

    const frame = await hit(handler, 'https://hooks.stripe.com/3d_secure_2/x');
    expect(frame.contentType).toContain('text/html');
    expect(frame.body).toContain('Stripe simulado');
  });

  it('la llave publicable de las pruebas tiene la forma que acepta la app y dice que es simulada', () => {
    expect(stripePublishableKeyOf(FAKE_STRIPE_PUBLISHABLE_KEY)).toBe(FAKE_STRIPE_PUBLISHABLE_KEY);
    expect(FAKE_STRIPE_PUBLISHABLE_KEY).toContain('Simulada');
    expect(FAKE_STRIPE_PUBLISHABLE_KEY).toMatch(/^pk_test_/);
  });

  it('guarda cada petición con su origen, no guarda el permiso previo y se puede vaciar', async () => {
    const fake = createFakeStripeJs();
    const { context, routes } = fakeContext();
    await fake.attach(context);
    const handler = routes[0]?.handler as Handler;
    expect(fake.requests).toEqual([]);

    await hit(handler, 'https://js.stripe.com/endive/stripe.js');
    await hit(handler, 'https://m.js.stripe.com/x/y.js');
    await hit(handler, 'https://api.stripe.com/v1/x', 'POST');
    await hit(handler, 'https://hooks.stripe.com/x');
    const preflight = await hit(handler, 'https://api.stripe.com/v1/x', 'OPTIONS', {
      origin: 'http://127.0.0.1:4174',
    });
    expect(preflight.status).toBe(204);
    expect(preflight.headers?.['access-control-allow-origin']).toBe('http://127.0.0.1:4174');
    expect(fake.requests).toEqual([
      { url: 'https://js.stripe.com/endive/stripe.js', method: 'GET', kind: 'script' },
      { url: 'https://m.js.stripe.com/x/y.js', method: 'GET', kind: 'script' },
      { url: 'https://api.stripe.com/v1/x', method: 'POST', kind: 'api' },
      { url: 'https://hooks.stripe.com/x', method: 'GET', kind: 'frame' },
    ]);

    fake.clear();
    expect(fake.requests).toEqual([]);
  });

  it('el script que se sirve lo cambia setScript', async () => {
    const fake = createFakeStripeJs();
    const { context, routes } = fakeContext();
    await fake.attach(context);
    const handler = routes[0]?.handler as Handler;
    fake.setScript(EMPTY_STRIPE_JS_SCRIPT);
    expect((await hit(handler, 'https://js.stripe.com/endive/stripe.js')).body).toBe(
      EMPTY_STRIPE_JS_SCRIPT,
    );
    expect(EMPTY_STRIPE_JS_SCRIPT).not.toMatch(/Stripe\s*=|fetch\(|XMLHttpRequest|import\(/);
  });
});

describe('rutas propias del Stripe.js simulado', () => {
  it('/__fake/config entrega la configuración al momento y no cuenta como petición de la app', async () => {
    const fake = createFakeStripeJs();
    const { context, routes } = fakeContext();
    await fake.attach(context);
    const handler = routes[0]?.handler as Handler;
    const first = await hit(handler, 'https://api.stripe.com/__fake/config');
    expect(JSON.parse(first.body ?? '')).toEqual(DEFAULT_FAKE_WALLET_CONFIG);
    fake.wallet.confirm = 'declined';
    fake.wallet.wallets.googlePay = true;
    const second = await hit(handler, 'https://api.stripe.com/__fake/config');
    expect(JSON.parse(second.body ?? '')).toMatchObject({
      confirm: 'declined',
      wallets: { applePay: true, googlePay: true },
    });
    expect(fake.requests).toEqual([]);
    fake.resetWallet();
    expect(fake.wallet).toEqual(DEFAULT_FAKE_WALLET_CONFIG);
  });

  it('/__fake/complete llama a onWalletPaid con el secreto y tampoco cuenta como petición', async () => {
    const fake = createFakeStripeJs();
    const paid: string[] = [];
    fake.onWalletPaid = (secret) => paid.push(secret);
    const { context, routes } = fakeContext();
    await fake.attach(context);
    const handler = routes[0]?.handler as Handler;
    const route = {
      request: () => ({
        url: () => 'https://api.stripe.com/__fake/complete',
        method: () => 'POST',
        headers: () => ({}),
        postData: () => 'cs_test_sub_000001_secret_simulado',
      }),
      fulfill: () => Promise.resolve(),
    } as unknown as Route;
    await handler(route);
    expect(paid).toEqual(['cs_test_sub_000001_secret_simulado']);
    expect(fake.requests).toEqual([]);
  });
});

/** Un elemento del documento de mentira, con lo mínimo que usa el script */
class FakeNode {
  children: FakeNode[] = [];
  attributes: Record<string, string> = {};
  listeners: Record<string, (() => void)[]> = {};
  style = { cssText: '' };
  textContent = '';
  type = '';
  setAttribute(name: string, value: string) {
    this.attributes[name] = value;
  }
  addEventListener(name: string, handler: () => void) {
    (this.listeners[name] ??= []).push(handler);
  }
  appendChild(child: FakeNode) {
    this.children.push(child);
  }
  click() {
    for (const handler of this.listeners.click ?? []) handler();
  }
}

/** Corre el script simulado como lo haría el navegador y deja a mano window, el log y los avisos de pago */
function runScript(wallet: Partial<FakeWalletConfig> = {}) {
  const config: FakeWalletConfig = { ...structuredClone(DEFAULT_FAKE_WALLET_CONFIG), ...wallet };
  const fetched: { url: string; body: string | undefined }[] = [];
  const window: Record<string, unknown> = {};
  const sandbox = {
    window,
    document: {
      createElement: () => new FakeNode(),
      querySelector: () => null,
    },
    fetch: (url: string, init?: { body?: string }) => {
      fetched.push({ url, body: init?.body });
      return Promise.resolve({
        json: () => Promise.resolve(config),
      });
    },
    setTimeout,
    Object,
    Promise,
    Error,
    Boolean,
  };
  vm.runInNewContext(FAKE_STRIPE_JS_SCRIPT, sandbox);
  return { window, fetched, config };
}

type Handlers = Record<string, (event: unknown) => void>;
interface SdkLike {
  loadActions(): Promise<{
    type: string;
    actions?: {
      confirm(args: unknown): Promise<{ type: string; error?: { code: string | null } }>;
    };
  }>;
  createExpressCheckoutElement(options: unknown): {
    on(name: string, handler: (event: unknown) => void): unknown;
    mount(target: FakeNode): void;
    destroy(): void;
  };
}
interface StripeLike {
  (
    key: string,
    options?: unknown,
  ): { initCheckoutElementsSdk(init: { clientSecret: string }): SdkLike };
  version: string;
}

describe('el script de Stripe.js simulado se porta como el SDK de Checkout', () => {
  const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

  it('define window.Stripe como la versión endive y registra lo que se le hace', () => {
    const { window } = runScript();
    const Stripe = window.Stripe as StripeLike;
    expect(Stripe.version).toBe('endive');
    const stripe = Stripe('pk_test_x', { locale: 'es-419' });
    stripe.initCheckoutElementsSdk({ clientSecret: 'cs_test_x_secret_y' });
    expect(window.__fakeStripeLog).toEqual([
      { type: 'Stripe', key: 'pk_test_x', locale: 'es-419' },
      { type: 'init', clientSecret: 'cs_test_x_secret_y' },
    ]);
  });

  async function mounted(wallet: Partial<FakeWalletConfig> = {}) {
    const run = runScript(wallet);
    const sdk = (run.window.Stripe as StripeLike)('pk_test_x').initCheckoutElementsSdk({
      clientSecret: 'cs_test_x_secret_y',
    });
    const loaded = await sdk.loadActions();
    const element = sdk.createExpressCheckoutElement({
      paymentMethods: { applePay: 'auto', googlePay: 'auto', link: 'never' },
    });
    const events: Handlers = {};
    const received: { name: string; event: unknown }[] = [];
    for (const name of ['ready', 'loaderror', 'confirm', 'cancel']) {
      element.on(name, (event) => received.push({ name, event }));
      events[name] = (event) => received.push({ name, event });
    }
    const host = new FakeNode();
    element.mount(host);
    await tick();
    await tick();
    return { ...run, loaded, element, host, received };
  }

  it('con Apple Pay pinta un botón accesible y avisa ready con esa billetera', async () => {
    const { host, received } = await mounted();
    const box = host.children[0];
    expect(box?.children).toHaveLength(1);
    expect(box?.children[0]?.textContent).toBe('Suscribirme con Apple Pay (simulado)');
    expect(box?.children[0]?.type).toBe('button');
    expect(received.find((item) => item.name === 'ready')?.event).toMatchObject({
      availablePaymentMethods: { applePay: true, googlePay: false, link: false },
    });
  });

  it('respeta las billeteras apagadas por la app y pinta ambas cuando el aparato las tiene', async () => {
    const both = await mounted({ wallets: { applePay: true, googlePay: true } });
    expect(
      both.host.children[0]?.children.map((button) => button.attributes['data-wallet']),
    ).toEqual(['apple_pay', 'google_pay']);
  });

  it('sin billeteras no pinta nada y ready llega sin métodos, y loadError avisa loaderror', async () => {
    const none = await mounted({ wallets: { applePay: false, googlePay: false } });
    expect(none.host.children[0]?.children).toHaveLength(0);
    expect(
      (none.received.find((item) => item.name === 'ready')?.event as Record<string, unknown>)
        .availablePaymentMethods,
    ).toBeUndefined();
    const broken = await mounted({ loadError: true });
    expect(broken.received.map((item) => item.name)).toEqual(['loaderror']);
  });

  it('tocar el botón avisa confirm, y confirm bueno avisa el pago con el secreto', async () => {
    const { loaded, host, received, fetched } = await mounted();
    host.children[0]?.children[0]?.click();
    const confirmEvent = received.find((item) => item.name === 'confirm')?.event as {
      expressPaymentType: string;
    };
    expect(confirmEvent.expressPaymentType).toBe('apple_pay');
    const result = await loaded.actions?.confirm({
      expressCheckoutConfirmEvent: confirmEvent,
      redirect: 'if_required',
    });
    expect(result).toMatchObject({ type: 'success' });
    expect(fetched.at(-1)).toEqual({
      url: 'https://api.stripe.com/__fake/complete',
      body: 'cs_test_x_secret_y',
    });
  });

  it('confirm malo devuelve el error de Stripe y no avisa ningún pago', async () => {
    for (const [confirm, code] of [
      ['declined', 'paymentFailed'],
      ['error', null],
    ] as const) {
      const { loaded, fetched } = await mounted({ confirm });
      const result = await loaded.actions?.confirm({});
      expect(result).toMatchObject({ type: 'error', error: { code } });
      expect(fetched.some((call) => call.url.endsWith('/__fake/complete'))).toBe(false);
    }
    const thrown = await mounted({ confirm: 'throw' });
    await expect(thrown.loaded.actions?.confirm({})).rejects.toThrow('Sin red simulada');
  });

  it('actionsError hace fallar loadActions, y cancel avisa cancel', async () => {
    const failing = await mounted({ actionsError: true });
    expect(failing.loaded.type).toBe('error');
    const ok = await mounted();
    (ok.window.__fakeStripe as { cancel(): void }).cancel();
    expect(ok.received.at(-1)).toMatchObject({ name: 'cancel' });
  });

  it('destroy vacía el lugar donde se montó', async () => {
    const { element, host, window } = await mounted();
    element.destroy();
    expect(host.textContent).toBe('');
    expect((window.__fakeStripeLog as { type: string }[]).at(-1)?.type).toBe('destroy');
  });
});
