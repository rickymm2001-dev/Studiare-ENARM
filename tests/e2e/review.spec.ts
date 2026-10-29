// Flujo 2 de 14.1. Sesión de repaso con confianza previa, calificación, causa del fallo y XP. Se
// sigue el mazo más chico para que la prueba sea rápida
import { SCREENS } from '@/app/screens';
import { t } from '@/i18n/es-MX';
import { subscribeMonthly } from './support/b1';
import { expect, expectNoSeriousA11yViolations, signUp, test } from './support/fixtures';

test('repasa con confianza, califica, reporta la causa de un fallo y gana XP', async ({ page }) => {
  test.setTimeout(120_000);
  await signUp(page);
  // Seguir mazos del catálogo es de los planes de pago (4.25, B8)
  await subscribeMonthly(page);

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
  // Con la respuesta a la vista salen los cuatro botones con su intervalo en letra chica. Otra vez, con
  // su fondo rojo, dejaba ese texto abajo de 4.5 a 1 y antes nadie lo revisaba
  await expect(rating('again')).toBeVisible();
  await expectNoSeriousA11yViolations(page);
  await rating('good').click();

  // Tarjeta 2 solo con el teclado. Espacio muestra, 1 es Otra vez y pide el motivo, 2 es Tiempo
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

  // Inicio ya cuenta las tres tarjetas en la fila de Tarjetas de Meta de hoy (D-150). El tope del
  // día sale de los ajustes del alumno, así que solo se fija lo hecho
  await page.goto('/');
  const goal = page.getByRole('region', { name: t.home.goal.title });
  await expect(
    goal.getByText(new RegExp(`^${t.widgets.plan.rows.cards} 3 de [\\d,]+$`)),
  ).toBeVisible();
  // La carga de repaso ya dibuja la gráfica con lo de este mes
  await expect(page.getByRole('heading', { level: 3, name: t.home.load.title })).toBeVisible();
  await expect(page.getByRole('img', { name: t.home.load.chartLabel })).toBeVisible();
});
