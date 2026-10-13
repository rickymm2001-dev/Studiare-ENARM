// Configuración en una sola página (B3 del plan del cambio, comentarios 5, 6 y 16). Exactamente tres
// secciones con su subtítulo y ninguna pestaña, los enlaces viejos con ?seccion=, Editar perfil con
// Cancelar, que regresa lo guardado, y Guardar, que se conserva al recargar, y el aviso al salir con
// cambios sin guardar.
import type { Page } from '@playwright/test';
import { SCREENS } from '@/app/screens';
import { t } from '@/i18n/es-MX';
import { emailOf } from './support/b1';
import { expect, expectNoSeriousA11yViolations, signUp, test } from './support/fixtures';
import { isPhone, mainNav } from './support/navigation';

const text = t.settingsPage;
const SECTIONS = [text.sections.profile, text.sections.appearance, text.sections.privacy];

/** Tus datos, la tarjeta de Perfil que se edita */
const dataCard = (page: Page) => page.getByRole('region', { name: text.profile.title });

test('Configuración es una sola página con exactamente tres secciones y ninguna pestaña', async ({
  page,
}) => {
  await signUp(page, 'Ana');
  await page.goto(SCREENS.settings.path);
  const main = page.getByRole('main');
  await expect(main.getByRole('heading', { level: 2 })).toHaveText(SECTIONS);
  for (const name of SECTIONS) {
    await expect(main.getByRole('region', { name, exact: true })).toBeVisible();
  }
  await expect(page.getByRole('tablist')).toHaveCount(0);
  await expect(page.getByRole('tab')).toHaveCount(0);

  // Perfil empieza con el plan y después tus datos, de solo lectura
  const profile = main.getByRole('region', { name: text.sections.profile, exact: true });
  await expect(profile.getByRole('region').first()).toHaveAccessibleName(text.plan.title);
  await expect(profile.getByRole('link', { name: text.plan.change })).toBeVisible();
  await expect(dataCard(page).getByText(emailOf('Ana'))).toBeVisible();
  await expect(dataCard(page).getByRole('textbox')).toHaveCount(0);
  await expect(profile.getByRole('button', { name: t.session.signOut })).toBeVisible();
  // Estudio, Pomodoro y la base de demostración ya no viven aquí
  await expect(page.getByText(t.settings.cardTimerEnabled)).toHaveCount(0);
  await expect(page.getByRole('radio', { name: new RegExp(t.database.demo) })).toHaveCount(0);
  await expectNoSeriousA11yViolations(page);

  // Los enlaces viejos siguen funcionando. Privacidad lleva a su sección
  await page.goto(`${SCREENS.settings.path}?seccion=privacy`);
  await expect(
    page.getByRole('heading', { level: 2, name: text.sections.privacy }),
  ).toBeInViewport();
  // Y Estudio lleva a Ajustes del repaso, en Repasar
  await page.goto(`${SCREENS.settings.path}?seccion=study`);
  await expect(page).toHaveURL(new RegExp(`${SCREENS.review.path}\\?ajustes=1$`));
  await expect(page.getByRole('dialog', { name: text.reviewSettings.title })).toBeVisible();
});

test('Editar perfil. Cancelar regresa lo guardado y Guardar se conserva al recargar', async ({
  page,
}) => {
  await signUp(page, 'Ana');
  await page.goto(`${SCREENS.settings.path}#perfil`);
  const card = dataCard(page);
  await expect(card.getByText('Ana', { exact: true })).toBeVisible();

  // Cancelar no guarda nada y vuelve a solo lectura
  await card.getByRole('button', { name: text.profile.edit }).click();
  const alias = card.getByLabel(t.onboarding.alias, { exact: true });
  await expect(alias).toHaveValue('Ana');
  await expect(alias).toBeFocused();
  await alias.fill('Ana Luisa');
  await card.getByRole('button', { name: text.profile.cancel }).click();
  await expect(card.getByRole('textbox')).toHaveCount(0);
  await expect(card.getByText('Ana', { exact: true })).toBeVisible();
  await expect(card.getByText('Ana Luisa', { exact: true })).toHaveCount(0);

  // Guardar cambia el alias y un dato de la cuenta
  await card.getByRole('button', { name: text.profile.edit }).click();
  await expect(alias).toHaveValue('Ana');
  await alias.fill('Ana Luisa');
  await card.getByLabel(t.account.sex, { exact: true }).selectOption('female');
  await expectNoSeriousA11yViolations(page);
  await card.getByRole('button', { name: text.profile.save }).click();
  await expect(card.getByText(text.profile.saved)).toBeVisible();
  await expect(card.getByText('Ana Luisa', { exact: true })).toBeVisible();
  await expect(card.getByText(t.account.sexes.female, { exact: true })).toBeVisible();
  await expect(card.getByRole('textbox')).toHaveCount(0);

  await page.reload();
  await expect(dataCard(page).getByText('Ana Luisa', { exact: true })).toBeVisible();
  await expect(dataCard(page).getByText(t.account.sexes.female, { exact: true })).toBeVisible();
});

test('salir con cambios sin guardar avisa y deja seguir editando o salir', async ({ page }) => {
  await signUp(page, 'Ana');
  await page.goto(SCREENS.settings.path);
  const card = dataCard(page);
  await card.getByRole('button', { name: text.profile.edit }).click();
  await card.getByLabel(t.onboarding.alias, { exact: true }).fill('Ana Luisa');

  // Ir a otra pantalla pregunta antes
  await page.getByRole('link', { name: text.plan.change }).click();
  const warning = page.getByRole('alertdialog', { name: text.unsaved.title });
  await expect(warning).toBeVisible();
  await expect(warning).toContainText(text.unsaved.body);
  await expectNoSeriousA11yViolations(page);

  // Seguir editando deja todo como estaba y el foco vuelve al enlace que intentó salir
  await warning.getByRole('button', { name: text.unsaved.stay }).click();
  await expect(warning).toHaveCount(0);
  await expect(page).toHaveURL(new RegExp(`${SCREENS.settings.path}$`));
  await expect(card.getByLabel(t.onboarding.alias, { exact: true })).toHaveValue('Ana Luisa');
  await expect(page.getByRole('link', { name: text.plan.change })).toBeFocused();

  // En el teléfono, una sección de Más también pregunta y, al seguir editando, el foco vuelve a Más
  if (isPhone(page)) {
    const more = mainNav(page).getByRole('button', { name: t.navItems.more });
    await more.click();
    await page
      .getByRole('dialog', { name: t.nav.more })
      .getByRole('link', { name: t.navItems.tutor })
      .click();
    await expect(warning).toBeVisible();
    await warning.getByRole('button', { name: text.unsaved.stay }).click();
    await expect(warning).toHaveCount(0);
    await expect(more).toBeFocused();
    await expect(page).toHaveURL(new RegExp(`${SCREENS.settings.path}$`));
  }

  // Salir sin guardar sí sale y lo escrito se pierde
  await page.getByRole('link', { name: text.plan.change }).click();
  await warning.getByRole('button', { name: text.unsaved.leave }).click();
  await expect(
    page.getByRole('heading', { level: 1, name: t.screens.subscription.title }),
  ).toBeVisible();
  await page.goto(SCREENS.settings.path);
  await expect(dataCard(page).getByText('Ana', { exact: true })).toBeVisible();
});
