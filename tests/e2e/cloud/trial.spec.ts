// Prueba gratis de 7 días con tarjeta (B10, respuesta 18, 5.4). El candado ofrece la prueba con la
// bandera freeTrial y abre la forma de pago del Mensual, que avisa que hoy no se cobra nada y cuándo
// termina. La prueba aparta el lugar Fundador, se ve en Suscripción y en Perfil, y se cancela en el
// portal. Al terminar sin cobro el lugar se libera y la segunda prueba ya no está disponible. La
// pasarela y el portal son simulados y nunca se cobra nada
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
import { FAKE_GATEWAY_ORIGIN, FAKE_PORTAL_ORIGIN } from '../support/fakeSupabaseConfig';
import { expectNoSeriousA11yViolations } from '../support/fixtures';

const EMAIL = 'ana.prueba@ejemplo.mx';
const text = billingCloudText;
const DAY_MS = 86_400_000;

test.describe('Prueba gratis', () => {
  test('el candado ofrece la prueba, empieza sin cobro, aparta el lugar y se ve en Suscripción y en Perfil', async ({
    page,
    cloud,
  }) => {
    const zone = test.info().project.use.timezoneId ?? 'America/Merida';
    cloud.setFeatureFlags({ freeTrial: true });
    await enterWithLink(page, cloud, EMAIL, 'Ana');
    await reloadWithServerFlags(page);

    // El candado de Party ofrece la prueba y abre la forma de pago del Mensual
    await page.goto(SCREENS.party.path);
    const lock = page.getByRole('region', { name: t.freePlan.party.title });
    await lock.getByRole('link', { name: t.billing.freeTrialCta }).click();
    await expect(page).toHaveURL(new RegExp(`${SCREENS.subscription.path}$`));
    await expect(
      page.getByRole('heading', { name: text.checkoutTitle(t.billing.plans.monthly) }),
    ).toBeVisible();

    // El aviso dice que hoy no se cobra nada, cuándo termina y cuánto se cobra ese día
    const trialEnd = longDateIn(Date.now() + 7 * DAY_MS, zone);
    await expect(
      page.getByText(text.summary.trial(trialEnd, t.billing.price(79), 'mes')),
    ).toBeVisible();
    await expect(
      page.getByRole('radio', {
        name: new RegExp(text.options.card.label),
      }),
    ).toBeVisible();
    await expectNoSeriousA11yViolations(page);
    await page.getByRole('button', { name: text.actions.trial }).click();

    // La pasarela dice 7 días gratis y hoy no se cobra nada
    await expect(page).toHaveURL(new RegExp(`^${FAKE_GATEWAY_ORIGIN}/c/pay/`));
    await expect(page.getByText(gatewayText.simulated)).toBeVisible();
    await expect(
      page.getByText(gatewayText.trialSummary(7, t.billing.price(79), t.billing.periods.monthly)),
    ).toBeVisible();
    await page.getByRole('button', { name: gatewayText.startTrial }).click();

    // De vuelta, la prueba empezó sin cobro y apartó el lugar Fundador
    await expect(page).toHaveURL(/\/suscripcion\?pago=ok$/);
    await expect(page.getByText(text.returning.trialStarted)).toBeVisible({ timeout: 20_000 });
    expect(cloud.subscriptionOf(EMAIL)).toMatchObject({ plan: 'founder', status: 'trialing' });
    expect(cloud.paymentsOf(EMAIL)).toEqual([]);
    expect(cloud.founderSeatsTaken()).toBe(1);
    expect(cloud.trialClaimOf(EMAIL)).toMatchObject({ status: 'started', plan: 'founder' });
    const serverEnd = cloud.subscriptionOf(EMAIL)?.trialEndsAt ?? '';
    await expect(
      page.getByText(text.status.trialing(longDateIn(serverEnd, zone), t.billing.price(79))),
    ).toBeVisible();
    await expect(
      page.getByRole('region', { name: t.billing.current(t.billing.plans.founder) }),
    ).toBeVisible();
    await expectNoSeriousA11yViolations(page);

    // Perfil dice lo mismo, con su salvo que canceles
    await page.goto(`${SCREENS.settings.path}#perfil`);
    const plan = page.getByRole('region', { name: t.settingsPage.plan.title });
    await expect(
      plan.getByText(
        t.settingsPage.plan.trialing(longDateIn(serverEnd, zone), t.billing.price(79)),
      ),
    ).toBeVisible();
    await expectNoSeriousA11yViolations(page);

    // En el portal cancela dentro de la prueba. La prueba sigue hasta su fin y no se cobra
    await page.goto(SCREENS.subscription.path);
    await page.getByRole('button', { name: text.portal.go }).click();
    await expect(page).toHaveURL(new RegExp(`^${FAKE_PORTAL_ORIGIN}/p/session/`));
    await page.getByRole('button', { name: gatewayText.cancelSubscription }).click();
    await expect(page).toHaveURL(/\/suscripcion$/);
    await page.reload();
    await expect(
      page.getByText(text.status.trialCanceled(longDateIn(serverEnd, zone))),
    ).toBeVisible({ timeout: 20_000 });
    expect(cloud.subscriptionOf(EMAIL)).toMatchObject({
      status: 'trialing',
      cancelAtPeriodEnd: true,
    });

    // La prueba termina sin cobro. El lugar se libera y la cuenta vuelve a Gratis
    cloud.endTrial(EMAIL, 'cancel');
    expect(cloud.founderSeatsTaken()).toBe(0);
    expect(cloud.trialClaimOf(EMAIL)).toMatchObject({ status: 'canceled' });
    expect(cloud.paymentsOf(EMAIL)).toEqual([]);
    await page.reload();
    await expect(
      page.getByRole('region', { name: t.billing.current(t.billing.plans.free) }),
    ).toBeVisible({ timeout: 20_000 });

    // La segunda prueba ya no está disponible. El botón dice Elegir y la tarjeta cobra al momento
    const monthly = page.getByRole('region', { name: t.billing.plans.monthly, exact: true });
    await expect(
      monthly.getByRole('button', { name: t.billing.choose(t.billing.plans.monthly) }),
    ).toBeVisible();
    await expect(monthly.getByRole('button', { name: t.billing.freeTrialCta })).toHaveCount(0);
    await monthly.getByRole('button', { name: t.billing.choose(t.billing.plans.monthly) }).click();
    await expect(
      page.getByRole('radio', {
        name: new RegExp(
          text.options.card
            .noTrial(t.billing.price(79), t.billing.periods.monthly)
            .replace(/[$.]/g, (char) => `\\${char}`),
        ),
      }),
    ).toBeVisible();
    await expect(page.getByText(text.summary.charge(t.billing.price(79), 'mes'))).toBeVisible();
    await expectNoSeriousA11yViolations(page);
  });

  test('al terminar la prueba con cobro el plan sigue, confirma el lugar y cuenta la garantía', async ({
    page,
    cloud,
  }) => {
    const zone = test.info().project.use.timezoneId ?? 'America/Merida';
    await enterWithLink(page, cloud, EMAIL, 'Ana');
    await page.goto(SCREENS.subscription.path);
    // La prueba no depende de la bandera. La decide el servidor y Suscripción la ofrece
    await page
      .getByRole('region', { name: t.billing.plans.annual, exact: true })
      .getByRole('button', { name: t.billing.freeTrialCta })
      .click();
    await expect(
      page.getByRole('heading', { name: text.checkoutTitle(t.billing.plans.annual) }),
    ).toBeVisible();
    await page.getByRole('button', { name: text.actions.trial }).click();
    await page.getByRole('button', { name: gatewayText.startTrial }).click();
    await expect(page.getByText(text.returning.trialStarted)).toBeVisible({ timeout: 20_000 });
    expect(cloud.subscriptionOf(EMAIL)).toMatchObject({
      plan: 'founder_annual',
      status: 'trialing',
    });

    // Tres días antes del fin queda en la cola el correo de fin de la prueba (B15 lo manda)
    cloud.advanceTime(5 * DAY_MS);
    expect(cloud.outbox().map((mail) => mail.kind)).toEqual(['trial_ending']);

    cloud.endTrial(EMAIL, 'charge');
    expect(cloud.paymentsOf(EMAIL)).toMatchObject([{ amountMxn: 749, status: 'paid' }]);
    expect(cloud.trialClaimOf(EMAIL)).toMatchObject({ status: 'converted' });
    expect(cloud.founderSeatsTaken()).toBe(1);
    await page.reload();
    const renews = cloud.subscriptionOf(EMAIL)?.currentPeriodEnd ?? '';
    await expect(
      page.getByText(text.status.renews(longDateIn(renews, zone), t.billing.price(749))),
    ).toBeVisible({ timeout: 20_000 });
    await expect(
      page.getByRole('region', { name: t.billing.current(t.billing.plans.founder_annual) }),
    ).toBeVisible();
  });
});
