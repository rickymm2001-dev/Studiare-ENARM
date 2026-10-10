// Auditoría de flujos con interrupciones. Los flujos felices ya los cubren las pruebas de punta a punta.
// Aquí se hace lo que un alumno hace sin querer, recargar a la mitad, volver con el navegador, perder la
// conexión, hacer doble clic, o compartir el dispositivo con otro perfil. Cada prueba falla ante un
// error de consola, y confirma que no se pierde ni se duplica nada.
import { SCREENS } from '@/app/screens';
import { t } from '@/i18n/es-MX';
import { answerPracticeQuestion, expect, signUp, test } from '../e2e/support/fixtures';
import type { Page } from '@playwright/test';

async function startPractice(page: Page, total = 5) {
  await page.goto(SCREENS.simulatorSetup.path);
  const setup = page.getByRole('region', { name: t.simulator.setupTitle });
  await setup
    .getByRole('combobox', { name: t.simulator.count, exact: true })
    .selectOption(String(total));
  const start = setup.getByRole('button', { name: t.simulator.start });
  await expect(start).toBeEnabled({ timeout: 60_000 });
  await start.click();
  await expect(page.getByText(t.simulator.progress(1, total), { exact: true })).toBeVisible();
}

test('recargar a la mitad de una práctica no rompe nada ni pierde lo contestado', async ({
  page,
}) => {
  test.setTimeout(240_000);
  await signUp(page);
  await startPractice(page);
  await answerPracticeQuestion(page, 1, 5);
  await answerPracticeQuestion(page, 2, 5);
  await page.reload();
  // Retoma en la pregunta 3 con lo contestado intacto, y se puede terminar
  await expect(page.getByText(t.simulator.progress(3, 5), { exact: true })).toBeVisible();
  for (let number = 3; number <= 5; number += 1) await answerPracticeQuestion(page, number, 5);
});

test('volver con el navegador desde otra pantalla a media práctica deja la sesión usable', async ({
  page,
}) => {
  test.setTimeout(240_000);
  await signUp(page);
  await startPractice(page);
  await answerPracticeQuestion(page, 1, 5);
  await page.goto(SCREENS.progress.path);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(t.screens.progress.title);
  await page.goBack();
  await page.goForward();
  await page.goBack();
  // La práctica sigue en la pregunta 2 y se puede contestar hasta el resumen
  await expect(page.getByText(t.simulator.progress(2, 5), { exact: true })).toBeVisible();
  for (let number = 2; number <= 5; number += 1) await answerPracticeQuestion(page, number, 5);
});

test('sin conexión se puede terminar una práctica y ver su resumen', async ({ page, context }) => {
  test.setTimeout(240_000);
  await signUp(page);
  await startPractice(page, 5);
  // Un alumno que abre la app por primera vez ya tiene el service worker al empezar a practicar
  await expect
    .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)))
    .toBe(true);
  await context.setOffline(true);
  await expect(page.getByText(t.offlineBanner)).toBeVisible();
  for (let number = 1; number <= 5; number += 1) await answerPracticeQuestion(page, number, 5);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(t.screens.sessionSummary.title);
  await context.setOffline(false);
});

test('doble clic al contestar no salta una pregunta ni cuenta dos veces', async ({ page }) => {
  test.setTimeout(240_000);
  await signUp(page);
  await startPractice(page, 5);
  await page.getByRole('radio').first().check();
  const answer = page.getByRole('button', { name: t.simulator.answerAndNext });
  await answer.dblclick();
  await expect(page.getByText(t.simulator.progress(2, 5), { exact: true })).toBeVisible();
  // Tras el doble clic sigue en la 2 y no en la 3
  await page.waitForTimeout(500);
  await expect(page.getByText(t.simulator.progress(3, 5), { exact: true })).toHaveCount(0);
});

test('dos perfiles en el mismo dispositivo no se ven los datos', async ({ page }) => {
  test.setTimeout(300_000);
  await signUp(page, 'Ana');
  await startPractice(page, 5);
  for (let number = 1; number <= 5; number += 1) await answerPracticeQuestion(page, number, 5);
  const progressText = async () => {
    await page.goto(SCREENS.progress.path);
    // El texto se toma cuando la pantalla ya cargó y no solo con su título
    await expect
      .poll(async () => (await page.locator('main').innerText()).length, { timeout: 30_000 })
      .toBeGreaterThan(100);
    return page.locator('main').innerText();
  };
  const anaText = await progressText();

  // Sale de la cuenta de Ana y crea la de Beto en el mismo navegador
  await page.goto(SCREENS.profile.path);
  await page.getByRole('button', { name: t.session.signOut }).click();
  await signUp(page, 'Beto');
  const betoText = await progressText();
  // Lo de Ana tiene una sesión de práctica. Beto empieza de cero y no debe verla
  expect(betoText).not.toContain('Ana');
  expect(betoText).not.toBe(anaText);
  // La práctica que Ana dejó guardada en la pestaña tampoco es de Beto
  await page.goto(SCREENS.sessionSummary.path);
  await expect(page.getByText(t.simulator.noActive)).toBeVisible();
  await expect(page.getByRole('region', { name: t.simulator.review })).toHaveCount(0);
  console.log(`PERFILES progreso de Ana ${anaText.length} caracteres, de Beto ${betoText.length}`);
  await page.goto(SCREENS.home.path);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(t.screens.home.title);
});
