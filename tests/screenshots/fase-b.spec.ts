// Capturas de la Fase B. La única pantalla nueva es el panel de datos de demostración en Perfil.
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { test, type Page } from '@playwright/test';
import { SCREENS } from '@/app/screens';
import { t } from '@/i18n/es-MX';

const OUT_DIR = join(import.meta.dirname, '..', '..', 'docs', 'screenshots', 'fase-b');
mkdirSync(OUT_DIR, { recursive: true });

async function capture(page: Page, name: string, projectName: string) {
  await page
    .getByText(t.ai.badge.checking)
    .waitFor({ state: 'detached' })
    .catch(() => undefined);
  await page.addStyleTag({
    content: `@media (max-width: 1023px) { nav[aria-label="${t.nav.label}"] { position: static !important; } }`,
  });
  await page.screenshot({ path: join(OUT_DIR, `${name}--${projectName}.png`), fullPage: true });
}

test('panel de datos de demostración, vacío y generado', async ({ page }, info) => {
  test.setTimeout(240_000);
  await page.addInitScript(() => {
    localStorage.setItem(
      'enarm.preferences.v1',
      JSON.stringify({ theme: 'system', role: 'student', database: 'demo' }),
    );
  });
  await page.goto(SCREENS.profile.path);
  const panel = page.getByRole('region', { name: t.demoData.title });
  await panel.getByText(t.demoData.empty).waitFor();
  await capture(page, '01-perfil-demo-vacia', info.project.name);
  await panel.getByRole('button', { name: t.demoData.generate }).click();
  await panel.getByText(/Listo\. Se guardaron/).waitFor({ timeout: 200_000 });
  await capture(page, '02-perfil-demo-generada', info.project.name);
});
