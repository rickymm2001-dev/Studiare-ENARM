// Recorrido guiado con la cuenta en la nube (B15, 4.1 y 6.4 del plan de B15). Al crear la cuenta con el
// enlace del correo, el recorrido aparece solo al llegar a Inicio, se recorre completo con el plan Gratis
// (Apuntes y Party se ven con su candado y el texto lo dice) y queda como visto. La cuenta ya existente que
// vuelve a entrar con el enlace no lo ve sola, y lo encuentra en Configuración. El resto del recorrido, el
// teclado, axe y los anchos están en tests/e2e/tour.spec.ts, que corre sin nube.
import type { Page } from '@playwright/test';
import { SCREENS } from '@/app/screens';
import { TOUR_STEPS } from '@/features/tour/steps';
import { screenOf } from '@/features/tour/tourMachine';
import { t } from '@/i18n/es-MX';
import { tourTexts } from '@/i18n/tour';
import { enterWithLink, expect, openEmailLink, test } from '../support/cloudFixtures';

test.use({ tourAutoOffer: true });

const EMAIL = 'recorrido@ejemplo.mx';
/** La pantalla está en esa ruta, sin importar el hash que deja el enlace del correo */
const toBeAt = (path: string) => (url: URL) => url.pathname === path;
const dialogNamed = (page: Page, index: number) =>
  page.getByRole('dialog', {
    name: `${tourTexts.counter(index + 1, TOUR_STEPS.length)} ${tourTexts.steps[TOUR_STEPS[index] ?? 'welcome'].title}`,
    exact: true,
  });

test.describe('Recorrido guiado con la nube', () => {
  test('al crear la cuenta con el enlace del correo aparece solo, se recorre con Gratis y no vuelve', async ({
    page,
    cloud,
  }) => {
    test.setTimeout(120_000);
    await page.goto(SCREENS.onboarding.path);
    await page.getByLabel(t.onboarding.alias, { exact: true }).fill('Ana');
    await page.getByLabel(t.account.email, { exact: true }).fill(EMAIL);
    await page.getByLabel(t.accounts.signup.adultAccept(18)).check();
    await page.getByLabel(t.onboarding.privacyAccept).check();
    await page.getByRole('button', { name: t.onboarding.create }).click();
    await expect(page.getByRole('heading', { name: t.cloud.sentTitle })).toBeVisible();

    // Abre el enlace del correo en este navegador. La sesión llega por la nube y el recorrido empieza solo
    const email = cloud.lastEmail(EMAIL);
    if (!email) throw new Error('El servidor simulado no registró el correo');
    await openEmailLink(page, email.link);
    await expect(dialogNamed(page, 0)).toBeVisible({ timeout: 30_000 });

    // Los ocho pasos con el plan Gratis. Cada uno abre su pantalla, y Apuntes y Party lo dicen con su candado
    for (const [index, step] of TOUR_STEPS.entries()) {
      const dialog = dialogNamed(page, index);
      await expect(dialog).toBeVisible();
      await expect(page).toHaveURL(toBeAt(SCREENS[screenOf(step)].path));
      await expect(page.locator(`[data-tour-screen="${screenOf(step)}"]`)).toBeAttached();
      if (step === 'outlines' || step === 'party') {
        await expect(dialog).toContainText('En Gratis lo ves con candado');
        // Sin botón de compra dentro del recorrido (8.19)
        await expect(dialog.getByRole('button')).toHaveText([
          tourTexts.skip,
          tourTexts.back,
          tourTexts.next,
        ]);
      }
      await page
        .getByRole('button', {
          name: index === TOUR_STEPS.length - 1 ? tourTexts.finish : tourTexts.next,
        })
        .click();
    }
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page).toHaveURL(toBeAt(SCREENS.home.path));
    await expect(page.locator('[data-tour-screen="home"] h1')).toBeFocused();

    // Ya lo vio. Ni al recargar ni al volver a entrar con el mismo navegador vuelve a salir
    await page.reload();
    await expect(page.getByRole('heading', { level: 2, name: t.home.reviewsTitle })).toBeVisible();
    await page.waitForTimeout(1500);
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('una cuenta que ya existía no lo ve sola, lo encuentra en Configuración y se salta con Escape', async ({
    page,
    cloud,
  }) => {
    // La cuenta se creó antes, en otro dispositivo, así que este navegador no la dejó marcada
    cloud.createUser({ email: EMAIL, alias: 'Beto' });
    await enterWithLink(page, cloud, EMAIL, 'Beto');
    await page.waitForTimeout(1500);
    await expect(page.getByRole('dialog')).toHaveCount(0);

    await page.goto(SCREENS.settings.path);
    await page.getByRole('button', { name: tourTexts.settings.button }).click();
    await expect(dialogNamed(page, 0)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page).toHaveURL(toBeAt(SCREENS.home.path));
    await expect(page.locator('[data-tour-screen="home"] h1')).toBeFocused();
  });
});
