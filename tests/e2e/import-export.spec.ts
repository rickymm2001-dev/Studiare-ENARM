// Importar y exportar tarjetas (D-093). Con la app compilada de verdad, el archivo pasa por el Web
// Worker y, si es un paquete de Anki, por el motor de SQLite. Se prueba un CSV, un paquete .apkg en
// el formato viejo y otro en el nuevo, una hoja de Excel, un archivo que no se puede leer, el
// guardado con su confirmación de derechos, que volver a importar no duplica y la descarga del CSV.
import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { SCREENS } from '@/app/screens';
import {
  buildLegacyApkg,
  buildModernApkg,
  buildXlsx,
  standardModels,
  type ApkgFixture,
} from '@/data/import/testing/fixtures';
import { t } from '@/i18n/es-MX';
import { expect, expectNoSeriousA11yViolations, signUp, test } from './support/fixtures';

const apkgFixture: ApkgFixture = {
  models: standardModels,
  notes: [
    {
      guid: 'g1',
      model: 'basic',
      fields: ['Triada de Beck', 'Hipotensión, yugulares y ruidos apagados'],
      tags: 'cardio',
      deck: 'ENARM::Cardiología',
    },
    {
      guid: 'g2',
      model: 'reversed',
      fields: ['Metformina', 'Biguanida'],
      deck: 'ENARM::Cardiología',
      ordinals: [0, 1],
    },
    {
      guid: 'g3',
      model: 'cloze',
      fields: ['La {{c1::troponina}} sube a las 3 horas', ''],
      deck: 'ENARM',
    },
  ],
};

async function upload(
  page: Page,
  name: string,
  buffer: Uint8Array | Buffer,
  mimeType = 'application/octet-stream',
) {
  await page
    .getByLabel(t.importer.fileLabel)
    .setInputFiles({ name, mimeType, buffer: Buffer.from(buffer) });
}

async function importFile(page: Page, deckName: string) {
  await expect(page.getByText(t.importer.previewTitle)).toBeVisible({ timeout: 30_000 });
  await page.getByLabel(t.importer.deckName).fill(deckName);
  await page.getByLabel(t.importer.rights).check();
  await page.getByRole('button', { name: /^Importar \d/ }).click();
  await expect(page.getByText(t.importer.doneTitle)).toBeVisible({ timeout: 30_000 });
}

test('un CSV se previsualiza, exige confirmar derechos, se guarda y no se duplica', async ({
  page,
}) => {
  await signUp(page);
  await page.goto(SCREENS.decks.path);
  await expect(page.getByRole('heading', { name: t.importer.title })).toBeVisible();
  await expectNoSeriousA11yViolations(page);

  const csv =
    'Frente,Reverso,Etiquetas\nTriada de Beck,Hipotensión,cardio\n,sin frente,\nMetformina,Biguanida,\n';
  await upload(page, 'mis tarjetas.csv', Buffer.from(csv), 'text/csv');
  await expect(page.getByText(t.importer.previewTitle)).toBeVisible();
  await expect(page.getByText(t.importer.summary(2, 1))).toBeVisible();
  await expect(page.getByText(t.importer.rowErrorsTitle(1))).toBeVisible();
  await expect(page.getByText('Fila 3, sin frente')).toBeVisible();
  await expect(page.getByLabel(t.importer.deckName)).toHaveValue('mis tarjetas');
  await expectNoSeriousA11yViolations(page);

  // Sin confirmar el derecho de uso no se guarda
  await page.getByRole('button', { name: /^Importar \d/ }).click();
  await expect(page.getByText(t.importer.rightsRequired)).toBeVisible();
  await page.getByLabel(t.importer.rights).check();
  await page.getByRole('button', { name: /^Importar \d/ }).click();
  await expect(page.getByText(t.importer.doneTitle)).toBeVisible();
  await expect(page.getByText(t.importer.done(2, 2))).toBeVisible();

  // El mazo aparece entre los del alumno
  await expect(
    page.getByRole('listitem').filter({ hasText: 'mis tarjetas' }).first(),
  ).toBeVisible();

  // El mismo archivo otra vez no duplica
  await page.getByRole('button', { name: t.importer.again }).click();
  await upload(page, 'mis tarjetas.csv', Buffer.from(csv), 'text/csv');
  await importFile(page, 'mis tarjetas');
  await expect(page.getByText(t.importer.doneDuplicates(2))).toBeVisible();
  await page.goto(SCREENS.explore.path);
  await expect(page.getByText(t.explore.results(2, 2))).toBeVisible({ timeout: 30_000 });
});

test('un paquete de Anki del formato viejo y otro del nuevo se leen con el motor de SQLite', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await signUp(page);
  await page.goto(SCREENS.decks.path);

  await upload(page, 'viejo.apkg', await buildLegacyApkg(apkgFixture));
  await expect(page.getByText(t.importer.summary(3, 3))).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText(t.importer.sources.apkg, { exact: false }).first()).toBeVisible();
  await importFile(page, 'Anki viejo');
  await expect(page.getByText(t.importer.done(3, 4))).toBeVisible();

  await page.getByRole('button', { name: t.importer.again }).click();
  // Otras notas, con otros identificadores, para que no sean duplicados de las primeras
  const modern: ApkgFixture = {
    models: standardModels,
    notes: apkgFixture.notes.map((note) => ({
      ...note,
      guid: `nuevo-${note.guid}`,
      fields: note.fields.map((field) => `${field} (nuevo)`),
    })),
  };
  await upload(page, 'nuevo.apkg', await buildModernApkg(modern));
  await importFile(page, 'Anki nuevo');
  await expect(page.getByText(t.importer.done(3, 4))).toBeVisible();

  await page.goto(SCREENS.explore.path);
  await expect(page.getByText(t.explore.results(8, 8))).toBeVisible({ timeout: 30_000 });
});

test('una hoja de Excel se importa y un archivo que no se puede leer avisa con claridad', async ({
  page,
}) => {
  await signUp(page);
  await page.goto(SCREENS.decks.path);
  await upload(
    page,
    'hoja.xlsx',
    buildXlsx([
      ['Frente', 'Reverso'],
      ['Dosis de adrenalina en paro', '1 mg cada 3 a 5 minutos'],
    ]),
  );
  await importFile(page, 'Mi hoja');
  await expect(page.getByText(t.importer.done(1, 1))).toBeVisible();

  await page.getByRole('button', { name: t.importer.again }).click();
  await upload(page, 'raro.apkg', Buffer.from('esto no es un zip, es texto sin sentido\0\0\0'));
  await expect(page.getByRole('alert')).toHaveText(t.importer.errors.unsupported ?? '');
  await upload(page, 'vacio.csv', Buffer.from(''));
  await expect(page.getByRole('alert')).toHaveText(t.importer.errors.empty ?? '');
});

test('exportar descarga un CSV con encabezados y un identificador por nota', async ({ page }) => {
  await signUp(page);
  await page.goto(SCREENS.decks.path);
  // Sin mazos propios no hay nada que exportar
  await expect(page.getByRole('heading', { name: t.exporter.title })).toHaveCount(0);

  await upload(page, 'a.csv', Buffer.from('Frente,Reverso\nUno,Dos\nTres,Cuatro\n'), 'text/csv');
  await importFile(page, 'Para exportar');

  await expect(page.getByRole('heading', { name: t.exporter.title })).toBeVisible();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: t.exporter.button }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^Studiare-\d{4}-\d{2}-\d{2}\.csv$/);
  const path = await download.path();
  const text = readFileSync(path, 'utf8');
  expect(text).toContain('#guid column:1');
  expect(text).toContain('#columns:Guid,Notetype,Deck,Front,Back,Tags');
  expect(text).toContain('Para exportar');
  expect(text.trim().split(/\r?\n/)).toHaveLength(7 + 2);
  await expect(page.getByText(t.exporter.done(2, download.suggestedFilename()))).toBeVisible();
});
