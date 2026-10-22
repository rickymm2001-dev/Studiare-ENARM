// Apple Pay y Google Pay dentro de Suscripción (B17, 6.5 y 6.7 del plan de B17). Con la bandera expressWallets
// prendida en el servidor y la llave publicable simulada del build de nube, la forma de pago de la tarjeta suma los
// botones, con Stripe.js simulado (tests/e2e/support/fakeStripeJs.ts): nada sale a Stripe de verdad y nunca se
// cobra. Se prueba que con la bandera apagada no hay ninguna petición a Stripe, que el aviso del cobro está antes
// de los botones, el pago con prueba y sin ella, sin billeteras, un pago rechazado y cancelar la hoja, y que si el
// servidor o Stripe.js fallan queda la página de pago de siempre. Cada prueba revisa accesibilidad, y cualquier
// error de la consola, también una violación de la política de seguridad, la tumba (fixtures)
import { SCREENS } from '@/app/screens';
import { billingCloudText } from '@/i18n/billingCloud';
import { t } from '@/i18n/es-MX';
import { walletTexts } from '@/i18n/wallet';
import { walletCheckoutIdOf } from '../support/fakeBilling';
import { gatewayText } from '../support/fakeGateway';
import {
  cancelFakeWalletSheet,
  fakeStripeJsOf,
  fakeStripeLogOf,
  type FakeStripeJs,
} from '../support/fakeStripeJs';
import { FAKE_GATEWAY_ORIGIN } from '../support/fakeSupabaseConfig';
import {
  enterWithLink,
  expect,
  longDateIn,
  reloadWithServerFlags,
  test as cloudTest,
} from '../support/cloudFixtures';
import { expectNoSeriousA11yViolations } from '../support/fixtures';
import type { Page } from '@playwright/test';

const EMAIL = 'ana.billetera@ejemplo.mx';
const text = billingCloudText;
const DAY_MS = 86_400_000;

const test = cloudTest.extend<{ stripe: FakeStripeJs }>({
  // El Stripe.js simulado de este contexto, con Apple Pay por omisión y el aviso de pago enlazado al Supabase
  // simulado: cuando confirma bien, la suscripción nace como la habría creado el webhook de Stripe
  stripe: async ({ context, cloud }, use) => {
    const fake = fakeStripeJsOf(context);
    if (!fake) throw new Error('El Stripe.js simulado no está enganchado a este contexto');
    fake.resetWallet();
    fake.clear();
    fake.onWalletPaid = (secret) => {
      cloud.billing.completeCheckout(walletCheckoutIdOf(secret), null);
    };
    await use(fake);
    fake.onWalletPaid = null;
  },
});

const region = (page: Page) => page.getByRole('region', { name: walletTexts.title });
const appleButton = (page: Page) =>
  page.getByRole('button', { name: 'Suscribirme con Apple Pay (simulado)' });
const googleButton = (page: Page) =>
  page.getByRole('button', { name: 'Suscribirme con Google Pay (simulado)' });

/** Entra, aplica las banderas del servidor y abre la forma de pago del Mensual, que empieza con Tarjeta */
async function openCheckout(
  page: Page,
  cloud: Parameters<typeof enterWithLink>[1],
  flags: Record<string, boolean>,
  trial: boolean,
): Promise<void> {
  cloud.setFeatureFlags({ expressWallets: true, ...flags });
  await enterWithLink(page, cloud, EMAIL, 'Ana');
  await reloadWithServerFlags(page);
  await page.goto(SCREENS.subscription.path);
  const monthly = page.getByRole('region', { name: t.billing.plans.monthly, exact: true });
  await monthly
    .getByRole('button', {
      name: trial ? t.billing.freeTrialCta : t.billing.choose(t.billing.plans.monthly),
    })
    .click();
  await expect(
    page.getByRole('heading', { name: text.checkoutTitle(t.billing.plans.monthly) }),
  ).toBeVisible();
}

test.describe('Apple Pay y Google Pay en Suscripción', () => {
  test('con la bandera apagada no hay sección ni una sola petición a Stripe, en ninguna pantalla', async ({
    page,
    cloud,
    stripe,
  }) => {
    cloud.setFeatureFlags({ freeTrial: true });
    await enterWithLink(page, cloud, EMAIL, 'Ana');
    await reloadWithServerFlags(page);
    for (const path of [SCREENS.home.path, SCREENS.progress.path, SCREENS.subscription.path]) {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    }
    const monthly = page.getByRole('region', { name: t.billing.plans.monthly, exact: true });
    await monthly.getByRole('button', { name: t.billing.freeTrialCta }).click();
    await expect(
      page.getByRole('radio', { name: new RegExp(text.options.card.label) }),
    ).toBeChecked();
    // La página de pago de siempre sigue ahí, con su resumen del cobro
    await expect(page.getByRole('button', { name: text.actions.trial })).toBeVisible();
    await expect(region(page)).toHaveCount(0);
    await expectNoSeriousA11yViolations(page);
    expect(stripe.requests).toEqual([]);
    expect(await fakeStripeLogOf(page)).toEqual([]);
    // Ni siquiera pidió la sesión de las billeteras al servidor
    expect(
      cloud.calls.filter(
        (call) =>
          call.path.endsWith('/create-checkout') &&
          JSON.stringify(call.body).includes('"ui":"wallet"'),
      ),
    ).toEqual([]);
  });

  test('con la bandera prendida no se pide nada a Stripe hasta abrir la forma de pago de la tarjeta', async ({
    page,
    cloud,
    stripe,
  }) => {
    cloud.setFeatureFlags({ expressWallets: true, freeTrial: true, cashPasses: true });
    await enterWithLink(page, cloud, EMAIL, 'Ana');
    await reloadWithServerFlags(page);
    for (const path of [SCREENS.home.path, SCREENS.progress.path, SCREENS.subscription.path]) {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    }
    expect(stripe.requests).toEqual([]);
    // Se abre la forma de pago, que empieza con Tarjeta, y entonces sí se descarga Stripe.js
    const monthly = page.getByRole('region', { name: t.billing.plans.monthly, exact: true });
    await monthly.getByRole('button', { name: t.billing.freeTrialCta }).click();
    await expect(region(page)).toBeVisible({ timeout: 20_000 });
    await expect(appleButton(page)).toBeVisible();
    expect(stripe.requests.map((request) => request.kind)).toEqual(['script']);
    expect(stripe.requests[0]?.url).toBe('https://js.stripe.com/endive/stripe.js');
    // Elegir otra forma de pago quita los botones y los destruye
    await page.getByRole('radio', { name: new RegExp(text.options.oxxo.label) }).click();
    await expect(region(page)).toHaveCount(0);
    expect((await fakeStripeLogOf(page)).map((entry) => entry.type)).toContain('destroy');
    // Y al volver a Tarjeta se piden otra vez, con otra sesión
    await page.getByRole('radio', { name: new RegExp(text.options.card.label) }).click();
    await expect(appleButton(page)).toBeVisible();
    expect(
      cloud.calls.filter(
        (call) =>
          call.path.endsWith('/create-checkout') &&
          JSON.stringify(call.body).includes('"ui":"wallet"'),
      ),
    ).toHaveLength(2);
  });

  test('con Apple Pay empieza la prueba gratis sin cobrar, y el aviso del cobro está antes de los botones', async ({
    page,
    cloud,
    stripe,
  }) => {
    const zone = test.info().project.use.timezoneId ?? 'America/Merida';
    await openCheckout(page, cloud, { freeTrial: true }, true);
    await expect(region(page)).toBeVisible({ timeout: 20_000 });
    await expect(appleButton(page)).toBeVisible();
    await expect(googleButton(page)).toHaveCount(0);

    // El resumen del cobro automático de la prueba está a la vista y arriba de los botones
    const trialEnd = longDateIn(Date.now() + 7 * DAY_MS, zone);
    const summary = page.getByText(text.summary.trial(trialEnd, t.billing.price(79), 'mes'));
    await expect(summary).toBeVisible();
    const summaryBox = await summary.boundingBox();
    const walletBox = await region(page).boundingBox();
    expect(summaryBox?.y).toBeLessThan(walletBox?.y ?? 0);
    await expect(page.getByText(walletTexts.consentTrial)).toBeVisible();
    await expect(page.getByText(walletTexts.noCode)).toBeVisible();
    // Pagar con la tarjeta sigue a la mano
    await expect(page.getByRole('button', { name: text.actions.trial })).toBeVisible();
    await expectNoSeriousA11yViolations(page);

    // La sesión se pidió con ui wallet, el plan Fundador y la prueba que se avisó
    const wallet = cloud.calls.find(
      (call) =>
        call.path.endsWith('/create-checkout') &&
        JSON.stringify(call.body).includes('"ui":"wallet"'),
    );
    expect(wallet?.body).toEqual({
      plan: 'founder',
      provider: 'stripe',
      mode: 'subscription',
      expectTrial: true,
      ui: 'wallet',
    });

    // Se toca el botón, el alumno autoriza en la hoja y Stripe confirma
    await appleButton(page).click();
    await expect(page).toHaveURL(/\/suscripcion\?pago=ok$/);
    await expect(page.getByText(text.returning.trialStarted)).toBeVisible({ timeout: 20_000 });
    expect(cloud.subscriptionOf(EMAIL)).toMatchObject({ plan: 'founder', status: 'trialing' });
    expect(cloud.paymentsOf(EMAIL)).toEqual([]);
    expect(cloud.founderSeatsTaken()).toBe(1);
    expect(cloud.trialClaimOf(EMAIL)).toMatchObject({ status: 'started', plan: 'founder' });
    await expect(
      page.getByRole('region', { name: t.billing.current(t.billing.plans.founder) }),
    ).toBeVisible();
    // La forma de pago se cerró, sin pasar por la pasarela hospedada
    await expect(
      page.getByRole('heading', { name: text.checkoutTitle(t.billing.plans.monthly) }),
    ).toHaveCount(0);
    expect(page.url().startsWith(FAKE_GATEWAY_ORIGIN)).toBe(false);
    await expectNoSeriousA11yViolations(page);

    // Lo que la app le hizo a Stripe.js
    const log = await fakeStripeLogOf(page);
    const init = log.find((entry) => entry.type === 'init');
    expect(init?.clientSecret).toMatch(/^cs_test_sub_\d+_secret_/);
    expect(log.find((entry) => entry.type === 'Stripe')).toMatchObject({
      key: 'pk_test_' + 'SimuladaPruebasStudiare0000000000',
      locale: 'es-419',
    });
    expect(log.find((entry) => entry.type === 'element')?.options).toMatchObject({
      paymentMethods: {
        applePay: 'auto',
        googlePay: 'auto',
        link: 'never',
        paypal: 'never',
        klarna: 'never',
        amazonPay: 'never',
      },
      buttonType: { applePay: 'subscribe', googlePay: 'subscribe' },
    });
    expect(log.find((entry) => entry.type === 'confirm')).toMatchObject({
      redirect: 'if_required',
      withEvent: true,
    });
    expect(log.map((entry) => entry.type)).toEqual(
      expect.arrayContaining(['mount', 'authorized', 'confirm', 'paid', 'destroy']),
    );
    expect(log.some((entry) => entry.type === 'paymentFailed')).toBe(false);
    // Solo habló con Stripe.js y con la API simulada. Ninguna otra petición
    expect(new Set(stripe.requests.map((request) => request.kind))).toEqual(new Set(['script']));
  });

  test('con Google Pay y sin prueba paga el primer periodo y la suscripción queda activa', async ({
    page,
    cloud,
    stripe,
  }) => {
    stripe.wallet.wallets = { applePay: false, googlePay: true };
    // Sin freeTrial el servidor no da la prueba, y la billetera cobra hoy
    await openCheckout(page, cloud, {}, false);
    await expect(region(page)).toBeVisible({ timeout: 20_000 });
    await expect(googleButton(page)).toBeVisible();
    await expect(appleButton(page)).toHaveCount(0);
    await expect(page.getByText(text.summary.charge(t.billing.price(79), 'mes'))).toBeVisible();
    await expect(page.getByText(walletTexts.consentCharge)).toBeVisible();
    await expect(page.getByText(walletTexts.consentTrial)).toHaveCount(0);
    await expectNoSeriousA11yViolations(page);

    await googleButton(page).click();
    await expect(page).toHaveURL(/\/suscripcion\?pago=ok$/);
    await expect(page.getByText(text.returning.confirmed)).toBeVisible({ timeout: 20_000 });
    expect(cloud.subscriptionOf(EMAIL)).toMatchObject({ plan: 'founder', status: 'active' });
    expect(cloud.paymentsOf(EMAIL)).toMatchObject([{ status: 'paid', amountMxn: 79 }]);
    await expectNoSeriousA11yViolations(page);
  });

  test('sin Apple Pay ni Google Pay lo dice, quita los botones y deja la tarjeta', async ({
    page,
    cloud,
    stripe,
  }) => {
    stripe.wallet.wallets = { applePay: false, googlePay: false };
    await openCheckout(page, cloud, { freeTrial: true }, true);
    await expect(page.getByText(walletTexts.noWallet)).toBeVisible({ timeout: 20_000 });
    await expect(appleButton(page)).toHaveCount(0);
    await expect(googleButton(page)).toHaveCount(0);
    await expect(page.getByText(walletTexts.intro)).toHaveCount(0);
    await expect(page.getByRole('button', { name: text.actions.trial })).toBeEnabled();
    await expectNoSeriousA11yViolations(page);
    expect(cloud.subscriptionOf(EMAIL)).toBeNull();
  });

  test('un pago rechazado se dice con el foco, no cambia el plan y se puede reintentar', async ({
    page,
    cloud,
    stripe,
  }) => {
    stripe.wallet.confirm = 'declined';
    await openCheckout(page, cloud, { freeTrial: true }, true);
    await expect(appleButton(page)).toBeVisible({ timeout: 20_000 });
    await appleButton(page).click();
    const alert = page.getByRole('alert').filter({ hasText: walletTexts.errors.declined });
    await expect(alert).toBeVisible();
    await expect(alert).toBeFocused();
    // El error de Stripe no se muestra en crudo y la hoja se cerró con error
    await expect(page.getByText('Your card was declined')).toHaveCount(0);
    expect((await fakeStripeLogOf(page)).some((entry) => entry.type === 'paymentFailed')).toBe(
      true,
    );
    await expect(page).toHaveURL(new RegExp(`${SCREENS.subscription.path}$`));
    expect(cloud.subscriptionOf(EMAIL)).toBeNull();
    await expectNoSeriousA11yViolations(page);

    // Otro error de Stripe y una excepción tienen su texto
    stripe.wallet.confirm = 'error';
    await appleButton(page).click();
    await expect(page.getByRole('alert')).toContainText(walletTexts.errors.failed);
    stripe.wallet.confirm = 'throw';
    await appleButton(page).click();
    await expect(page.getByRole('alert')).toContainText(walletTexts.errors.unknown);
    expect(cloud.subscriptionOf(EMAIL)).toBeNull();

    // Con otra tarjeta sí pasa, y el aviso del error se va
    stripe.wallet.confirm = 'ok';
    await appleButton(page).click();
    await expect(page).toHaveURL(/\/suscripcion\?pago=ok$/);
    await expect(page.getByText(text.returning.trialStarted)).toBeVisible({ timeout: 20_000 });
    expect(cloud.subscriptionOf(EMAIL)).toMatchObject({ status: 'trialing' });
  });

  test('cancelar la hoja no deja nada raro y se puede pagar después', async ({
    page,
    cloud,
    stripe,
  }) => {
    await openCheckout(page, cloud, { freeTrial: true }, true);
    await expect(appleButton(page)).toBeVisible({ timeout: 20_000 });
    await cancelFakeWalletSheet(page);
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(appleButton(page)).toBeEnabled();
    expect(cloud.subscriptionOf(EMAIL)).toBeNull();
    expect(stripe.wallet.confirm).toBe('ok');
    await appleButton(page).click();
    await expect(page.getByText(text.returning.trialStarted)).toBeVisible({ timeout: 20_000 });
  });

  test('mientras confirma lo dice, y un segundo toque no paga dos veces', async ({
    page,
    cloud,
    stripe,
  }) => {
    stripe.wallet.confirmDelayMs = 1_500;
    await openCheckout(page, cloud, { freeTrial: true }, true);
    await expect(appleButton(page)).toBeVisible({ timeout: 20_000 });
    await appleButton(page).click();
    await expect(page.getByText(walletTexts.confirming)).toBeVisible();
    // Un segundo toque (el botón de la billetera ya no recibe clics) no manda otra confirmación
    await appleButton(page)
      .click({ force: true, noWaitAfter: true })
      .catch(() => undefined);
    await expect(page).toHaveURL(/\/suscripcion\?pago=ok$/, { timeout: 20_000 });
    await expect(page.getByText(text.returning.trialStarted)).toBeVisible({ timeout: 20_000 });
    const confirms = (await fakeStripeLogOf(page)).filter((entry) => entry.type === 'confirm');
    expect(confirms).toHaveLength(1);
    expect(cloud.passesOf(EMAIL)).toEqual([]);
    expect(cloud.trialClaimOf(EMAIL)).toMatchObject({ status: 'started' });
  });

  test('si el servidor no deja abrir el pago lo dice como siempre, quita los botones y deja la tarjeta', async ({
    page,
    cloud,
  }) => {
    await openCheckout(page, cloud, { freeTrial: true }, true);
    await expect(appleButton(page)).toBeVisible({ timeout: 20_000 });
    // Ahora el servidor contesta que ya hay un plan (por ejemplo, pagó en otro aparato) y se cambia el plan
    cloud.checkoutError = 'already_subscribed';
    await page.getByRole('button', { name: text.back }).click();
    const annual = page.getByRole('region', { name: t.billing.plans.annual, exact: true });
    await annual.getByRole('button', { name: t.billing.freeTrialCta }).click();
    await expect(page.getByText(text.errors.already_subscribed)).toBeVisible({ timeout: 20_000 });
    await expect(region(page)).toHaveCount(0);
    await expect(page.getByRole('button', { name: text.actions.trial })).toBeVisible();
    await expectNoSeriousA11yViolations(page);
    expect(cloud.subscriptionOf(EMAIL)).toBeNull();
  });

  test('si Stripe.js no está disponible dice que las billeteras no están y la página de pago sigue funcionando', async ({
    page,
    cloud,
    stripe,
  }) => {
    stripe.wallet.loadError = true;
    await openCheckout(page, cloud, { freeTrial: true }, true);
    await expect(page.getByText(walletTexts.unavailable)).toBeVisible({ timeout: 20_000 });
    await expect(appleButton(page)).toHaveCount(0);
    await expectNoSeriousA11yViolations(page);
    // El camino de siempre funciona
    await page.getByRole('button', { name: text.actions.trial }).click();
    await expect(page).toHaveURL(new RegExp(`^${FAKE_GATEWAY_ORIGIN}/c/pay/`));
    await page.getByRole('button', { name: gatewayText.startTrial }).click();
    await expect(page).toHaveURL(/\/suscripcion\?pago=ok$/);
    await expect(page.getByText(text.returning.trialStarted)).toBeVisible({ timeout: 20_000 });
    expect(cloud.subscriptionOf(EMAIL)).toMatchObject({ status: 'trialing' });
  });

  test('la política de seguridad del build abre Stripe solo para esto y sin scripts en línea', async ({
    page,
    cloud,
  }) => {
    await openCheckout(page, cloud, { freeTrial: true }, true);
    await expect(region(page)).toBeVisible({ timeout: 20_000 });
    const policy = await page
      .locator('meta[http-equiv="Content-Security-Policy"]')
      .getAttribute('content');
    const directive = (name: string) =>
      (policy ?? '')
        .split(';')
        .map((part) => part.trim())
        .find((part) => part.startsWith(`${name} `)) ?? '';
    expect(directive('script-src')).toContain('https://js.stripe.com');
    // wasm-unsafe-eval es de la política de siempre (WebAssembly). Lo que no entra es 'unsafe-inline' ni 'unsafe-eval'
    expect(directive('script-src')).not.toMatch(/'unsafe-(?:inline|eval)'/);
    expect(directive('frame-src')).toContain('https://js.stripe.com');
    expect(directive('connect-src')).toContain('https://api.stripe.com');
    expect(directive('default-src')).not.toContain('stripe');
    expect(directive('img-src')).not.toContain('stripe');
  });
});
