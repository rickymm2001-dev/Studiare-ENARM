// Pago en la nube (Fase P bloque 5, D-096, D-114, D-118). Con la cuenta conectada, elegir un plan
// pide la dirección de pago a la función create-checkout y abre la pasarela. Pagar regresa a
// Suscripción con ?pago=ok y el plan lo confirma el servidor. La pasarela y el portal son simulados y
// nunca se cobra nada
import { SCREENS } from '@/app/screens';
import { PLANS } from '@/config/billing';
import { t } from '@/i18n/es-MX';
import { enterWithLink, expect, test } from '../support/cloudFixtures';
import { gatewayText } from '../support/fakeGateway';
import { FAKE_GATEWAY_ORIGIN, FAKE_PORTAL_ORIGIN } from '../support/fakeSupabaseConfig';
import { expectNoSeriousA11yViolations } from '../support/fixtures';

const EMAIL = 'ana@ejemplo.mx';
const text = t.billing.cloud;

test.describe('Pago en la nube', () => {
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

    // El mensual se cobra como Fundador mientras dure la promoción (D-114)
    await page.getByRole('button', { name: t.billing.choose(t.billing.plans.monthly) }).click();
    await expect(page.getByRole('heading', { name: text.checkoutTitle })).toBeVisible();
    await expect(page.getByText(text.testMode)).toBeVisible();
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
    await expect(
      page.getByRole('region', { name: t.billing.current(t.billing.plans.founder) }),
    ).toBeVisible();
    await expect(page.getByRole('heading', { name: text.portal.title })).toBeVisible();
    // Con un pago vigente no se ofrece otro cobro (D-118)
    await expect(
      page.getByRole('button', { name: t.billing.choose(t.billing.plans.annual) }),
    ).toHaveCount(0);
    await expect(page.getByText(text.changePlanNote)).toBeVisible();
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
    await page.getByRole('button', { name: t.billing.choose(t.billing.plans.annual) }).click();
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

  test('el servidor avisa cuando el cupo Fundador se llenó y cuando ya hay un plan pagado', async ({
    page,
    cloud,
  }) => {
    await enterWithLink(page, cloud, EMAIL, 'Ana');
    await page.goto(SCREENS.subscription.path);
    await page.getByRole('button', { name: t.billing.choose(t.billing.plans.monthly) }).click();
    await expectNoSeriousA11yViolations(page);

    // Sin lugares Fundador, la app ofrece seguir con el precio regular
    cloud.checkoutError = 'founder_full';
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

    // Con un plan pagado vigente el servidor rechaza abrir otro cobro
    cloud.checkoutError = 'already_subscribed';
    await regular.click();
    await expect(page.getByText(text.errors.already_subscribed)).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`${SCREENS.subscription.path}$`));
    expect(cloud.subscriptionOf(EMAIL)).toBeNull();
  });
});
