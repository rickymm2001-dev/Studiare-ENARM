// Flujo 2 de 14.1. Sesión de repaso con confianza previa, calificación, causa del fallo y XP. Se
// sigue el mazo más chico para que la prueba sea rápida
import { SCREENS } from '@/app/screens';
import { t } from '@/i18n/es-MX';
import { expect, expectNoSeriousA11yViolations, signUp, test } from './support/fixtures';

test('repasa con confianza, califica, reporta la causa de un fallo y gana XP', async ({ page }) => {
  test.setTimeout(120_000);
  await signUp(page);

  // Sin mazos todavía, Repasar manda a Mazos
  await page.goto(SCREENS.review.path);
  await expect(page.getByText(t.review.noDecksTitle)).toBeVisible();

  await page.goto(SCREENS.decks.path);
  const deck = page.getByRole('listitem').filter({ hasText: 'Urgencias (Paco)' });
  await deck.getByRole('button', { name: t.decks.follow }).click();
  await expect(deck.getByRole('button', { name: t.decks.unfollow })).toBeVisible({
    timeout: 60_000,
  });

  await page.goto(SCREENS.review.path);
  await page.getByRole('button', { name: /^Repasar [\d,]+ tarjetas?$/ }).click();
  await expectNoSeriousA11yViolations(page);

  const rating = (value: keyof typeof t.review.ratings) =>
    page.getByRole('button', { name: new RegExp(`^${t.review.ratings[value]}`) });

  // Sin pregunta de confianza (D-087). Tarjeta 1 con el ratón, mostrar y Bien
  await expect(page.getByRole('button', { name: t.review.confidence.sure })).toHaveCount(0);
  await page.getByRole('button', { name: t.review.show }).click();
  await rating('good').click();

  // Tarjeta 2 solo con el teclado. Espacio muestra, 1 es Otra vez y pide la causa, 2 es Lo olvidé
  await expect(page.getByRole('button', { name: t.review.show })).toBeVisible();
  await page.keyboard.press('Space');
  await page.keyboard.press('1');
  await expect(page.getByText(t.review.causeQuestion)).toBeVisible();
  await page.keyboard.press('2');

  // Tarjeta 3 con Enter para mostrar y 4 para Fácil
  await expect(page.getByRole('button', { name: t.review.show })).toBeVisible();
  await page.keyboard.press('Enter');
  await page.keyboard.press('4');

  // Al terminar la sesión dice cuántas tarjetas repasó y cuánto XP ganó
  await page.getByRole('button', { name: t.review.finish }).click();
  await expect(page.getByText(t.review.doneTitle)).toBeVisible();
  await expect(page.getByText(/Repasaste 3 tarjetas y ganaste [\d,]+ XP\./)).toBeVisible();

  // Inicio ya cuenta las tres tarjetas y el XP
  await page.goto('/');
  await expect(page.getByText(t.widgets.today.done(3, 0))).toBeVisible();
  await expect(page.getByText(/[\d,]+ XP en total/)).not.toHaveText(t.widgets.level.total(0));
});
