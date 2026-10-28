// Revisión del examen con tarjetas y motivos (B5, comentarios 1 y 2 de Ricardo). Un examen corto,
// una tarjeta en un mazo propio nuevo y otra en un mazo precargado, las dos aparecen en Repasar y el
// mazo compartido no cambia. Después se marca un motivo, se cambia y Progreso muestra el último.
import type { Locator, Page } from '@playwright/test';
import { SCREENS } from '@/app/screens';
import { t } from '@/i18n/es-MX';
import { followSmallestDeck, readTable, startExam } from './support/b1';
import { expect, expectNoSeriousA11yViolations, signUp, test } from './support/fixtures';

const QUESTIONS = 20;
const OWN_DECK = 'Repaso del simulacro';
const PRELOADED_DECK = 'Urgencias (Paco)';
/** Marcas que el alumno escribe al frente antes de guardar, para reconocer cada tarjeta en Repasar */
const OWN_MARK = 'Tarjeta propia del simulacro.';
const LAYER_MARK = 'Tarjeta en mi capa de Urgencias.';

interface DeckRow {
  id: string;
  ownerId: string | null;
  origin: string;
  parentId?: string | null;
}
interface NoteRow {
  id: string;
  deckId: string;
}

/** Las notas de los mazos precargados, que son lo compartido */
async function sharedNotes(page: Page): Promise<string[]> {
  const decks = await readTable<DeckRow>(page, 'decks');
  const shared = new Set(
    decks.filter((deck) => deck.origin === 'preloaded').map((deck) => deck.id),
  );
  return (await readTable<NoteRow>(page, 'notes'))
    .filter((note) => shared.has(note.deckId))
    .map((note) => note.id)
    .sort();
}

/** Sin Mis errores el repaso empieza por las tarjetas nuevas, que es lo que se quiere ver */
async function stopSendingErrors(page: Page) {
  await page.goto(`${SCREENS.review.path}?ajustes=1`);
  const panel = page.getByRole('dialog', { name: t.settingsPage.reviewSettings.title });
  await panel.getByLabel(t.settings.errorsToReview).uncheck();
  await panel.getByRole('button', { name: t.settings.saveChanges }).click();
  await expect(panel.getByText(t.settings.saved, { exact: true })).toBeVisible();
}

/** Un examen de 20 contestado con la primera opción, terminado y guardado */
async function takeExam(page: Page) {
  // El tamaño se elige siempre. Con un plan de pago empieza en 280, y seguir un mazo del catálogo ya
  // contrata el mensual simulado (followSmallestDeck, B8)
  await startExam(page, QUESTIONS);
  for (let index = 1; index <= QUESTIONS; index += 1) {
    await expect(page.getByText(t.exam.progress(index, QUESTIONS), { exact: true })).toBeVisible();
    await page.getByRole('radio').first().check();
    if (index < QUESTIONS)
      await page.getByRole('button', { name: t.exam.next, exact: true }).click();
  }
  await page.getByRole('button', { name: t.exam.finish }).click();
  await page.getByRole('dialog').getByRole('button', { name: t.exam.finishConfirm }).click();
  await expect(page).toHaveURL(new RegExp(`${SCREENS.examResults.path}$`));
  await expect(page.getByText(t.examResults.saving)).toHaveCount(0, { timeout: 60_000 });
}

/** Abre la pregunta fallada número n de la revisión y devuelve su fila */
async function openMissed(page: Page, n: number): Promise<Locator> {
  const review = page.getByRole('region', { name: t.examResults.reviewTitle });
  await review.getByRole('button', { name: t.examResults.filter.missed }).click();
  const row = review.locator('ol > li').nth(n);
  await row.locator('summary').click();
  await expect(
    row.getByRole('button', { name: /^Crear tarjeta de la pregunta \d+$/ }),
  ).toBeVisible();
  return row;
}

/** Crea la tarjeta de la pregunta en el mazo elegido, con una marca al frente */
async function createCard(
  page: Page,
  row: Locator,
  deck: { label: string } | { newName: string },
  mark: string,
) {
  await row.getByRole('button', { name: /^Crear tarjeta de la pregunta \d+$/ }).click();
  const dialog = page.getByRole('dialog', { name: t.examReview.createCard.title });
  const select = dialog.getByRole('combobox', { name: t.examReview.createCard.deck });
  if ('newName' in deck) {
    await select.selectOption({ label: t.examReview.createCard.newDeckOption });
    await dialog.getByLabel(t.examReview.createCard.newDeckName).fill(deck.newName);
  } else {
    await select.selectOption({ label: deck.label });
    await expect(dialog.getByText(t.examReview.createCard.layerHint)).toBeVisible();
  }
  // La tarjeta llega armada con el texto del banco y se puede cambiar antes de guardarla
  const front = dialog.getByLabel(t.decks.editor.reverseFront, { exact: true });
  await expect(front).not.toHaveValue('');
  await expect(dialog.getByLabel(t.decks.editor.reverseBack, { exact: true })).toHaveValue(
    new RegExp(`^${t.examReview.createCard.correctAnswer}\\. `),
  );
  await front.fill(`${mark}\n\n${await front.inputValue()}`);
  const save = dialog.getByRole('button', { name: t.examReview.createCard.save });
  await save.click();
  await expect(dialog.getByText(/^Listo\. La tarjeta quedó en /)).toBeVisible();
  // Guardar otra vez no la duplica
  await save.click();
  await expect(dialog.getByText(/así que no se duplicó\.$/)).toBeVisible();
  return dialog;
}

test('crea una tarjeta en un mazo propio y otra en uno precargado, las dos entran a Repasar y el compartido no cambia', async ({
  page,
}) => {
  test.setTimeout(300_000);
  await signUp(page);
  await followSmallestDeck(page);
  await stopSendingErrors(page);
  const sharedBefore = await sharedNotes(page);
  expect(sharedBefore.length).toBeGreaterThan(0);

  await takeExam(page);
  const first = await openMissed(page, 0);
  const ownDialog = await createCard(page, first, { newName: OWN_DECK }, OWN_MARK);
  await expectNoSeriousA11yViolations(page);
  await ownDialog.getByRole('button', { name: t.examReview.createCard.close }).click();

  const second = await openMissed(page, 1);
  const layerDialog = await createCard(page, second, { label: PRELOADED_DECK }, LAYER_MARK);
  await layerDialog.getByRole('button', { name: t.examReview.createCard.close }).click();

  // El mazo compartido no cambió. La tarjeta vive en un mazo del alumno que cuelga del precargado
  expect(await sharedNotes(page)).toEqual(sharedBefore);
  const decks = await readTable<DeckRow>(page, 'decks');
  const preloaded = new Set(decks.filter((deck) => deck.origin === 'preloaded').map((d) => d.id));
  const layers = decks.filter(
    (deck) => deck.ownerId !== null && deck.parentId && preloaded.has(deck.parentId),
  );
  expect(layers).toHaveLength(1);

  // Las dos aparecen en Repasar. La búsqueda recorre solo las primeras tarjetas a propósito. Las que
  // salen de una pregunta llevan IDs con el momento fijo ID_TIME de src/data/usecases/questionCards.ts,
  // anterior al de los mazos precargados, y Repasar toma las nuevas en el orden de su ID, así que van
  // primero entre las nuevas. Es una decisión, no un accidente, y esta prueba depende de ella. Si ese
  // orden cambia, hay que elegir solo sus mazos en Mazos y temas o recorrer la sesión completa
  await page.goto(SCREENS.review.path);
  await page.getByRole('button', { name: /^Repasar [\d,]+ tarjetas?$/ }).click();
  const seen = new Set<string>();
  for (let index = 0; index < 22 && seen.size < 2; index += 1) {
    const show = page.getByRole('button', { name: t.review.show });
    await expect(show).toBeVisible();
    for (const mark of [OWN_MARK, LAYER_MARK]) {
      if ((await page.getByText(mark).count()) > 0) seen.add(mark);
    }
    await show.click();
    await page.getByRole('button', { name: new RegExp(`^${t.review.ratings.easy}`) }).click();
  }
  expect([...seen].sort()).toEqual([LAYER_MARK, OWN_MARK].sort());
});

test('marca por qué falló, lo cambia y Progreso muestra el último', async ({ page }) => {
  test.setTimeout(300_000);
  await signUp(page);
  await takeExam(page);
  const row = await openMissed(page, 0);
  const motives = row.getByRole('group', { name: t.examReview.motives.legend });
  await motives.getByRole('button', { name: t.review.causes.knowledge }).click();
  await expect(
    motives.getByText(t.examReview.motives.saved(t.review.causes.knowledge)),
  ).toBeVisible();
  await motives.getByRole('button', { name: t.review.causes.fatigue }).click();
  await expect(
    motives.getByText(t.examReview.motives.saved(t.review.causes.fatigue)),
  ).toBeVisible();
  await expect(motives.getByRole('button', { name: t.review.causes.fatigue })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expectNoSeriousA11yViolations(page);

  // Los dos cambios quedaron en la bitácora y ninguno se editó
  const events = await readTable<{ type: string; payload: { cause?: string } }>(page, 'events');
  expect(
    events.filter((event) => event.type === 'cause_reported').map((event) => event.payload.cause),
  ).toEqual(['knowledge', 'fatigue']);

  // Al volver a la revisión sigue el último
  await page.reload();
  const again = await openMissed(page, 0);
  await expect(
    again
      .getByRole('group', { name: t.examReview.motives.legend })
      .getByRole('button', { name: t.review.causes.fatigue }),
  ).toHaveAttribute('aria-pressed', 'true');

  // Progreso reparte por rama con el último motivo de cada error
  await page.goto(SCREENS.progress.path);
  const card = page.getByRole('region', { name: t.examReview.progress.title });
  await expect(card.getByText(t.review.causes.fatigue, { exact: true })).toBeVisible({
    timeout: 30_000,
  });
  await expect(card.getByText(t.review.causes.knowledge, { exact: true })).toHaveCount(0);
  await expect(card.getByText(t.examReview.progress.total(1), { exact: true })).toBeVisible();
  await expectNoSeriousA11yViolations(page);
});
