// Modo oscuro (B2 del plan del cambio, D-121). Cada pantalla pasa axe también en oscuro, con la
// preferencia del sistema en oscuro y sin clase en <html>, que es como la ve quien no eligió tema
import { SCREEN_KEYS, SCREENS } from '@/app/screens';
import {
  expect,
  expectNoSeriousA11yViolations,
  presetPreferences,
  signUp,
  test,
} from './support/fixtures';

test.use({ colorScheme: 'dark' });

for (const key of SCREEN_KEYS) {
  const screen = SCREENS[key];
  test(`en oscuro la pantalla ${screen.number} ${key} pasa axe`, async ({ page }) => {
    if (screen.area === 'physician' || screen.area === 'admin') {
      await presetPreferences(page, { role: 'admin' });
    }
    await page.goto(screen.path);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expectNoSeriousA11yViolations(page);
  });
}

test('en oscuro el tablero de Inicio con sesión pasa axe', async ({ page }) => {
  await signUp(page);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expectNoSeriousA11yViolations(page);
});
