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

  // Repasar y Mazos son una sola sección con dos pestañas (D-087)
  const tabs = page.getByRole('navigation', { name: t.studyTabs.label });
  await expect(tabs.getByRole('link', { name: t.studyTabs.decks })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await tabs.getByRole('link', { name: t.studyTabs.review }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(t.screens.review.title);
  await page
    .getByRole('navigation', { name: t.studyTabs.label })
    .getByRole('link', { name: t.studyTabs.decks })
    .click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(t.screens.decks.title);

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
  // Primero la tarjeta tiene que estar en pantalla, si no la ausencia de la etiqueta no prueba nada
  const show = page.getByRole('button', { name: t.review.show });
  await expect(show).toBeVisible();
  await expect(page.getByText(t.review.errorCard)).toHaveCount(0);
  await expect(page.getByText('¿Qué mide la tasa de filtrado glomerular?')).toBeVisible();
  await show.click();
  await expect(page.getByText('Cuánta sangre filtran los riñones por minuto')).toBeVisible();
  await page.getByRole('button', { name: new RegExp(`^${t.review.ratings.good}`) }).click();
  // La segunda es la de hueco
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

test('arma un árbol de mazos, mueve un submazo y cambia el nombre', async ({ page }) => {
  test.setTimeout(120_000);
  await signUp(page);
  await page.goto(SCREENS.decks.path);
  const own = page.getByRole('region', { name: t.decks.yoursTitle });
  const create = async (name: string) => {
    await own.getByLabel(t.decks.nameLabel).fill(name);
    await own.getByRole('button', { name: t.decks.createButton }).click();
    const dialog = page.getByRole('dialog', { name: t.decks.editor.title(name) });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: t.decks.editor.close }).click();
  };

  // Un mazo en el primer nivel y otro dentro de él
  await create('Medicina interna');
  await own.getByLabel(t.decks.parentLabel).selectOption({ label: 'Medicina interna' });
  await create('Nefrología');
  await expect(own.getByText(t.decks.inside('Medicina interna'))).toBeVisible();
  await expectNoSeriousA11yViolations(page);

  // El editor avisa de una respuesta larga y sigue pasando axe con los avisos a la vista
  await own.getByRole('button', { name: `${t.decks.editCards}. Nefrología` }).click();
  const editor = page.getByRole('dialog', { name: t.decks.editor.title('Nefrología') });
  await editor.getByLabel(t.decks.editor.front, { exact: true }).fill('¿Qué es la TFG?');
  await editor
    .getByLabel(t.decks.editor.back, { exact: true })
    .fill(Array.from({ length: 60 }, (_, index) => `dato${index}`).join(' '));
  await expect(editor.getByText(t.cardQuality.footer)).toBeVisible({ timeout: 10_000 });
  await expectNoSeriousA11yViolations(page);
  await editor.getByRole('button', { name: t.decks.editor.close }).click();

  // Al organizarlo se puede regresar al primer nivel y cambiarle el nombre
  await own.getByRole('button', { name: t.decks.organizeLabel('Nefrología') }).click();
  await own.getByLabel(t.decks.renameLabel).fill('Nefrología clínica');
  await own.getByRole('button', { name: t.decks.rename }).click();
  await expect(own.getByText(t.decks.renamed)).toBeVisible();
  await own.getByLabel(t.decks.moveLabel).selectOption({ label: t.decks.topLevel });
  await own.getByRole('button', { name: t.decks.move }).click();
  await expect(own.getByText(t.decks.moved)).toBeVisible();
  await expect(own.getByText(t.decks.inside('Medicina interna'))).toHaveCount(0);
  await expect(own.getByText('Nefrología clínica', { exact: true }).first()).toBeVisible();
});
