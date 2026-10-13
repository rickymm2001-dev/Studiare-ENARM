// Planificador (D-119 B3, comentario 13). La ruta /planificador redirige a Progreso,
// donde vive la semana de 7 días planeado vs hecho y los avisos de sobrecarga.
import { SCREENS } from '@/app/screens';
import { t } from '@/i18n/es-MX';
import { expect, expectNoSeriousA11yViolations, signUp, test } from './support/fixtures';

test('la ruta /planificador redirige a Progreso y muestra la semana de 7 días', async ({
  page,
}) => {
  await signUp(page);
  await page.goto(SCREENS.planner.path);
  await expect(page).toHaveURL(new RegExp(SCREENS.progress.path));

  // Semana de 7 días, con hoy marcado
  await expect(
    page.getByRole('region', { name: t.planner.weekTitle }).getByRole('listitem'),
  ).toHaveCount(7);
  await expectNoSeriousA11yViolations(page);
});
