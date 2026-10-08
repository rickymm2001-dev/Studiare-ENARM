// Capturas de la Etapa 3 de la Fase C2 (15.1 paso 2). La lista de Apuntes y un apunte abierto con sus
// marcas resaltadas, las tarjetas que salen de él y sus enlaces. Teléfono y escritorio, en claro y
// oscuro. Las imágenes quedan en docs/screenshots/fase-c2-etapa3, en JPEG para no pesar de más.
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { SCREENS } from '@/app/screens';
import { t } from '@/i18n/es-MX';
import { signUp } from '../e2e/support/fixtures';

const OUT_DIR = join(import.meta.dirname, '..', '..', 'docs', 'screenshots', 'fase-c2-etapa3');
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

const editorOf = (page: Page) => page.getByRole('textbox', { name: t.outlines.editor.label });

async function newOutline(page: Page, title: string) {
  await page.goto(SCREENS.outlines.path);
  await page.getByLabel(t.outlines.newTitle).fill(title);
  await page.getByRole('button', { name: t.outlines.create }).click();
  await expect(editorOf(page)).toBeVisible({ timeout: 30_000 });
  await editorOf(page).click();
}

test('un apunte con marcas, sus tarjetas y la lista de apuntes', async ({ page }, info) => {
  test.setTimeout(180_000);
  await signUp(page);

  await newOutline(page, 'Insuficiencia cardiaca');
  await page.keyboard.type(
    'Insuficiencia cardiaca :: Incapacidad del corazón para bombear lo que el cuerpo necesita #Cardiología',
  );
  await page.keyboard.press('Enter');
  await page.keyboard.type('Causas principales >>>');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Tab');
  await page.keyboard.type('Cardiopatía isquémica');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Hipertensión arterial');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.type(
    'Primera línea para reducir mortalidad >> IECA o ARA II con betabloqueador',
  );
  await page.keyboard.press('Enter');
  await page.keyboard.type(
    'El {{BNP}} se eleva en la insuficiencia cardiaca y se relaciona con [[Diagnóstico cardiológico]]',
  );
  await expect(page.getByText(t.outlines.preview.count(5))).toBeVisible();
  await expect(page.getByText(t.outlines.editor.saved, { exact: true })).toBeVisible({
    timeout: 15_000,
  });
  await capture(page, 'apunte-con-marcas', info.project.name);

  // Una lista con dos apuntes más
  await newOutline(page, 'Diagnóstico cardiológico');
  await page.keyboard.type('ECG de 12 derivaciones >> Primer estudio ante arritmia');
  await expect(page.getByText(t.outlines.editor.saved, { exact: true })).toBeVisible({
    timeout: 15_000,
  });
  await page.goto(SCREENS.outlines.path);
  await expect(
    page.getByRole('link', { name: t.outlines.open('Insuficiencia cardiaca') }),
  ).toBeVisible();
  await capture(page, 'apuntes-lista', info.project.name);
});
