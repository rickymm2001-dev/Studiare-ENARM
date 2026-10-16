// Tarjetas con IA desde un texto o PDF (D-085). Con la app compilada, el plan Gratis no la incluye,
// un plan de pago genera con el modo simulado, de un PDF y de un texto pegado, las tarjetas quedan
// en borrador con su cita, la señal de controversia se puede verificar y la cuota del día se respeta.
// Cuando el servidor dice que ya no hay generaciones de hoy (B12, 2.4) la app lo avisa con el texto del
// servidor y no tapa el tope con tarjetas simuladas.
import type { Page } from '@playwright/test';
import { SCREENS } from '@/app/screens';
import { buildPdf } from '@/data/import/testing/pdf';
import { t } from '@/i18n/es-MX';
import { cardPanel, openCard, resultRows, searchResults } from './support/cardSearch';
import { expect, expectNoSeriousA11yViolations, signUp, test } from './support/fixtures';

const MATERIAL =
  'La metformina es el tratamiento de primera línea de la diabetes mellitus tipo 2. ' +
  'La dosis inicial habitual es de 500 mg cada 12 horas con los alimentos. ' +
  'Nunca debe usarse con una tasa de filtrado glomerular menor de 30 ml/min. ' +
  'La retinopatía diabética se caracteriza por microaneurismas y hemorragias retinianas en el fondo de ojo.';

async function subscribeMonthly(page: Page) {
  await page.goto(SCREENS.subscription.path);
  await page.getByRole('button', { name: t.billing.choose(t.billing.plans.monthly) }).click();
  await page.getByRole('button', { name: t.billing.confirm }).click();
  await expect(page.getByText(t.billing.receiptTitle)).toBeVisible({ timeout: 15_000 });
}

test('el plan Gratis no la incluye y uno de pago genera tarjetas en borrador con su cita', async ({
  page,
}) => {
  await signUp(page);
  await page.goto(SCREENS.decks.path);
  await expect(
    page.getByText(t.billing.featureLocked(t.billing.featureNames.aiCards)),
  ).toBeVisible();

  await subscribeMonthly(page);
  await page.goto(SCREENS.decks.path);
  const card = page.getByRole('region', { name: t.aiCards.title });
  await expect(card).toBeVisible();
  await expect(card.getByText(t.aiCards.modes.template)).toBeVisible();
  await expectNoSeriousA11yViolations(page);

  await card.getByLabel(t.aiCards.textLabel).fill(MATERIAL);
  await card.getByLabel(t.aiCards.sourceName).fill('Guía de diabetes');
  await card.getByRole('button', { name: t.aiCards.generate }).click();
  await expect(card.getByRole('heading', { name: t.aiCards.resultTitle })).toBeVisible();
  await expect(card.getByText(t.aiCards.draftLabel).first()).toBeVisible();
  await expect(card.getByText(t.aiCards.quote).first()).toBeVisible();
  // La frase "nunca debe usarse" es absoluta y trae su señal con fuentes de la lista
  const signal = card.getByLabel(t.controversy.title);
  await expect(signal).toBeVisible();
  await expect(signal.getByText(/Guías de Práctica Clínica del CENETEC/)).toBeVisible();
  await expect(signal.getByRole('button')).toHaveCount(0);
  await expectNoSeriousA11yViolations(page);

  await card.getByRole('button', { name: /^Guardar \d+ tarjetas? en borrador$/ }).click();
  await expect(card.getByText(t.aiCards.savedTitle, { exact: true })).toBeVisible();

  // En Buscar tarjetas la tarjeta con señal la lleva marcada, y al verificarla la señal se quita
  await page.goto(SCREENS.explore.path);
  const results = searchResults(page);
  await expect(results).toBeVisible({ timeout: 30_000 });
  const badge = results.getByText(t.controversy.badge).first();
  await expect(badge).toBeVisible();
  await openCard(resultRows(page).filter({ hasText: t.controversy.badge }).first());
  await cardPanel(page).getByRole('button', { name: t.controversy.verify }).click();
  await expect(results.getByText(t.controversy.badge)).toHaveCount(0);
});

test('un PDF con texto llena el campo y uno sin texto avisa que no se puede leer', async ({
  page,
}) => {
  await signUp(page);
  await subscribeMonthly(page);
  await page.goto(SCREENS.decks.path);
  const card = page.getByRole('region', { name: t.aiCards.title });
  await expect(card).toBeVisible();

  const pdf = buildPdf([
    ['La metformina es el tratamiento de primera linea de la diabetes mellitus tipo 2.'],
    ['La dosis inicial habitual es de 500 mg cada 12 horas con los alimentos.'],
  ]);
  await card
    .getByLabel(t.aiCards.fileLabel)
    .setInputFiles({ name: 'guia.pdf', mimeType: 'application/pdf', buffer: Buffer.from(pdf) });
  await expect(card.getByLabel(t.aiCards.textLabel)).toHaveValue(/metformina/, { timeout: 30_000 });
  await expect(card.getByLabel(t.aiCards.sourceName)).toHaveValue('guia.pdf');

  await card.getByLabel(t.aiCards.fileLabel).setInputFiles({
    name: 'escaneo.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from(buildPdf([[]])),
  });
  await expect(card.getByRole('alert')).toHaveText(t.aiCards.fileErrors.no_text ?? '', {
    timeout: 30_000,
  });
});

/** Lo que contesta el servidor cuando se pasa de las generaciones de tarjetas del día (B12, 2.2) */
const GENERATION_MESSAGE =
  'Llegaste al límite de generaciones de tarjetas con IA de hoy. Vuelve mañana.';

test('cuando el servidor contesta generation_limit la app avisa de las generaciones de hoy y no inventa tarjetas', async ({
  page,
  consoleErrors,
}) => {
  await signUp(page);
  await subscribeMonthly(page);
  await page.goto(SCREENS.decks.path);
  const card = page.getByRole('region', { name: t.aiCards.title });
  await expect(card).toBeVisible();

  // La primera generación pasa por el proxy de verdad. A la segunda el servidor le dice que ya no hay
  let requests = 0;
  await page.route('**/api/ai/flashcards', async (route) => {
    requests += 1;
    if (requests === 1) {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 429,
      json: { error: 'generation_limit', message: GENERATION_MESSAGE },
    });
  });
  await card.getByLabel(t.aiCards.textLabel).fill(MATERIAL);
  await card.getByRole('button', { name: t.aiCards.generate }).click();
  await expect(card.getByRole('heading', { name: t.aiCards.resultTitle })).toBeVisible();
  await card.getByRole('button', { name: t.aiCards.again }).first().click();

  await card.getByLabel(t.aiCards.textLabel).fill(MATERIAL);
  await card.getByRole('button', { name: t.aiCards.generate }).click();
  await expect(card.getByRole('alert')).toHaveText(GENERATION_MESSAGE);
  // La app no tapa el tope con tarjetas del generador simulado, y el texto sigue ahí para otro día
  await expect(card.getByRole('heading', { name: t.aiCards.resultTitle })).toHaveCount(0);
  await expect(card.getByLabel(t.aiCards.textLabel)).toHaveValue(MATERIAL);
  expect(requests).toBe(2);
  await expectNoSeriousA11yViolations(page);

  // Chromium anota en la consola cada 429 como un recurso que no cargó. Es el que provocó la prueba y
  // ningún otro error pasa
  expect(consoleErrors).toEqual([
    'Failed to load resource: the server responded with a status of 429 (Too Many Requests)',
  ]);
  consoleErrors.length = 0;
});
