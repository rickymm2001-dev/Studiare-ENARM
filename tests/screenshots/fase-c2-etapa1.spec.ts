// Capturas de la Etapa 1 de la Fase C2 (15.1 paso 2). Explorar con filtros y acciones por lote, el
// árbol de mazos propios y el editor de tarjetas con sus avisos de calidad. Teléfono y escritorio, en
// claro y oscuro. Las imágenes quedan en docs/screenshots/fase-c2-etapa1, en JPEG para no pesar de más.
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { SCREENS } from '@/app/screens';
import { t } from '@/i18n/es-MX';
import { signUp } from '../e2e/support/fixtures';

const OUT_DIR = join(import.meta.dirname, '..', '..', 'docs', 'screenshots', 'fase-c2-etapa1');
mkdirSync(OUT_DIR, { recursive: true });

async function capture(page: Page, name: string, projectName: string) {
  await page
    .getByText(t.states.loading.label, { exact: true })
    .waitFor({ state: 'detached' })
    .catch(() => undefined);
  await page.waitForLoadState('networkidle');
  // La barra fija del teléfono sale a media imagen en una captura de página completa
  await page.addStyleTag({
    content: `@media (max-width: 1023px) { nav[aria-label="${t.nav.label}"] { position: static !important; } }`,
  });
  await page.screenshot({
    path: join(OUT_DIR, `${name}--${projectName}.jpg`),
    type: 'jpeg',
    quality: 78,
    fullPage: true,
  });
}

test('Explorar con filtros, una tarjeta abierta y acciones por lote', async ({ page }, info) => {
  test.setTimeout(180_000);
  await signUp(page);
  await page.goto(SCREENS.decks.path);
  const deck = page.getByRole('listitem').filter({ hasText: 'Urgencias (Paco)' });
  await deck.getByRole('button', { name: t.decks.follow }).click();
  await expect(deck.getByRole('button', { name: t.decks.unfollow })).toBeVisible({
    timeout: 60_000,
  });

  await page.goto(SCREENS.explore.path);
  const list = page.getByRole('list', { name: t.explore.list });
  await expect(list).toBeVisible({ timeout: 30_000 });
  await capture(page, 'explorar-lista', info.project.name);

  // Una búsqueda, dos tarjetas marcadas y la primera abierta
  await page.getByRole('searchbox', { name: t.explore.search }).fill('dolor');
  await expect(list).toBeVisible();
  const rows = list.getByRole('listitem');
  await rows.nth(0).getByRole('checkbox').check();
  await rows.nth(1).getByRole('checkbox').check();
  await rows.nth(0).getByRole('button', { name: t.explore.seeCard }).click();
  await page.getByText(t.explore.tagsTitle, { exact: true }).click();
  await capture(page, 'explorar-filtrada-con-acciones', info.project.name);
});

test('mazos propios en árbol y el editor con avisos de calidad', async ({ page }, info) => {
  test.setTimeout(120_000);
  await signUp(page);
  await page.goto(SCREENS.decks.path);
  const own = page.getByRole('region', { name: t.decks.yoursTitle });
  const create = async (name: string) => {
    await own.getByLabel(t.decks.nameLabel).fill(name);
    await own.getByRole('button', { name: t.decks.createButton }).click();
    const dialog = page.getByRole('dialog', { name: t.decks.editor.title(name) });
    await expect(dialog).toBeVisible();
    return dialog;
  };
  await (
    await create('Medicina interna')
  )
    .getByRole('button', { name: t.decks.editor.close })
    .click();
  await own.getByLabel(t.decks.parentLabel).selectOption({ label: 'Medicina interna' });
  const dialog = await create('Nefrología');

  // Una respuesta larga y una pregunta repetida despiertan los avisos
  await dialog.getByLabel(t.decks.editor.front, { exact: true }).fill('¿Qué es la TFG?');
  await dialog
    .getByLabel(t.decks.editor.back, { exact: true })
    .fill(Array.from({ length: 60 }, (_, index) => `dato${index}`).join(' '));
  await expect(dialog.getByText(t.cardQuality.footer)).toBeVisible({ timeout: 10_000 });
  await capture(page, 'editor-con-avisos', info.project.name);

  await dialog.getByRole('button', { name: t.decks.editor.save }).click();
  await dialog.getByRole('button', { name: t.decks.editor.close }).click();
  await own.getByRole('button', { name: t.decks.organizeLabel('Nefrología') }).click();
  await capture(page, 'mazos-arbol', info.project.name);
});
