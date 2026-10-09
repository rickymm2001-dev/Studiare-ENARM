// Panel del médico de la Fase E. Pantalla 19, acuerdo del etiquetado. Sin etiquetas mide nada y dice
// que el alumno ve trampas. El médico sin preguntas asignadas no tiene cola y el admin no etiqueta.
// Pantalla 18, editor de pregunta con versiones. Pantalla 21, reportes de contenido.
import { SCREENS } from '@/app/screens';
import { t } from '@/i18n/es-MX';
import {
  answerPracticeQuestion,
  expect,
  expectNoSeriousA11yViolations,
  signUp,
  test,
} from './support/fixtures';
import type { Page } from '@playwright/test';

const text = t.agreementScreen;

async function enterAs(page: Page, role: 'physician' | 'admin') {
  await page.goto(SCREENS.roleSelector.path);
  await page.getByRole('radio', { name: new RegExp(t.roles.names[role]) }).click();
  await page.getByRole('button', { name: t.roles.enterAs(t.roles.names[role]) }).click();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
}

test('acuerdo del etiquetado. El médico sin asignaciones no tiene cola y el tablero calibra', async ({
  page,
}) => {
  // Con cuenta, porque la cola lleva las preguntas asignadas a quien etiqueta
  await signUp(page);
  await enterAs(page, 'physician');
  await page.goto(SCREENS.agreement.path);
  await expect(
    page.getByRole('heading', { level: 1, name: t.screens.agreement.title }),
  ).toBeVisible();
  const queue = page.getByRole('region', { name: text.queue.title });
  await expect(queue.getByText(text.queue.empty)).toBeVisible();
  await expect(page.getByText(text.vocabulary.title)).toBeVisible();
  await expect(page.getByText(text.vocabulary.trap, { exact: false })).toBeVisible();
  await expectNoSeriousA11yViolations(page);
});

test('acuerdo del etiquetado. El admin ve el tablero y no etiqueta', async ({ page }) => {
  await enterAs(page, 'admin');
  await page.goto(SCREENS.agreement.path);
  const queue = page.getByRole('region', { name: text.queue.title });
  await expect(queue.getByText(text.queue.adminNote)).toBeVisible();
  await expect(queue.getByRole('combobox')).toHaveCount(0);
  await expectNoSeriousA11yViolations(page);
});

test('editor de pregunta. Se abre desde el banco, guarda una versión nueva y la lista en el historial', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await signUp(page);
  await enterAs(page, 'admin');
  await page.goto(SCREENS.questionBank.path);
  const list = page.getByRole('region', { name: t.bank.listTitle });
  const first = list.getByRole('listitem').first();
  await expect(first).toBeVisible({ timeout: 90_000 });
  await first.locator('summary').click();
  await first.getByRole('link', { name: t.questionEditor.edit }).click();

  await expect(
    page.getByRole('heading', { level: 1, name: t.screens.questionEditor.title }),
  ).toBeVisible();
  const explanation = page.getByLabel(t.questionEditor.meta.explanation, { exact: true });
  await expect(explanation).toBeVisible({ timeout: 60_000 });
  await expectNoSeriousA11yViolations(page);

  await explanation.fill('Explicación revisada en la prueba de punta a punta.');
  await page.getByRole('button', { name: t.settings.saveChanges }).click();
  await expect(page.getByText(t.questionEditor.save.saved)).toBeVisible();
  const history = page.getByRole('region', { name: t.questionEditor.sections.history });
  await expect(history.getByText(t.questionEditor.status.version(2))).toBeVisible();
  await expect(
    history.getByText(
      t.questionEditor.history.changed([t.questionEditor.history.parts.explanation ?? '']),
    ),
  ).toBeVisible();
  await expect(page.getByLabel(t.questionEditor.meta.explanation, { exact: true })).toHaveValue(
    'Explicación revisada en la prueba de punta a punta.',
  );
});

test('reportes. El alumno reporta un error y desde la bandeja se resuelve', async ({ page }) => {
  test.setTimeout(240_000);
  await signUp(page);
  await page.goto(SCREENS.simulatorSetup.path);
  const practice = page.getByRole('region', { name: t.simulator.setupTitle });
  await practice.getByRole('combobox', { name: t.simulator.count, exact: true }).selectOption('5');
  const start = practice.getByRole('button', { name: t.simulator.start });
  await expect(start).toBeEnabled({ timeout: 90_000 });
  await start.click();
  for (let index = 1; index <= 5; index += 1) await answerPracticeQuestion(page, index, 5);

  // Reporta desde la revisión del resumen
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(t.screens.sessionSummary.title);
  const answers = page.getByRole('region', { name: t.simulator.review });
  const row = answers
    .getByRole('listitem')
    .filter({ has: page.locator('details') })
    .first();
  if ((await row.locator(':scope > details').getAttribute('open')) === null) {
    await row.locator('summary').first().click();
  }
  await row.locator('summary', { hasText: t.simulator.report }).click();
  await row.getByRole('button', { name: t.simulator.sendReport }).click();
  await expect(row.getByText(t.simulator.reported)).toBeVisible();

  // El reporte llega a la bandeja y se resuelve
  await enterAs(page, 'admin');
  await page.goto(SCREENS.contentReports.path);
  await expect(
    page.getByRole('heading', { level: 1, name: t.screens.contentReports.title }),
  ).toBeVisible();
  await expect(page.getByText(t.reportsScreen.group.open(1))).toBeVisible();
  await expectNoSeriousA11yViolations(page);
  await page.getByRole('button', { name: t.reportsScreen.row.resolve }).click();
  await expect(page.getByText(t.reportsScreen.empty.openTitle)).toBeVisible();
});
