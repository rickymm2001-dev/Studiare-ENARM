// B4 (comentarios 8 y 11 del plan del cambio).
// 1. Mazos de Paco muestran sus temas completos en Mazos y en Repasar (sin recortes, ordenados alfabéticamente).
// 2. Buscar tarjetas: buscar, filtrar con chips, editar una tarjeta en el panel lateral y suspender varias en lote.
import type { Page } from '@playwright/test';
import { SCREENS } from '@/app/screens';
import { t } from '@/i18n/es-MX';
import { expect, expectNoSeriousA11yViolations, signUp, test } from './support/fixtures';

async function followSmallestDeck(page: Page) {
  await page.goto(SCREENS.decks.path);
  const deck = page.getByRole('listitem').filter({ hasText: 'Urgencias (Paco)' });
  await deck.getByRole('button', { name: t.decks.follow }).click();
  await expect(deck.getByRole('button', { name: t.decks.unfollow })).toBeVisible({
    timeout: 60_000,
  });
}

test.describe('B4: Temas de Paco y Buscar tarjetas', () => {
  test('mazos de Paco muestran sus temas completos sin recortes en Mazos y Repasar', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await signUp(page);

    // 1. En Mazos, el mazo de Paco muestra sus ramas y temas completos
    await page.goto(SCREENS.decks.path);
    const urgenciasDeck = page.getByRole('listitem').filter({ hasText: 'Urgencias (Paco)' });
    await expect(urgenciasDeck).toBeVisible();

    // Verificamos que no exista el texto recortado "+ X temas más"
    await expect(urgenciasDeck.getByText(/\+\s*\d+\s*temas?\s*más/i)).toHaveCount(0);

    // Seguimos el mazo
    await urgenciasDeck.getByRole('button', { name: t.decks.follow }).click();
    await expect(urgenciasDeck.getByRole('button', { name: t.decks.unfollow })).toBeVisible({
      timeout: 60_000,
    });

    // 2. En Repasar, el pliegue Mazos y temas muestra ramas y temas ordenados alfabéticamente
    await page.goto(SCREENS.review.path);
    const disclosure = page.getByRole('button', { name: /mazos y temas/i });
    if ((await disclosure.getAttribute('aria-expanded')) !== 'true') {
      await disclosure.click();
    }

    await expect(page.getByText('Urgencias (Paco)')).toBeVisible();
    await expectNoSeriousA11yViolations(page);
  });

  test('busca, filtra, edita una tarjeta en el panel y suspende varias en lote', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await signUp(page);

    // Crear primero un mazo propio con una tarjeta editable
    await page.goto(SCREENS.decks.path);
    const ownRegion = page.getByRole('region', { name: t.decks.yoursTitle });
    await ownRegion.getByLabel(t.decks.nameLabel).fill('Mazo de prueba B4');
    await ownRegion.getByRole('button', { name: t.decks.createButton }).click();

    const editor = page.getByRole('dialog', { name: t.decks.editor.title('Mazo de prueba B4') });
    await expect(editor).toBeVisible();
    await editor
      .getByLabel(t.decks.editor.front, { exact: true })
      .fill('Pregunta de prueba inicial');
    await editor
      .getByLabel(t.decks.editor.back, { exact: true })
      .fill('Respuesta de prueba inicial');
    await editor.getByRole('button', { name: t.decks.editor.save }).click();
    await expect(editor.getByText(t.decks.editor.saved)).toBeVisible();
    await editor.getByRole('button', { name: t.decks.editor.close }).click();

    // Seguir también el mazo precargado para tener volumen de tarjetas
    await followSmallestDeck(page);

    // Ir a Buscar tarjetas
    await page.goto(SCREENS.explore.path);
    const list = page.getByRole('list', { name: t.explore.list });
    await expect(list).toBeVisible({ timeout: 30_000 });

    // 1. Buscar con la barra de búsqueda rápida
    const search = page.getByRole('searchbox', { name: t.explore.search });
    await search.fill('Pregunta de prueba inicial');
    await expect(page.getByText('Pregunta de prueba inicial')).toBeVisible();

    // 2. Click en la fila de la tarjeta para abrir el panel lateral de previsualización y edición
    await page.getByText('Pregunta de prueba inicial').click();
    const sidePanel = page.getByRole('complementary', { name: t.explore.sidePanel.title });
    await expect(sidePanel).toBeVisible();
    await expect(sidePanel.getByText('Respuesta de prueba inicial')).toBeVisible();

    // 3. Editar la tarjeta desde el panel lateral
    await sidePanel.getByRole('button', { name: t.explore.sidePanel.edit }).click();
    const frontInput = sidePanel.getByLabel(t.explore.sidePanel.frontLabel);
    await frontInput.fill('Pregunta de prueba editada');
    await sidePanel.getByRole('button', { name: t.explore.sidePanel.save }).click();
    await expect(sidePanel.getByText(t.explore.sidePanel.saved)).toBeVisible();
    await expect(page.getByText('Pregunta de prueba editada')).toBeVisible();

    // 4. Limpiar búsqueda y suspender tarjetas en lote
    await search.fill('');
    await page.getByRole('button', { name: t.explore.clear }).click();

    // Marcar tarjetas de la página
    await page.getByRole('checkbox', { name: t.explore.selectPage }).check();
    await expect(page.getByRole('button', { name: t.explore.actions.suspend, exact: true })).toBeVisible();
    await page.getByRole('button', { name: t.explore.actions.suspend, exact: true }).click();
    await expect(page.getByText(/suspendida/i)).toBeVisible();

    await expectNoSeriousA11yViolations(page);
  });
});
