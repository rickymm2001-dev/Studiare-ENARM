// Tarjetas con IA desde un texto o PDF (D-085). Con la app compilada, el plan Gratis no la incluye,
// un plan de pago genera con el modo simulado, de un PDF y de un texto pegado, las tarjetas quedan
// en borrador con su cita, la señal de controversia se puede verificar y la cuota del día se respeta.
import type { Page } from '@playwright/test';
import { SCREENS } from '@/app/screens';
import { buildPdf } from '@/data/import/testing/pdf';
import { t } from '@/i18n/es-MX';
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

  // En Explorar la tarjeta con señal la lleva marcada, y al verificarla la señal se quita
  await page.goto(SCREENS.explore.path);
  const list = page.getByRole('list', { name: t.explore.list });
  await expect(list).toBeVisible({ timeout: 30_000 });
  const badge = list.getByText(t.controversy.badge).first();
  await expect(badge).toBeVisible();
  const row = list.getByRole('listitem').filter({ hasText: t.controversy.badge });
  await row.getByRole('button', { name: /^Ver tarjeta/ }).click();
  await row.getByRole('button', { name: t.controversy.verify }).click();
  await expect(list.getByText(t.controversy.badge)).toHaveCount(0);
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
