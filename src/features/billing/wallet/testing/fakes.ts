// Dobles de las pruebas de los botones de Apple Pay y Google Pay (B17, 6.5). Un Stripe.js falso que guarda todo
// lo que la app le hace, con el elemento de pago exprés incluido, y la nube que contesta create-checkout. Nunca se
// descarga el script de Stripe ni sale una petición. Lo usan WalletPay.test.tsx y CheckoutOptions.wallet.test.tsx
import type { SupabaseClient } from '@supabase/supabase-js';
import { act } from '@testing-library/react';
import { vi } from 'vitest';
import type { WalletStripe } from '../stripeJs';

export const SECRET = 'cs_test_a1b2c3_secret_d4e5f6';
export const KEY = 'pk_test_' + 'SimuladaPruebasStudiare0000000000';

export interface Reply {
  data: unknown;
  error: unknown;
}
export const session = (trial = true): Reply => ({
  data: { clientSecret: SECRET, trial },
  error: null,
});
export const refusal = (body: unknown, status = 409): Reply => ({
  data: null,
  error: { context: new Response(JSON.stringify(body), { status }) },
});

/** La nube que contesta create-checkout con esa respuesta y guarda los cuerpos que recibió */
export function cloudWith(reply: Reply) {
  const calls: unknown[] = [];
  const cloud = {
    functions: {
      invoke: (_name: string, init: { body: unknown }) => {
        calls.push(init.body);
        return Promise.resolve(reply);
      },
    },
  } as unknown as SupabaseClient;
  return { cloud, calls };
}

export type Methods = { applePay: boolean; googlePay: boolean } | undefined;
export type ConfirmResult =
  { type: 'success' } | { type: 'error'; error: { message: string; code: string | null } };

export interface FakeStripeOptions {
  /** Qué billeteras dice tener el aparato cuando el elemento está listo */
  methods?: Methods;
  /** loadActions responde con error */
  actionsError?: boolean;
  /** Qué contesta cada llamada a confirm. La última se repite */
  confirm?: (() => Promise<ConfirmResult>)[];
}

/** Un Stripe.js falso que guarda todo lo que la app le hace, con el elemento de pago exprés incluido */
export function fakeStripe(options: FakeStripeOptions = {}) {
  const log = {
    sdk: [] as unknown[],
    elementOptions: [] as unknown[],
    mounted: 0,
    destroyed: 0,
    confirms: [] as unknown[],
  };
  const handlers = new Map<string, (event: unknown) => void>();
  const methods: Methods =
    'methods' in options ? options.methods : { applePay: true, googlePay: false };
  const element = {
    on: (name: string, handler: (event: unknown) => void) => {
      handlers.set(name, handler);
      return element;
    },
    mount: (host: HTMLElement) => {
      log.mounted += 1;
      host.dataset.mounted = 'true';
      queueMicrotask(() => {
        handlers.get('ready')?.({
          elementType: 'expressCheckout',
          availablePaymentMethods: methods,
        });
      });
    },
    destroy: () => {
      log.destroyed += 1;
    },
  };
  const confirms = options.confirm ?? [() => Promise.resolve<ConfirmResult>({ type: 'success' })];
  const stripe = {
    initCheckoutElementsSdk: (init: unknown) => {
      log.sdk.push(init);
      return {
        loadActions: () =>
          Promise.resolve(
            options.actionsError
              ? { type: 'error', error: { message: 'x', code: null } }
              : {
                  type: 'success',
                  actions: {
                    confirm: (args: unknown) => {
                      log.confirms.push(args);
                      const next = confirms[Math.min(log.confirms.length - 1, confirms.length - 1)];
                      return next ? next() : Promise.resolve({ type: 'success' });
                    },
                  },
                },
          ),
        createExpressCheckoutElement: (elementOptions: unknown) => {
          log.elementOptions.push(elementOptions);
          return element;
        },
      };
    },
  } as unknown as WalletStripe;
  /** El alumno autoriza el pago en la hoja de su billetera */
  const authorize = () => {
    const paymentFailed = vi.fn();
    act(() => {
      handlers.get('confirm')?.({ expressPaymentType: 'apple_pay', paymentFailed });
    });
    return paymentFailed;
  };
  const fire = (name: string, event: unknown = {}) => {
    act(() => {
      handlers.get(name)?.(event);
    });
  };
  return { stripe, log, authorize, fire };
}
