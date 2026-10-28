// Estudio por tema y búsqueda avanzada (V4-B3, lo que pidió Paco). Estudiar un tema es aparte de la
// cola del día. Entran todas las tarjetas elegidas, también las nuevas que no tocan hoy, y lo
// calificado queda como evento con la marca extra para que no gaste el cupo del día. La búsqueda
// acepta campo:valor y los atajos de ejemplo se ponen en el cuadro con un toque.
import type { Page } from '@playwright/test';
import { SCREENS } from '@/app/screens';
import { t } from '@/i18n/es-MX';
import { followSmallestDeck, readTable } from './support/b1';
import { resultCount } from './support/cardSearch';
import { expect, signUp, test } from './support/fixtures';

const START = /^Repasar [\d,]+ tarjetas?$/;

/**
 * Cuántas tarjetas nuevas dice el panel de lo que toca con la selección. Cada celda crema lleva la
 * cifra arriba y su nombre debajo (D-150), así que la cifra es la que va antes de Nuevas
 */
const newCounter = async (page: Page): Promise<number> => {
  const panel = await page.getByRole('region', { name: t.reviewSetup.countersLabel }).innerText();
  return Number(new RegExp(`(\\d+)\\s+${t.review.counters.new}`).exec(panel)?.[1]);
};

const countOf = async (page: Page): Promise<number> => {
  const label = (await page.getByRole('button', { name: START }).textContent()) ?? '';
  return Number(label.replace(/\D/g, ''));
};

test('estudiar un tema trae más tarjetas que las de hoy, no gasta el cupo del día y deja su marca', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await signUp(page);
  await followSmallestDeck(page);
  await page.goto(SCREENS.review.path);

  const today = await countOf(page);
  const newBefore = await newCounter(page);
  await page.getByRole('button', { name: t.reviewSetup.modes.topic }).click();
  await expect(page.getByText(t.reviewSetup.topicHint)).toBeVisible();
  const topic = await countOf(page);
  // Con el mazo recién seguido hoy tocan solo las nuevas del día. El tema trae todas las del mazo
  expect(topic).toBeGreaterThan(today);

  await page.getByRole('button', { name: START }).click();
  await page.getByRole('button', { name: t.review.show }).click();
  await page.getByRole('button', { name: new RegExp(`^${t.review.ratings.good}`) }).click();
  await page.getByRole('button', { name: t.review.finish }).click();
  await expect(page.getByText(t.review.doneTitle)).toBeVisible();

  const events = await readTable<{ type: string; payload: { extra?: boolean } }>(page, 'events');
  const reviews = events.filter((event) => event.type === 'card_reviewed');
  expect(reviews).toHaveLength(1);
  expect(reviews[0]?.payload.extra).toBe(true);

  // El cupo de nuevas de hoy no bajó, porque el repaso extra no lo gastó. La tarjeta que se calificó
  // quedó en aprendizaje y toca otra vez hoy, así que el total sube en una y las nuevas no cambian
  await page.goto(SCREENS.review.path);
  await page.getByRole('button', { name: t.reviewSetup.modes.today }).click();
  expect(await newCounter(page)).toBe(newBefore);
  expect(await countOf(page)).toBe(today + 1);
});

test('la búsqueda avanzada acepta campo:valor y los ejemplos se ponen con un toque', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await signUp(page);
  await followSmallestDeck(page);
  await page.goto(SCREENS.explore.path);

  const search = page.getByRole('searchbox', { name: t.cardSearch.searchLabel });
  await page.getByText(t.cardSearch.advanced.title).click();
  await page.getByRole('button', { name: t.cardSearch.advanced.insert('estado:nueva') }).click();
  await expect(search).toHaveValue('estado:nueva ');
  await expect(search).toBeFocused();
  await expect.poll(() => resultCount(page)).toBeGreaterThan(0);
  const news = await resultCount(page);

  // Un mazo recién seguido no tiene tarjetas en repaso, y un guion niega el filtro
  await search.fill('estado:repaso');
  await expect.poll(() => resultCount(page)).toBe(0);
  await search.fill('estado:nueva -estado:nueva');
  await expect.poll(() => resultCount(page)).toBe(0);
  await search.fill('-estado:repaso');
  await expect.poll(() => resultCount(page)).toBeGreaterThanOrEqual(news);
});
