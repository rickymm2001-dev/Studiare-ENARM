// Pases de 1 mes o 1 año con OXXO y SPEI (B10, respuesta 7 y 4.4). Con la bandera cashPasses la forma
// de pago ofrece la ficha OXXO y la transferencia SPEI. Generar la ficha regresa con el pago pendiente,
// y el plan se activa cuando OXXO confirma el pago. Una ficha que vence sin pago no cambia nada. Con un
// pase vigente solo se suma otro pase, que empieza al terminar el primero. La pasarela es simulada y
// nunca se cobra nada
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
import { gatewayText } from '../support/fakeGateway';
import { FAKE_GATEWAY_ORIGIN } from '../support/fakeSupabaseConfig';
import { expectNoSeriousA11yViolations } from '../support/fixtures';

const EMAIL = 'carla.pase@ejemplo.mx';
const text = billingCloudText;

test.describe('Pases con OXXO y SPEI', () => {
  // Con freeTrial apagada, como en producción hasta la corrida real, el Mensual dice Elegir y no la
  // prueba. Los pases no dependen de ella
  test.beforeEach(({ cloud }) => {
    cloud.setFeatureFlags({ cashPasses: true });
  });

  test('OXXO pagado da un pase de un mes y SPEI suma un año que empieza al terminar', async ({
    page,
    cloud,
  }) => {
    const zone = test.info().project.use.timezoneId ?? 'America/Merida';
    await enterWithLink(page, cloud, EMAIL, 'Carla');
    await reloadWithServerFlags(page);
    await page.goto(SCREENS.subscription.path);
    await page
      .getByRole('region', { name: t.billing.plans.monthly, exact: true })
      .getByRole('button', { name: t.billing.choose(t.billing.plans.monthly) })
      .click();

    // OXXO es un pase de un solo pago, con la garantía por transferencia
    await page.getByRole('radio', { name: new RegExp(text.options.oxxo.label) }).click();
    await expect(
      page.getByText([text.summary.pass, text.summary.oxxoRefund].join(' ')),
    ).toBeVisible();
    await expectNoSeriousA11yViolations(page);
    await page.getByRole('button', { name: text.actions.oxxo }).click();

    // La ficha se genera en la pasarela y regresa pendiente, sin esperar el aviso
    await expect(page).toHaveURL(new RegExp(`^${FAKE_GATEWAY_ORIGIN}/c/pay/`));
    await expect(
      page.getByText(gatewayText.passSummary('1 mes', t.billing.price(149), 'OXXO')),
    ).toBeVisible();
    await page.getByRole('button', { name: gatewayText.voucher }).click();
    await expect(page).toHaveURL(/\/suscripcion\?pago=pendiente&metodo=oxxo$/);
    const pending = cloud.paymentsOf(EMAIL)[0];
    expect(pending).toMatchObject({ status: 'pending', method: 'oxxo', amountMxn: 149 });
    // Cuando la nube tiene el pendiente lo dice con su monto y su vencimiento
    await expect(
      page.getByText(
        text.pending.oxxoUntil(t.billing.price(149), longDateIn(pending?.expiresAt ?? '', zone)),
      ),
    ).toBeVisible({ timeout: 20_000 });
    await expect(
      page.getByRole('region', { name: t.billing.current(t.billing.plans.free) }),
    ).toBeVisible();
    await expectNoSeriousA11yViolations(page);

    // OXXO confirma el pago. El plan es el mensual por un pase que no se renueva
    cloud.settleVoucher(EMAIL, 'paid');
    const [first] = cloud.passesOf(EMAIL);
    expect(first).toMatchObject({ plan: 'monthly', method: 'oxxo', status: 'active' });
    await page.goto(SCREENS.subscription.path);
    await expect(
      page.getByText(text.status.pass(longDateIn(first?.endsAt ?? '', zone))),
    ).toBeVisible({ timeout: 20_000 });
    await expect(
      page.getByRole('region', { name: t.billing.current(t.billing.plans.monthly) }),
    ).toBeVisible();
    // Con un pase no hay portal ni prueba. Solo se suma otro pase (8.10)
    await expect(page.getByRole('heading', { name: text.portal.title })).toHaveCount(0);
    await expect(
      page.getByText(text.passNote(longDateIn(first?.endsAt ?? '', zone))),
    ).toBeVisible();
    await expectNoSeriousA11yViolations(page);

    // Suma un año con SPEI
    await page.getByRole('button', { name: text.addPeriod.annual }).click();
    await expect(
      page.getByRole('radio', { name: new RegExp(text.options.card.label) }),
    ).toHaveCount(0);
    await page.getByRole('radio', { name: new RegExp(text.options.spei.label) }).click();
    await expect(
      page.getByText(
        [text.summary.pass, text.summary.passAdds(longDateIn(first?.endsAt ?? '', zone))].join(' '),
      ),
    ).toBeVisible();
    await page.getByRole('button', { name: text.actions.spei }).click();
    await page.getByRole('button', { name: gatewayText.transfer }).click();
    await expect(page).toHaveURL(/\/suscripcion\?pago=pendiente&metodo=spei$/);
    await expect(page.getByText(text.pending.spei(t.billing.price(1499)))).toBeVisible({
      timeout: 20_000,
    });

    // Llega la transferencia. El pase anual empieza cuando termina el mensual
    cloud.fundTransfer(EMAIL);
    const passes = cloud.passesOf(EMAIL);
    expect(passes).toHaveLength(2);
    expect(passes[1]).toMatchObject({ plan: 'annual', method: 'spei' });
    expect(passes[1]?.startsAt).toBe(first?.endsAt);
    await page.goto(SCREENS.subscription.path);
    await expect(
      page.getByText(text.status.pass(longDateIn(passes[1]?.endsAt ?? '', zone))),
    ).toBeVisible({ timeout: 20_000 });
  });

  test('una ficha OXXO que vence sin pago lo dice y no cambia el plan', async ({ page, cloud }) => {
    await enterWithLink(page, cloud, EMAIL, 'Carla');
    await reloadWithServerFlags(page);
    await page.goto(SCREENS.subscription.path);
    await page
      .getByRole('region', { name: t.billing.plans.annual, exact: true })
      .getByRole('button', { name: t.billing.choose(t.billing.plans.annual) })
      .click();
    await page.getByRole('radio', { name: new RegExp(text.options.oxxo.label) }).click();
    await page.getByRole('button', { name: text.actions.oxxo }).click();
    await expect(
      page.getByText(gatewayText.passSummary('1 año', t.billing.price(1499), 'OXXO')),
    ).toBeVisible();
    await page.getByRole('button', { name: gatewayText.voucher }).click();
    await expect(page).toHaveURL(/\/suscripcion\?pago=pendiente&metodo=oxxo$/);
    await expect.poll(() => cloud.paymentsOf(EMAIL)[0]?.status).toBe('pending');

    cloud.settleVoucher(EMAIL, 'expired');
    expect(cloud.paymentsOf(EMAIL)).toMatchObject([{ status: 'expired' }]);
    expect(cloud.passesOf(EMAIL)).toEqual([]);
    await page.goto(SCREENS.subscription.path);
    await expect(page.getByText(text.pending.voucherExpired.oxxo)).toBeVisible({ timeout: 20_000 });
    await expect(
      page.getByRole('region', { name: t.billing.current(t.billing.plans.free) }),
    ).toBeVisible();
    await expectNoSeriousA11yViolations(page);
  });
});
