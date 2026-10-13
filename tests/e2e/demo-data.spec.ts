// Generar y regenerar los datos de demostración en el navegador real (11.2, 11.3, D-052).
// Confirma que el worker de simulación se empaqueta y que la siembra llega a enarm_demo. El cambio de
// base y el generador viven en Datos de demostración del admin (B3 del plan del cambio, 5.4).
import { SCREENS } from '@/app/screens';
import { t } from '@/i18n/es-MX';
import { adminText } from '@/i18n/admin';
import { switchDatabase } from './support/b1';
import { expect, expectNoSeriousA11yViolations, test } from './support/fixtures';

const text = adminText.adminDemo;

test('genera la demo en un worker, la guarda en enarm_demo y la puede regenerar', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await switchDatabase(page, 'demo', { stayAsAdmin: true });
  await expect(page).toHaveURL(new RegExp(`${SCREENS.demoData.path}$`));
  const generator = page.getByRole('region', { name: text.adjust.title });
  await expect(generator).toContainText(text.adjust.empty);
  await expect(generator).toContainText(t.labels.simulatedData);
  await expectNoSeriousA11yViolations(page);

  await generator.getByRole('button', { name: text.generate }).click();
  await expect(generator.getByRole('status')).toHaveText(
    /Listo\. Se guardaron [\d,]+ eventos simulados\./,
    {
      timeout: 150_000,
    },
  );
  await expect(page.getByText(t.database.users(301))).toBeVisible();
  await expect(generator).toContainText(text.adjust.ready);

  // La base real sigue vacía
  await page.getByRole('radio', { name: new RegExp(t.database.real) }).click();
  await expect(page.getByText(t.database.users(0))).toBeVisible();

  await page.getByRole('radio', { name: new RegExp(t.database.demo) }).click();
  await generator.getByRole('button', { name: text.regenerate }).click();
  await expect(generator).toContainText(text.confirmRegenerate);
  await generator.getByRole('button', { name: text.confirmRegenerateYes }).click();
  await expect(generator.getByRole('status')).toHaveText(/Listo\./, { timeout: 150_000 });
  await expect(page.getByText(t.database.users(301))).toBeVisible();
});
