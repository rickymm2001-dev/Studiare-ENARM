// Capturas del bloque B8 (plan Gratis, respuestas 18, 19 y 20, 4.3 y 4.25). Lo que cambió a la vista.
// En Gratis, Party con su candado y lo que sigue abierto, el reto de Party en Inicio, Mazos con el
// catálogo y subir mazos detrás del candado, y la tabla de planes de Suscripción con lo que cierra
// Gratis. En docs/screenshots/v3/b8
import { expect, test, type Page } from '@playwright/test';
import { SCREENS } from '@/app/screens';
import { t } from '@/i18n/es-MX';
import { signUp } from '../../e2e/support/fixtures';
import { capture, outDirFor } from './capture';

const OUT_DIR = outDirFor('b8');

async function shot(page: Page, project: string, name: string, path: string, region: string) {
  await page.goto(path);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole('region', { name: region }).first()).toBeVisible({ timeout: 60_000 });
  await capture(page, OUT_DIR, name, project);
}

test('los candados del plan Gratis', async ({ page }, info) => {
  test.setTimeout(300_000);
  const project = info.project.name;
  await signUp(page);
  await shot(page, project, 'party-gratis', SCREENS.party.path, t.freePlan.party.title);
  await shot(page, project, 'inicio-gratis', SCREENS.home.path, t.widgets.names.party_challenge);
  await shot(page, project, 'mazos-gratis', SCREENS.decks.path, t.freePlan.importDecks.title);
  await shot(page, project, 'suscripcion-gratis', SCREENS.subscription.path, t.billing.plans.free);
});
