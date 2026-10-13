// Apuntes y mazos (B6 del plan del cambio, respuesta 74). Con un plan de pago, se crea un apunte, una
// línea se vuelve tarjeta con el botón de la línea, sin escribir marcas, se eligen su mazo y su tema
// del ENARM, y la tarjeta sale en Repasar. El modo clase crea un apunte con plantilla y una materia
// libre, cuyas tarjetas nunca llevan un tema del ENARM. En Gratis Apuntes se ve con candado y la
// prueba de 7 días (respuesta 20). Corre en teléfono y en computadora.
import type { Page } from '@playwright/test';
import { SCREENS } from '@/app/screens';
import { t } from '@/i18n/es-MX';
import { readTable, subscribeMonthly } from './support/b1';
import {
  expect,
  expectNoHorizontalOverflow,
  expectNoSeriousA11yViolations,
  signUp,
  test,
} from './support/fixtures';

const editorOf = (page: Page) => page.getByRole('textbox', { name: t.outlines.editor.label });

interface StoredNote {
  id: string;
  deckId: string;
  tags: string[];
  outlineId?: string | null;
  deletedAt?: string | null;
}
interface StoredDeck {
  id: string;
  name: string;
  parentId?: string | null;
}

/** Las notas vivas de los apuntes, tal como están en IndexedDB */
async function outlineNotes(page: Page): Promise<StoredNote[]> {
  return (await readTable<StoredNote>(page, 'notes')).filter(
    (note) => typeof note.outlineId === 'string' && (note.deletedAt ?? null) === null,
  );
}

async function saved(page: Page) {
  await expect(page.getByText(t.outlines.editor.saved, { exact: true })).toBeVisible({
    timeout: 15_000,
  });
}

test('un apunte vuelve tarjeta una línea con el botón, elige mazo y tema y la tarjeta sale en Repasar', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await signUp(page);
  await subscribeMonthly(page);

  await page.goto(SCREENS.outlines.path);
  await page.getByLabel(t.outlines.newTitle).fill('Asma');
  await page.getByRole('button', { name: t.outlines.create }).click();
  await expect(editorOf(page)).toBeVisible({ timeout: 30_000 });
  await editorOf(page).click();
  await page.keyboard.type('Tratamiento de primera línea: salbutamol');

  // El botón de la línea abre los tipos de tarjeta y escribe la marca por el alumno
  await page.getByRole('button', { name: t.outlines.editor.lineButton }).click();
  const menu = page.getByRole('group', { name: t.outlines.editor.lineCard.title });
  await expect(menu).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await menu.getByRole('button', { name: t.outlines.editor.lineCard.kinds.forward }).click();
  await expect(menu).toHaveCount(0);
  await expect(editorOf(page)).toContainText('Tratamiento de primera línea >> salbutamol');
  await expect(page.getByText(t.outlines.preview.count(1))).toBeVisible();
  await saved(page);

  // Mazo y tema. Las tarjetas pasan al mazo Apuntes con el tema Neumología del ENARM
  await page.getByText(t.outlines.settings.title, { exact: true }).click();
  await page.getByLabel(t.outlines.editor.deckLabel).selectOption({ label: 'Apuntes' });
  await page.getByRole('button', { name: t.outlines.subject.kinds.enarm }).click();
  await page
    .getByLabel(t.outlines.subject.branch, { exact: true })
    .selectOption({ label: 'Medicina interna' });
  await page.getByLabel(t.outlines.subject.topic, { exact: true }).selectOption('pulmonology');
  await page.getByRole('button', { name: t.outlines.settings.save }).click();
  await expect(page.getByText(t.outlines.settings.saved)).toBeVisible({ timeout: 15_000 });
  await expectNoSeriousA11yViolations(page);

  const decks = await readTable<StoredDeck>(page, 'decks');
  const root = decks.find((deck) => deck.name === 'Apuntes' && !deck.parentId);
  await expect
    .poll(async () => (await outlineNotes(page)).map((note) => [note.deckId, note.tags]))
    .toEqual([[root?.id, ['topic:pulmonology']]]);

  // Repasar ya trae la tarjeta del apunte
  await page.goto(SCREENS.review.path);
  await page.getByRole('button', { name: /^Repasar [\d,]+ tarjetas?$/ }).click();
  await expect(page.getByText('Tratamiento de primera línea', { exact: true })).toBeVisible({
    timeout: 30_000,
  });
});

test('el modo clase crea un apunte con plantilla y materia libre que no cuenta en el ENARM', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await signUp(page);
  await subscribeMonthly(page);

  await page.goto(SCREENS.outlines.path);
  await page.getByRole('button', { name: t.outlines.form.purposes.class }).click();
  await page.getByLabel(t.outlines.subject.freeName, { exact: true }).fill('Anatomía');
  await page.getByRole('button', { name: t.outlines.form.startClass }).click();
  await expect(editorOf(page)).toBeVisible({ timeout: 30_000 });

  // Solo el editor, con la plantilla de clase y el cursor en su primera línea en blanco
  await expect(page.getByRole('button', { name: t.outlines.editor.classMode })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByRole('region', { name: t.outlines.preview.title })).toHaveCount(0);
  for (const section of t.outlines.templateLines.class) {
    await expect(editorOf(page)).toContainText(section.text);
  }
  await expect(editorOf(page)).toBeFocused();
  await page.keyboard.type('Húmero: hueso del brazo');

  // Con el botón de la barra, sin escribir la marca
  await page.getByRole('button', { name: t.outlines.editor.cardLabel }).click();
  await page.getByRole('button', { name: t.outlines.editor.lineCard.kinds.both }).click();
  await expect(editorOf(page)).toContainText('Húmero :: hueso del brazo');
  await saved(page);
  await expectNoSeriousA11yViolations(page);

  // La tarjeta lleva la materia libre y nunca un tema del ENARM
  await expect
    .poll(async () => (await outlineNotes(page)).map((note) => note.tags))
    .toEqual([['Materia::Anatomía']]);
  const [note] = await outlineNotes(page);
  expect(note?.tags.some((tag) => tag.startsWith('topic:'))).toBe(false);

  // La lista dice la materia y la búsqueda encuentra la línea sin acentos
  await page.getByRole('link', { name: t.outlines.backToList }).click();
  await page.getByRole('searchbox', { name: t.outlines.search }).fill('humero');
  await expect(page.getByText(t.outlines.searchResults(1))).toBeVisible();
  await expect(page.getByText(t.outlines.subject.shownFree('Anatomía'))).toBeVisible();
});

test('en Gratis Apuntes se ve con candado y la prueba de 7 días lleva a Suscripción', async ({
  page,
}) => {
  await signUp(page);
  await page.goto(SCREENS.outlines.path);
  const preview = page.getByRole('region', { name: t.outlines.locked.title });
  await expect(preview).toBeVisible();
  await expect(page.getByLabel(t.outlines.newTitle)).toHaveCount(0);
  await expectNoSeriousA11yViolations(page);
  await preview.getByRole('link', { name: t.outlines.locked.cta }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(t.screens.subscription.title);
});
