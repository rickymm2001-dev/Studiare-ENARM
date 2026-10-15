// Cambio de plan en el portal de Stripe (B10, respuesta 9, 2.3). Con una suscripción vigente la tarjeta
// del otro plan dice Cambiar a Anual o Cambiar a Mensual y abre el portal en cambiar de plan. Subir cobra
// hoy la diferencia y el plan cambia por su Price ID. Bajar se programa al final del periodo, la app lo
// avisa y al terminar el periodo queda el plan nuevo. El portal es simulado y nunca se cobra nada
import { SCREENS } from '@/app/screens';
import { billingCloudText } from '@/i18n/billingCloud';
import { t } from '@/i18n/es-MX';
import { enterWithLink, expect, longDateIn, test } from '../support/cloudFixtures';
import { gatewayText } from '../support/fakeGateway';
import { FAKE_PORTAL_ORIGIN } from '../support/fakeSupabaseConfig';
import { expectNoSeriousA11yViolations } from '../support/fixtures';

const EMAIL = 'bruno.cambio@ejemplo.mx';
const text = billingCloudText;
const DAY_MS = 86_400_000;

test.describe('Cambio de plan', () => {
  test('sube de mensual a anual con cobro de la diferencia y baja al final del periodo', async ({
    page,
    cloud,
  }) => {
    const zone = test.info().project.use.timezoneId ?? 'America/Merida';
    // Bruno ya paga el Mensual Fundador desde hace 10 días
    cloud.createUser({ email: EMAIL, alias: 'Bruno' });
    cloud.setSubscription(EMAIL, {
      plan: 'founder',
      status: 'active',
      provider: 'stripe',
      currentPeriodEnd: new Date(Date.now() + 20 * DAY_MS).toISOString(),
    });
    await enterWithLink(page, cloud, EMAIL);
    await page.goto(SCREENS.subscription.path);
    await expect(
      page.getByRole('region', { name: t.billing.current(t.billing.plans.founder) }),
    ).toBeVisible({ timeout: 20_000 });

    // La tarjeta del anual abre el portal en cambiar de plan
    const annual = page.getByRole('region', { name: t.billing.plans.annual, exact: true });
    await expect(annual.getByText(text.changeNote)).toBeVisible();
    await expectNoSeriousA11yViolations(page);
    await annual.getByRole('button', { name: text.changeTo.annual }).click();
    await expect(page).toHaveURL(new RegExp(`^${FAKE_PORTAL_ORIGIN}/p/session/`));
    // La app pidió el portal en cambiar de plan, sin mandar ningún cliente
    expect(
      cloud.calls.filter((call) => call.path === '/functions/v1/create-portal-session').at(-1)
        ?.body,
    ).toEqual({ flow: 'update' });
    // La configuración de Fundadores solo lista sus dos precios, 79 y 749
    await page
      .getByRole('button', { name: gatewayText.changeTo(t.billing.plans.founder_annual) })
      .click();
    await expect(page).toHaveURL(/\/suscripcion$/);

    // Se cobró hoy la diferencia, con el crédito de lo que no usó del mes, y el plan es el anual
    expect(cloud.subscriptionOf(EMAIL)).toMatchObject({ plan: 'founder_annual', status: 'active' });
    const charges = cloud.paymentsOf(EMAIL).filter((payment) => payment.amountMxn > 0);
    expect(charges).toHaveLength(1);
    expect(charges[0]?.amountMxn).toBeGreaterThan(749 - 79);
    expect(charges[0]?.amountMxn).toBeLessThan(749);
    // Cambiar de precio conserva el mismo lugar Fundador
    expect(cloud.founderSeatsTaken()).toBe(1);
    await page.reload();
    await expect(
      page.getByRole('region', { name: t.billing.current(t.billing.plans.founder_annual) }),
    ).toBeVisible({ timeout: 20_000 });

    // Bajar al mensual se programa para el fin del periodo
    const monthly = page.getByRole('region', { name: t.billing.plans.monthly, exact: true });
    await monthly.getByRole('button', { name: text.changeTo.monthly }).click();
    await expect(page).toHaveURL(new RegExp(`^${FAKE_PORTAL_ORIGIN}/p/session/`));
    await page.getByRole('button', { name: gatewayText.changeTo(t.billing.plans.founder) }).click();
    await expect(page).toHaveURL(/\/suscripcion$/);
    expect(cloud.subscriptionOf(EMAIL)).toMatchObject({
      plan: 'founder_annual',
      scheduledChange: true,
    });
    await page.reload();
    const periodEnd = cloud.subscriptionOf(EMAIL)?.currentPeriodEnd ?? '';
    await expect(page.getByText(text.status.scheduled(longDateIn(periodEnd, zone)))).toBeVisible({
      timeout: 20_000,
    });
    await expectNoSeriousA11yViolations(page);

    // Al terminar el periodo queda el mensual, con su cobro, y el aviso se va
    cloud.endPeriod(EMAIL);
    expect(cloud.subscriptionOf(EMAIL)).toMatchObject({
      plan: 'founder',
      status: 'active',
      scheduledChange: false,
    });
    await page.reload();
    await expect(
      page.getByRole('region', { name: t.billing.current(t.billing.plans.founder) }),
    ).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(text.status.scheduled(longDateIn(periodEnd, zone)))).toHaveCount(0);
    expect(cloud.founderSeatsTaken()).toBe(1);
  });
});
