// Un solo dispositivo activo por cuenta (acuerdo del 2026-10-07, migraciones single_device y
// device_barrier). Gana el último navegador en entrar. El anterior lo descubre al sincronizar y al
// revisar su fila, avisa y cierra su sesión. Cambiar de dispositivo demasiadas veces en un día lo
// frena el servidor con la hora en que puede volver a intentarlo
import { SCREENS } from '@/app/screens';
import { t } from '@/i18n/es-MX';
import {
  enterWithLink,
  expect,
  openEmailLink,
  openSecondDevice,
  retryTimeLabel,
  test,
} from '../support/cloudFixtures';
import { expectNoSeriousA11yViolations } from '../support/fixtures';

const EMAIL = 'ana@ejemplo.mx';
/** Lo que dice la sincronización cuando salió bien, sin la fecha */
const SYNC_OK_PREFIX = t.cloud.sync.ok('§').split('§')[0]?.trim() ?? '';

test.describe('Dispositivo único por cuenta', () => {
  test('el segundo navegador toma la cuenta y el primero ve el aviso al sincronizar', async ({
    page,
    browser,
    cloud,
    consoleErrors,
  }) => {
    await enterWithLink(page, cloud, EMAIL, 'Ana');
    await expect.poll(() => cloud.deviceSessionOf(EMAIL)?.deviceId).toBeTruthy();
    const firstDevice = cloud.deviceSessionOf(EMAIL)?.deviceId;

    await page.goto(SCREENS.profile.path);
    await expect(page.getByText(t.cloud.linked(EMAIL))).toBeVisible();
    await expect(page.getByText(SYNC_OK_PREFIX)).toBeVisible({ timeout: 15_000 });

    // Otro navegador entra con la misma cuenta y se queda con el dispositivo
    const second = await openSecondDevice(browser, cloud, consoleErrors);
    await enterWithLink(second.page, cloud, EMAIL);
    await expect.poll(() => cloud.deviceSessionOf(EMAIL)?.deviceId).not.toBe(firstDevice);

    // El primero ya no puede subir nada
    await page.getByRole('button', { name: t.cloud.sync.syncNow }).click();
    await expect(page.getByText(t.cloud.sync.device)).toBeVisible();

    // Y en su siguiente revisión, al volver a enfocar la pestaña, ve el aviso y queda fuera
    const notice = page.getByRole('alert').filter({ hasText: t.cloud.otherDevice.title });
    await expect
      .poll(
        async () => {
          await page.evaluate(() => {
            window.dispatchEvent(new Event('focus'));
          });
          return notice.isVisible();
        },
        { timeout: 20_000 },
      )
      .toBe(true);
    await expect(notice).toContainText(t.cloud.otherDevice.body);
    await expect(page.getByRole('heading', { name: t.session.signedOutTitle })).toBeVisible();
    await expectNoSeriousA11yViolations(page);
    await notice.getByRole('button', { name: t.cloud.otherDevice.dismiss }).click();
    await expect(notice).toHaveCount(0);

    // El segundo sigue con la cuenta
    await second.page.goto(SCREENS.profile.path);
    await expect(second.page.getByText(t.cloud.linked(EMAIL))).toBeVisible();
    await expect(second.page.getByText(SYNC_OK_PREFIX)).toBeVisible({ timeout: 15_000 });
    await second.context.close();
  });

  test('pasado el límite de cambios el servidor no deja entrar y dice a qué hora reintentar', async ({
    page,
    browser,
    cloud,
    consoleErrors,
  }) => {
    // Un solo cambio de dispositivo por día. El primer reclamo de la cuenta no cuenta
    cloud.deviceLimits = { maxChanges: 1, windowHours: 24 };
    await enterWithLink(page, cloud, EMAIL, 'Ana');
    await expect.poll(() => cloud.deviceSessionOf(EMAIL)?.deviceId).toBeTruthy();
    const firstDevice = cloud.deviceSessionOf(EMAIL)?.deviceId;

    const second = await openSecondDevice(browser, cloud, consoleErrors);
    await enterWithLink(second.page, cloud, EMAIL);
    await expect.poll(() => cloud.deviceSessionOf(EMAIL)?.deviceId).not.toBe(firstDevice);
    const secondDevice = cloud.deviceSessionOf(EMAIL)?.deviceId;

    // El primero vuelve a entrar con un correo nuevo. Sería el segundo cambio del día
    await openEmailLink(page, cloud.issueMagicLink(EMAIL));
    const notice = page.getByRole('alert').filter({ hasText: t.cloud.deviceLimit.title });
    await expect(notice).toBeVisible({ timeout: 20_000 });
    const retryAt = cloud.deviceLimitRetryAt(EMAIL);
    if (retryAt === null) throw new Error('El servidor simulado no fijó la hora de reintento');
    const timeZone = test.info().project.use.timezoneId ?? 'America/Merida';
    await expect(notice).toContainText(`a las ${retryTimeLabel(retryAt, timeZone)} h`);
    // Sin un correo de ayuda configurado en el build no se inventa ninguno
    await expect(notice).toContainText(t.cloud.deviceLimit.helpWithoutContact);
    await expectNoSeriousA11yViolations(page);

    // El reclamo rechazado quedó en la bitácora y el segundo navegador conserva la cuenta
    expect(cloud.rpcCalls('log_rejected_claim')).toHaveLength(1);
    expect(cloud.deviceSessionOf(EMAIL)?.deviceId).toBe(secondDevice);
    // La sesión de este navegador se cerró
    await expect(page.getByRole('heading', { level: 1, name: t.landing.title })).toBeVisible();
    await notice.getByRole('button', { name: t.cloud.deviceLimit.dismiss }).click();
    await expect(notice).toHaveCount(0);

    await second.page.goto(SCREENS.profile.path);
    await expect(second.page.getByText(t.cloud.linked(EMAIL))).toBeVisible();
    await second.context.close();
  });
});
