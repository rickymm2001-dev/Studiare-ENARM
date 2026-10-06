// Mazos a mano (pantalla 12, 3.1). Crear un mazo, escribirle una tarjeta básica y una con hueco,
// repasarlas, editarlas y borrar el mazo. Son privados del alumno, así que aparecen en Repasar sin
// seguir nada.
import { SCREENS } from '@/app/screens';
import { t } from '@/i18n/es-MX';
import { expect, expectNoSeriousA11yViolations, signUp, test } from './support/fixtures';

const DECK = 'Nefrología de la residencia';

test('crea un mazo, escribe tarjetas, las repasa, las edita y borra el mazo', async ({ page }) => {
  test.setTimeout(120_000);
  await signUp(page);
  await page.goto(SCREENS.decks.path);
  const own = page.getByRole('region', { name: t.decks.yoursTitle });

  // Sin nombre no crea nada y lo dice
  await own.getByRole('button', { name: t.decks.createButton }).click();
  await expect(own.getByText(t.decks.nameError)).toBeVisible();
  await own.getByLabel(t.decks.nameLabel).fill(DECK);
  await own.getByRole('button', { name: t.decks.createButton }).click();

  // Se abre el editor del mazo recién creado
  const dialog = page.getByRole('dialog', { name: t.decks.editor.title(DECK) });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(t.decks.editor.empty)).toBeVisible();
  await expectNoSeriousA11yViolations(page);

  // Pide lo que falta
  await dialog.getByRole('button', { name: t.decks.editor.save }).click();
  await expect(dialog.getByText(t.decks.editor.errors.empty_front)).toBeVisible();

  // Una tarjeta básica y una con un hueco, las dos escritas como texto plano
  await dialog
    .getByLabel(t.decks.editor.front, { exact: true })
    .fill('¿Qué mide la tasa de filtrado glomerular?');
  await dialog
    .getByLabel(t.decks.editor.back, { exact: true })
    .fill('Cuánta sangre filtran los riñones por minuto');
  await dialog.getByRole('button', { name: t.decks.editor.save }).click();
  await expect(dialog.getByText(t.decks.editor.saved)).toBeVisible();
  await dialog.getByText(t.decks.editor.cloze, { exact: true }).click();
  await dialog
    .getByLabel(t.decks.editor.text, { exact: true })
    .fill('Con <b>1</b> la {{c1::creatinina}} sube en la lesión renal aguda');
  await expect(dialog.locator('form').getByText(t.decks.editor.cards(1))).toBeVisible();
  await dialog.getByRole('button', { name: t.decks.editor.save }).click();
  await expect(dialog.getByRole('region', { name: t.decks.editor.listTitle(2) })).toBeVisible();
  // Lo escrito se ve como texto y no como etiqueta
  await expect(dialog.getByText('<b>1</b>')).toBeVisible();
  await dialog.getByRole('button', { name: t.decks.editor.close }).click();
  await expect(own.getByText(t.decks.progress(0, 2))).toBeVisible();

  // Sin seguir ningún mazo, Repasar ya trae las dos tarjetas propias
  await page.goto(SCREENS.review.path);
  await page.getByRole('button', { name: /^Repasar 2 tarjetas$/ }).click();
  await expect(page.getByText(t.review.errorCard)).toHaveCount(0);
  await page.getByRole('button', { name: t.review.confidence.sure, exact: true }).click();
  await expect(page.getByText('¿Qué mide la tasa de filtrado glomerular?')).toBeVisible();
  await page.getByRole('button', { name: t.review.show }).click();
  await expect(page.getByText('Cuánta sangre filtran los riñones por minuto')).toBeVisible();
  await page.getByRole('button', { name: new RegExp(`^${t.review.ratings.good}`) }).click();
  // La segunda es la de hueco
  await page.getByRole('button', { name: t.review.confidence.unsure, exact: true }).click();
  await expect(page.getByText('[…]')).toBeVisible();

  // Editar una tarjeta cambia su texto y borrarla la quita
  await page.goto(SCREENS.decks.path);
  await own.getByRole('button', { name: `${t.decks.editCards}. ${DECK}` }).click();
  const editor = page.getByRole('dialog', { name: t.decks.editor.title(DECK) });
  await editor
    .getByRole('button', { name: new RegExp(`^${t.decks.editor.editNote('¿Qué mide la tasa')}`) })
    .click();
  await editor.getByLabel(t.decks.editor.front, { exact: true }).fill('¿Qué mide la TFG?');
  await editor.getByRole('button', { name: t.decks.editor.saveChanges }).click();
  // La lista de tarjetas ya trae el texto nuevo. El campo del formulario también lo tiene un momento
  await expect(
    editor
      .getByRole('region', { name: t.decks.editor.listTitle(2) })
      .getByText('¿Qué mide la TFG?'),
  ).toBeVisible();
  await editor
    .getByRole('button', { name: new RegExp(`^${t.decks.editor.deleteNote('Con <b>1</b>')}`) })
    .click();
  await editor.getByRole('button', { name: t.decks.confirmDeleteYes }).click();
  await expect(editor.getByRole('region', { name: t.decks.editor.listTitle(1) })).toBeVisible();
  await editor.getByRole('button', { name: t.decks.editor.close }).click();

  // Borrar el mazo pide confirmar
  await own.getByRole('button', { name: `${t.decks.deleteDeck}. ${DECK}` }).click();
  await expect(own.getByText(t.decks.confirmDelete(DECK))).toBeVisible();
  await own.getByRole('button', { name: t.decks.confirmDeleteYes }).click();
  await expect(own.getByText(DECK)).toHaveCount(0);
});
