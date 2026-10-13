// Ajustes del repaso en Repasar (B3 del plan del cambio, comentario 4). Todo lo que se guarda del
// repaso vive en un solo panel de Repasar. Un ajuste cambiado ahí se conserva al recargar y queda
// en la bitácora como cambio de ajustes.
import { SCREENS } from '@/app/screens';
import { t } from '@/i18n/es-MX';
import { readTable } from './support/b1';
import { expect, expectNoSeriousA11yViolations, signUp, test } from './support/fixtures';

const text = t.settingsPage.reviewSettings;

interface SettingsEvent {
  type: string;
  payload: { key?: string; value?: unknown };
}

test('un ajuste del repaso se cambia en el panel de Repasar y se conserva al recargar', async ({
  page,
}) => {
  await signUp(page);
  await page.goto(SCREENS.review.path);
  await page.getByRole('button', { name: text.open }).click();
  await expect(page).toHaveURL(new RegExp(`${SCREENS.review.path}\\?ajustes=1$`));
  const panel = page.getByRole('dialog', { name: text.title });
  // Metas y repaso, la carga diaria y el Pomodoro, todo junto
  await expect(panel.getByRole('region', { name: t.settings.goalsTitle })).toBeVisible();
  await expect(panel.getByRole('region', { name: t.dailyLoad.title })).toBeVisible();
  await expect(panel.getByRole('region', { name: t.settings.pomodoroTitle })).toBeAttached();
  await expectNoSeriousA11yViolations(page);

  const newCards = panel.getByRole('spinbutton', { name: t.settings.newCardsPerDay });
  await expect(newCards).toHaveValue('20');
  await newCards.fill('35');
  await panel.getByRole('button', { name: t.settings.saveChanges }).click();
  await expect(panel.getByText(t.settings.saved, { exact: true })).toBeVisible();

  // Al recargar la dirección vuelve a abrir el panel con el valor guardado
  await page.reload();
  await expect(
    page
      .getByRole('dialog', { name: text.title })
      .getByRole('spinbutton', { name: t.settings.newCardsPerDay }),
  ).toHaveValue('35');

  // Al cerrar se queda en Repasar y la dirección ya no lo abre
  await page
    .getByRole('dialog', { name: text.title })
    .getByRole('button', { name: text.close })
    .click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page).toHaveURL(new RegExp(`${SCREENS.review.path}$`));

  // El cambio quedó en la bitácora como un cambio de ajustes
  const events = await readTable<SettingsEvent>(page, 'events');
  const change = events.find(
    (event) => event.type === 'settings_changed' && event.payload.key === 'settings.newCardsPerDay',
  );
  expect(change?.payload.value).toBe(35);
});

test('Simular solo muestra cuándo llega la retroalimentación y lleva al panel para cambiarla', async ({
  page,
}) => {
  await signUp(page);
  await page.goto(SCREENS.simulatorSetup.path);
  const practice = page.getByRole('region', { name: t.simulator.setupTitle });
  await expect(practice.getByText(text.practiceFeedback(false))).toBeVisible({ timeout: 60_000 });
  // Un solo lugar para cada ajuste. En Simular no hay campo para cambiarlo
  await expect(practice.getByRole('combobox', { name: t.settings.practiceFeedback })).toHaveCount(
    0,
  );

  await practice.getByRole('link', { name: text.change }).click();
  await expect(page).toHaveURL(new RegExp(`${SCREENS.review.path}\\?ajustes=1$`));
  const panel = page.getByRole('dialog', { name: text.title });
  await panel.getByRole('combobox', { name: t.settings.practiceFeedback }).selectOption('each');
  await panel.getByRole('button', { name: t.settings.saveChanges }).click();
  await expect(panel.getByText(t.settings.saved, { exact: true })).toBeVisible();

  // Cerrar el panel regresa a Simular, de donde vino, ya con el valor nuevo
  await panel.getByRole('button', { name: text.close }).click();
  await expect(page).toHaveURL(new RegExp(`${SCREENS.simulatorSetup.path}$`));
  await expect(
    page
      .getByRole('region', { name: t.simulator.setupTitle })
      .getByText(text.practiceFeedback(true)),
  ).toBeVisible({ timeout: 60_000 });
});

test('el botón de atrás cierra el panel sin salir de Repasar y los cambios sin guardar piden confirmación', async ({
  page,
}) => {
  await signUp(page);
  await page.goto(SCREENS.review.path);
  const opener = page.getByRole('button', { name: text.open, exact: true });
  await opener.click();
  const panel = page.getByRole('dialog', { name: text.title });
  await expect(panel).toBeVisible();

  // Sin cambios, atrás cierra el panel y deja Repasar como estaba
  await page.goBack();
  await expect(panel).toHaveCount(0);
  await expect(page).toHaveURL(new RegExp(`${SCREENS.review.path}$`));
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(t.screens.review.title);

  // Con un cambio sin guardar, Escape pregunta antes de cerrar
  await opener.click();
  const newCards = panel.getByRole('spinbutton', { name: t.settings.newCardsPerDay });
  await newCards.fill('35');
  await page.keyboard.press('Escape');
  const warning = page.getByRole('alertdialog', { name: text.unsaved.title });
  await expect(warning).toBeVisible();
  await expect(warning).toContainText(text.unsaved.body);
  await expectNoSeriousA11yViolations(page);
  await warning.getByRole('button', { name: text.unsaved.stay }).click();
  await expect(warning).toHaveCount(0);
  await expect(newCards).toHaveValue('35');

  // Atrás también pregunta. Cerrar sin guardar cierra el panel y no guarda nada
  await page.goBack();
  await expect(warning).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`${SCREENS.review.path}\\?ajustes=1$`));
  await warning.getByRole('button', { name: text.unsaved.leave }).click();
  await expect(panel).toHaveCount(0);
  await expect(page).toHaveURL(new RegExp(`${SCREENS.review.path}$`));
  await opener.click();
  await expect(panel.getByRole('spinbutton', { name: t.settings.newCardsPerDay })).toHaveValue(
    '20',
  );
});
