// Generar y regenerar los datos de demostración en el navegador real (11.2, 11.3, D-052).
// Confirma que el worker de simulación se empaqueta y que la siembra llega a enarm_demo.
import { SCREENS } from '@/app/screens';
import { t } from '@/i18n/es-MX';
import { expect, expectNoSeriousA11yViolations, test } from './support/fixtures';

test('genera la demo en un worker, la guarda en enarm_demo y la puede regenerar', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await page.goto(`${SCREENS.settings.path}?seccion=account`);
  await page.getByRole('radio', { name: new RegExp(t.database.demo) }).click();
  const panel = page.getByRole('region', { name: t.demoData.title });
  await expect(panel).toContainText(t.demoData.empty);
  await expect(panel).toContainText(t.labels.simulatedData);
  await expectNoSeriousA11yViolations(page);

  await panel.getByRole('button', { name: t.demoData.generate }).click();
  await expect(panel.getByRole('status')).toHaveText(
    /Listo\. Se guardaron [\d,]+ eventos simulados\./,
    {
      timeout: 150_000,
    },
  );
  await expect(page.getByText(t.database.users(301))).toBeVisible();
  await expect(panel).toContainText(t.demoData.ready(301));

  // La base real sigue vacía
  await page.getByRole('radio', { name: new RegExp(t.database.real) }).click();
  await expect(page.getByText(t.database.users(0))).toBeVisible();

  await page.getByRole('radio', { name: new RegExp(t.database.demo) }).click();
  await panel.getByRole('button', { name: t.demoData.regenerate }).click();
  await expect(panel).toContainText(t.demoData.confirmText);
  await panel.getByRole('button', { name: t.demoData.confirm }).click();
  await expect(panel.getByRole('status')).toHaveText(/Listo\./, { timeout: 150_000 });
  await expect(page.getByText(t.database.users(301))).toBeVisible();
});
