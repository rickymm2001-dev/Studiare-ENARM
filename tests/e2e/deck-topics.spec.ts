// Temas de cada mazo (B4 del plan del cambio, comentario 8). Con los mazos de Paco, Mazos y Repasar
// dicen la rama y todos los temas de cada mazo, en orden alfabético del español, sin repetidos, sin
// recortes y sin nombres pegados. Lo esperado se arma aquí con los archivos de los mazos, la tabla de
// nombres legibles y el motor, y se compara con lo que se ve, nivel por nivel.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Locator, Page } from '@playwright/test';
import { SCREENS } from '@/app/screens';
import { topicDisplayName } from '@/demo/content/topicDisplayNames';
import { buildTopicOutline, type TopicNode } from '@/engines/deckTopics';
import { sanitizeTag, tagSegments } from '@/engines/tagPath';
import { t } from '@/i18n/es-MX';
import { subscribeMonthly } from './support/b1';
import { expect, expectNoSeriousA11yViolations, signUp, test } from './support/fixtures';

interface DeckFile {
  key: string;
  name: string;
  notes: { sourceTag: string }[];
}

const files = ['paco-mi', 'paco-gyo', 'paco-urgencias'].map(
  (key) =>
    JSON.parse(
      readFileSync(
        fileURLToPath(new URL(`../../src/demo/content/decks/${key}.json`, import.meta.url)),
        'utf8',
      ),
    ) as DeckFile,
);

type Shape = [string, Shape[]];

/** Rama, materia y tema de cada nota con su nombre legible, en el orden del motor */
function expectedShape(file: DeckFile): Shape[] {
  const outline = buildTopicOutline(
    file.notes.map((note) => {
      const tag = sanitizeTag(note.sourceTag);
      return tag === '' ? [] : tagSegments(tag).map(topicDisplayName);
    }),
  );
  const shape = (nodes: readonly TopicNode[]): Shape[] =>
    nodes.map((node) => [node.name, shape(node.children)]);
  return shape(outline.branches);
}

/** Lo que se ve en la lista de temas, nivel por nivel */
async function shownShape(list: Locator): Promise<Shape[]> {
  return list.evaluate((root) => {
    const read = (ul: Element): Shape[] =>
      [...ul.children]
        .filter((item) => item.tagName === 'LI')
        .map((item): Shape => {
          const name = item.querySelector(':scope > p')?.textContent ?? item.textContent;
          const below = item.querySelector(':scope > ul');
          return [name.trim(), below ? read(below) : []];
        });
    return read(root);
  });
}

/** Abre los temas plegados del mazo de una fila, como en Mazos, y devuelve su lista */
async function openTopics(page: Page, row: Locator, deckName: string): Promise<Locator> {
  await row.getByText(t.deckTopics.title, { exact: true }).click();
  const list = page.getByRole('list', { name: t.deckTopics.listLabel(deckName) });
  await expect(list).toBeVisible();
  return list;
}

/** La fila de un mazo de Paco. Sus temas viven dentro, así que se busca por el nombre del mazo */
function deckRow(page: Page, name: string): Locator {
  return page.getByRole('listitem').filter({ hasText: name }).first();
}

test('Mazos y Repasar dicen todos los temas de los mazos de Paco, agrupados por rama', async ({
  page,
}) => {
  test.setTimeout(420_000);
  await signUp(page);

  // En Mazos, los tres mazos con todos sus temas, aunque todavía no los sigas
  await page.goto(SCREENS.decks.path);
  for (const file of files) {
    const row = deckRow(page, file.name);
    await expect(row.getByText(t.deckTopics.title, { exact: true })).toBeVisible({
      timeout: 30_000,
    });
    const list = await openTopics(page, row, file.name);
    expect(await shownShape(list), file.key).toEqual(expectedShape(file));
  }
  // El ejemplo de Ricardo, Reumatología con Artritis reumatoide y Lupus eritematoso sistémico
  const internal = page.getByRole('list', {
    name: t.deckTopics.listLabel('Medicina interna (Paco)'),
  });
  const rheumatology = internal.getByRole('list', { name: 'Reumatología', exact: true });
  const topics = await rheumatology.getByRole('listitem').allInnerTexts();
  expect(topics.indexOf('Artritis reumatoide')).toBeGreaterThanOrEqual(0);
  expect(topics.indexOf('Artritis reumatoide')).toBeLessThan(
    topics.indexOf('Lupus eritematoso sistémico'),
  );
  // Ginecología y obstetricia se agrupa en sus dos ramas, sin nombres pegados
  const gyo = page.getByRole('list', {
    name: t.deckTopics.listLabel('Ginecología y obstetricia (Paco)'),
  });
  await expect(gyo.getByText('Anticonceptivos y métodos de planificación familiar')).toBeVisible();
  await expect(gyo.getByText('AnticonceptivosyMPF')).toHaveCount(0);
  await expectNoSeriousA11yViolations(page);

  // Se siguen los tres y Repasar dice lo mismo debajo de cada mazo. Los temas se ven también en
  // Gratis, pero seguir mazos del catálogo es de los planes de pago (4.25, B8)
  await subscribeMonthly(page);
  await page.goto(SCREENS.decks.path);
  for (const file of files) {
    const row = deckRow(page, file.name);
    await row.getByRole('button', { name: t.decks.follow }).click();
    await expect(row.getByRole('button', { name: t.decks.unfollow })).toBeVisible({
      timeout: 120_000,
    });
  }
  // En Repasar basta abrir Mazos y temas. La lista de cada mazo ya está abierta, sin otro pliegue
  await page.goto(SCREENS.review.path);
  await page.getByText(t.reviewSetup.filters, { exact: true }).click({ timeout: 60_000 });
  for (const file of files) {
    const row = deckRow(page, file.name);
    await expect(row.getByLabel(file.name, { exact: true })).toBeChecked();
    const list = page.getByRole('list', { name: t.deckTopics.listLabel(file.name) });
    await expect(list).toBeVisible();
    expect(await shownShape(list), file.key).toEqual(expectedShape(file));
  }
  await expect(page.getByText(t.deckTopics.title, { exact: true })).toHaveCount(0);
  await expectNoSeriousA11yViolations(page);
});
