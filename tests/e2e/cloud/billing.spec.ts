// Pago en la nube (Fase P bloque 5, D-096, D-114, D-118 y B10). Con la cuenta conectada, elegir un plan
// abre la forma de pago, que pide la dirección de pago a create-checkout y abre la pasarela. Pagar
// regresa a Suscripción con ?pago=ok y el plan lo confirma el servidor. Aquí el servidor tiene la
// prueba gratis apagada (trialDays en 0), así que el pago es al momento. La prueba se recorre en
// trial.spec.ts. La pasarela y el portal son simulados y nunca se cobra nada
import { SCREENS } from '@/app/screens';
import { PLANS } from '@/config/billing';
import { billingCloudText } from '@/i18n/billingCloud';
import { t } from '@/i18n/es-MX';
import { enterWithLink, expect, test } from '../support/cloudFixtures';
import { gatewayText } from '../support/fakeGateway';
import { FAKE_GATEWAY_ORIGIN, FAKE_PORTAL_ORIGIN } from '../support/fakeSupabaseConfig';
import { expectNoSeriousA11yViolations } from '../support/fixtures';

const EMAIL = 'ana@ejemplo.mx';
const text = billingCloudText;

test.describe('Pago en la nube', () => {
  test.beforeEach(({ cloud }) => {
    cloud.setBillingRules({ trialDays: 0 });
  });

  test('elegir el plan mensual lleva a la pasarela y pagar deja el plan activo', async ({
    page,
    cloud,
  }) => {
    await enterWithLink(page, cloud, EMAIL, 'Ana');
    await page.goto(SCREENS.subscription.path);
    // La descripción de la pantalla dice que el plan lo confirma el servidor. En computadora va oculta
    await expect(page.getByText(text.notice)).toBeAttached();
    await expect(
      page.getByRole('region', { name: t.billing.current(t.billing.plans.free) }),
    ).toBeVisible();

    // El mensual se cobra como Fundador mientras dure la promoción (D-114). Sin prueba se elige
    await page
      .getByRole('region', { name: t.billing.plans.monthly, exact: true })
      .getByRole('button', { name: t.billing.choose(t.billing.plans.monthly) })
      .click();
    await expect(
      page.getByRole('heading', { name: text.checkoutTitle(t.billing.plans.monthly) }),
    ).toBeVisible();
    await expect(page.getByText(text.testMode)).toBeVisible();
    // Con las banderas apagadas solo hay tarjeta, que dice Apple Pay y Google Pay (B10)
    await expect(page.getByRole('radio')).toHaveCount(1);
    await expect(
      page.getByRole('radio', { name: new RegExp(text.options.card.label) }),
    ).toBeVisible();
    await expect(page.getByText(text.summary.charge(t.billing.price(79), 'mes'))).toBeVisible();
    await expectNoSeriousA11yViolations(page);
    await page.getByRole('button', { name: text.go }).click();

    // La pasarela simulada vive en el dominio que la app acepta para Stripe
    await expect(page).toHaveURL(new RegExp(`^${FAKE_GATEWAY_ORIGIN}/c/pay/`));
    await expect(page.getByText(gatewayText.simulated)).toBeVisible();
    await expect(
      page.getByText(
        gatewayText.summary(
          t.billing.plans.founder,
          t.billing.price(PLANS.founder.priceMxn),
          t.billing.periods.founder,
        ),
      ),
    ).toBeVisible();
    expect(cloud.subscriptionOf(EMAIL)).toBeNull();
    await page.getByRole('button', { name: gatewayText.pay }).click();

    // De vuelta en la app, el plan lo confirma el servidor
    await expect(page).toHaveURL(/\/suscripcion\?pago=ok$/);
    await expect(page.getByText(text.returning.confirmed)).toBeVisible({ timeout: 20_000 });
    expect(cloud.subscriptionOf(EMAIL)).toMatchObject({
      plan: 'founder',
      status: 'active',
      provider: 'stripe',
    });
    expect(cloud.paymentsOf(EMAIL)).toMatchObject([
      { amountMxn: 79, status: 'paid', method: 'card', purpose: 'subscription' },
    ]);
    // El primer cobro confirma el lugar Fundador
    expect(cloud.founderSeatsTaken()).toBe(1);
    await expect(
      page.getByRole('region', { name: t.billing.current(t.billing.plans.founder) }),
    ).toBeVisible();
    await expect(page.getByRole('heading', { name: text.portal.title })).toBeVisible();
    // Con un pago vigente no se ofrece otro cobro. El anual se cambia en el portal (D-118, B10)
    const annual = page.getByRole('region', { name: t.billing.plans.annual, exact: true });
    await expect(
      annual.getByRole('button', { name: t.billing.choose(t.billing.plans.annual) }),
    ).toHaveCount(0);
    await expect(annual.getByRole('button', { name: text.changeTo.annual })).toBeVisible();
    await expect(annual.getByText(text.changeNote)).toBeVisible();
    await expectNoSeriousA11yViolations(page);

    // El portal de facturación también es simulado y regresa a Suscripción
    await page.getByRole('button', { name: text.portal.go }).click();
    await expect(page).toHaveURL(new RegExp(`^${FAKE_PORTAL_ORIGIN}/p/session/`));
    await expect(page.getByText(gatewayText.portalSummary(t.billing.plans.founder))).toBeVisible();
    await page.getByRole('link', { name: gatewayText.back }).click();
    await expect(page).toHaveURL(/\/suscripcion$/);
    await expect(
      page.getByRole('region', { name: t.billing.current(t.billing.plans.founder) }),
    ).toBeVisible();
  });

  test('cancelar en la pasarela regresa sin cobrar nada', async ({ page, cloud }) => {
    await enterWithLink(page, cloud, EMAIL, 'Ana');
    await page.goto(SCREENS.subscription.path);
    await page
      .getByRole('region', { name: t.billing.plans.annual, exact: true })
      .getByRole('button', { name: t.billing.choose(t.billing.plans.annual) })
      .click();
    // El anual se cobra como anual Fundador a 749 (B10)
    await expect(page.getByText(text.summary.charge(t.billing.price(749), 'año'))).toBeVisible();
    await page.getByRole('button', { name: text.go }).click();
    await expect(page).toHaveURL(new RegExp(`^${FAKE_GATEWAY_ORIGIN}/c/pay/`));
    await page.getByRole('button', { name: gatewayText.cancel }).click();
    await expect(page).toHaveURL(/\/suscripcion\?pago=cancelado$/);
    await expect(page.getByText(text.returning.canceled)).toBeVisible();
    await expect(
      page.getByRole('region', { name: t.billing.current(t.billing.plans.free) }),
    ).toBeVisible();
    expect(cloud.subscriptionOf(EMAIL)).toBeNull();
  });

  test('con el cupo Fundador lleno ofrece el precio regular, y con un plan pagado no abre otro cobro', async ({
    page,
    cloud,
  }) => {
    await enterWithLink(page, cloud, EMAIL, 'Ana');
    await page.goto(SCREENS.subscription.path);
    await page
      .getByRole('region', { name: t.billing.plans.monthly, exact: true })
      .getByRole('button', { name: t.billing.choose(t.billing.plans.monthly) })
      .click();
    await expectNoSeriousA11yViolations(page);

    // Sin lugares Fundador el servidor responde founder_full y la app ofrece el precio regular
    cloud.founderSeats = 0;
    await page.getByRole('button', { name: text.go }).click();
    await expect(page.getByText(text.errors.founder_full)).toBeVisible();
    const regular = page.getByRole('button', {
      name: text.regularInstead(
        `${t.billing.price(PLANS.monthly.priceMxn)} ${t.billing.periods.monthly}`,
      ),
    });
    await expect(regular).toBeVisible();
    // El botón del precio regular parte su texto en el teléfono en lugar de desbordar (H27 de B1)
    await expectNoSeriousA11yViolations(page);

    // Con un plan pagado vigente el servidor rechaza abrir otro cobro (D-118)
    cloud.setSubscription(EMAIL, {
      plan: 'annual',
      status: 'active',
      provider: 'stripe',
      currentPeriodEnd: new Date(Date.now() + 300 * 86_400_000).toISOString(),
    });
    await regular.click();
    await expect(page.getByText(text.errors.already_subscribed)).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`${SCREENS.subscription.path}$`));
    expect(cloud.paymentsOf(EMAIL)).toEqual([]);
  });
});
