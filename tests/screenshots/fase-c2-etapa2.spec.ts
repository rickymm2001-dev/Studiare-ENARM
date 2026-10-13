// Capturas de la Etapa 2 de la Fase C2 (15.1 paso 2). Repasar con los tres contadores y el
// temporizador, los atrasos con su aviso y herramientas, los límites de hoy con el perfil guía y la
// sugerencia de nuevas, y los ajustes de días fáciles. Teléfono y escritorio, en claro y oscuro.
// Las imágenes quedan en docs/screenshots/fase-c2-etapa2, en JPEG para no pesar de más. Desde B3 del
// plan del cambio los ajustes, los límites y la carga diaria viven en Ajustes del repaso, el panel de
// Repasar, así que las capturas se toman ahí y conservan sus nombres.
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { SCREENS } from '@/app/screens';
import { t } from '@/i18n/es-MX';
import { reviewSettingsPanel } from '../e2e/support/b1';
import { signUp } from '../e2e/support/fixtures';

const OUT_DIR = join(import.meta.dirname, '..', '..', 'docs', 'screenshots', 'fase-c2-etapa2');
mkdirSync(OUT_DIR, { recursive: true });

async function capture(page: Page, name: string, projectName: string) {
  await page
    .getByText(t.states.loading.label, { exact: true })
    .waitFor({ state: 'detached' })
    .catch(() => undefined);
  await page.waitForLoadState('networkidle');
  // La barra fija del teléfono sale a media imagen en una captura de página completa
  await page.addStyleTag({
    content: `@media (max-width: 1023px) { nav[aria-label="${t.nav.label}"] { position: static !important; } }`,
  });
  await page.screenshot({
    path: join(OUT_DIR, `${name}--${projectName}.jpg`),
    type: 'jpeg',
    quality: 78,
    fullPage: true,
  });
}

async function followSmallestDeck(page: Page) {
  await page.goto(SCREENS.decks.path);
  const deck = page.getByRole('listitem').filter({ hasText: 'Urgencias (Paco)' });
  await deck.getByRole('button', { name: t.decks.follow }).click();
  await expect(deck.getByRole('button', { name: t.decks.unfollow })).toBeVisible({
    timeout: 60_000,
  });
}

test('repaso con contadores y temporizador, y los atrasos repartidos', async ({ page }, info) => {
  test.setTimeout(240_000);
  await signUp(page);
  await followSmallestDeck(page);

  // Temporizador encendido con 30 segundos y sin mostrar la respuesta sola
  await page.goto(`${SCREENS.review.path}?ajustes=1`);
  const panel = reviewSettingsPanel(page);
  // 50 nuevas por día y 60 repasos como límite, así 45 atrasadas pasan el mínimo de 40 y de la
  // mitad del límite, y salta el aviso de recuperación
  await panel.getByRole('spinbutton', { name: t.settings.newCardsPerDay }).fill('50');
  await panel.getByRole('spinbutton', { name: t.settings.reviewsPerDay }).fill('60');
  await panel.getByRole('checkbox', { name: t.settings.cardTimerEnabled }).check();
  await expect(panel.getByRole('combobox', { name: t.settings.cardTimerSeconds })).toBeVisible();
  await panel.getByText(t.settings.easyDaysTitle, { exact: true }).first().click();
  await panel.getByRole('combobox', { name: t.settings.weekdays.sat }).selectOption('reduced');
  await panel.getByRole('combobox', { name: t.settings.weekdays.sun }).selectOption('minimum');
  await capture(page, 'ajustes-temporizador-dias-faciles', info.project.name);
  await panel.getByRole('button', { name: t.settings.saveChanges }).click();
  await expect(panel.getByText(t.settings.saved, { exact: true })).toBeVisible();

  // Los límites y la carga diaria, con el perfil guía y la sugerencia de nuevas, en el mismo panel
  await expect(panel.getByRole('region', { name: t.dailyLoad.guideTitle })).toBeVisible();
  await panel
    .getByRole('region', { name: t.dailyLoad.suggestionTitle })
    .getByRole('button', { name: t.dailyLoad.calculate })
    .click();
  await expect(
    panel
      .getByRole('region', { name: t.dailyLoad.suggestionTitle })
      .getByText(/^Te sugerimos|Para calcular/),
  ).toBeVisible({ timeout: 30_000 });
  await capture(page, 'repasar-limites-carga-diaria', info.project.name);
  await panel.getByRole('button', { name: t.settingsPage.reviewSettings.close }).click();
  await expect(panel).toHaveCount(0);

  await page.getByRole('button', { name: /^Repasar [\d,]+ tarjetas?$/ }).click();
  await expect(page.getByRole('timer')).toBeVisible();
  await capture(page, 'repaso-contadores-temporizador', info.project.name);
  // Con el teclado, Espacio muestra la respuesta y 3 es Bien
  for (let index = 0; index < 45; index += 1) {
    await expect(page.getByRole('button', { name: t.review.show })).toBeVisible();
    await page.keyboard.press('Space');
    await page.keyboard.press('3');
  }
  await page.getByRole('button', { name: t.review.finish }).click();
  await expect(page.getByText(t.review.doneTitle)).toBeVisible();

  // Tres días después esas tarjetas ya son atrasos
  await page.clock.setFixedTime(new Date(Date.now() + 3 * 86_400_000));
  await page.goto(SCREENS.review.path);
  const banner = page.getByRole('region', { name: /^Tienes \d+ tarjetas? atrasadas?$/ });
  await expect(banner).toBeVisible({ timeout: 30_000 });
  await capture(page, 'atrasos-aviso-de-recuperacion', info.project.name);
  await page.getByText(t.overdue.title, { exact: true }).click();
  await capture(page, 'atrasos-herramientas', info.project.name);
  await banner.getByRole('button', { name: /^Repartir \d+ tarjetas?$/ }).click();
  await expect(page.getByText(/tarjetas? repartidas?\.$/)).toBeVisible();
  await capture(page, 'atrasos-repartidos-con-deshacer', info.project.name);
});
