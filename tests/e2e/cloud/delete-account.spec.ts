// Borrar mis datos y eliminar mi cuenta con la nube conectada (D-101, D-106). Primero se borra la copia
// de la nube y, solo si salió bien, lo de este dispositivo. Con una suscripción de Stripe activa el
// servidor se niega a eliminar la cuenta, porque eso no detendría los cobros
import { SCREENS } from '@/app/screens';
import { t } from '@/i18n/es-MX';
import { enterWithLink, expect, test } from '../support/cloudFixtures';
import { expectNoSeriousA11yViolations } from '../support/fixtures';

const EMAIL = 'ana@ejemplo.mx';
const ACCOUNT_SECTION = `${SCREENS.settings.path}?seccion=account`;

test.describe('Borrar la cuenta con la nube', () => {
  test('elimina la cuenta en la nube y los datos de este dispositivo', async ({ page, cloud }) => {
    await enterWithLink(page, cloud, EMAIL, 'Ana');
    await page.goto(ACCOUNT_SECTION);
    await expect(page.getByText(t.settings.deleteCloudNote)).toBeVisible();
    const card = page.getByRole('region', { name: t.settings.accountDeleteTitle });
    await expect(card).toBeVisible();
    await expectNoSeriousA11yViolations(page);

    // Sin la palabra no se puede, y con otra palabra tampoco
    const action = card.getByRole('button', { name: t.settings.accountDeleteAction });
    await expect(action).toBeDisabled();
    await card.getByLabel(t.settings.accountDeleteConfirmLabel).fill('eliminar');
    await expect(action).toBeDisabled();
    await card.getByLabel(t.settings.accountDeleteConfirmLabel).fill(t.settings.accountDeleteWord);
    await action.click();

    // La cuenta ya no existe en la nube y este navegador quedó sin sesión
    await expect.poll(() => cloud.userByEmail(EMAIL)).toBeUndefined();
    expect(cloud.rpcCalls('delete_my_account')).toHaveLength(1);
    await expect(page.getByRole('region', { name: t.settings.accountDeleteTitle })).toHaveCount(0);
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: t.landing.title })).toBeVisible();
    // El correo queda libre. Entrar otra vez crea una cuenta nueva
    await enterWithLink(page, cloud, EMAIL, 'Ana');
    expect(cloud.userByEmail(EMAIL)).toBeDefined();
  });

  test('con una suscripción de Stripe activa el servidor no borra nada', async ({
    page,
    cloud,
  }) => {
    cloud.createUser({ email: EMAIL, alias: 'Ana' });
    cloud.setSubscription(EMAIL, {
      plan: 'monthly',
      status: 'active',
      provider: 'stripe',
      currentPeriodEnd: new Date(Date.now() + 20 * 86_400_000).toISOString(),
    });
    await enterWithLink(page, cloud, EMAIL);
    await page.goto(ACCOUNT_SECTION);
    const card = page.getByRole('region', { name: t.settings.accountDeleteTitle });
    await card.getByLabel(t.settings.accountDeleteConfirmLabel).fill(t.settings.accountDeleteWord);
    await card.getByRole('button', { name: t.settings.accountDeleteAction }).click();

    await expect(card.getByRole('alert')).toHaveText(t.settings.eraseErrors.active_subscription);
    expect(cloud.userByEmail(EMAIL)).toBeDefined();
    expect(cloud.subscriptionOf(EMAIL)?.status).toBe('active');
    // La sesión sigue abierta y nada se borró en este dispositivo
    await expect(page.getByText(t.settings.deleteCloudNote)).toBeVisible();
    await expectNoSeriousA11yViolations(page);

    // Ya cancelada, con el periodo pagado por delante, sí se puede
    cloud.setSubscription(EMAIL, {
      plan: 'monthly',
      status: 'canceled',
      provider: 'stripe',
      currentPeriodEnd: new Date(Date.now() + 20 * 86_400_000).toISOString(),
    });
    await card.getByRole('button', { name: t.settings.accountDeleteAction }).click();
    await expect.poll(() => cloud.userByEmail(EMAIL)).toBeUndefined();
  });

  test('borrar mis datos limpia la copia de la nube y conserva la cuenta', async ({
    page,
    cloud,
  }) => {
    await enterWithLink(page, cloud, EMAIL, 'Ana');
    await page.goto(ACCOUNT_SECTION);
    const card = page.getByRole('region', { name: t.settings.deleteTitle });
    await card.getByRole('button', { name: t.settings.delete }).click();
    await expect(card.getByText(t.settings.deleteCloudConfirmText)).toBeVisible();
    await card.getByRole('button', { name: t.settings.deleteConfirm }).click();

    await expect.poll(() => cloud.rpcCalls('delete_my_data')).toHaveLength(1);
    expect(cloud.userByEmail(EMAIL)).toBeDefined();
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: t.landing.title })).toBeVisible();
  });
});
