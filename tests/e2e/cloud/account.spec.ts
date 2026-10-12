// Cuenta en la nube (D-075, D-115). Crear la cuenta desde la bienvenida manda un correo con enlace y
// código. El enlace abre sesión en el navegador que lo abre y el código sirve en cualquiera. El
// Supabase simulado guarda lo que "se mandó" y la prueba lo lee de ahí
import { SCREENS } from '@/app/screens';
import { t } from '@/i18n/es-MX';
import { expect, expectHome, openEmailLink, test } from '../support/cloudFixtures';
import { expectNoSeriousA11yViolations } from '../support/fixtures';

const EMAIL = 'ana@ejemplo.mx';
/** Lo que dice la sincronización cuando salió bien, sin la fecha */
const SYNC_OK_PREFIX = t.cloud.sync.ok('§').split('§')[0]?.trim() ?? '';

test.describe('Cuenta en la nube', () => {
  test('crea la cuenta con el enlace del correo y vuelve a entrar con el código de seis dígitos', async ({
    page,
    cloud,
  }) => {
    await page.goto(SCREENS.onboarding.path);
    // Con la nube configurada la bienvenida lo dice
    await expect(page.getByText(t.cloud.loginNote)).toBeVisible();
    await page.getByLabel(t.onboarding.alias, { exact: true }).fill('Ana');
    await page.getByLabel(t.account.email, { exact: true }).fill(EMAIL);
    await page.getByLabel(t.onboarding.privacyAccept).check();
    await page.getByRole('button', { name: t.onboarding.create }).click();

    // El correo "salió" con el enlace y un código de un solo uso
    await expect(page.getByRole('heading', { name: t.cloud.sentTitle })).toBeVisible();
    await expect(page.getByText(t.cloud.sentBody(EMAIL))).toBeVisible();
    await expectNoSeriousA11yViolations(page);
    const first = cloud.lastEmail(EMAIL);
    if (!first) throw new Error('El servidor simulado no registró el correo');
    expect(first.code).toMatch(/^\d{6}$/);
    expect(cloud.userByEmail(EMAIL)?.alias).toBe('Ana');

    // Abrir el enlace en este navegador une la cuenta y abre la sesión
    await openEmailLink(page, first.link);
    await expectHome(page);
    await page.goto(SCREENS.profile.path);
    await expect(page.getByText(t.cloud.linked(EMAIL))).toBeVisible();
    // Este navegador reclamó el dispositivo de la cuenta
    await expect.poll(() => cloud.deviceSessionOf(EMAIL)?.deviceId).toBeTruthy();

    // Cerrar sesión solo cierra la de este navegador
    await page.getByRole('button', { name: t.session.signOut }).click();
    await expect(page.getByRole('heading', { name: t.session.signedOutTitle })).toBeVisible();
    await expect
      .poll(() => cloud.calls.filter((call) => call.path.startsWith('/auth/v1/logout')))
      .toHaveLength(1);
    expect(cloud.calls.find((call) => call.path.startsWith('/auth/v1/logout'))?.path).toContain(
      'scope=local',
    );

    // Ya tengo cuenta. El código del correo entra sin abrir el enlace
    await page.goto(SCREENS.onboarding.path);
    await page.getByRole('tab', { name: t.onboarding.loginTab }).click();
    await expect(page.getByText(t.cloud.signInDescription)).toBeVisible();
    await page.getByLabel(t.account.email, { exact: true }).fill(EMAIL);
    await page.getByRole('button', { name: t.cloud.sendLink }).click();
    await expect(page.getByRole('heading', { name: t.cloud.sentTitle })).toBeVisible();
    const second = cloud.lastEmail(EMAIL);
    if (!second) throw new Error('El servidor simulado no registró el segundo correo');
    expect(second.code).not.toBe(first.code);

    const form = page.getByRole('form', { name: t.cloud.code.formLabel });
    // Un código con pocos dígitos ni se manda
    await form.getByLabel(t.cloud.code.label).fill('12');
    await form.getByRole('button', { name: t.cloud.code.submit }).click();
    await expect(form.getByText(t.cloud.code.format)).toBeVisible();
    expect(cloud.calls.filter((call) => call.path.startsWith('/auth/v1/verify'))).toHaveLength(0);

    // Un código incorrecto lo rechaza el servidor y la sesión sigue cerrada
    const wrong = second.code === '000000' ? '111111' : '000000';
    await form.getByLabel(t.cloud.code.label).fill(wrong);
    await form.getByRole('button', { name: t.cloud.code.submit }).click();
    await expect(form.getByRole('status')).toHaveText(t.cloud.code.errors.invalid);
    await expect(page.getByRole('heading', { name: t.cloud.sentTitle })).toBeVisible();

    // El código correcto abre la sesión y el puente une la cuenta
    await form.getByLabel(t.cloud.code.label).fill(second.code);
    await form.getByRole('button', { name: t.cloud.code.submit }).click();
    await expectHome(page);
    await page.goto(SCREENS.profile.path);
    await expect(page.getByText(t.cloud.linked(EMAIL))).toBeVisible();
    // Volver a entrar en el mismo navegador es un reclamo refresh con la sesión nueva, y el servidor
    // lo acepta, así que este navegador sigue siendo el activo y la sincronización termina bien
    await expect(page.getByText(SYNC_OK_PREFIX)).toBeVisible({ timeout: 15_000 });
  });

  test('un código que ya se usó no vuelve a abrir la sesión', async ({ page, cloud }) => {
    cloud.createUser({ email: EMAIL, alias: 'Ana' });
    await page.goto(SCREENS.onboarding.path);
    await page.getByRole('tab', { name: t.onboarding.loginTab }).click();
    await page.getByLabel(t.account.email, { exact: true }).fill(EMAIL);
    await page.getByRole('button', { name: t.cloud.sendLink }).click();
    const email = cloud.lastEmail(EMAIL);
    if (!email) throw new Error('El servidor simulado no registró el correo');

    const form = page.getByRole('form', { name: t.cloud.code.formLabel });
    await form.getByLabel(t.cloud.code.label).fill(email.code);
    await form.getByRole('button', { name: t.cloud.code.submit }).click();
    await expectHome(page);

    // Sale, pide otro correo y prueba el código viejo. Supabase lo rechaza como vencido
    await page.goto(SCREENS.profile.path);
    await page.getByRole('button', { name: t.session.signOut }).click();
    await expect(page.getByRole('heading', { name: t.session.signedOutTitle })).toBeVisible();
    await page.goto(SCREENS.onboarding.path);
    await page.getByRole('tab', { name: t.onboarding.loginTab }).click();
    await page.getByLabel(t.account.email, { exact: true }).fill(EMAIL);
    await page.getByRole('button', { name: t.cloud.sendLink }).click();
    const again = page.getByRole('form', { name: t.cloud.code.formLabel });
    await again.getByLabel(t.cloud.code.label).fill(email.code);
    await again.getByRole('button', { name: t.cloud.code.submit }).click();
    await expect(again.getByRole('status')).toHaveText(t.cloud.code.errors.invalid);
    await expectNoSeriousA11yViolations(page);
  });
});
