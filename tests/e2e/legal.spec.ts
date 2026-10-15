// Aviso de privacidad y términos y condiciones (Fase G, G2, y B16). Se leen sin sesión desde la portada
// y desde la bienvenida, dicen que son un borrador para revisión del abogado, nunca le muestran al
// alumno una marca de pendiente y pasan axe.
import { SCREENS } from '@/app/screens';
import { legalText } from '@/i18n/legal';
import { t } from '@/i18n/es-MX';
import { expect, expectNoSeriousA11yViolations, signUp, test } from './support/fixtures';

test('desde la portada se lee el aviso y los términos sin sesión, y dicen que son un borrador', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('link', { name: legalText.links.privacy }).click();
  await expect(page).toHaveURL(new RegExp(`${SCREENS.privacyNotice.path}$`));
  await expect(
    page.getByRole('heading', { level: 1, name: t.screens.privacyNotice.title }),
  ).toBeVisible();
  await expect(page.getByRole('note')).toContainText(legalText.draftNotice);
  await expect(
    page.getByRole('heading', { level: 2, name: 'Tus derechos y cómo ejercerlos' }),
  ).toBeVisible();
  // Lo que falta del responsable no se ve como marca (B16)
  await expect(page.getByRole('main')).not.toContainText(/[[\]{}]|\bpendiente/i);
  // Sin sesión no hay navegación de la app
  await expect(page.getByRole('navigation', { name: t.nav.label })).toHaveCount(0);
  await expectNoSeriousA11yViolations(page);

  await page.getByRole('link', { name: legalText.links.terms }).click();
  await expect(page.getByRole('heading', { level: 1, name: t.screens.terms.title })).toBeVisible();
  await expect(page.getByText('No hay chat libre')).toBeVisible();
  await expect(page.getByRole('main')).not.toContainText(/[[\]{}]|\bpendiente/i);
  await expectNoSeriousA11yViolations(page);
});

test('en la bienvenida el aviso se abre en otra pestaña y el formulario no se pierde', async ({
  page,
  context,
}) => {
  await page.goto(SCREENS.onboarding.path);
  await page.getByLabel(t.onboarding.alias, { exact: true }).fill('Ana');
  const [popup] = await Promise.all([
    context.waitForEvent('page'),
    page.getByRole('link', { name: new RegExp(legalText.onboarding.read) }).click(),
  ]);
  await popup.waitForLoadState();
  await expect(
    popup.getByRole('heading', { level: 1, name: t.screens.privacyNotice.title }),
  ).toBeVisible();
  await popup.close();
  await expect(page.getByLabel(t.onboarding.alias, { exact: true })).toHaveValue('Ana');
});

test('con sesión el aviso se lee con la navegación de la app y desde Configuración, Privacidad', async ({
  page,
}) => {
  await signUp(page);
  await page.goto(`${SCREENS.settings.path}#privacidad`);
  await page.getByRole('link', { name: legalText.links.privacy }).click();
  await expect(
    page.getByRole('heading', { level: 1, name: t.screens.privacyNotice.title }),
  ).toBeVisible();
  await expect(page.getByRole('navigation', { name: t.nav.label })).toBeVisible();
});
