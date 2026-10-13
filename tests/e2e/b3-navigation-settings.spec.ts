// Pruebas E2E de B3: Navegación, Configuración y Perfil (criterios de aceptación 1, 2, 3 y 4).
import { SCREENS } from '@/app/screens';
import { t } from '@/i18n/es-MX';
import { expect, signUp, test } from './support/fixtures';

test.describe('B3: Navegación, Configuración y Perfil', () => {
  test('cambia un ajuste del repaso en Repasar, recarga y lo conserva (criterio 2)', async ({ page }) => {
    test.setTimeout(120_000);
    await signUp(page);

    // Seguir un mazo para tener tarjetas en Repasar y acceder a ReviewSetup
    await page.goto(SCREENS.decks.path);
    const deck = page.getByRole('listitem').filter({ hasText: 'Urgencias (Paco)' });
    await deck.getByRole('button', { name: t.decks.follow }).click();
    await expect(deck.getByRole('button', { name: t.decks.unfollow })).toBeVisible({
      timeout: 60_000,
    });

    await page.goto(SCREENS.review.path);

    // Abrir el pliegue de Límites diarios donde vive ReviewSettingsPanel
    const limitsDisclosure = page.locator('summary', { hasText: t.reviewSetup.limits });
    await limitsDisclosure.click();

    // Localizar el ajuste de paso de confianza (cardConfidenceStep)
    const confidenceCheckbox = page.getByLabel(t.settings.cardConfidenceStep);
    await expect(confidenceCheckbox).toBeVisible();

    const initiallyChecked = await confidenceCheckbox.isChecked();
    if (initiallyChecked) {
      await confidenceCheckbox.uncheck();
    } else {
      await confidenceCheckbox.check();
    }

    // Debe aparecer la barra de guardado con el botón Guardar cambios dentro del formulario de ajustes
    const reviewForm = page.getByRole('form', { name: 'Ajustes del repaso' });
    const saveBtn = reviewForm.getByRole('button', { name: t.settings.saveChanges });
    await expect(saveBtn).toBeVisible();
    await saveBtn.click();

    // Esperar mensaje de guardado
    await expect(reviewForm.getByText(t.settings.saved)).toBeVisible();

    // Recargar la página y verificar persistencia
    await page.reload();
    const limitsDisclosureAfter = page.locator('summary', { hasText: t.reviewSetup.limits });
    await limitsDisclosureAfter.click();

    const confidenceCheckboxAfter = page.getByLabel(t.settings.cardConfidenceStep);
    await expect(confidenceCheckboxAfter).toBeVisible();
    expect(await confidenceCheckboxAfter.isChecked()).toBe(!initiallyChecked);
  });

  test('Configuración tiene exactamente 3 secciones y 0 pestañas (criterio 3)', async ({ page }) => {
    test.setTimeout(60_000);
    await signUp(page);
    await page.goto(SCREENS.settings.path);

    // 0 pestañas
    await expect(page.getByRole('tab')).toHaveCount(0);
    await expect(page.getByRole('tablist')).toHaveCount(0);

    // Exactamente 3 secciones (Perfil, Apariencia, Privacidad)
    await expect(page.getByRole('heading', { level: 2, name: t.settings.sections.profile })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('heading', { level: 2, name: t.settings.sections.appearance })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: t.settings.sections.privacy })).toBeVisible();

    // No debe haber sección de administración para el alumno
    await expect(page.getByRole('heading', { level: 2, name: t.navItems.admin })).toHaveCount(0);

    // Muestra la tarjeta del plan actual y botón Cambiar tu plan
    await expect(page.getByText(new RegExp(t.settings.currentPlan, 'i'))).toBeVisible();
    await expect(page.getByRole('link', { name: new RegExp(t.settings.changePlan, 'i') })).toBeVisible();
  });

  test('recorre Editar perfil: solo lectura por defecto, editable con aviso al cancelar dirty y guardado (criterio 3)', async ({ page }) => {
    test.setTimeout(60_000);
    await signUp(page);
    await page.goto(SCREENS.settings.path);

    // 1. Vista de solo lectura por defecto
    const editBtn = page.getByRole('button', { name: t.settings.editProfile });
    await expect(editBtn).toBeVisible({ timeout: 15_000 });
    await expect(page.getByLabel(t.onboarding.alias)).toHaveCount(0);

    // 2. Clic en Editar perfil abre los campos
    await editBtn.click();
    const aliasInput = page.getByLabel(t.onboarding.alias);
    await expect(aliasInput).toBeVisible();

    const cancelBtn = page.getByRole('button', { name: t.settings.cancelEdit });
    const saveBtn = page.getByRole('button', { name: t.settings.save });
    await expect(cancelBtn).toBeVisible();
    await expect(saveBtn).toBeVisible();

    // 3. Modificar campo (dirty) y pulsar Cancelar
    await aliasInput.fill('Dra. Ana Modificada');
    await cancelBtn.click();

    // Debe mostrar diálogo de confirmación
    const discardDialog = page.getByRole('alertdialog');
    await expect(discardDialog).toBeVisible();
    await expect(discardDialog.getByText(t.settings.discardEditTitle)).toBeVisible();

    // Continuar editando
    await discardDialog.getByRole('button', { name: t.settings.keepEditing }).click();
    await expect(discardDialog).toHaveCount(0);
    await expect(aliasInput).toBeVisible();

    // Cancelar y confirmar descarte
    await cancelBtn.click();
    await expect(discardDialog).toBeVisible();
    await discardDialog.getByRole('button', { name: t.settings.confirmDiscard }).click();

    // Vuelve a solo lectura con el alias original
    await expect(page.getByRole('button', { name: t.settings.editProfile })).toBeVisible();
    await expect(page.getByText('Dra. Ana Modificada')).toHaveCount(0);

    // 4. Guardar cambios exitosamente
    await page.getByRole('button', { name: t.settings.editProfile }).click();
    await page.getByLabel(t.onboarding.alias).fill('Dra. Ana Guardada');
    await page.getByRole('button', { name: t.settings.save }).click();

    // Vuelve a solo lectura y muestra el nuevo alias
    await expect(page.getByRole('button', { name: t.settings.editProfile })).toBeVisible();
    await expect(page.getByText('Dra. Ana Guardada')).toBeVisible();
  });

  test('las rutas viejas /perfil, /planificador, /logros redirigen a Configuración y Progreso (criterio 4)', async ({ page }) => {
    await signUp(page);

    await page.goto('/perfil');
    await expect(page).toHaveURL(/\/configuracion$/);
    await expect(page.getByRole('heading', { level: 1, name: t.screens.settings.title })).toBeVisible();

    await page.goto('/planificador');
    await expect(page).toHaveURL(/\/progreso$/);
    await expect(page.getByRole('heading', { level: 1, name: t.screens.progress.title })).toBeVisible();

    await page.goto('/logros');
    await expect(page).toHaveURL(/\/progreso$/);
    await expect(page.getByRole('heading', { level: 1, name: t.screens.progress.title })).toBeVisible();
  });
});
