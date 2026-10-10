// Privacidad en Configuración (D-101, Fase E bloque E6). Los consentimientos se cambian cuando el
// alumno quiera. El puntaje oficial es voluntario, solo vale con la mejora anónima y se borra al
// retirarla. Eliminar la cuenta solo existe con la cuenta en la nube conectada.
import { SCREENS } from '@/app/screens';
import { t } from '@/i18n/es-MX';
import { expect, expectNoSeriousA11yViolations, signUp, test } from './support/fixtures';

const text = t.settings.privacy;
const section = `${SCREENS.settings.path}?seccion=privacy`;

test('el puntaje oficial se guarda, sobrevive a recargar y se borra al retirar la mejora anónima', async ({
  page,
}) => {
  await signUp(page);
  await page.goto(section);
  await expect(page.getByRole('heading', { name: text.consentsTitle })).toBeVisible();
  await expect(page.getByText(text.none)).toBeVisible();
  await expectNoSeriousA11yViolations(page);

  // Un puntaje fuera de rango se frena con el aviso en español y no se guarda
  await page.getByLabel(text.score, { exact: true }).fill('150');
  await page.getByRole('button', { name: text.saveScore }).click();
  await expect(page.getByText(text.scoreErrors.invalid_score)).toBeVisible();
  await expect(page.getByText(text.none)).toBeVisible();

  await page.getByLabel(text.score, { exact: true }).fill('72.5');
  await page.getByRole('button', { name: text.saveScore }).click();
  const year = new Date().getFullYear();
  await expect(page.getByText(text.current(year, 72.5))).toBeVisible();

  await page.reload();
  await expect(page.getByText(text.current(year, 72.5))).toBeVisible();

  // Retirar la mejora anónima quita el puntaje y la captura
  await page
    .getByRole('checkbox', { name: t.onboarding.consents.anonymized_improvement[0] })
    .uncheck();
  await expect(page.getByText(text.scoreNeedsConsent)).toBeVisible();
  await expect(page.getByText(text.none)).toBeVisible();
  await expect(page.getByLabel(text.score, { exact: true })).toHaveCount(0);
  await expectNoSeriousA11yViolations(page);
});

test('sin la nube conectada solo está Borrar mis datos y no la baja de la cuenta', async ({
  page,
}) => {
  await signUp(page);
  await page.goto(`${SCREENS.settings.path}?seccion=account`);
  await expect(page.getByRole('heading', { name: t.settings.deleteTitle })).toBeVisible();
  await expect(page.getByRole('heading', { name: t.settings.accountDeleteTitle })).toHaveCount(0);
  await expect(page.getByText(t.settings.deleteCloudNote)).toHaveCount(0);
  await expectNoSeriousA11yViolations(page);
});
