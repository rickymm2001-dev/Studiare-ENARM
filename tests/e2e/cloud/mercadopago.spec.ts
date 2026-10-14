// Mercado Pago (B10, respuesta 8, paso 4 del paquete C). Con la bandera mercadoPago la forma de pago
// ofrece la suscripción de Mercado Pago, sin prueba ni precio Fundador, y su pago único. La suscripción
// se autoriza en Mercado Pago simulado, se administra en la app porque Mercado Pago no tiene portal y se
// cancela con cancel-subscription. Los avisos los arma Mercado Pago simulado con las mismas funciones
// del aviso real. Nada sale a Mercado Pago de verdad
import { SCREENS } from '@/app/screens';
import { billingCloudText } from '@/i18n/billingCloud';
import { t } from '@/i18n/es-MX';
import {
  enterWithLink,
  expect,
  longDateIn,
  reloadWithServerFlags,
  test,
} from '../support/cloudFixtures';
import { mercadoPagoText } from '../support/fakeMercadoPago';
import { FAKE_MERCADOPAGO_ORIGIN } from '../support/fakeSupabaseConfig';
import { expectNoSeriousA11yViolations } from '../support/fixtures';

const EMAIL = 'diego.mp@ejemplo.mx';
const text = billingCloudText;

test.describe('Mercado Pago', () => {
  test.beforeEach(({ cloud }) => {
    cloud.setFeatureFlags({ mercadoPago: true });
  });

  test('suscripción con renovación, sin prueba ni Fundador, y cancelación desde la app', async ({
    page,
    cloud,
  }) => {
    const zone = test.info().project.use.timezoneId ?? 'America/Merida';
    await enterWithLink(page, cloud, EMAIL, 'Diego');
    await reloadWithServerFlags(page);
    await page.goto(SCREENS.subscription.path);
    await page
      .getByRole('region', { name: t.billing.plans.monthly, exact: true })
      .getByRole('button', { name: t.billing.freeTrialCta })
      .click();

    // Mercado Pago cobra el precio regular y no tiene prueba ni códigos de descuento
    await page.getByRole('radio', { name: new RegExp(text.options.mercadopago.label) }).click();
    await expect(page.getByText(text.summary.charge(t.billing.price(149), 'mes'))).toBeVisible();
    await expect(page.getByText(text.summary.code)).toHaveCount(0);
    await expectNoSeriousA11yViolations(page);
    await page.getByRole('button', { name: text.actions.mercadopago }).click();

    await expect(page).toHaveURL(new RegExp(`^${FAKE_MERCADOPAGO_ORIGIN}/subscriptions/checkout`));
    await expect(page.getByText(mercadoPagoText.simulated)).toBeVisible();
    await page.getByRole('button', { name: mercadoPagoText.authorize }).click();

    // El primer cobro aprobado da el plan mensual regular, sin lugar Fundador
    await expect(page).toHaveURL(/\/suscripcion\?pago=ok$/);
    await expect(page.getByText(text.returning.confirmed)).toBeVisible({ timeout: 20_000 });
    expect(cloud.subscriptionOf(EMAIL)).toMatchObject({
      plan: 'monthly',
      status: 'active',
      provider: 'mercadopago',
    });
    expect(cloud.paymentsOf(EMAIL)).toMatchObject([
      { amountMxn: 149, status: 'paid', method: 'mercadopago', purpose: 'subscription' },
    ]);
    expect(cloud.founderSeatsTaken()).toBe(0);

    // Sin portal de Stripe. Para cambiar de plan se cancela y se contrata el otro al terminar
    await expect(page.getByRole('button', { name: text.portal.go })).toHaveCount(0);
    await expect(
      page
        .getByRole('region', { name: t.billing.plans.annual, exact: true })
        .getByText(text.mercadoPagoChangeNote),
    ).toBeVisible();
    await expectNoSeriousA11yViolations(page);

    // Cancela desde la app, con confirmación. El plan vale hasta el fin de lo pagado
    const periodEnd = cloud.subscriptionOf(EMAIL)?.currentPeriodEnd ?? '';
    await page.getByRole('button', { name: text.mercadoPago.cancel }).click();
    await expect(
      page.getByText(text.mercadoPago.confirm(longDateIn(periodEnd, zone))),
    ).toBeVisible();
    await page.getByRole('button', { name: text.mercadoPago.confirmYes }).click();
    await expect(page.getByText(text.mercadoPago.done(longDateIn(periodEnd, zone)))).toBeVisible();
    expect(cloud.subscriptionOf(EMAIL)).toMatchObject({
      status: 'canceled',
      cancelAtPeriodEnd: true,
    });
    await expect(page.getByText(text.status.canceled(longDateIn(periodEnd, zone)))).toBeVisible({
      timeout: 20_000,
    });
    await expect(
      page.getByRole('region', { name: t.billing.current(t.billing.plans.monthly) }),
    ).toBeVisible();
    await expectNoSeriousA11yViolations(page);
  });

  test('pago único con Mercado Pago, aprobado y en efectivo', async ({ page, cloud }) => {
    const zone = test.info().project.use.timezoneId ?? 'America/Merida';
    await enterWithLink(page, cloud, EMAIL, 'Diego');
    await reloadWithServerFlags(page);
    await page.goto(SCREENS.subscription.path);
    await page
      .getByRole('region', { name: t.billing.plans.annual, exact: true })
      .getByRole('button', { name: t.billing.freeTrialCta })
      .click();
    await page
      .getByRole('radio', { name: new RegExp(text.options.mercadopago_pass.label) })
      .click();
    await page.getByRole('button', { name: text.actions.mercadopago }).click();
    await expect(page).toHaveURL(new RegExp(`^${FAKE_MERCADOPAGO_ORIGIN}/checkout/v1/redirect`));
    await page.getByRole('button', { name: mercadoPagoText.pay }).click();

    // Aprobado da un pase anual que no se renueva
    await expect(page).toHaveURL(/\/suscripcion\?pago=ok$/);
    await expect(page.getByText(text.returning.confirmed)).toBeVisible({ timeout: 20_000 });
    const [pass] = cloud.passesOf(EMAIL);
    expect(pass).toMatchObject({ plan: 'annual', method: 'mercadopago', provider: 'mercadopago' });
    await expect(
      page.getByText(text.status.pass(longDateIn(pass?.endsAt ?? '', zone))),
    ).toBeVisible({ timeout: 20_000 });

    // Otro mes en efectivo queda pendiente hasta que Mercado Pago lo confirma, y se suma
    await page.getByRole('button', { name: text.addPeriod.monthly }).click();
    await page
      .getByRole('radio', { name: new RegExp(text.options.mercadopago_pass.label) })
      .click();
    await page.getByRole('button', { name: text.actions.mercadopago }).click();
    await page.getByRole('button', { name: mercadoPagoText.payCash }).click();
    await expect(page).toHaveURL(/\/suscripcion\?pago=pendiente&metodo=mercadopago$/);
    await expect(page.getByText(text.pending.mercadopago)).toBeVisible({ timeout: 20_000 });
    cloud.settleVoucher(EMAIL, 'paid');
    const passes = cloud.passesOf(EMAIL);
    expect(passes).toHaveLength(2);
    expect(passes[1]?.startsAt).toBe(pass?.endsAt);
    await expectNoSeriousA11yViolations(page);
  });
});
