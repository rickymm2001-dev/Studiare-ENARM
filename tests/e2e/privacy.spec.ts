// Privacidad en Configuración (D-101, Fase E bloque E6, B3 del plan del cambio). Los consentimientos
// se cambian cuando el alumno quiera. El puntaje oficial es voluntario, se captura en Progreso, solo
// vale con la mejora anónima, que se da en Privacidad, y se borra al retirarla. Eliminar la cuenta
// solo existe con la cuenta en la nube conectada.
import type { Page } from '@playwright/test';
import { SCREENS } from '@/app/screens';
import { t } from '@/i18n/es-MX';
import { expect, expectNoSeriousA11yViolations, signUp, test } from './support/fixtures';

const text = t.settings.privacy;
const section = `${SCREENS.settings.path}#privacidad`;
const improvement = (page: Page) =>
  page.getByRole('checkbox', { name: t.onboarding.consents.anonymized_improvement[0] });
const scoreCard = (page: Page) => page.getByRole('region', { name: text.scoreTitle });

test('el puntaje oficial se guarda en Progreso, sobrevive a recargar y se borra al retirar la mejora anónima', async ({
  page,
}) => {
  await signUp(page);
  // Sin la mejora anónima, Progreso no captura el puntaje y lleva a Privacidad a darla
  await page.goto(SCREENS.progress.path);
  await expect(scoreCard(page).getByText(text.scoreNeedsConsent)).toBeVisible();
  await expect(page.getByLabel(text.score, { exact: true })).toHaveCount(0);
  await scoreCard(page).getByRole('link', { name: t.settingsPage.officialScore.turnOn }).click();
  await expect(page).toHaveURL(new RegExp(`${SCREENS.settings.path}#privacidad$`));
  await expect(page.getByRole('heading', { name: text.consentsTitle })).toBeVisible();
  await expectNoSeriousA11yViolations(page);
  // La mejora anónima empieza apagada (4.27 del plan del cambio)
  await expect(improvement(page)).not.toBeChecked();
  await improvement(page).check();
  await expect(page.getByText(text.consentSaved)).toBeVisible();

  await page.goto(SCREENS.progress.path);
  const card = scoreCard(page);
  await expect(card.getByText(text.none)).toBeVisible();
  // Un puntaje fuera de rango se frena con el aviso en español y no se guarda
  await card.getByLabel(text.score, { exact: true }).fill('150');
  await card.getByRole('button', { name: text.saveScore }).click();
  await expect(card.getByText(text.scoreErrors.invalid_score)).toBeVisible();
  await expect(card.getByText(text.none)).toBeVisible();

  await card.getByLabel(text.score, { exact: true }).fill('72.5');
  await card.getByRole('button', { name: text.saveScore }).click();
  const year = new Date().getFullYear();
  await expect(card.getByText(text.current(year, 72.5))).toBeVisible();
  await expectNoSeriousA11yViolations(page);

  await page.reload();
  await expect(scoreCard(page).getByText(text.current(year, 72.5))).toBeVisible();

  // Retirar la mejora anónima en Privacidad quita el puntaje y la captura
  await page.goto(section);
  await improvement(page).uncheck();
  await expect(page.getByText(text.consentSaved)).toBeVisible();
  await page.goto(SCREENS.progress.path);
  await expect(scoreCard(page).getByText(text.scoreNeedsConsent)).toBeVisible();
  await expect(scoreCard(page).getByText(text.none)).toBeVisible();
  await expect(page.getByLabel(text.score, { exact: true })).toHaveCount(0);
});

test('sin la nube conectada solo está Borrar mis datos y no la baja de la cuenta', async ({
  page,
}) => {
  await signUp(page);
  await page.goto(section);
  await expect(page.getByRole('heading', { name: t.settings.deleteTitle })).toBeVisible();
  await expect(page.getByRole('heading', { name: t.settings.accountDeleteTitle })).toHaveCount(0);
  await expect(page.getByText(t.settings.deleteCloudNote)).toHaveCount(0);
  await expectNoSeriousA11yViolations(page);
});
