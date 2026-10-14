// Referidos con mes gratis (Fase P bloque 11, D-080, D-096, respuesta 77 y 4.3 del plan del cambio,
// B7). El servidor da el código, canjea el de otra persona y otorga el mes gratis con el primer cobro
// confirmado del referido, nunca con la factura de 0 pesos de una prueba gratis ni dos veces por el
// mismo aviso. La tarjeta Invita y gana un mes vive en Party y en Configuración, sección Perfil, y cada
// alumno comparte su enlace /bienvenida?ref=CODIGO, que la bienvenida guarda y se canjea al entrar.
// Una cuenta nueva que entra desde Ya tengo cuenta lo canjea hasta completar su registro (B9)
import { SCREENS } from '@/app/screens';
import { t } from '@/i18n/es-MX';
import {
  enterWithLink,
  expect,
  expectHome,
  openEmailLink,
  openSecondDevice,
  test,
} from '../support/cloudFixtures';
import { gatewayText } from '../support/fakeGateway';
import { expectNoSeriousA11yViolations } from '../support/fixtures';

const ANA = 'ana@ejemplo.mx';
const BRUNO = 'bruno@ejemplo.mx';
const text = t.referrals;
const card = t.b7.referral;
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
    const region = page.getByRole('region', { name: card.title });
    const code = region.getByTestId('referral-code');
    await expect(code).toHaveText(/^[A-Z0-9]{8}$/);
    const anaCode = (await code.textContent()) ?? '';
    expect(anaCode).toBe(cloud.referralCodeOf(ANA));
    await expect(region.getByText(text.pending(0))).toBeVisible();
    await expect(region.getByText(text.months(0))).toBeVisible();
    await expectNoSeriousA11yViolations(page);

    // El código propio y uno que no existe no se canjean
    const input = region.getByLabel(text.redeemLabel);
    const redeem = region.getByRole('button', { name: text.redeem });
    await input.fill(anaCode);
    await redeem.click();
    await expect(region.getByText(text.results.own)).toBeVisible();
    await input.fill('ZZZZ9999');
    await redeem.click();
    await expect(region.getByText(text.results.invalid)).toBeVisible();

    // Bruno canjea el código de Ana desde su propio navegador, aunque lo escriba en minúsculas
    const second = await openSecondDevice(browser, cloud, consoleErrors);
    await enterWithLink(second.page, cloud, BRUNO, 'Bruno');
    await second.page.goto(SCREENS.party.path);
    const brunoCard = second.page.getByRole('region', { name: card.title });
    await brunoCard.getByLabel(text.redeemLabel).fill(anaCode.toLowerCase());
    await brunoCard.getByRole('button', { name: text.redeem }).click();
    await expect(brunoCard.getByText(text.redeemed)).toBeVisible();
    await expect(brunoCard.getByText(text.alreadyReferred)).toBeVisible();
    await expect(brunoCard.getByLabel(text.redeemLabel)).toHaveCount(0);
    expect(cloud.referralsOf(ANA)).toEqual({ pending: 1, completed: 0 });

    // Ana lo ve pendiente. El mes gratis llega hasta el primer pago de Bruno
    await page.reload();
    await expect(region.getByText(text.pending(1))).toBeVisible();
    await expect(region.getByText(text.months(0))).toBeVisible();

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
    await expect(region.getByText(text.completed(1))).toBeVisible();
    await expect(region.getByText(text.months(1))).toBeVisible();
    await expect(region.getByText(UNTIL_PREFIX)).toBeVisible();
    await second.context.close();
  });

  test('con el enlace de Ana, Bruno queda referido al entrar y el mes llega con su primer cobro, no con la prueba', async ({
    page,
    browser,
    cloud,
    consoleErrors,
  }) => {
    // Ana ve su enlace en Configuración, sección Perfil, también en el plan Gratis (4.3)
    await enterWithLink(page, cloud, ANA, 'Ana');
    await page.goto(`${SCREENS.settings.path}#perfil`);
    const region = page.getByRole('region', { name: card.title });
    const anaCode = cloud.referralCodeOf(ANA);
    const link = region.getByTestId('referral-link');
    await expect(link).toHaveText(new RegExp(`/bienvenida\\?ref=${anaCode}$`));
    const invitation = (await link.textContent()) ?? '';
    await expect(region.getByText(text.months(0))).toBeVisible();
    await expectNoSeriousA11yViolations(page);

    // Bruno abre el enlace en su navegador. La bienvenida guarda el código y lo dice
    const second = await openSecondDevice(browser, cloud, consoleErrors);
    await second.page.goto(invitation);
    await expect(second.page.getByText(card.invited(anaCode))).toBeVisible();
    // Al entrar con su correo el código se canjea solo, sin escribirlo
    await enterWithLink(second.page, cloud, BRUNO, 'Bruno');
    await expect
      .poll(() => cloud.referralsOf(ANA), { timeout: 20_000 })
      .toEqual({ pending: 1, completed: 0 });
    await second.page.goto(SCREENS.party.path);
    await expect(
      second.page.getByRole('region', { name: card.title }).getByText(text.alreadyReferred),
    ).toBeVisible();

    // La prueba gratis abre con una factura de 0 pesos. No es un cobro y no da el mes
    expect(
      cloud.paymentNotice({
        eventId: 'evt_prueba_bruno',
        email: BRUNO,
        plan: 'monthly',
        paymentId: 'in_prueba_bruno',
        amountMxn: 0,
      }),
    ).toBe('ignored');
    expect(cloud.referralsOf(ANA)).toEqual({ pending: 1, completed: 0 });
    await page.reload();
    await expect(region.getByText(text.pending(1))).toBeVisible();
    await expect(region.getByText(text.months(0))).toBeVisible();

    // El primer cobro, con la pasarela simulada, da el mes a Ana
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

    // La pasarela repite el aviso de ese cobro y no da otro mes
    const charge = cloud.lastPaymentNotice(BRUNO);
    expect(charge?.amountMxn).toBeGreaterThan(0);
    if (!charge) throw new Error('El cobro de Bruno no dejó aviso');
    expect(cloud.paymentNotice(charge)).toBe('duplicate');

    await page.reload();
    await expect(region.getByText(text.completed(1))).toBeVisible();
    await expect(region.getByText(text.months(1))).toBeVisible();
    await expect(region.getByText(UNTIL_PREFIX)).toBeVisible();
    await second.context.close();
  });

  test('con el enlace de Ana, una cuenta nueva desde Ya tengo cuenta canjea el código hasta completar su registro (B9)', async ({
    page,
    cloud,
  }) => {
    const anaCode = cloud.referralCodeOf(ANA);
    await page.goto(`${SCREENS.onboarding.path}?ref=${anaCode}`);
    await expect(page.getByText(card.invited(anaCode))).toBeVisible();
    // Bruno nunca pasó por Crear cuenta. Pide el código desde Ya tengo cuenta
    await page.getByRole('tab', { name: t.onboarding.loginTab }).click();
    await page.getByLabel(t.account.email, { exact: true }).fill(BRUNO);
    await page.getByRole('button', { name: t.cloud.sendLink }).click();
    await expect(page.getByRole('heading', { name: t.cloud.sentTitle })).toBeVisible();
    const mail = cloud.lastEmail(BRUNO);
    if (!mail) throw new Error('El servidor simulado no registró el correo');
    await openEmailLink(page, mail.link);

    // Sin aceptar el aviso ni confirmar su edad no manda el código, aunque ya reclamó el dispositivo
    await expect(
      page.getByRole('heading', { level: 1, name: t.accounts.completeSignup.title }),
    ).toBeVisible({ timeout: 20_000 });
    await expect.poll(() => cloud.deviceSessionOf(BRUNO)?.deviceId).toBeTruthy();
    expect(cloud.referralsOf(ANA)).toEqual({ pending: 0, completed: 0 });

    await page.getByLabel(t.onboarding.alias, { exact: true }).fill('Bruno');
    await page.getByLabel(t.accounts.signup.adultAccept(18)).check();
    await page.getByLabel(t.onboarding.privacyAccept).check();
    await page.getByRole('button', { name: t.accounts.completeSignup.save }).click();
    await expectHome(page);
    await expect
      .poll(() => cloud.referralsOf(ANA), { timeout: 20_000 })
      .toEqual({ pending: 1, completed: 0 });
    expect(cloud.acceptancesOf(BRUNO)).toHaveLength(1);
  });
});
