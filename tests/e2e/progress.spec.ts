// Progreso (pantalla 10). La exactitud por dificultad calibra hasta tener respuestas, y la carga
// futura dice que no hay mazos y, con un mazo seguido, proyecta 30 o 60 días con su tabla por semana.
import { SCREENS } from '@/app/screens';
import { t } from '@/i18n/es-MX';
import { expect, expectNoSeriousA11yViolations, signUp, test } from './support/fixtures';

test('la dificultad calibra y la carga futura proyecta los mazos que sigues', async ({ page }) => {
  test.setTimeout(120_000);
  await signUp(page);
  await page.goto(SCREENS.progress.path);

  // Sin respuestas cada grupo de dificultad calibra con cuánto falta
  const difficulty = page.getByRole('region', { name: t.progress.difficultyTitle });
  await expect(difficulty.getByText(t.progress.difficultyCalibrating(20))).toHaveCount(3);
  // Sin mazos seguidos no hay carga que proyectar y lo dice
  const load = page.getByRole('region', { name: t.progress.futureLoad.title });
  await expect(load.getByText(t.progress.futureLoad.empty)).toBeVisible();
  await expect(load.getByRole('link', { name: t.progress.futureLoad.goToDecks })).toBeVisible();
  await expectNoSeriousA11yViolations(page);

  // Con un mazo seguido aparece la gráfica de 30 días con su resumen para el lector de pantalla
  await page.goto(SCREENS.decks.path);
  const deck = page.getByRole('listitem').filter({ hasText: 'Urgencias (Paco)' });
  await deck.getByRole('button', { name: t.decks.follow }).click();
  await expect(deck.getByRole('button', { name: t.decks.unfollow })).toBeVisible({
    timeout: 60_000,
  });
  await page.goto(SCREENS.progress.path);
  const chart = load.getByRole('img');
  await expect(chart).toHaveAttribute('aria-label', /^Carga de los próximos 30 días\./);
  await expect(load.getByText(t.progress.futureLoad.empty)).toHaveCount(0);

  // 60 días cambia la proyección y la tabla por semana da lo mismo para quien no ve la gráfica
  await load.getByRole('button', { name: t.progress.futureLoad.horizon(60) }).click();
  await expect(chart).toHaveAttribute('aria-label', /^Carga de los próximos 60 días\./);
  await load.getByText(t.progress.futureLoad.weeks).first().click();
  // Encabezado y 9 semanas
  await expect(load.getByRole('row')).toHaveCount(10);
  await expectNoSeriousA11yViolations(page);
});
