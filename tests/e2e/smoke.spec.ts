import { expect, test } from '@playwright/test';

test('la página abre en el navegador', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Prototipo ENARM');
});
