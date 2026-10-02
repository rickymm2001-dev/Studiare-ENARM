// Capturas de la Fase A. Las 26 pantallas y los estados que se agregaron en esta fase.
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { test, type Page } from '@playwright/test';
import { SCREEN_KEYS, SCREENS } from '@/app/screens';
import { t } from '@/i18n/es-MX';

const OUT_DIR = join(import.meta.dirname, '..', '..', 'docs', 'screenshots', 'fase-a');
mkdirSync(OUT_DIR, { recursive: true });

async function preset(page: Page, preferences: { role?: string; database?: string }) {
  await page.addInitScript(
    (value) => {
      localStorage.setItem('enarm.preferences.v1', JSON.stringify(value));
    },
    { theme: 'system', role: 'student', database: 'real', ...preferences },
  );
}

async function capture(page: Page, name: string, projectName: string) {
  // Espera a que el modo de IA deje de decir revisando, para que la captura sea estable
  await page
    .getByText(t.ai.badge.checking)
    .waitFor({ state: 'detached' })
    .catch(() => undefined);
  // En la captura de página completa una barra fija sale a media imagen. Solo para la captura,
  // la barra del teléfono se pega al final de la página, que es donde la ve el alumno
  await page.addStyleTag({
    content: `@media (max-width: 1023px) { nav[aria-label="${t.nav.label}"] { position: static !important; } }`,
  });
  await page.screenshot({ path: join(OUT_DIR, `${name}--${projectName}.png`), fullPage: true });
}

for (const key of SCREEN_KEYS) {
  const screen = SCREENS[key];
  const number = String(screen.number).padStart(2, '0');
  test(`${number} ${key}`, async ({ page }, info) => {
    const needsRole = screen.area === 'physician' || screen.area === 'admin';
    await preset(page, { role: needsRole ? screen.area : 'student' });
    await page.goto(screen.path);
    await page.getByRole('heading', { level: 1 }).waitFor();
    await capture(page, `${number}-${key}`, info.project.name);
  });
}

test('estado calibrando', async ({ page }, info) => {
  await preset(page, {});
  await page.goto(`${SCREENS.progress.path}?estado=calibrando`);
  await page.getByText(t.states.calibrating.remaining(28, t.states.exampleUnit)).waitFor();
  await capture(page, '90-estado-calibrando', info.project.name);
});

test('estado cargando y error', async ({ page }, info) => {
  await preset(page, {});
  await page.goto(`${SCREENS.review.path}?estado=error`);
  await page.getByRole('alert').waitFor();
  await capture(page, '91-estado-error', info.project.name);
});

test('demostración con datos simulados', async ({ page }, info) => {
  await preset(page, { database: 'demo' });
  await page.goto(SCREENS.profile.path);
  await page.getByText(t.database.storedIn('enarm_demo')).waitFor();
  await capture(page, '92-perfil-demostracion', info.project.name);
});

test('acceso negado por rol', async ({ page }, info) => {
  await preset(page, { role: 'student' });
  await page.goto(SCREENS.aiCosts.path);
  await page.getByRole('heading', { name: t.access.adminTitle }).waitFor();
  await capture(page, '93-acceso-por-rol', info.project.name);
});
