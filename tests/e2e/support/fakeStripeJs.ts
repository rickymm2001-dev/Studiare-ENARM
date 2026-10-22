// Stripe.js simulado para las pruebas de punta a punta (B17, 6.7 del plan de B17). Se atienden dentro del
// navegador de la prueba, con context.route, los orígenes que abre la política de seguridad cuando el build
// trae VITE_STRIPE_PUBLISHABLE_KEY (STRIPE_*_ORIGINS en src/config/csp.ts). Ninguna petición sale a Stripe de
// verdad, y por eso tests/e2e/support/fixtures.ts lo engancha a todo contexto, igual que fakeTelemetry.ts hace
// con PostHog y Sentry.
//
// Guarda cada petición real que llegó (requests). Con eso una spec puede demostrar lo que más importa del
// diseño: con la bandera expressWallets apagada, o sin elegir Tarjeta en Suscripción, no hay ninguna petición
// a Stripe (fakeStripeJsOf(context).requests es []).
//
// El script que se sirve en lugar de Stripe.js (FAKE_STRIPE_JS_SCRIPT) define window.Stripe como Stripe.js
// endive. Tiene initCheckoutElementsSdk con loadActions, createExpressCheckoutElement y un elemento que pinta un
// botón por billetera, con ready (con o sin billeteras), loaderror, confirm bueno y malo y cancel. Cómo se
// comporta lo manda la spec desde Node con fake.wallet, que el script lee al momento por /__fake/config, así
// cambia a media prueba y sobrevive a recargar la página. Al confirmar bien avisa por /__fake/complete, que
// llama fake.onWalletPaid con el secreto de la sesión: es el aviso de pago de Stripe, que la spec convierte en
// la suscripción del Supabase simulado. Lo que hace la app con el SDK queda en window.__fakeStripeLog, que la
// spec lee con fakeStripeLogOf(page). Todo es simulado y nunca se mezcla con datos reales.
import type { BrowserContext, Page, Request, Route } from '@playwright/test';

/** Los orígenes de Stripe que atiende el doble. Son los mismos que abre walletPayments en la política */
export const FAKE_STRIPE_JS_ORIGIN = 'https://js.stripe.com';
export const FAKE_STRIPE_API_ORIGIN = 'https://api.stripe.com';
export const FAKE_STRIPE_HOOKS_ORIGIN = 'https://hooks.stripe.com';

/** Los patrones de context.route. El comodín de subdominios es el de *.js.stripe.com de la política */
export const FAKE_STRIPE_ROUTE_PATTERNS = [
  `${FAKE_STRIPE_JS_ORIGIN}/**`,
  'https://*.js.stripe.com/**',
  `${FAKE_STRIPE_API_ORIGIN}/**`,
  `${FAKE_STRIPE_HOOKS_ORIGIN}/**`,
] as const;

/**
 * La llave publicable que lleva el build de nube de las pruebas (playwright.config.ts). Tiene la forma que valida
 * stripePublishableKeyOf (pk_test_ y 16 o más letras y números) y dice en su texto que es simulada y rellena con
 * ceros, para que no se confunda con una llave de ninguna cuenta ni la marque un escáner. Las llaves
 * publicables son públicas por diseño, y aun así esta no es de nadie
 */
export const FAKE_STRIPE_PUBLISHABLE_KEY = 'pk_test_' + 'SimuladaPruebasStudiare0000000000';

/** Un script que no hace nada. Ya no es el que se sirve, pero queda para probar que el doble acepta otro con setScript */
export const EMPTY_STRIPE_JS_SCRIPT =
  '/* Stripe.js simulado sin comportamiento (paso 0 de B17). Lo llena FAKE_STRIPE_JS_SCRIPT. */\n';

/** Rutas propias del doble dentro de api.stripe.com. No existen en Stripe y no cuentan como peticiones de la app */
export const FAKE_STRIPE_CONFIG_PATH = '/__fake/config';
export const FAKE_STRIPE_COMPLETE_PATH = '/__fake/complete';

/** Cómo se porta el Stripe.js simulado. La spec lo cambia en cualquier momento con fake.wallet */
export interface FakeWalletConfig {
  /** Qué billeteras tiene el aparato. Sin ninguna, ready llega sin billeteras */
  wallets: { applePay: boolean; googlePay: boolean };
  /** Qué contesta confirm. ok paga, declined y error son errores de Stripe, y throw rechaza la promesa */
  confirm: 'ok' | 'declined' | 'error' | 'throw';
  /** Cuánto tarda confirm, para ver el aviso de que se está confirmando */
  confirmDelayMs: number;
  /** loadActions responde con error */
  actionsError: boolean;
  /** El elemento avisa loaderror al montarse */
  loadError: boolean;
}

export const DEFAULT_FAKE_WALLET_CONFIG: FakeWalletConfig = {
  wallets: { applePay: true, googlePay: false },
  confirm: 'ok',
  confirmDelayMs: 0,
  actionsError: false,
  loadError: false,
};

/**
 * El script que se sirve en lugar de https://js.stripe.com/endive/stripe.js. Es JavaScript de navegador y vive
 * como texto. Usa solo fetch hacia FAKE_STRIPE_API_ORIGIN, para leer la configuración y avisar el pago
 */
export const FAKE_STRIPE_JS_SCRIPT = `/* Stripe.js simulado (B17, solo pruebas). No es Stripe y no cobra nada. */
(function () {
  'use strict';
  var API = '${FAKE_STRIPE_API_ORIGIN}';
  var log = (window.__fakeStripeLog = window.__fakeStripeLog || []);
  function note(type, data) {
    log.push(Object.assign({ type: type }, data || {}));
  }
  function config() {
    return fetch(API + '${FAKE_STRIPE_CONFIG_PATH}').then(function (reply) {
      return reply.json();
    });
  }
  function pause(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  function confirm(secret, args) {
    note('confirm', {
      redirect: args && args.redirect,
      withEvent: Boolean(args && args.expressCheckoutConfirmEvent),
    });
    return config().then(function (cfg) {
      return pause(cfg.confirmDelayMs || 0).then(function () {
        if (cfg.confirm === 'throw') throw new Error('Sin red simulada');
        if (cfg.confirm === 'declined') {
          return {
            type: 'error',
            error: {
              message: 'Your card was declined.',
              code: 'paymentFailed',
              paymentFailed: { declineCode: 'generic_decline' },
            },
          };
        }
        if (cfg.confirm === 'error') {
          return { type: 'error', error: { message: 'Something went wrong.', code: null } };
        }
        // El pago pasó. Stripe avisa a nuestro servidor (el webhook) y aquí lo hace la spec con onWalletPaid
        return fetch(API + '${FAKE_STRIPE_COMPLETE_PATH}', {
          method: 'POST',
          headers: { 'content-type': 'text/plain' },
          body: secret,
        }).then(function () {
          note('paid');
          return { type: 'success', session: {} };
        });
      });
    });
  }

  function createElement(options) {
    var handlers = {};
    var host = null;
    var element = {
      on: function (name, handler) {
        handlers[name] = handler;
        return element;
      },
      once: function (name, handler) {
        handlers[name] = handler;
        return element;
      },
      off: function (name) {
        delete handlers[name];
        return element;
      },
      emit: function (name, event) {
        if (handlers[name]) handlers[name](event);
      },
      mount: function (target) {
        host = typeof target === 'string' ? document.querySelector(target) : target;
        note('mount');
        config().then(function (cfg) {
          if (cfg.loadError) {
            element.emit('loaderror', { elementType: 'expressCheckout', error: { type: 'api_error' } });
            return;
          }
          var methods = options && options.paymentMethods ? options.paymentMethods : {};
          var shown = [];
          if (cfg.wallets.applePay && methods.applePay !== 'never') shown.push(['apple_pay', 'Apple Pay']);
          if (cfg.wallets.googlePay && methods.googlePay !== 'never') shown.push(['google_pay', 'Google Pay']);
          var box = document.createElement('div');
          box.setAttribute('data-fake-stripe', 'express-checkout');
          box.style.cssText = 'display:flex;flex-direction:column;gap:8px';
          shown.forEach(function (wallet) {
            var button = document.createElement('button');
            button.type = 'button';
            button.textContent = 'Suscribirme con ' + wallet[1] + ' (simulado)';
            button.setAttribute('data-wallet', wallet[0]);
            button.style.cssText =
              'min-height:44px;border:0;border-radius:6px;background:#000;color:#fff;font:600 15px system-ui;cursor:pointer';
            button.addEventListener('click', function () {
              note('authorized', { via: wallet[0] });
              element.emit('confirm', {
                expressPaymentType: wallet[0],
                paymentFailed: function (payload) {
                  note('paymentFailed', { payload: payload || null });
                },
              });
            });
            box.appendChild(button);
          });
          if (host) host.appendChild(box);
          element.emit('ready', {
            elementType: 'expressCheckout',
            availablePaymentMethods: shown.length
              ? {
                  applePay: cfg.wallets.applePay,
                  googlePay: cfg.wallets.googlePay,
                  link: false,
                  paypal: false,
                  klarna: false,
                  amazonPay: false,
                }
              : undefined,
          });
        });
      },
      unmount: function () {},
      destroy: function () {
        note('destroy');
        if (host) host.textContent = '';
        host = null;
      },
    };
    // La spec cierra la hoja de la billetera sin pagar con window.__fakeStripe.cancel()
    window.__fakeStripe = {
      cancel: function () {
        note('cancel');
        element.emit('cancel', { elementType: 'expressCheckout' });
      },
    };
    return element;
  }

  function Stripe(key, options) {
    note('Stripe', { key: key, locale: options && options.locale });
    return {
      _registerWrapper: function () {},
      initCheckoutElementsSdk: function (init) {
        var secret = init.clientSecret;
        note('init', { clientSecret: secret });
        return {
          loadActions: function () {
            return config().then(function (cfg) {
              if (cfg.actionsError) {
                return { type: 'error', error: { message: 'Simulado', code: null } };
              }
              return {
                type: 'success',
                actions: {
                  confirm: function (args) {
                    return confirm(secret, args);
                  },
                },
              };
            });
          },
          createExpressCheckoutElement: function (options) {
            note('element', { options: options });
            return createElement(options);
          },
        };
      },
    };
  }
  Stripe.version = 'endive';
  window.Stripe = Stripe;
})();
`;

/** Una petición que llegó a uno de los orígenes de Stripe, ya leída */
export interface StripeJsRequest {
  url: string;
  method: string;
  /** Qué origen la atendió. script es js.stripe.com y sus subdominios, api es api.stripe.com y frame es hooks */
  kind: 'script' | 'api' | 'frame';
}

export interface FakeStripeJs {
  /** Todo lo que llegó a Stripe en este contexto, en orden. Vacío si la app nunca lo pidió */
  readonly requests: readonly StripeJsRequest[];
  /** Cómo se porta el Stripe.js simulado. La spec cambia sus campos cuando quiera */
  readonly wallet: FakeWalletConfig;
  /**
   * El aviso de pago de Stripe. Se llama con el secreto de la sesión cuando el Stripe.js simulado confirma bien.
   * La spec lo convierte en la suscripción del Supabase simulado
   */
  onWalletPaid: ((clientSecret: string) => void) | null;
  /** Cambia el script que se sirve en lugar de Stripe.js */
  setScript(source: string): void;
  /** Olvida lo que llegó, por ejemplo para revisar que después de cambiar de plan no se pidió nada más */
  clear(): void;
  /** Vuelve la configuración de las billeteras a la de omisión */
  resetWallet(): void;
  /** Atiende los orígenes en este contexto. installFakeStripeJs lo llama */
  attach(context: BrowserContext): Promise<void>;
}

/** Los encabezados que el navegador necesita para aceptar la respuesta de otro origen */
function corsHeaders(request: Request): Record<string, string> {
  return {
    'access-control-allow-origin': request.headers().origin ?? '*',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': '*',
    'access-control-max-age': '600',
    vary: 'origin',
  };
}

function kindOf(url: string): StripeJsRequest['kind'] {
  const host = new URL(url).hostname;
  if (host === 'api.stripe.com') return 'api';
  if (host === 'hooks.stripe.com') return 'frame';
  return 'script';
}

export function createFakeStripeJs(): FakeStripeJs {
  const requests: StripeJsRequest[] = [];
  let script = FAKE_STRIPE_JS_SCRIPT;
  const wallet: FakeWalletConfig = structuredClone(DEFAULT_FAKE_WALLET_CONFIG);
  const fake: FakeStripeJs = {
    requests,
    wallet,
    onWalletPaid: null,
    setScript(source) {
      script = source;
    },
    clear() {
      requests.length = 0;
    },
    resetWallet() {
      Object.assign(wallet, structuredClone(DEFAULT_FAKE_WALLET_CONFIG));
    },
    async attach(context) {
      for (const pattern of FAKE_STRIPE_ROUTE_PATTERNS) await context.route(pattern, serve);
    },
  };

  async function serve(route: Route): Promise<void> {
    const request = route.request();
    const headers = corsHeaders(request);
    // El permiso previo (preflight) del navegador no es una petición de la app y no se guarda
    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers });
      return;
    }
    const url = new URL(request.url());
    // Las rutas propias del doble son del script simulado y no de la app, así que no cuentan como petición
    if (url.hostname === 'api.stripe.com' && url.pathname === FAKE_STRIPE_CONFIG_PATH) {
      await route.fulfill({
        status: 200,
        headers,
        contentType: 'application/json; charset=utf-8',
        body: JSON.stringify(wallet),
      });
      return;
    }
    if (url.hostname === 'api.stripe.com' && url.pathname === FAKE_STRIPE_COMPLETE_PATH) {
      fake.onWalletPaid?.(request.postData() ?? '');
      await route.fulfill({
        status: 200,
        headers,
        contentType: 'application/json; charset=utf-8',
        body: '{}',
      });
      return;
    }
    const kind = kindOf(request.url());
    requests.push({ url: request.url(), method: request.method(), kind });
    if (kind === 'api') {
      await route.fulfill({
        status: 200,
        headers,
        contentType: 'application/json; charset=utf-8',
        body: '{}',
      });
    } else if (kind === 'frame') {
      await route.fulfill({
        status: 200,
        headers,
        contentType: 'text/html; charset=utf-8',
        body: '<!doctype html><title>Stripe simulado</title>',
      });
    } else {
      await route.fulfill({
        status: 200,
        headers,
        contentType: 'application/javascript; charset=utf-8',
        body: script,
      });
    }
  }

  return fake;
}

const installed = new WeakMap<BrowserContext, FakeStripeJs>();

/**
 * Engancha Stripe.js simulado a un contexto de Playwright. Lo llama el contexto de fixtures.ts, así que lo trae
 * toda prueba. Llamarlo dos veces en el mismo contexto devuelve el mismo doble y no registra las rutas otra vez
 */
export async function installFakeStripeJs(context: BrowserContext): Promise<FakeStripeJs> {
  const known = installed.get(context);
  if (known) return known;
  const fake = createFakeStripeJs();
  installed.set(context, fake);
  await fake.attach(context);
  return fake;
}

/** El doble de este contexto, para que una spec lea qué peticiones llegaron. undefined si no se enganchó */
export function fakeStripeJsOf(context: BrowserContext): FakeStripeJs | undefined {
  return installed.get(context);
}

/** Una cosa que la app le hizo al Stripe.js simulado dentro de la página */
export interface FakeStripeLogEntry {
  type: string;
  [key: string]: unknown;
}

/** Lo que la app le hizo al Stripe.js simulado en esta página, en orden. Vacío si nunca se cargó */
export async function fakeStripeLogOf(page: Page): Promise<FakeStripeLogEntry[]> {
  return page.evaluate(() =>
    ((window as unknown as { __fakeStripeLog?: FakeStripeLogEntry[] }).__fakeStripeLog ?? []).map(
      (entry) => ({ ...entry }),
    ),
  );
}

/** El alumno cierra la hoja de la billetera sin pagar */
export async function cancelFakeWalletSheet(page: Page): Promise<void> {
  await page.evaluate(() => {
    (window as unknown as { __fakeStripe: { cancel(): void } }).__fakeStripe.cancel();
  });
}
