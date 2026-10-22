// Examen con hoja de respuestas (V4-B5). Con la opción encendida las opciones de la pregunta solo se
// leen y la respuesta se llena en un alveolo de la hoja, como en la hoja de lectura óptica del examen
// real. Un alveolo solo se llena si la pregunta ya se vio y el llenado sobrevive a una recarga.
import type { Page } from '@playwright/test';
import { SCREENS } from '@/app/screens';
import { examTotalMs } from '@/engines/exam';
import { t } from '@/i18n/es-MX';
import { expect, expectNoSeriousA11yViolations, signUp, test } from './support/fixtures';

const QUESTIONS = 20;

async function startWithSheet(page: Page) {
  await page.goto(SCREENS.simulatorSetup.path);
  const card = page.getByRole('region', { name: t.exam.cardTitle });
  await expect(card.getByText(t.exam.timeTotal(examTotalMs(QUESTIONS)))).toBeVisible({
    timeout: 60_000,
  });
  await card.getByText(t.exam.settings, { exact: true }).click();
  await card.getByLabel(t.answerSheet.optionLabel).check();
  await card.getByRole('button', { name: t.exam.start }).click();
  await expect(page).toHaveURL(new RegExp(`${SCREENS.exam.path}$`));
  await expect(page.getByRole('timer')).toBeVisible();
}

const bubble = (page: Page, question: number, letter: string) =>
  page.getByRole('radio', { name: t.answerSheet.bubble(question, letter), exact: true });

test('la respuesta se llena en la hoja y no en la opción de la pregunta', async ({ page }) => {
  test.setTimeout(240_000);
  await signUp(page);
  await startWithSheet(page);

  const sheet = page.getByRole('region', { name: t.answerSheet.title });
  await expect(sheet).toBeVisible();
  await expect(page.getByText(t.answerSheet.readOnlyNote)).toBeVisible();

  // Las opciones de la pregunta solo se leen. Las demás preguntas aún no se ven, así que su alveolo
  // está cerrado
  const options = page.getByRole('radio', { name: /^[A-J]\./ });
  await expect(options.first()).toBeDisabled();
  await expect(bubble(page, 2, 'A')).toBeDisabled();

  // Llena la B de la primera pregunta y queda marcada
  await bubble(page, 1, 'B').click();
  await expect(bubble(page, 1, 'B')).toHaveAttribute('aria-checked', 'true');
  await expect(bubble(page, 1, 'A')).toHaveAttribute('aria-checked', 'false');

  // Cambiarla mueve la marca, un alveolo a la vez
  await bubble(page, 1, 'C').click();
  await expect(bubble(page, 1, 'C')).toHaveAttribute('aria-checked', 'true');
  await expect(bubble(page, 1, 'B')).toHaveAttribute('aria-checked', 'false');

  // Una recarga retoma el examen con el alveolo llenado
  await page.reload();
  await expect(page.getByRole('timer')).toBeVisible();
  await expect(bubble(page, 1, 'C')).toHaveAttribute('aria-checked', 'true');

  // Al ver la segunda pregunta su alveolo se abre y se llena
  await page.getByRole('button', { name: t.exam.next, exact: true }).click();
  await expect(bubble(page, 2, 'A')).toBeEnabled();
  await bubble(page, 2, 'A').click();
  await expect(bubble(page, 2, 'A')).toHaveAttribute('aria-checked', 'true');

  // Ir a una pregunta desde el número de su fila
  await page.getByRole('button', { name: t.answerSheet.goTo(1), exact: true }).click();
  await expect(page.getByText(t.exam.progress(1, QUESTIONS), { exact: true })).toBeVisible();
  await expect(bubble(page, 1, 'C')).toHaveAttribute('aria-checked', 'true');
  await expectNoSeriousA11yViolations(page);
});

test('sin la opción encendida el examen se contesta tocando la opción', async ({ page }) => {
  test.setTimeout(180_000);
  await signUp(page);
  await page.goto(SCREENS.simulatorSetup.path);
  const card = page.getByRole('region', { name: t.exam.cardTitle });
  await expect(card.getByText(t.exam.timeTotal(examTotalMs(QUESTIONS)))).toBeVisible({
    timeout: 60_000,
  });
  await card.getByRole('button', { name: t.exam.start }).click();
  await expect(page.getByRole('timer')).toBeVisible();
  await expect(page.getByRole('region', { name: t.answerSheet.title })).toHaveCount(0);
  await page.getByRole('radio').first().check();
  await expect(page.getByRole('radio').first()).toBeChecked();
});
