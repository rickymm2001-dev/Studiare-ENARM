// Apuntes (D-092). Se escribe un apunte con marcas y salen tarjetas que Repasar ya trae. Al editar el
// texto las tarjetas se actualizan sin perder las que siguen, quitar una marca las quita y volver a
// ponerla las revive. Un enlace a otro apunte se resuelve y se puede crear desde el apunte que lo cita.
import type { Page } from '@playwright/test';
import { SCREENS } from '@/app/screens';
import { t } from '@/i18n/es-MX';
import { expect, expectNoSeriousA11yViolations, signUp, test } from './support/fixtures';

const editorOf = (page: Page) => page.getByRole('textbox', { name: t.outlines.editor.label });

async function createOutline(page: Page, title: string) {
  await page.goto(SCREENS.outlines.path);
  await page.getByLabel(t.outlines.newTitle).fill(title);
  await page.getByRole('button', { name: t.outlines.create }).click();
  await expect(editorOf(page)).toBeVisible({ timeout: 30_000 });
  await editorOf(page).click();
}

async function saved(page: Page) {
  await expect(page.getByText(t.outlines.editor.saved, { exact: true })).toBeVisible({
    timeout: 15_000,
  });
}

test('un apunte con marcas da tarjetas, se actualiza al editar y se borra', async ({ page }) => {
  test.setTimeout(180_000);
  await signUp(page);
  await createOutline(page, 'Asma');

  // Dos líneas con marca y una más dentro de la primera
  await page.keyboard.type('Asma :: Obstrucción reversible de la vía aérea');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Primera línea >> Salbutamol');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Tab');
  await page.keyboard.type('Sibilancias nocturnas ;; Asma #Neumología::Asma');

  // Un :: da dos tarjetas, >> una y ;; una más
  await expect(page.getByText(t.outlines.preview.count(4))).toBeVisible();
  await saved(page);
  await expectNoSeriousA11yViolations(page);

  // Repasar ya trae las tarjetas del apunte. Hoy salen 3 porque las dos cartas de un mismo concepto
  // no se repasan el mismo día, la segunda espera a mañana
  await page.goto(SCREENS.review.path);
  await expect(page.getByRole('button', { name: 'Repasar 3 tarjetas' })).toBeVisible({
    timeout: 30_000,
  });

  // Cambiar el texto de una línea conserva su tarjeta y quitar una marca la quita
  await page.goto(SCREENS.outlines.path);
  await page.getByRole('link', { name: t.outlines.open('Asma') }).click();
  await expect(editorOf(page)).toBeVisible();
  await expect(page.getByText(t.outlines.preview.count(4))).toBeVisible();
  await editorOf(page).getByText('Salbutamol').click();
  await page.keyboard.press('End');
  await page.keyboard.type(' inhalado');
  await expect(page.getByText(t.outlines.preview.count(4))).toBeVisible();
  // Quitar los dos puntos del primer renglón deja esa línea sin marca
  // El cursor tiene que quedar al principio de esa línea antes de borrar. Sin esperarlo, los Delete a
  // veces caían al final de la línea de abajo y se llevaban su salto de línea. Si el clic no llegó
  // a tiempo, se repite
  const caret = () =>
    page.evaluate(() => {
      const selection = window.getSelection();
      return `${selection?.anchorOffset ?? -1}|${selection?.anchorNode?.textContent ?? ''}`;
    });
  await expect(async () => {
    await editorOf(page).getByText('Obstrucción reversible').click();
    await page.keyboard.press('Home');
    expect(await caret()).toMatch(/^0\|Asma /);
  }).toPass({ timeout: 15_000 });
  for (const key of Array.from('Asma ::', () => 'Delete')) await page.keyboard.press(key);
  await expect(page.getByText(t.outlines.preview.count(2))).toBeVisible();
  await saved(page);

  // Borrar el apunte borra sus tarjetas y las saca de Repasar
  await page.getByRole('button', { name: t.outlines.remove.button }).click();
  await page.getByRole('button', { name: t.outlines.remove.confirm }).click();
  await expect(page.getByText(t.outlines.empty)).toBeVisible({ timeout: 15_000 });
  await page.goto(SCREENS.review.path);
  await expect(page.getByRole('button', { name: /^Repasar \d+ tarjetas?$/ })).toHaveCount(0);
});

/** Las notas que guarda el navegador, tal como están en IndexedDB, con las borradas incluidas */
async function storedNotes(page: Page) {
  return page.evaluate(
    () =>
      new Promise<{ id: string; outlineNodeId: string | null; deletedAt?: string | null }[]>(
        (resolve, reject) => {
          const open = indexedDB.open('enarm_real');
          open.onerror = () => {
            reject(new Error('No se pudo abrir la base'));
          };
          open.onsuccess = () => {
            const all = open.result.transaction('notes', 'readonly').objectStore('notes').getAll();
            all.onerror = () => {
              reject(new Error('No se pudo leer las notas'));
            };
            all.onsuccess = () => {
              open.result.close();
              resolve(all.result as never);
            };
          };
        },
      ),
  );
}

test('partir una línea con Enter al inicio y volverla a unir conserva su nota y su historial', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await signUp(page);
  await createOutline(page, 'Historial');
  await page.keyboard.type('Pregunta >> Respuesta');
  await saved(page);
  const [original] = await storedNotes(page);
  expect(original).toBeDefined();

  // Enter al inicio deja un renglón en blanco arriba. La línea con tarjeta sigue siendo la misma
  await page.keyboard.press('Home');
  await page.keyboard.press('Enter');
  await expect(page.getByText(t.outlines.editor.saved, { exact: true })).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByText(t.outlines.preview.count(1))).toBeVisible();
  let notes = await storedNotes(page);
  expect(notes).toHaveLength(1);
  expect(notes[0]).toMatchObject({ id: original?.id, outlineNodeId: original?.outlineNodeId });
  expect(notes[0]?.deletedAt ?? null).toBeNull();

  // Backspace al inicio quita el renglón en blanco y tampoco cambia la nota
  await page.keyboard.press('Backspace');
  await expect(editorOf(page).locator('li')).toHaveCount(1);
  await expect(page.getByText(t.outlines.editor.saved, { exact: true })).toBeVisible({
    timeout: 15_000,
  });
  notes = await storedNotes(page);
  expect(notes).toHaveLength(1);
  expect(notes[0]).toMatchObject({ id: original?.id, outlineNodeId: original?.outlineNodeId });
  expect(notes[0]?.deletedAt ?? null).toBeNull();
});

test('pegar varias líneas hace varias líneas con su tarjeta cada una', async ({ page }) => {
  test.setTimeout(120_000);
  await signUp(page);
  await createOutline(page, 'Pegado');
  await page.evaluate(() => {
    const target = document.querySelector('[role="textbox"]');
    const data = new DataTransfer();
    data.setData('text/plain', 'Q1 >> A1\nQ2 >> A2\nQ3 >> A3');
    target?.dispatchEvent(
      new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }),
    );
  });
  await expect(editorOf(page).locator('li')).toHaveCount(3);
  await expect(page.getByText(t.outlines.preview.count(3))).toBeVisible();
});

test('los enlaces entre apuntes se resuelven y se crean desde el que los cita', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await signUp(page);
  await createOutline(page, 'Neumología');
  await page.keyboard.type('Ver [[Asma]] para el tratamiento');
  await saved(page);

  // El apunte citado todavía no existe, se puede crear desde aquí
  const links = page.getByRole('region', { name: t.outlines.links.title });
  await expect(links.getByText('Asma')).toBeVisible();
  await expect(links.getByText(t.outlines.links.missing)).toBeVisible();
  await links.getByRole('button', { name: t.outlines.create }).click();
  await expect(links.getByRole('link', { name: 'Asma' })).toBeVisible({ timeout: 15_000 });

  // Y el apunte creado muestra desde dónde lo mencionan
  await links.getByRole('link', { name: 'Asma' }).click();
  await expect(editorOf(page)).toBeVisible();
  const asmaLinks = page.getByRole('region', { name: t.outlines.links.title });
  await expect(asmaLinks.getByRole('link', { name: 'Neumología' })).toBeVisible();
});

test('Esc saca el foco del editor y los botones de la barra sirven sin teclado', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await signUp(page);
  await createOutline(page, 'Teclado');
  await page.keyboard.type('Uno');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Dos');
  // Sin tecla Tab (teléfono), el botón mete la línea en la de arriba
  await page.getByRole('button', { name: t.outlines.editor.indent }).click();
  await expect(editorOf(page).locator('ul ul li')).toHaveCount(1);
  await page.getByRole('button', { name: t.outlines.editor.outdent }).click();
  await expect(editorOf(page).locator('ul ul li')).toHaveCount(0);
  await editorOf(page).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: t.outlines.editor.indent })).toBeFocused();
});
