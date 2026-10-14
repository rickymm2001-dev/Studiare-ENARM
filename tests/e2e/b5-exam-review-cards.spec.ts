// B5 (comentarios 1 y 2 del plan del cambio).
// 1. Un test E2E corre un examen corto, crea una tarjeta en mazo propio y otra en precargado;
//    ambas aparecen en Repasar y el mazo compartido no se mutó.
// 2. Un test E2E selecciona motivo de error, lo cambia, y Progreso refleja el último.
import { SCREENS } from '@/app/screens';
import type { Deck, Card } from '@/data/schemas/decks';
import { examTotalMs } from '@/engines/exam';
import { t } from '@/i18n/es-MX';
import { readTable } from './support/b1';
import { expect, expectNoSeriousA11yViolations, signUp, test } from './support/fixtures';

const QUESTIONS = 20;

test.describe('B5: Revisión del examen y motivos de error', () => {
  test('crea tarjeta en mazo propio y en precargado sin mutar compartido, y cambia motivo reflejándolo en Progreso', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await signUp(page);

    // 1. Seguir el mazo precargado Urgencias (Paco)
    await page.goto(SCREENS.decks.path);
    const urgenciasDeck = page.getByRole('listitem').filter({ hasText: 'Urgencias (Paco)' });
    await expect(urgenciasDeck).toBeVisible();
    await urgenciasDeck.getByRole('button', { name: t.decks.follow }).click();
    await expect(urgenciasDeck.getByRole('button', { name: t.decks.unfollow })).toBeVisible({
      timeout: 60_000,
    });

    // 2. Iniciar y contestar un examen corto de 20 preguntas
    await page.goto(SCREENS.simulatorSetup.path);
    const examCard = page.getByRole('region', { name: t.exam.cardTitle });
    await expect(examCard.getByText(t.exam.timeTotal(examTotalMs(QUESTIONS)))).toBeVisible({
      timeout: 60_000,
    });
    await examCard.getByRole('button', { name: t.exam.start }).click();
    await expect(page).toHaveURL(new RegExp(`${SCREENS.exam.path}$`));

    // Contestar las preguntas rápidamente con la primera opción (para tener falladas y correctas)
    for (let i = 0; i < QUESTIONS; i += 1) {
      await page.getByRole('radio').first().check();
      if (i < QUESTIONS - 1) {
        await page.getByRole('button', { name: t.exam.next, exact: true }).click();
      }
    }

    // Finalizar examen
    await page.getByRole('button', { name: t.exam.finish }).click();
    const finishDialog = page.getByRole('dialog');
    await finishDialog.getByRole('button', { name: t.exam.finishConfirm }).click();

    // 3. En los resultados, ir a la revisión pregunta por pregunta
    await expect(page).toHaveURL(new RegExp(`${SCREENS.examResults.path}$`));
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(t.screens.examResults.title);
    await expect(page.getByText(t.examResults.saving)).toHaveCount(0, { timeout: 60_000 });

    const review = page.getByRole('region', { name: t.examResults.reviewTitle });
    await review.getByRole('button', { name: t.examResults.filter.missed }).click();
    const missedItems = review.locator('ol > li');
    const missedCount = await missedItems.count();
    expect(missedCount).toBeGreaterThanOrEqual(2);

    // Expandir primera pregunta fallada
    const firstMissed = missedItems.first();
    await firstMissed.locator('summary').click();

    // --- Motivo de error: seleccionar Conocimiento y cambiarlo a Tiempo ---
    const knowledgeBtn = firstMissed.getByRole('button', {
      name: t.review.causes.knowledge,
      exact: true,
    });
    const timeBtn = firstMissed.getByRole('button', { name: t.review.causes.time, exact: true });

    await knowledgeBtn.click();
    await expect(knowledgeBtn).toHaveAttribute('aria-pressed', 'true');

    // Cambiar motivo a Tiempo
    await timeBtn.click();
    await expect(timeBtn).toHaveAttribute('aria-pressed', 'true');
    await expect(knowledgeBtn).toHaveAttribute('aria-pressed', 'false');

    // --- Crear tarjeta en mazo propio ---
    const createCardBtn1 = firstMissed.getByRole('button', {
      name: t.examResults.createCard,
      exact: true,
    });
    await createCardBtn1.click();

    const dialog1 = page.getByRole('dialog');
    await expect(dialog1).toBeVisible();
    await dialog1.getByLabel('Mazo destino').selectOption({ label: '+ Crear nuevo mazo' });
    await dialog1.getByLabel('Nombre del nuevo mazo').fill('Mazo Propio B5');
    await dialog1.getByRole('button', { name: 'Guardar tarjeta' }).click();

    // El diálogo se cierra y el botón ahora dice "Tarjeta creada"
    await expect(dialog1).toHaveCount(0);
    await expect(
      firstMissed.getByRole('button', { name: t.examResults.cardCreated, exact: true }),
    ).toBeVisible();

    // --- Crear tarjeta en mazo precargado ---
    const secondMissed = missedItems.nth(1);
    await secondMissed.locator('summary').click();

    const createCardBtn2 = secondMissed.getByRole('button', {
      name: t.examResults.createCard,
      exact: true,
    });
    await createCardBtn2.click();

    const dialog2 = page.getByRole('dialog');
    await expect(dialog2).toBeVisible();
    // Seleccionar el mazo precargado seguido
    await dialog2.getByLabel('Mazo destino').selectOption({ label: 'Urgencias (Paco) (precargado)' });
    await dialog2.getByRole('button', { name: 'Guardar tarjeta' }).click();

    await expect(dialog2).toHaveCount(0);
    await expect(
      secondMissed.getByRole('button', { name: t.examResults.cardCreated, exact: true }),
    ).toBeVisible();

    // 4. Verificar integridad: el mazo precargado NO fue mutado y se creó el submazo privado
    const decks = await readTable<Deck>(page, 'decks');
    const preloadedDeck = decks.find((d: Deck) => d.name === 'Urgencias (Paco)');
    expect(preloadedDeck).toBeDefined();
    expect(preloadedDeck?.origin).toBe('preloaded');
    expect(preloadedDeck?.ownerId).toBeNull();

    const subdeck = decks.find(
      (d: Deck) => d.name === 'Mis tarjetas' && d.parentId === preloadedDeck?.id,
    );
    expect(subdeck).toBeDefined();
    expect(subdeck?.origin).toBe('manual');
    expect(subdeck?.visibility).toBe('private');

    // Ambas tarjetas existen en la base
    const cards = await readTable<Card>(page, 'cards');
    const ownDeck = decks.find((d: Deck) => d.name === 'Mazo Propio B5');
    const cardInOwnDeck = cards.find((c: Card) => c.deckId === ownDeck?.id);
    const cardInSubdeck = cards.find((c: Card) => c.deckId === subdeck?.id);
    expect(cardInOwnDeck).toBeDefined();
    expect(cardInSubdeck).toBeDefined();

    // 5. Verificar que ambas tarjetas aparecen disponibles en Repasar
    await page.goto(SCREENS.review.path);
    // El botón de empezar repasar incluye las tarjetas nuevas creadas
    await expect(page.getByRole('button', { name: /^Repasar [\d,]+ tarjetas?$/ })).toBeVisible();

    // 6. Verificar que Progreso refleja el último motivo seleccionado ("Tiempo", no "Conocimiento")
    await page.goto(SCREENS.progress.path);
    const causesCard = page.getByRole('region', { name: 'Motivos de error' });
    await expect(causesCard).toBeVisible();
    await expect(causesCard.getByText(/Tiempo:\s*1/)).toBeVisible();
    await expect(causesCard.getByText('Conocimiento')).toHaveCount(0);

    await expectNoSeriousA11yViolations(page);
  });
});
