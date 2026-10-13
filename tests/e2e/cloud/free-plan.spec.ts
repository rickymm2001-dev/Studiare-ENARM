// Plan Gratis con la nube (B8 del plan del cambio, respuesta 20 y 4.3). El plan lo decide el servidor y
// la app lo refleja. En Gratis Party lleva su candado y la app no le pide nada de Party al servidor,
// que de todos modos lo rechazaría (PT001, party_open). Los referidos siguen abiertos. Con un plan de
// pago Party se abre, y cuando el plan vence en el servidor vuelve el candado sin sacar al alumno de
// su grupo. El mes regalado por un referido cuenta como plan de pago. Corre contra el Supabase
// simulado
import { SCREENS } from '@/app/screens';
import { t } from '@/i18n/es-MX';
import { enterWithLink, expect, openSecondDevice, test } from '../support/cloudFixtures';
import type { FakeSupabaseServer } from '../support/fakeSupabase';
import { gatewayText } from '../support/fakeGateway';
import { expectNoSeriousA11yViolations } from '../support/fixtures';

const ANA = 'ana.gratis@ejemplo.mx';
const BRUNO = 'bruno.gratis@ejemplo.mx';
const GROUP = 'Guardia del plan';
const DAY_MS = 86_400_000;

/** Las llamadas de la app a las funciones de Party en la base */
const partyCalls = (cloud: FakeSupabaseServer) =>
  cloud.calls.filter((call) => call.path.includes('/rpc/party_'));

test.describe('Plan Gratis con la nube', () => {
  test('en Gratis Party lleva su candado, los referidos siguen y la app no llama a Party', async ({
    page,
    cloud,
  }) => {
    await enterWithLink(page, cloud, ANA, 'Ana');
    await page.goto(SCREENS.party.path);
    const lock = page.getByRole('region', { name: t.freePlan.party.title });
    await expect(lock).toBeVisible({ timeout: 20_000 });
    await expect(lock.getByRole('link', { name: t.billing.featureSeePlans })).toBeVisible();
    // Invita y gana un mes trae el código propio del servidor (4.3)
    const referral = page.getByRole('region', { name: t.b7.referral.title });
    await expect(referral.getByTestId('referral-code')).toHaveText(/^[A-Z0-9]{8}$/);
    expect(await referral.getByTestId('referral-code').textContent()).toBe(
      cloud.referralCodeOf(ANA),
    );
    await expectNoSeriousA11yViolations(page);

    await page.goto(SCREENS.home.path);
    await expect(
      page
        .getByRole('region', { name: t.widgets.names.party_challenge })
        .getByText(t.freePlan.widget),
    ).toBeVisible({ timeout: 20_000 });
    expect(partyCalls(cloud)).toEqual([]);
  });

  test('con el plan pagado Party se abre y al vencer en el servidor vuelve el candado', async ({
    page,
    cloud,
  }) => {
    cloud.createUser({ email: ANA, alias: 'Ana' });
    cloud.setSubscription(ANA, {
      plan: 'monthly',
      status: 'active',
      provider: 'stripe',
      currentPeriodEnd: new Date(Date.now() + 20 * DAY_MS).toISOString(),
    });
    await enterWithLink(page, cloud, ANA);
    await page.goto(SCREENS.party.path);
    const consent = page.getByRole('region', { name: t.partyCloud.consent.title });
    await expect(consent.getByText(t.partyCloud.consent.body)).toBeVisible({ timeout: 20_000 });
    await consent.getByRole('button', { name: t.partyCloud.consent.allow }).click();
    const create = page.getByRole('region', { name: t.party.createTitle });
    await create.getByLabel(t.party.groupName).fill(GROUP);
    await create.getByRole('button', { name: t.party.create }).click();
    await expect(page.getByRole('region', { name: GROUP })).toBeVisible();
    expect(cloud.party.activeMembers(GROUP)).toHaveLength(1);

    // El plan venció en el servidor. Al abrir otra vez, el servidor ya no deja ver el grupo y la app
    // muestra el candado. Ana sigue en su grupo hasta que salga
    cloud.setSubscription(ANA, {
      plan: 'monthly',
      status: 'canceled',
      provider: 'stripe',
      currentPeriodEnd: new Date(Date.now() - DAY_MS).toISOString(),
    });
    await page.reload();
    await expect(page.getByRole('region', { name: t.freePlan.party.title })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByRole('region', { name: GROUP })).toHaveCount(0);
    expect(cloud.party.activeMembers(GROUP)).toHaveLength(1);
  });

  test('el mes gratis por un referido abre Party', async ({
    page,
    browser,
    cloud,
    consoleErrors,
  }) => {
    test.setTimeout(180_000);
    await enterWithLink(page, cloud, ANA, 'Ana');
    await page.goto(SCREENS.party.path);
    await expect(page.getByRole('region', { name: t.freePlan.party.title })).toBeVisible({
      timeout: 20_000,
    });
    const code = cloud.referralCodeOf(ANA);

    // Bruno canjea el código de Ana desde Party, que en Gratis conserva la tarjeta, y paga su plan
    const second = await openSecondDevice(browser, cloud, consoleErrors);
    await enterWithLink(second.page, cloud, BRUNO, 'Bruno');
    await second.page.goto(SCREENS.party.path);
    const brunoCard = second.page.getByRole('region', { name: t.b7.referral.title });
    await brunoCard.getByLabel(t.referrals.redeemLabel).fill(code);
    await brunoCard.getByRole('button', { name: t.referrals.redeem }).click();
    await expect(brunoCard.getByText(t.referrals.redeemed)).toBeVisible();
    await second.page.goto(SCREENS.subscription.path);
    await second.page
      .getByRole('button', { name: t.billing.choose(t.billing.plans.monthly) })
      .click();
    await second.page.getByRole('button', { name: t.billing.cloud.go }).click();
    await second.page.getByRole('button', { name: gatewayText.pay }).click();
    await expect(second.page.getByText(t.billing.cloud.returning.confirmed)).toBeVisible({
      timeout: 20_000,
    });
    expect(cloud.referralsOf(ANA)).toEqual({ pending: 0, completed: 1 });
    await second.context.close();

    // Con su mes gratis Ana ya entra a Party, que primero pide su permiso
    await page.reload();
    await expect(
      page
        .getByRole('region', { name: t.partyCloud.consent.title })
        .getByText(t.partyCloud.consent.body),
    ).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('region', { name: t.freePlan.party.title })).toHaveCount(0);
  });
});
