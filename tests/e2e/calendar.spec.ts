// Calendario (V4-B6). El mes con su cuadrícula accesible, el cambio de mes y el día elegido con su
// detalle, el plan por semanas hasta el examen con sus simuladores de domingo y la descarga del .ics.
// Corre en teléfono y en computadora.
import { readFile } from 'node:fs/promises';
import { SCREENS } from '@/app/screens';
import { t } from '@/i18n/es-MX';
import {
  expect,
  expectNoHorizontalOverflow,
  expectNoSeriousA11yViolations,
  signUp,
  test,
} from './support/fixtures';
import { isPhone } from './support/navigation';

test('el calendario muestra el mes, cambia de mes y arma el plan por semanas con su .ics', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await signUp(page);
  await page.goto(SCREENS.calendar.path);
  await expect(page.getByRole('heading', { level: 1, name: t.screens.calendar.title })).toBeVisible(
    { timeout: 60_000 },
  );

  // La cuadrícula es una tabla con su título y las letras de los días
  const grid = page.getByRole('table');
  await expect(grid).toBeVisible();
  await expect(grid.getByRole('columnheader')).toHaveCount(7);
  await expectNoHorizontalOverflow(page);
  await expectNoSeriousA11yViolations(page);

  // El día elegido dice qué pasa ese día. Hoy es el elegido al entrar
  const todayButton = grid.locator('button[aria-current="date"]');
  await expect(todayButton).toHaveAttribute('aria-pressed', 'true');
  // En teléfono cada día mide al menos 44 px de ancho, el objetivo táctil de la app
  if (isPhone(page)) {
    const box = await todayButton.boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(44);
  }
  await expect(
    page
      .getByRole('region', { name: /^\w/ })
      .filter({
        hasText:
          /Hiciste|Se proyectan|Todavía no registras|No hay carga|Todavía no sigues|Esta semana/,
      })
      .first(),
  ).toBeVisible();

  // Mes siguiente y de regreso con Hoy
  const title = page.getByRole('heading', { level: 2 }).first();
  const before = await title.textContent();
  await page.getByRole('button', { name: t.calendar.next }).click();
  await expect(title).not.toHaveText(before ?? '');
  await page.getByRole('button', { name: t.calendar.today }).click();
  await expect(title).toHaveText(before ?? '');

  // La fecha del examen es la de la plataforma, provisional, y el aviso va junto a la cuenta regresiva
  await expect(page.getByText(t.calendar.provisionalDate)).toBeVisible();

  // El plan por semanas llega hasta el examen y termina con 10 domingos de simulador. En Gratis dice
  // que el simulador completo es de pago y lleva a Suscripción
  const plan = page.getByRole('region', { name: t.calendar.plan.title });
  await expect(plan.getByRole('listitem').first()).toBeVisible();
  await expect(plan.getByText(t.calendar.plan.simulatorPaid, { exact: false })).toBeVisible();
  await expect(plan.getByRole('link', { name: t.billing.featureSeePlans })).toHaveAttribute(
    'href',
    SCREENS.subscription.path,
  );
  await plan.getByRole('button', { name: /^Ver las \d+ semanas$/ }).click();
  await expect(plan.getByText(t.calendar.plan.simulator(10, 10))).toBeVisible();
  await expect(plan.getByText(t.calendar.plan.exam)).toBeVisible();

  // El .ics se baja con el plan y el día del examen
  const download = page.waitForEvent('download');
  await plan.getByRole('button', { name: t.calendar.plan.export }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe(t.calendar.plan.fileName);
  const path = await file.path();
  const ics = await readFile(path, 'utf8');
  expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
  expect(ics).toContain('SUMMARY:ENARM');
  expect(ics).toContain(`SUMMARY:${t.calendar.plan.eventSimulator(1, 10)}`);
});
