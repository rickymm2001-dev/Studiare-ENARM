// Modo sin conexión (14.4, Fase F). Después de la primera carga, la app abre y se navega sin red.
// Todas las pantallas se bajan por separado y el service worker las guarda al instalarse, así que
// entrar sin conexión a una pantalla que nunca se había visitado también tiene que funcionar. Las
// funciones de IA dicen que necesitan conexión y lo demás sigue.
import { SCREENS } from '@/app/screens';
import { t } from '@/i18n/es-MX';
import { expect, signUp, test } from './support/fixtures';

// Una pantalla de cada área, pensada para que su archivo no se haya bajado antes de cortar la red
const NEVER_VISITED = [
  SCREENS.progress.path,
  SCREENS.planner.path,
  SCREENS.rewards.path,
  SCREENS.party.path,
  SCREENS.outlines.path,
] as const;

test('sin conexión abre pantallas que nunca se habían visitado y la IA avisa que necesita red', async ({
  page,
  context,
}) => {
  test.setTimeout(120_000);
  await signUp(page);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  // Recarga para que el service worker controle la página y termine de guardar todo
  await page.reload();
  await expect
    .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)))
    .toBe(true);
  // El precaché se llena al instalarse. Se espera a que tenga las pantallas
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const names = await caches.keys();
        const precache = names.find((name) => name.includes('precache'));
        if (!precache) return 0;
        return (await (await caches.open(precache)).keys()).length;
      }),
    )
    .toBeGreaterThan(40);

  await context.setOffline(true);
  for (const path of NEVER_VISITED) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByText(t.offlineBanner)).toBeVisible();
  }

  // Configuración, Cuenta, dice que la IA necesita conexión y que lo demás sigue
  await page.goto(`${SCREENS.settings.path}?seccion=account`);
  await expect(page.getByText(t.ai.detail.offline)).toBeVisible();
  await expect(page.getByText(t.ai.badge.offline)).toBeVisible();

  // Y vuelve a la normalidad al regresar la red
  await context.setOffline(false);
  await expect(page.getByText(t.offlineBanner)).toHaveCount(0);
});
