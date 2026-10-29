// Examen con hoja de respuestas (V4-B5). Con la opción encendida las opciones de la pregunta solo se
// leen y la respuesta se llena en una burbuja de la hoja, como en la hoja de lectura óptica del examen
// real. Una burbuja solo se llena si la pregunta ya se vio y el llenado sobrevive a una recarga.
import type { Page } from '@playwright/test';
import { SCREENS } from '@/app/screens';
import { t } from '@/i18n/es-MX';
import { openExamSetup, startExam } from './support/b1';
import { expect, expectNoSeriousA11yViolations, signUp, test } from './support/fixtures';
import { isPhone } from './support/navigation';

const QUESTIONS = 20;

async function startWithSheet(page: Page) {
  const card = await openExamSetup(page);
  // La hoja se enciende en los ajustes del examen, la tarjeta debajo del formulario
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

  // Las opciones de la pregunta solo se leen. Las demás preguntas aún no se ven, así que su burbuja
  // está cerrada
  const options = page.getByRole('radio', { name: /^[A-J]\./ });
  await expect(options.first()).toBeDisabled();
  await expect(bubble(page, 2, 'A')).toBeDisabled();

  // Llena la B de la primera pregunta y queda marcada
  await bubble(page, 1, 'B').click();
  await expect(bubble(page, 1, 'B')).toHaveAttribute('aria-checked', 'true');
  await expect(bubble(page, 1, 'A')).toHaveAttribute('aria-checked', 'false');

  // Cambiarla mueve la marca, una burbuja a la vez
  await bubble(page, 1, 'C').click();
  await expect(bubble(page, 1, 'C')).toHaveAttribute('aria-checked', 'true');
  await expect(bubble(page, 1, 'B')).toHaveAttribute('aria-checked', 'false');

  // Una recarga retoma el examen con la burbuja llena
  await page.reload();
  await expect(page.getByRole('timer')).toBeVisible();
  await expect(bubble(page, 1, 'C')).toHaveAttribute('aria-checked', 'true');

  // Al ver la segunda pregunta su burbuja se abre y se llena
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
  await startExam(page, QUESTIONS);
  await expect(page.getByRole('region', { name: t.answerSheet.title })).toHaveCount(0);
  await page.getByRole('radio').first().check();
  await expect(page.getByRole('radio').first()).toBeChecked();
});

test('la hoja se recorre con el teclado sin cambiar de pregunta y llena con Espacio', async ({
  page,
}) => {
  test.setTimeout(240_000);
  await signUp(page);
  await startWithSheet(page);

  // Toda la hoja es una sola parada de Tab, la primera burbuja de la pregunta que se ve
  const stops = page.locator('[role="radio"][tabindex="0"]');
  await expect(stops).toHaveCount(1);
  await expect(stops).toHaveAttribute('aria-label', t.answerSheet.bubble(1, 'A'));
  await stops.focus();

  // Las flechas mueven el foco de la hoja y no cambian de pregunta, que con ellas se mueve el examen
  await page.keyboard.press('ArrowRight');
  await expect(bubble(page, 1, 'B')).toBeFocused();
  await expect(page.getByText(t.exam.progress(1, QUESTIONS), { exact: true })).toBeVisible();

  // Mover el foco no llena la burbuja, Espacio sí
  await expect(bubble(page, 1, 'B')).toHaveAttribute('aria-checked', 'false');
  await page.keyboard.press('Space');
  await expect(bubble(page, 1, 'B')).toHaveAttribute('aria-checked', 'true');

  // Abajo no pasa a una pregunta que todavía no se ve
  await page.keyboard.press('ArrowDown');
  await expect(bubble(page, 1, 'B')).toBeFocused();
  await expect(stops).toHaveCount(1);
  await expectNoSeriousA11yViolations(page);
});

test('en el teléfono Anterior y Siguiente se quedan a la mano al recorrer la hoja', async ({
  page,
}) => {
  test.skip(!isPhone(page), 'El dock pegajoso es del teléfono y la tableta');
  test.setTimeout(240_000);
  await signUp(page);
  await startWithSheet(page);
  const next = page.getByRole('button', { name: t.exam.next, exact: true });
  // Arriba, con la hoja todavía debajo de la pantalla, y abajo, con la pregunta ya fuera de ella
  await expect(next).toBeInViewport();
  await page.evaluate(() => {
    window.scrollTo(0, document.documentElement.scrollHeight);
  });
  await expect(page.getByRole('region', { name: t.answerSheet.title })).toBeInViewport();
  await expect(next).toBeInViewport();
});
