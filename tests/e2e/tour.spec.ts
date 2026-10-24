// Recorrido guiado de ocho pasos (B15, 4.1 a 4.6 y 6.4 del plan de B15). Corre en teléfono y en computadora.
// Cubre el registro y el recorrido completo con Siguiente hasta Terminar, revisando la pantalla, el título y
// el resalte de cada paso, Saltar introducción en los ocho pasos y el salto desde uno del medio, Escape, solo
// con teclado, que no vuelve al recargar, que las cuentas de antes no lo ven solas, Ver el recorrido desde
// Configuración, el paso al centro cuando el ancla no se ve, el ancho de 320 px y axe en el globo, en claro y
// en oscuro. A diferencia de las demás specs, aquí el recorrido sí aparece solo al terminar el registro
// (tourAutoOffer en true), como para quien llega por primera vez.
import AxeBuilder from '@axe-core/playwright';
import type { Locator, Page } from '@playwright/test';
import { SCREENS } from '@/app/screens';
import { TOUR_STEPS, TOUR_STORAGE_KEY, type TourStep } from '@/features/tour/steps';
import { screenOf } from '@/features/tour/tourMachine';
import { t } from '@/i18n/es-MX';
import { tourTexts } from '@/i18n/tour';
import { expect, expectNoHorizontalOverflow, signUp, test } from './support/fixtures';
import { isPhone } from './support/navigation';

test.use({ tourAutoOffer: true });

const TOTAL = TOUR_STEPS.length;
const dialogOf = (page: Page) => page.getByRole('dialog');
const homeTitle = (page: Page) => page.locator('[data-tour-screen="home"] h1');
const skipButton = (page: Page) => page.getByRole('button', { name: tourTexts.skip });
const nextButton = (page: Page) =>
  page.getByRole('button', { name: new RegExp(`^(${tourTexts.next}|${tourTexts.finish})$`) });
const titleOf = (index: number) =>
  `${tourTexts.counter(index + 1, TOTAL)} ${tourTexts.steps[TOUR_STEPS[index] ?? 'welcome'].title}`;
const stepDialog = (page: Page, index: number) =>
  page.getByRole('dialog', { name: titleOf(index), exact: true });

/**
 * Lo que el plan dice que señala cada paso, por el texto que el alumno ve en el menú. En el teléfono
 * Apuntes, Party y Configuración viven en Más (4.2)
 */
function expectedTarget(step: TourStep, phone: boolean): string | null {
  switch (step) {
    case 'welcome':
      return null;
    case 'home':
      return t.navItems.home;
    case 'review':
      return t.navItems.review;
    case 'simulator':
      return t.navItems.simulate;
    case 'progress':
      return t.navItems.progress;
    case 'outlines':
      return phone ? t.navItems.more : t.navItems.outlines;
    case 'party':
      return phone ? t.navItems.more : t.navItems.party;
    case 'settings':
      return phone ? t.navItems.more : t.navItems.settings;
  }
}

/** El elemento del menú por lo que dice. Por CSS y no por rol, porque con el globo abierto el menú queda oculto a los lectores */
function menuItem(page: Page, label: string): Locator {
  return page
    .locator(`nav[aria-label="${t.nav.label}"] :is(a, button)`)
    .filter({ hasText: new RegExp(`^${label}$`) });
}

/**
 * Crea la cuenta por la bienvenida y espera el globo, que aparece solo al llegar a Inicio. No usa signUp de
 * las fixtures, que apaga el recorrido y espera un título de Inicio que el globo ya habría ocultado
 */
async function register(page: Page, alias = 'Ana'): Promise<void> {
  await page.goto(SCREENS.onboarding.path);
  await page.getByLabel(t.onboarding.alias, { exact: true }).fill(alias);
  await page.getByLabel(t.account.email, { exact: true }).fill(`${alias.toLowerCase()}@ejemplo.mx`);
  await page.getByLabel(t.accounts.signup.adultAccept(18)).check();
  await page.getByLabel(t.onboarding.privacyAccept).check();
  await page.getByRole('button', { name: t.onboarding.create }).click();
  await expect(stepDialog(page, 0)).toBeVisible({ timeout: 20_000 });
}

/** Cuenta nueva, y el globo ya pasó por todos sus pasos hasta el que se pide, que queda abierto */
async function registerAndGoTo(page: Page, index: number): Promise<void> {
  await register(page);
  for (let step = 0; step < index; step += 1) {
    await nextButton(page).click();
    await expect(stepDialog(page, step + 1)).toBeVisible();
  }
}

/** La pantalla está en esa ruta, sin importar el hash ni la consulta que traiga la dirección */
const toBeAt = (path: string) => (url: URL) => url.pathname === path;

/** Un globo que ya terminó: no queda diálogo, se vuelve a Inicio y el foco queda en su título */
async function expectBackHome(page: Page): Promise<void> {
  await expect(dialogOf(page)).toHaveCount(0);
  await expect(page).toHaveURL(toBeAt(SCREENS.home.path));
  await expect(homeTitle(page)).toBeFocused();
}

/** Cero violaciones serias o críticas de axe en el globo. Detrás, la página queda oculta a los lectores */
async function expectDialogAccessible(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page })
    .include('[role="dialog"]')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  const serious = results.violations.filter(
    (violation) => violation.impact === 'serious' || violation.impact === 'critical',
  );
  expect(
    serious.map(
      (violation) =>
        `${violation.id}: ${violation.nodes.map((node) => node.target.join(' ')).join(', ')}`,
    ),
    'violaciones serias o críticas de axe en el globo',
  ).toEqual([]);
}

/** Dentro del rectángulo de la pantalla, sin salirse por ningún lado */
async function expectInsideViewport(page: Page, locator: Locator, what: string): Promise<void> {
  const box = await locator.boundingBox();
  const view = page.viewportSize();
  if (!box || !view) throw new Error(`${what} sin medidas`);
  expect(box.x, `${what} a la izquierda`).toBeGreaterThanOrEqual(-0.5);
  expect(box.y, `${what} arriba`).toBeGreaterThanOrEqual(-0.5);
  expect(box.x + box.width, `${what} a la derecha`).toBeLessThanOrEqual(view.width + 0.5);
  expect(box.y + box.height, `${what} abajo`).toBeLessThanOrEqual(view.height + 0.5);
}

test.describe('recorrido guiado', () => {
  test('al terminar el registro recorre los ocho pasos con Siguiente, cada uno en su pantalla y señalando su lugar del menú', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const phone = isPhone(page);
    await register(page);

    for (const [index, step] of TOUR_STEPS.entries()) {
      const dialog = stepDialog(page, index);
      await expect(dialog).toBeVisible();
      await expect(dialog).toContainText(tourTexts.steps[step].text);
      // Cada paso abre su pantalla, con el encabezado que el recorrido usa de ancla
      await expect(page).toHaveURL(toBeAt(SCREENS[screenOf(step)].path));
      await expect(page.locator(`[data-tour-screen="${screenOf(step)}"]`)).toBeAttached();
      // El foco está en el título del paso
      await expect(dialog.getByRole('heading')).toBeFocused();
      // Saltar introducción se ve en los ocho pasos. Atrás, desde el segundo. Terminar, solo en el último
      await expect(skipButton(page)).toBeVisible();
      await expect(page.getByRole('button', { name: tourTexts.back })).toHaveCount(
        index === 0 ? 0 : 1,
      );
      await expect(page.getByRole('button', { name: tourTexts.finish })).toHaveCount(
        index === TOTAL - 1 ? 1 : 0,
      );

      const target = expectedTarget(step, phone);
      const hole = page.locator('[data-tour-hole]');
      if (target === null) {
        // La bienvenida va al centro, sin resalte
        await expect(hole).toHaveCount(0);
        await expect(dialog).toHaveAttribute('data-tour-mode', phone ? 'sheet' : 'center');
      } else {
        // El resalte está sobre el elemento del menú del plan, con 4 px de aire
        const item = menuItem(page, target);
        await expect(item).toHaveCount(1);
        const [itemBox, holeBox, dialogBox] = [
          await item.boundingBox(),
          await hole.boundingBox(),
          await dialog.boundingBox(),
        ];
        if (!itemBox || !holeBox || !dialogBox) throw new Error(`${step} sin medidas`);
        // Lo que se sale de la pantalla por arriba o por la izquierda se recorta en 0, como el resalte
        const left = Math.max(0, itemBox.x - 4);
        const top = Math.max(0, itemBox.y - 4);
        const right = itemBox.x + itemBox.width + 4;
        const bottom = itemBox.y + itemBox.height + 4;
        expect(Math.abs(holeBox.x - left), `${step} x`).toBeLessThanOrEqual(2);
        expect(Math.abs(holeBox.y - top), `${step} y`).toBeLessThanOrEqual(2);
        expect(
          Math.abs(holeBox.x + holeBox.width - right),
          `${step} borde derecho`,
        ).toBeLessThanOrEqual(2);
        expect(
          Math.abs(holeBox.y + holeBox.height - bottom),
          `${step} borde de abajo`,
        ).toBeLessThanOrEqual(2);
        await expect(dialog).toHaveAttribute('data-tour-mode', phone ? 'sheet' : 'anchored');
        // El globo no tapa lo que señala. En el teléfono queda encima de la barra, y en computadora, a su lado
        if (phone) {
          expect(dialogBox.y + dialogBox.height, `${step} globo`).toBeLessThanOrEqual(
            holeBox.y + 1,
          );
        } else {
          expect(dialogBox.x, `${step} globo`).toBeGreaterThanOrEqual(
            holeBox.x + holeBox.width - 1,
          );
        }
      }
      await expectInsideViewport(page, dialog, `globo del paso ${String(index + 1)}`);
      await expectNoHorizontalOverflow(page);

      // Siguiente. El último dice Terminar
      await nextButton(page).click();
    }

    await expectBackHome(page);
  });

  test('queda como visto, así que no vuelve a aparecer al recargar ni al volver a Inicio', async ({
    page,
  }) => {
    await registerAndGoTo(page, 2);
    await skipButton(page).click();
    await expectBackHome(page);
    await page.reload();
    await expect(page.getByRole('heading', { level: 2, name: t.home.reviewsTitle })).toBeVisible();
    await page.goto(SCREENS.review.path);
    await page.goto(SCREENS.home.path);
    await expect(page.getByRole('heading', { level: 2, name: t.home.reviewsTitle })).toBeVisible();
    // Más de una vuelta de la revisión de cada 600 ms
    await page.waitForTimeout(1500);
    await expect(dialogOf(page)).toHaveCount(0);
    const stored = await page.evaluate((key) => localStorage.getItem(key), TOUR_STORAGE_KEY);
    expect(JSON.parse(stored ?? '{}')).toMatchObject({ autoOffer: true });
  });

  test('Saltar introducción salta desde uno del medio, vuelve a Inicio con el foco en su título y deja el menú usable', async ({
    page,
  }) => {
    await registerAndGoTo(page, 3);
    await expect(page).toHaveURL(toBeAt(SCREENS.outlines.path));
    await skipButton(page).click();
    await expectBackHome(page);
    // La página responde otra vez: el menú ya no está oculto a los lectores ni bloqueado
    await expect(page.getByRole('navigation', { name: t.nav.label })).toBeVisible();
    await expect(
      page
        .getByRole('navigation', { name: t.nav.label })
        .getByRole('link', { name: t.navItems.review }),
    ).toBeEnabled();
  });

  test('Escape salta la introducción', async ({ page }) => {
    await registerAndGoTo(page, 2);
    await page.keyboard.press('Escape');
    await expectBackHome(page);
  });

  test('un clic fuera del globo no hace nada', async ({ page }) => {
    await registerAndGoTo(page, 1);
    await page.mouse.click(5, 5);
    await expect(stepDialog(page, 1)).toBeVisible();
    await expect(dialogOf(page)).toHaveCount(1);
  });

  test('solo con teclado. El foco queda en el globo, Tab da la vuelta y las flechas cambian de paso', async ({
    page,
  }) => {
    await register(page);
    await expect(stepDialog(page, 0).getByRole('heading')).toBeFocused();
    // Primer paso. Saltar y Siguiente, y de Siguiente da la vuelta a Saltar
    await page.keyboard.press('Tab');
    await expect(skipButton(page)).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(nextButton(page)).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(skipButton(page)).toBeFocused();

    // Enter en Siguiente avanza, y el foco vuelve al título del paso nuevo
    await page.keyboard.press('Shift+Tab');
    await expect(nextButton(page)).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(stepDialog(page, 1)).toBeVisible();
    await expect(stepDialog(page, 1).getByRole('heading')).toBeFocused();

    // En el segundo paso aparece Atrás, entre Saltar y Siguiente
    await page.keyboard.press('Tab');
    await expect(skipButton(page)).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: tourTexts.back })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(nextButton(page)).toBeFocused();

    // Las flechas cambian de paso y, pase lo que pase, el foco no sale del globo
    await page.keyboard.press('ArrowRight');
    await expect(stepDialog(page, 2)).toBeVisible();
    await page.keyboard.press('ArrowRight');
    await expect(stepDialog(page, 3)).toBeVisible();
    await page.keyboard.press('ArrowLeft');
    await expect(stepDialog(page, 2)).toBeVisible();
    for (let press = 0; press < 8; press += 1) {
      await page.keyboard.press('Tab');
      expect(
        await page.evaluate(() => document.activeElement?.closest('[role="dialog"]') !== null),
      ).toBe(true);
    }

    // Y se termina igual, con el teclado
    await page.keyboard.press('Escape');
    await expectBackHome(page);
  });

  test('una cuenta de antes no lo ve sola, pero lo encuentra en Configuración y empieza en el primer paso', async ({
    page,
  }) => {
    // signUp apaga el recorrido. Después se deja el navegador como el de una cuenta anterior al recorrido, sin
    // marca de registro, y con el recorrido permitido
    await signUp(page, 'Antes');
    await page.evaluate((key) => {
      localStorage.setItem(key, JSON.stringify({ handled: [], autoOffer: true }));
    }, TOUR_STORAGE_KEY);
    await page.reload();
    await expect(page.getByRole('heading', { level: 2, name: t.home.reviewsTitle })).toBeVisible();
    await page.waitForTimeout(1500);
    await expect(dialogOf(page)).toHaveCount(0);

    // En Configuración, Perfil, junto a Tu sesión
    await page.goto(SCREENS.settings.path);
    const session = page.getByRole('region', { name: t.settingsPage.session.title });
    await expect(session.getByText(tourTexts.settings.title)).toBeVisible();
    await session.getByRole('button', { name: tourTexts.settings.button }).click();
    await expect(stepDialog(page, 0)).toBeVisible();
    await expect(page).toHaveURL(toBeAt(SCREENS.home.path));
    await expect(page.getByRole('button', { name: tourTexts.back })).toHaveCount(0);
    await skipButton(page).click();
    await expectBackHome(page);

    // Se puede volver a pedir cuantas veces se quiera
    await page.goto(SCREENS.settings.path);
    await page.getByRole('button', { name: tourTexts.settings.button }).click();
    await expect(stepDialog(page, 0)).toBeVisible();
  });

  test('después de verlo se vuelve a ver desde Configuración y se recorre completo', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await register(page);
    await skipButton(page).click();
    await expectBackHome(page);
    await page.goto(SCREENS.settings.path);
    await page.getByRole('button', { name: tourTexts.settings.button }).click();
    for (let index = 0; index < TOTAL; index += 1) {
      await expect(stepDialog(page, index)).toBeVisible();
      await nextButton(page).click();
    }
    await expectBackHome(page);
  });

  test('a 320 px de ancho, que es un zoom de 200%, el globo cabe y la página no se desborda', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 320, height: 640 });
    await register(page);
    for (let index = 0; index < TOTAL; index += 1) {
      const dialog = stepDialog(page, index);
      await expect(dialog).toBeVisible();
      // La bienvenida, un paso con texto largo, uno en Más y el último
      if ([0, 2, 3, 7].includes(index)) {
        await expectInsideViewport(page, dialog, `globo del paso ${String(index + 1)}`);
        for (const button of await dialog.getByRole('button').all()) {
          await expectInsideViewport(page, button, 'botón');
          expect(
            (await button.boundingBox())?.height ?? 0,
            'alto del botón',
          ).toBeGreaterThanOrEqual(44);
        }
        await expectNoHorizontalOverflow(page);
      }
      if (index < TOTAL - 1) await nextButton(page).click();
    }
    await skipButton(page).click();
    await expectBackHome(page);
  });

  test('no anima nada ni desplaza con suavidad con prefers-reduced-motion', async ({ page }) => {
    // La configuración de las e2e ya pide reducir el movimiento
    await register(page);
    const motion = await page.evaluate(() => {
      const seconds = (list: string) =>
        Math.max(
          ...list
            .split(',')
            .map((value) => value.trim())
            .map((value) =>
              value.endsWith('ms') ? Number.parseFloat(value) / 1000 : Number.parseFloat(value),
            ),
        );
      const parts = [
        ...document.querySelectorAll(
          '[role="dialog"], [role="dialog"] *, [data-tour-backdrop], [data-tour-backdrop] *',
        ),
      ];
      return {
        reduced: matchMedia('(prefers-reduced-motion: reduce)').matches,
        parts: parts.length,
        animations: parts.filter((part) => getComputedStyle(part).animationName !== 'none').length,
        longest: Math.max(
          ...parts.map((part) => {
            const style = getComputedStyle(part);
            return Math.max(seconds(style.transitionDuration), seconds(style.animationDuration));
          }),
        ),
        scroll: getComputedStyle(document.documentElement).scrollBehavior,
      };
    });
    expect(motion.reduced).toBe(true);
    expect(motion.parts).toBeGreaterThan(5);
    // Nada con animación, y las transiciones de los botones quedan en un instante
    expect(motion.animations).toBe(0);
    expect(motion.longest).toBeLessThanOrEqual(0.001);
    expect(motion.scroll).toBe('auto');
  });
});

test.describe('accesibilidad del globo con axe', () => {
  test('claro. Sin violaciones serias en ninguno de los ocho pasos', async ({ page }) => {
    test.setTimeout(180_000);
    await page.emulateMedia({ colorScheme: 'light' });
    await register(page);
    for (let index = 0; index < TOTAL; index += 1) {
      await expect(stepDialog(page, index)).toBeVisible();
      await expectDialogAccessible(page);
      await nextButton(page).click();
    }
    await expectBackHome(page);
  });

  test('oscuro. Sin violaciones serias en ninguno de los ocho pasos', async ({ page }) => {
    test.setTimeout(180_000);
    await page.emulateMedia({ colorScheme: 'dark' });
    await register(page);
    await expect(page.locator('html')).toHaveClass(/dark/);
    for (let index = 0; index < TOTAL; index += 1) {
      await expect(stepDialog(page, index)).toBeVisible();
      await expectDialogAccessible(page);
      await nextButton(page).click();
    }
    await expectBackHome(page);
  });
});
