// Capturas de cierre de B6 del plan del cambio (D-125). Apuntes con el botón de tarjeta de la línea y
// su menú de tipos, el mazo y el tema de cada apunte, el modo clase con su plantilla, la búsqueda sin
// acentos y el candado de Gratis con su vista previa. Quedan en docs/screenshots/v3/b6. El recorrido
// completo va en teléfono claro y computadora clara y oscura, y lo clave además en 1920 y en el
// teléfono oscuro, como en b45.spec.ts
import { expect, test, type Page } from '@playwright/test';
import { SCREENS } from '@/app/screens';
import { t } from '@/i18n/es-MX';
import { subscribeMonthly } from '../../e2e/support/b1';
import { signUp } from '../../e2e/support/fixtures';
import { capture, outDirFor } from './capture';

const B6_DIR = outDirFor('b6');

const FULL_WALK = (project: string) => !project.startsWith('1920') && project !== '390-oscuro';

const editorOf = (page: Page) => page.getByRole('textbox', { name: t.outlines.editor.label });

/** Captura lo que se ve, sin página completa, para menús y paneles abiertos */
async function viewport(page: Page, name: string, project: string) {
  await page.screenshot({ path: `${B6_DIR}/${name}--${project}.jpg`, type: 'jpeg', quality: 60 });
}

async function saved(page: Page) {
  await expect(page.getByText(t.outlines.editor.saved, { exact: true })).toBeVisible({
    timeout: 15_000,
  });
}

test('B6. Apunte con tarjeta de un botón, mazo y tema', async ({ page }, info) => {
  test.setTimeout(600_000);
  const project = info.project.name;
  await signUp(page);
  await subscribeMonthly(page);

  await page.goto(SCREENS.outlines.path);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 60_000 });
  await capture(page, B6_DIR, '01-apuntes', project);

  await page.getByLabel(t.outlines.newTitle).fill('Asma');
  await page.getByRole('button', { name: t.outlines.create }).click();
  await expect(editorOf(page)).toBeVisible({ timeout: 30_000 });
  await editorOf(page).click();
  await page.keyboard.type('Tratamiento de primera línea: salbutamol');
  await page.getByRole('button', { name: t.outlines.editor.lineButton }).click();
  const menu = page.getByRole('group', { name: t.outlines.editor.lineCard.title });
  await expect(menu).toBeVisible();
  await viewport(page, '02-tarjeta-de-la-linea', project);
  await menu.getByRole('button', { name: t.outlines.editor.lineCard.kinds.forward }).click();
  await expect(page.getByText(t.outlines.preview.count(1))).toBeVisible();
  await saved(page);
  await capture(page, B6_DIR, '03-apunte-con-tarjeta', project);
  if (!FULL_WALK(project)) return;

  await page.getByText(t.outlines.settings.title, { exact: true }).click();
  await page.getByLabel(t.outlines.editor.deckLabel).selectOption({ label: 'Apuntes' });
  await page.getByRole('button', { name: t.outlines.subject.kinds.enarm }).click();
  await page
    .getByLabel(t.outlines.subject.branch, { exact: true })
    .selectOption({ label: 'Medicina interna' });
  await page.getByLabel(t.outlines.subject.topic, { exact: true }).selectOption('pulmonology');
  await capture(page, B6_DIR, '04-mazo-y-tema', project);
  await page.getByRole('button', { name: t.outlines.settings.save }).click();
  await expect(page.getByText(t.outlines.settings.saved)).toBeVisible({ timeout: 15_000 });
});

test('B6. Modo clase con plantilla y búsqueda sin acentos', async ({ page }, info) => {
  test.skip(!FULL_WALK(info.project.name), 'Solo teléfono claro y computadora clara y oscura');
  test.setTimeout(600_000);
  const project = info.project.name;
  await signUp(page);
  await subscribeMonthly(page);

  await page.goto(SCREENS.outlines.path);
  await page.getByRole('button', { name: t.outlines.form.purposes.class }).click();
  await page.getByLabel(t.outlines.subject.freeName, { exact: true }).fill('Anatomía');
  await capture(page, B6_DIR, '05-nuevo-apunte-de-clase', project);
  await page.getByRole('button', { name: t.outlines.form.startClass }).click();
  await expect(editorOf(page)).toBeVisible({ timeout: 30_000 });
  // Sin esperar el foco, la primera letra se pierde y la búsqueda de abajo no encuentra la línea
  await expect(editorOf(page)).toBeFocused();
  await page.keyboard.type('Húmero: hueso del brazo');
  await page.getByRole('button', { name: t.outlines.editor.cardLabel }).click();
  await page.getByRole('button', { name: t.outlines.editor.lineCard.kinds.both }).click();
  await saved(page);
  await capture(page, B6_DIR, '06-modo-clase', project);

  await page.getByRole('link', { name: t.outlines.backToList }).click();
  await page.getByRole('searchbox', { name: t.outlines.search }).fill('humero');
  await expect(page.getByText(t.outlines.searchResults(1))).toBeVisible();
  await capture(page, B6_DIR, '07-busqueda', project);
});

test('B6. Apuntes en Gratis con candado y vista previa', async ({ page }, info) => {
  test.setTimeout(600_000);
  const project = info.project.name;
  await signUp(page);
  await page.goto(SCREENS.outlines.path);
  await expect(page.getByRole('region', { name: t.outlines.locked.title })).toBeVisible({
    timeout: 60_000,
  });
  await capture(page, B6_DIR, '08-candado-en-gratis', project);
});
