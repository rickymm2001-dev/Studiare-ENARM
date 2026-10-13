// Etiquetas visibles (4.6 y 4.1 del plan del cambio). Mientras el banco es de demostración hay un
// solo aviso global, Versión de demostración, y ninguna pantalla repite su etiqueta. La base de
// demostración marca Datos simulados en toda pantalla del alumno y los amigos, los duelos y la
// tarjeta de logro de Party también. Las etiquetas llevan texto, nunca solo color
import type { Page } from '@playwright/test';
import { SCREENS, type ScreenKey } from '@/app/screens';
import { t } from '@/i18n/es-MX';
import { generateDemo } from './support/b1';
import {
  answerPracticeQuestion,
  expect,
  expectNoSeriousA11yViolations,
  signUp,
  test,
} from './support/fixtures';

const demoVersion = (page: Page) =>
  page.getByRole('region', { name: t.labels.demoVersion, exact: true });

/** La frase que Ricardo pidió quitar de cada pantalla (comentario 9) no vuelve a aparecer */
async function expectNoPerScreenLabel(page: Page) {
  await expect(page.getByText(/no validad[oa]s? por médicos/)).toHaveCount(0);
}

test('con el banco de demostración hay un solo aviso global y ninguna etiqueta por pantalla', async ({
  page,
}) => {
  test.setTimeout(240_000);
  await signUp(page);

  // Los mazos precargados
  await page.goto(SCREENS.decks.path);
  await expect(demoVersion(page)).toContainText(t.labels.demoVersion);
  await expectNoPerScreenLabel(page);

  // Configurar la práctica, la pregunta, la retroalimentación y el resumen. El banco demo se
  // siembra la primera vez que se entra y puede tardar
  await page.goto(SCREENS.simulatorSetup.path);
  await expect(demoVersion(page)).toBeVisible();
  // El examen de abajo también pregunta cuántas preguntas, así que se busca dentro de la práctica
  const practice = page.getByRole('region', { name: t.simulator.setupTitle });
  await practice.getByRole('combobox', { name: t.simulator.count, exact: true }).selectOption('5');
  const start = practice.getByRole('button', { name: t.simulator.start });
  await expect(start).toBeEnabled({ timeout: 60_000 });
  await start.click();
  await expect(page.getByText(t.simulator.progress(1, 5))).toBeVisible();
  await expect(demoVersion(page)).toBeVisible();
  await expectNoPerScreenLabel(page);
  for (let index = 1; index <= 5; index += 1) {
    await answerPracticeQuestion(page, index, 5);
  }
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(t.screens.sessionSummary.title);
  await expect(demoVersion(page)).toBeVisible();
  await expectNoPerScreenLabel(page);

  // Repasar, con las preguntas falladas que pasaron a Mis errores
  await page.goto(SCREENS.review.path);
  await expect(demoVersion(page)).toBeVisible();
  await page.getByRole('button', { name: /^Repasar [\d,]+ tarjetas?$/ }).click();
  await expect(page.getByText(t.review.errorCard)).toBeVisible();
  await expect(demoVersion(page)).toBeVisible();
  await expectNoPerScreenLabel(page);
  await expectNoSeriousA11yViolations(page);

  // El examen completo, en curso
  await page.goto(SCREENS.simulatorSetup.path);
  const card = page.getByRole('region', { name: t.exam.cardTitle });
  await expect(card.getByRole('button', { name: t.exam.start })).toBeEnabled({ timeout: 60_000 });
  await card.getByRole('button', { name: t.exam.start }).click();
  await expect(page.getByRole('timer')).toBeVisible();
  await expect(demoVersion(page)).toBeVisible();
  await expectNoPerScreenLabel(page);
  await expectNoSeriousA11yViolations(page);
});

test('la portada, la bienvenida y los textos legales no llevan el aviso del banco', async ({
  page,
}) => {
  for (const path of [
    SCREENS.home.path,
    SCREENS.onboarding.path,
    SCREENS.privacyNotice.path,
    SCREENS.terms.path,
  ]) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(demoVersion(page)).toHaveCount(0);
  }
});

test('la base de demostración marca Datos simulados en toda pantalla del alumno', async ({
  page,
}) => {
  test.setTimeout(360_000);
  // Con la demostración generada cada pantalla trae sus datos simulados y no el aviso de vacía. Se
  // genera en Datos de demostración del admin (B3 del plan del cambio, 5.4)
  await generateDemo(page, 200_000);

  const screens: ScreenKey[] = [
    'home',
    'review',
    'simulatorSetup',
    'progress',
    'tutor',
    'decks',
    'party',
    'settings',
    'subscription',
  ];
  for (const key of screens) {
    await page.goto(SCREENS[key].path);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    const banner = page.getByRole('region', { name: t.labels.simulatedData, exact: true });
    await expect(banner, SCREENS[key].path).toContainText(t.labels.simulatedData);
    await expect(banner, SCREENS[key].path).toContainText(t.database.banner);
    // Un solo aviso. El de Versión de demostración no se apila encima del de datos simulados
    await expect(demoVersion(page), SCREENS[key].path).toHaveCount(0);
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
