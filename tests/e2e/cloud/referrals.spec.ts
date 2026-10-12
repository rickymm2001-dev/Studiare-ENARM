// Referidos con mes gratis (Fase P bloque 11, D-080, D-096). El servidor da el código, canjea el de otra
// persona y otorga el mes gratis con el primer pago confirmado del referido. La tarjeta vive en Party
import { SCREENS } from '@/app/screens';
import { t } from '@/i18n/es-MX';
import { enterWithLink, expect, openSecondDevice, test } from '../support/cloudFixtures';
import { gatewayText } from '../support/fakeGateway';
import { expectNoSeriousA11yViolations } from '../support/fixtures';

const ANA = 'ana@ejemplo.mx';
const BRUNO = 'bruno@ejemplo.mx';
const text = t.referrals;
/** Lo que dice la tarjeta cuando hay un mes gratis vigente, sin la fecha */
const UNTIL_PREFIX = text.until('§').split('§')[0]?.trim() ?? '';

test.describe('Referidos', () => {
  test('muestra el código propio, rechaza los códigos que no valen y canjea el de quien invitó', async ({
    page,
    browser,
    cloud,
    consoleErrors,
  }) => {
    await enterWithLink(page, cloud, ANA, 'Ana');
    await page.goto(SCREENS.party.path);
    const card = page.getByRole('region', { name: text.title });
    const code = card.getByTestId('referral-code');
    await expect(code).toHaveText(/^[A-Z0-9]{8}$/);
    const anaCode = (await code.textContent()) ?? '';
    expect(anaCode).toBe(cloud.referralCodeOf(ANA));
    await expect(card.getByText(text.pending(0))).toBeVisible();
    await expect(card.getByText(text.months(0))).toBeVisible();
    await expectNoSeriousA11yViolations(page);

    // El código propio y uno que no existe no se canjean
    const input = card.getByLabel(text.redeemLabel);
    const redeem = card.getByRole('button', { name: text.redeem });
    await input.fill(anaCode);
    await redeem.click();
    await expect(card.getByText(text.results.own)).toBeVisible();
    await input.fill('ZZZZ9999');
    await redeem.click();
    await expect(card.getByText(text.results.invalid)).toBeVisible();

    // Bruno canjea el código de Ana desde su propio navegador, aunque lo escriba en minúsculas
    const second = await openSecondDevice(browser, cloud, consoleErrors);
    await enterWithLink(second.page, cloud, BRUNO, 'Bruno');
    await second.page.goto(SCREENS.party.path);
    const brunoCard = second.page.getByRole('region', { name: text.title });
    await brunoCard.getByLabel(text.redeemLabel).fill(anaCode.toLowerCase());
    await brunoCard.getByRole('button', { name: text.redeem }).click();
    await expect(brunoCard.getByText(text.redeemed)).toBeVisible();
    await expect(brunoCard.getByText(text.alreadyReferred)).toBeVisible();
    await expect(brunoCard.getByLabel(text.redeemLabel)).toHaveCount(0);
    expect(cloud.referralsOf(ANA)).toEqual({ pending: 1, completed: 0 });

    // Ana lo ve pendiente. El mes gratis llega hasta el primer pago de Bruno
    await page.reload();
    await expect(card.getByText(text.pending(1))).toBeVisible();
    await expect(card.getByText(text.months(0))).toBeVisible();

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

    await page.reload();
    await expect(card.getByText(text.completed(1))).toBeVisible();
    await expect(card.getByText(text.months(1))).toBeVisible();
    await expect(card.getByText(UNTIL_PREFIX)).toBeVisible();
    await second.context.close();
  });
});
