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

  const confidence = (value: keyof typeof t.review.confidence) =>
    page.getByRole('button', { name: t.review.confidence[value], exact: true });
  const rating = (value: keyof typeof t.review.ratings) =>
    page.getByRole('button', { name: new RegExp(`^${t.review.ratings[value]}`) });

  // Tarjeta 1. Seguro y Bien
  await confidence('sure').click();
  await page.getByRole('button', { name: t.review.show }).click();
  await rating('good').click();

  // Tarjeta 2. Dudo y Otra vez, que pide la causa del fallo
  await confidence('unsure').click();
  await page.getByRole('button', { name: t.review.show }).click();
  await rating('again').click();
  await expect(page.getByText(t.review.causeQuestion)).toBeVisible();
  await page.getByRole('button', { name: t.review.causes.forgot }).click();

  // Tarjeta 3. No lo sé y Fácil
  await confidence('dont_know').click();
  await page.getByRole('button', { name: t.review.show }).click();
  await rating('easy').click();

  // Al terminar la sesión dice cuántas tarjetas repasó y cuánto XP ganó
  await page.getByRole('button', { name: t.review.finish }).click();
  await expect(page.getByText(t.review.doneTitle)).toBeVisible();
  await expect(page.getByText(/Repasaste 3 tarjetas y ganaste [\d,]+ XP\./)).toBeVisible();

  // Inicio ya cuenta las tres tarjetas y el XP
  await page.goto('/');
  await expect(page.getByText(t.widgets.today.done(3, 0))).toBeVisible();
  await expect(page.getByText(/[\d,]+ XP en total/)).not.toHaveText(t.widgets.level.total(0));
});
