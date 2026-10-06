// Etiquetas visibles (4.6). Las preguntas y los mazos de demostración dicen que no están validados por
// médicos, la base de demostración marca Datos simulados en toda pantalla del alumno y los amigos, los
// duelos y la tarjeta de logro de Party también. Las etiquetas llevan texto, nunca solo color
import type { Page } from '@playwright/test';
import { SCREENS, type ScreenKey } from '@/app/screens';
import { t } from '@/i18n/es-MX';
import { expect, expectNoSeriousA11yViolations, signUp, test } from './support/fixtures';

const demoContent = (page: Page) => page.getByText(t.labels.demoContent).first();

test('preguntas, examen y mazos de demostración dicen que no están validados por médicos', async ({
  page,
}) => {
  test.setTimeout(240_000);
  await signUp(page);

  // Los mazos precargados
  await page.goto(SCREENS.decks.path);
  await expect(demoContent(page)).toBeVisible();

  // Configurar la práctica, la pregunta, la retroalimentación y el resumen. El banco demo se
  // siembra la primera vez que se entra y puede tardar
  await page.goto(SCREENS.simulatorSetup.path);
  await expect(demoContent(page)).toBeVisible({ timeout: 60_000 });
  await page.getByLabel(t.simulator.count, { exact: true }).selectOption('5');
  const start = page.getByRole('button', { name: t.simulator.start });
  await expect(start).toBeEnabled({ timeout: 60_000 });
  await start.click();
  await expect(page.getByText(t.simulator.progress(1, 5))).toBeVisible();
  await expect(demoContent(page)).toBeVisible();
  for (let index = 1; index <= 5; index += 1) {
    await page.getByRole('radio').first().check();
    await page.getByRole('button', { name: t.simulator.confidence.sure }).click();
    await page.getByRole('button', { name: t.simulator.answer, exact: true }).click();
    if (index === 1) await expect(demoContent(page)).toBeVisible();
    await page
      .getByRole('button', { name: index === 5 ? t.simulator.finish : t.simulator.next })
      .click();
  }
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(t.screens.sessionSummary.title);
  await expect(demoContent(page)).toBeVisible();

  // El examen completo, en curso
  await page.goto(SCREENS.simulatorSetup.path);
  const card = page.getByRole('region', { name: t.exam.cardTitle });
  await expect(card.getByText(t.labels.demoContent)).toBeVisible({ timeout: 60_000 });
  await card.getByRole('button', { name: t.exam.start }).click();
  await expect(page.getByRole('timer')).toBeVisible();
  await expect(demoContent(page)).toBeVisible();
  await expectNoSeriousA11yViolations(page);
});

test('la base de demostración marca Datos simulados en toda pantalla del alumno', async ({
  page,
}) => {
  test.setTimeout(360_000);
  // Con la demostración generada cada pantalla trae sus datos simulados y no el aviso de vacía
  await page.goto(`${SCREENS.settings.path}?seccion=account`);
  await page.getByRole('radio', { name: new RegExp(t.database.demo) }).click();
  const panel = page.getByRole('region', { name: t.demoData.title });
  await panel.getByRole('button', { name: t.demoData.generate }).click();
  await expect(panel.getByRole('status')).toHaveText(/Listo\. Se guardaron/, { timeout: 200_000 });

  const screens: ScreenKey[] = [
    'home',
    'review',
    'simulatorSetup',
    'progress',
    'planner',
    'tutor',
    'decks',
    'party',
    'profile',
    'settings',
    'subscription',
  ];
  for (const key of screens) {
    await page.goto(SCREENS[key].path);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    const banner = page.getByRole('note');
    await expect(banner, SCREENS[key].path).toContainText(t.labels.simulatedData);
    await expect(banner, SCREENS[key].path).toContainText(t.database.banner);
  }

  // La tarjeta de logro de una cuenta de demostración lo dice y no se puede tomar por un logro real
  await page.goto(SCREENS.party.path);
  await expect(
    page
      .getByRole('region', { name: t.party.share.title })
      .getByRole('figure', { name: t.party.share.previewLabel }),
  ).toContainText(t.party.share.simulatedBanner, { timeout: 30_000 });
  await expectNoSeriousA11yViolations(page);
});

test('los compañeros y los duelos de Party van marcados como simulados', async ({ page }) => {
  test.setTimeout(120_000);
  await signUp(page);
  await page.goto(SCREENS.party.path);
  await page.getByLabel(t.party.groupName).fill('Guardia de los lunes');
  await page.getByRole('button', { name: t.party.create }).click();
  const group = page.getByRole('region', { name: 'Guardia de los lunes' });

  // El grupo, cada compañero de la tabla y el duelo llevan su etiqueta con texto
  await expect(group.getByText(t.labels.simulatedData).first()).toBeVisible();
  const table = group.getByRole('table');
  const rows = table.getByRole('row');
  // Encabezado, la persona y 6 compañeros
  await expect(rows).toHaveCount(8);
  await expect(table.getByText(t.party.simulated)).toHaveCount(6);
  await group.getByRole('button', { name: t.party.duel.newButton }).click();
  await group.getByRole('button', { name: t.party.duel.create }).click();
  const duel = group.getByRole('listitem').filter({ hasText: /^Duelo contra/ });
  await expect(duel.getByText(t.labels.simulatedData)).toBeVisible({ timeout: 60_000 });
  // En una cuenta real la tarjeta de logro no lleva la etiqueta de demostración
  await expect(page.getByRole('figure', { name: t.party.share.previewLabel })).not.toContainText(
    t.party.share.simulatedBanner,
  );
});
