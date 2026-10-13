// Herramientas del repaso (D-085, filas 5, 7 y 8). Días fáciles en Configuración, con su resumen y su
// evento. Sanguijuela, con el umbral del admin en un olvido para que la primera tarjeta repasada que
// se falla la marque, sugiera qué hacer y se suspenda. Y atrasos, adelantar y posponer con deshacer,
// más el límite de que sin tarjetas vencidas posponer no ofrece nada. daily-load.spec ya cubre
// repartir y deshacer el reparto, así que aquí no se repite.
import type { Page } from '@playwright/test';
import { SCREENS } from '@/app/screens';
import { t } from '@/i18n/es-MX';
import { followSmallestDeck, presetThresholds, readTable } from './support/b1';
import { expect, expectNoSeriousA11yViolations, signUp, test } from './support/fixtures';

const DAY_MS = 86_400_000;

const rating = (page: Page, value: keyof typeof t.review.ratings) =>
  page.getByRole('button', { name: new RegExp(`^${t.review.ratings[value]}`) });

async function startReview(page: Page) {
  await page.goto(SCREENS.review.path);
  await page.getByRole('button', { name: /^Repasar [\d,]+ tarjetas?$/ }).click();
  await expect(page.getByRole('button', { name: t.review.show })).toBeVisible();
}

/** Muestra la respuesta de la tarjeta en pantalla y la califica */
async function reviewCard(page: Page, value: keyof typeof t.review.ratings) {
  await page.getByRole('button', { name: t.review.show }).click();
  await rating(page, value).click();
}

async function finishReview(page: Page) {
  await page.getByRole('button', { name: t.review.finish }).click();
  await expect(page.getByText(t.review.doneTitle)).toBeVisible();
}

interface SettingsEvent {
  type: string;
  payload: { key?: string; value?: unknown; reason?: string };
}

test('días fáciles. Se marcan en Repasar, el resumen los cuenta al recargar y el cambio queda como evento', async ({
  page,
}) => {
  await signUp(page);
  await page.goto(SCREENS.review.path);
  await page.locator('summary', { hasText: t.reviewSetup.limits }).click();
  const disclosure = page.locator('summary', { hasText: t.settings.easyDaysTitle });
  await expect(disclosure).toContainText(t.settings.easyDaysSummary(0));
  await disclosure.click();
  await expect(page.getByText(t.settings.easyDaysHint)).toBeVisible();
  await expectNoSeriousA11yViolations(page);

  // El sábado casi sin repasos y el domingo con menos. El resumen cambia al momento
  await page.getByRole('combobox', { name: t.settings.weekdays.sat }).selectOption('minimum');
  await page.getByRole('combobox', { name: t.settings.weekdays.sun }).selectOption('reduced');
  await page
    .getByRole('form', { name: 'Ajustes del repaso' })
    .getByRole('button', { name: t.settings.saveChanges })
    .click();
  await expect(page.getByText(t.settings.saved)).toBeVisible();

  // Se recuerda al recargar
  await page.reload();
  await page.locator('summary', { hasText: t.reviewSetup.limits }).click();
  await expect(page.locator('summary', { hasText: t.settings.easyDaysTitle })).toContainText(
    t.settings.easyDaysSummary(2),
  );
  await page.locator('summary', { hasText: t.settings.easyDaysTitle }).click();
  await expect(page.getByRole('combobox', { name: t.settings.weekdays.sat })).toHaveValue(
    'minimum',
  );
  await expect(page.getByRole('combobox', { name: t.settings.weekdays.sun })).toHaveValue(
    'reduced',
  );

  // El ajuste quedó en la bitácora como un cambio de configuración
  const events = await readTable<SettingsEvent>(page, 'events');
  const change = events.find(
    (event) => event.type === 'settings_changed' && event.payload.key === 'settings.easyDays',
  );
  expect(change?.payload.value).toMatchObject({ sat: 'minimum', sun: 'reduced', mon: 'normal' });
});

test('sanguijuela. Con el umbral del admin en un olvido, fallar una tarjeta ya repasada la marca, sugiere qué hacer y se suspende', async ({
  page,
}) => {
  test.setTimeout(180_000);
  // El admin bajó el umbral de sanguijuela a un olvido, así la prueba no necesita ocho fallos
  await presetThresholds(page, { fsrs: { leechLapses: 1 } });
  await signUp(page);
  await followSmallestDeck(page);

  // Hoy la primera tarjeta se califica Fácil, que la pasa a repaso programado
  await startReview(page);
  await reviewCard(page, 'easy');
  await finishReview(page);

  // Un mes después ya venció. El reloj fijo solo mueve la fecha
  await page.clock.setFixedTime(new Date(Date.now() + 30 * DAY_MS));
  await startReview(page);
  await expect(page.getByText(t.review.reviewCard, { exact: true })).toBeVisible();
  await reviewCard(page, 'again');
  await expect(page.getByText(t.review.causeQuestion)).toBeVisible();
  await page.getByRole('button', { name: t.review.skipCause }).click();

  // Es su primer olvido y con el umbral en uno ya es sanguijuela. El panel explica y sugiere, y una
  // tarjeta precargada no se edita desde aquí
  const panel = page.getByRole('region', { name: t.review.leech.title });
  await expect(panel).toBeVisible();
  await expect(panel.getByText(t.review.leech.body(1))).toBeVisible();
  await expect(panel.getByText(t.review.leech.suggestionsTitle)).toBeVisible();
  await expect(panel.getByRole('listitem').first()).toBeVisible();
  await expect(panel.getByText(t.review.leech.cannotEdit)).toBeVisible();
  await expect(panel.getByRole('button', { name: t.review.leech.edit })).toHaveCount(0);
  await expect(page.getByText(t.review.leech.badge, { exact: true })).toBeVisible();
  await expectNoSeriousA11yViolations(page);

  // Suspenderla la saca de la sesión y sigue una tarjeta nueva
  await panel.getByRole('button', { name: t.review.leech.suspend }).click();
  await expect(panel).toHaveCount(0);
  await expect(page.getByText(t.review.newCard, { exact: true })).toBeVisible();
  await finishReview(page);

  // La suspensión quedó en la bitácora con su motivo
  const events = await readTable<SettingsEvent>(page, 'events');
  expect(
    events.filter((event) => event.type === 'cards_suspended').map((event) => event.payload.reason),
  ).toEqual(['leech']);

  // Explorar la encuentra entre las sanguijuelas, suspendida
  await page.goto(`${SCREENS.explore.path}?estado=sanguijuelas`);
  const list = page.getByRole('list', { name: t.explore.list });
  await expect(list).toBeVisible({ timeout: 30_000 });
  await expect(list.getByRole('listitem')).toHaveCount(1);
  await expect(list.getByText(t.explore.statusOne.leech, { exact: true })).toBeVisible();
  await expect(list.getByText(t.explore.statusOne.suspended, { exact: true })).toBeVisible();
});

test('atrasos. Adelantar trae un repaso a hoy, posponer mueve lo de hoy y se deshace, y sin vencidas posponer no ofrece nada', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await signUp(page);
  await followSmallestDeck(page);

  // Dos tarjetas con Bien quedan en aprendizaje para hoy y una con Fácil se va a repaso en días
  await startReview(page);
  await reviewCard(page, 'good');
  await reviewCard(page, 'good');
  await reviewCard(page, 'easy');
  await finishReview(page);

  // Con tarjetas ya programadas aparecen las herramientas, plegadas y sin atrasos
  await page.goto(SCREENS.review.path);
  const tools = page.locator('summary', { hasText: t.overdue.title });
  await expect(tools).toBeVisible({ timeout: 30_000 });
  await expect(tools).toContainText(t.overdue.summary(0));
  await tools.click();
  await expectNoSeriousA11yViolations(page);

  // Repartir no tiene nada que repartir
  const spread = page.getByRole('region', { name: t.overdue.spreadTitle });
  await expect(spread.getByText(t.overdue.noOverdue)).toBeVisible();
  await expect(spread.getByRole('button', { name: t.overdue.spreadButton(0) })).toBeDisabled();

  // Adelantar trae a hoy el único repaso programado para los próximos días
  const advance = page.getByRole('region', { name: t.overdue.advanceTitle });
  await expect(advance.getByText(t.overdue.advanceBody(1))).toBeVisible();
  await advance.getByRole('button', { name: t.overdue.advanceButton(1) }).click();
  await expect(page.getByText(t.overdue.done.advance(1))).toBeVisible();
  await expect(advance.getByText(t.overdue.advanceBody(0))).toBeVisible();
  await expect(advance.getByRole('button', { name: t.overdue.advanceButton(0) })).toBeDisabled();

  // Ahora las tres vencen hoy. Posponerlas dos días las quita de hoy
  const postpone = page.getByRole('region', { name: t.overdue.postponeTitle });
  await expect(postpone.getByText(t.overdue.postponeBody(3))).toBeVisible();
  await postpone.getByRole('combobox', { name: t.overdue.postponeDays }).selectOption('2');
  await postpone.getByRole('button', { name: t.overdue.postponeButton(3) }).click();
  await expect(page.getByText(t.overdue.done.postpone(3))).toBeVisible();

  // Límite. Sin tarjetas que venzan hoy ni antes, posponer no ofrece nada y sigue sin atrasos
  await expect(postpone.getByText(t.overdue.postponeBody(0))).toBeVisible();
  await expect(postpone.getByRole('button', { name: t.overdue.postponeButton(0) })).toBeDisabled();
  await expect(tools).toContainText(t.overdue.summary(0));

  // Deshacer regresa las tres a su fecha de antes
  await expect(page.getByText(t.overdue.undoBody('postpone', 3))).toBeVisible();
  await page.getByRole('button', { name: t.overdue.undoButton }).click();
  await expect(page.getByText(t.overdue.done.undo(3))).toBeVisible();
  await expect(postpone.getByText(t.overdue.postponeBody(3))).toBeVisible();

  // Cada cambio de fecha es un evento nuevo. La bitácora no se edita
  const events = await readTable<{ type: string; payload: { kind?: string } }>(page, 'events');
  expect(
    events.filter((event) => event.type === 'cards_rescheduled').map((event) => event.payload.kind),
  ).toEqual(['advance', 'postpone', 'undo']);
});
