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
