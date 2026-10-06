// Tutor (pantalla 11, 8.2 a 8.5). Sin datos todo calibra y lo dice. Con la demo, que trae 60 días de
// errores, salen hipótesis por reglas con su evidencia, se puede responder a cada una, y el informe
// semanal y los consejos por sesgo aparecen. Sin IA y sin chat libre.
import { SCREENS } from '@/app/screens';
import { t } from '@/i18n/es-MX';
import { expect, expectNoSeriousA11yViolations, signUp, test } from './support/fixtures';

test('sin datos el tutor calibra, no inventa hipótesis y se abre desde el menú', async ({
  page,
}) => {
  await signUp(page);
  // En el teléfono el tutor se abre desde Accesos en Perfil y en computadora desde el riel lateral
  const phone = (page.viewportSize()?.width ?? 0) < 1024;
  await page.goto(phone ? SCREENS.profile.path : '/');
  const scope = phone
    ? page.getByRole('main')
    : page.getByRole('navigation', { name: t.nav.label });
  await scope.getByRole('link', { name: t.navItems.tutor, exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(t.screens.tutor.title);

  await expect(page.getByText(t.tutor.calibrating(0))).toBeVisible();
  await expect(page.getByText(t.tutor.howItWorks)).toBeVisible();
  // El informe, los consejos y las tarjetas en borrador dicen en qué estado están
  const report = page.getByRole('region', { name: t.tutor.report.title });
  await expect(report.getByText(t.states.calibrating.title)).toBeVisible();
  await expect(
    page
      .getByRole('region', { name: t.tutor.biasTips.title })
      .getByText(t.tutor.biasTips.calibrating),
  ).toBeVisible();
  const drafts = page.getByRole('region', { name: t.tutor.drafts.title });
  await expect(drafts.getByText(t.tutor.drafts.meanwhile)).toBeVisible();
  // No hay chat libre ni caja para escribirle al tutor
  await expect(page.getByRole('textbox')).toHaveCount(0);
  await expectNoSeriousA11yViolations(page);
});

test('con la demo salen hipótesis con evidencia, se responden y el informe trae prioridades', async ({
  page,
}) => {
  test.setTimeout(240_000);
  await page.goto(`${SCREENS.settings.path}?seccion=account`);
  await page.getByRole('radio', { name: new RegExp(t.database.demo) }).click();
  const panel = page.getByRole('region', { name: t.demoData.title });
  await panel.getByRole('button', { name: t.demoData.generate }).click();
  await expect(panel.getByRole('status')).toHaveText(/Listo\. Se guardaron/, { timeout: 150_000 });

  await page.goto(SCREENS.tutor.path);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(t.screens.tutor.title);
  const report = page.getByRole('region', { name: t.tutor.report.title });
  await expect(report).toBeVisible({ timeout: 60_000 });

  // Hay hipótesis confirmadas y solo unas cuantas abiertas. El resto va en una lista que se abre
  const cards = page.getByRole('region').filter({ has: page.getByText(t.tutor.confirmedBadge) });
  await expect(cards.first()).toBeVisible();
  expect(await cards.count()).toBeLessThanOrEqual(3);
  await expect(page.getByText(/^Otras \d+ hipótesis$/)).toBeVisible();
  await expectNoSeriousA11yViolations(page);

  // La evidencia son errores reales del alumno
  const first = cards.first();
  await first.getByText(t.tutor.showEvidence).click();
  await expect(first.getByText(t.tutor.evidenceTitle)).toBeVisible();
  expect(await first.getByRole('listitem').count()).toBeGreaterThan(0);

  // Responder que sí sirve la deja y responder que no ayuda la manda a las descartadas
  await first.getByRole('button', { name: t.tutor.helpful }).click();
  await expect(first.getByText(t.tutor.answered.approved)).toBeVisible();
  const second = cards.nth(1);
  await second.getByRole('button', { name: t.tutor.notHelpful }).click();
  await expect(page.getByText(t.tutor.dismissedTitle(1))).toBeVisible();
  await page.getByText(t.tutor.dismissedTitle(1)).click();
  await page.getByRole('button', { name: t.tutor.reopen }).click();
  await expect(page.getByText(t.tutor.dismissedTitle(1))).toHaveCount(0);

  // El informe semanal trae prioridades con su atajo y los consejos por sesgo son borradores
  await expect(report.getByText(t.tutor.report.priorities)).toBeVisible();
  expect(await report.getByRole('link').count()).toBeGreaterThan(0);
  const tips = page.getByRole('region', { name: t.tutor.biasTips.title });
  await expect(tips.getByText(t.tutor.biasTips.draftLabel).first()).toBeVisible();
  await expectNoSeriousA11yViolations(page);
});
