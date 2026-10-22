// Capturas de cierre de B15, Analítica, errores, recordatorios y recorrido (6.5 del plan de B15). El recorrido
// guiado paso a paso en teléfono y en computadora, el registro con el permiso nuevo, Privacidad con Medición
// de uso, Ajustes del repaso con Recordatorios apagados, prendidos y sin nube, la página de baja para
// confirmar, ya lista y con el enlace vencido, Perfil con Ver el recorrido y Plataforma con Correos y alertas.
// Quedan en docs/screenshots/v3/b15, en 390, 1280 y 1920 y en claro y en oscuro:
// npm run screenshots:v3 -- b15.spec.ts
//
// Los textos salen de los archivos de i18n de cada pantalla (tour.ts, engagement.ts, adminEngagement.ts y
// consents.ts), así que si cambian, la spec los sigue.
//
// El recorrido y el registro corren contra el build sin nube. Los recordatorios, la página de baja y el
// admin, contra el build con la nube y el Supabase simulado de las e2e de nube (tests/e2e/cloud/README.md),
// como las de b11.spec.ts. El recorrido se captura solo en lo que ve la ventana, porque es un globo fijo
// sobre la pantalla y una captura de página completa lo estiraría.
import { join } from 'node:path';
import type { Locator, Page } from '@playwright/test';
import { SCREENS } from '@/app/screens';
import { TOUR_STEPS } from '@/features/tour/steps';
import { adminEngagementText } from '@/i18n/adminEngagement';
import { consentTexts } from '@/i18n/consents';
import { engagementTexts } from '@/i18n/engagement';
import { t } from '@/i18n/es-MX';
import { tourTexts } from '@/i18n/tour';
import {
  enterWithLink,
  expect,
  openSecondDevice,
  test as cloudTest,
} from '../../e2e/support/cloudFixtures';
import { FAKE_EMAIL_KINDS, unsubscribeTokenOf } from '../../e2e/support/fakeEngagement';
import { seedFlags } from '../../e2e/support/fakeTelemetry';
import { CLOUD_PREVIEW_URL } from '../../e2e/support/fakeSupabaseConfig';
import { signUp, test as localTest } from '../../e2e/support/fixtures';
import { capture, outDirFor } from './capture';

const B15_DIR = outDirFor('b15');

const reminderText = engagementTexts.reminders;
const unsubscribeText = engagementTexts.unsubscribe;

/** Ajustes del repaso. El panel y la sección Recordatorios por correo, que tiene su propio Guardar cambios */
const reviewPanel = (page: Page) =>
  page.getByRole('dialog', { name: t.settingsPage.reviewSettings.title });
const reminderSection = (page: Page) =>
  reviewPanel(page).getByRole('region', { name: reminderText.title });

const STEP_NAMES = [
  'bienvenida',
  'inicio',
  'repasar',
  'apuntes',
  'simular',
  'progreso',
  'party',
  'configuracion',
];

/** Una captura de lo que ve la ventana, sin recorrer la página. Para el globo del recorrido */
async function viewportShot(page: Page, name: string, project: string) {
  await page.waitForLoadState('networkidle');
  // Un paso que aterriza en una pantalla que todavía carga (Simular prepara el banco) saldría con el esqueleto
  // gris en lugar de su contenido. Cada estado de carga trae su texto para el lector de pantalla
  for (const label of [t.states.loading.label, t.simulator.preparing]) {
    await expect(page.getByText(label, { exact: true })).toHaveCount(0, { timeout: 30_000 });
  }
  await page.screenshot({
    path: join(B15_DIR, `${name}--${project}.jpg`),
    type: 'jpeg',
    quality: 60,
  });
}

/**
 * En el teléfono la barra de abajo va pegada al borde de la ventana. Si una captura la muestra en otro lugar, la
 * imagen miente sobre la app (así pasaba cuando una captura anterior le dejaba la posición estática), así que
 * antes de capturar se comprueba. En computadora el menú es el riel de la izquierda y no aplica
 */
async function expectBottomBarInPlace(page: Page) {
  const viewport = page.viewportSize();
  if (!viewport || viewport.width >= 1024) return;
  const box = await page.locator(`nav[aria-label="${t.nav.label}"]`).boundingBox();
  expect(Math.round((box?.y ?? 0) + (box?.height ?? 0))).toBe(viewport.height);
}

/** Captura solo un elemento, como una sección o un diálogo */
async function elementShot(target: Locator, name: string, project: string) {
  await target.scrollIntoViewIfNeeded();
  await target.screenshot({
    path: join(B15_DIR, `${name}--${project}.jpg`),
    type: 'jpeg',
    quality: 60,
  });
}

/**
 * Captura un elemento más alto que la pantalla, con un recorte de la página completa. La captura de un elemento
 * alto, con las barras fijas moviéndose, salía corrida hacia arriba y le cortaba el final. Aquí las barras se
 * dejan en su lugar antes, la página vuelve arriba, se mide el elemento y se recorta justo ese rectángulo
 */
async function tallShot(page: Page, target: Locator, name: string, project: string) {
  await page.waitForLoadState('networkidle');
  await page.addStyleTag({
    content:
      '.sticky { position: relative !important; top: auto !important; bottom: auto !important; } ' +
      '.lg\\:fixed { position: absolute !important; } ' +
      `@media (max-width: 1023px) { nav[aria-label="${t.nav.label}"] { position: static !important; } }`,
  });
  await page.evaluate(() => {
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(300);
  const box = await target.boundingBox();
  if (!box) throw new Error('El elemento no tiene caja para capturar');
  await page.screenshot({
    path: join(B15_DIR, `${name}--${project}.jpg`),
    type: 'jpeg',
    quality: 60,
    fullPage: true,
    clip: box,
  });
}

/**
 * Captura el panel de Ajustes del repaso con la sección de recordatorios arriba. El panel tiene su propio
 * desplazamiento, y sin esto la captura saldría de otra sección
 */
async function sectionInPanel(section: Locator, panel: Locator, name: string, project: string) {
  await section.evaluate((element) => {
    element.scrollIntoView({ block: 'start' });
  });
  await panel.screenshot({
    path: join(B15_DIR, `${name}--${project}.jpg`),
    type: 'jpeg',
    quality: 60,
  });
}

/** Abre una ruta y espera su título antes de capturar. Con la dirección completa, por la nube */
async function open(page: Page, path: string, ...ready: Locator[]) {
  await page.goto(path);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 60_000 });
  for (const locator of ready) await expect(locator).toBeVisible({ timeout: 60_000 });
}

const stepDialog = (page: Page, index: number) =>
  page.getByRole('dialog', {
    name: `${tourTexts.counter(index + 1, TOUR_STEPS.length)} ${tourTexts.steps[TOUR_STEPS[index] ?? 'welcome'].title}`,
    exact: true,
  });

// ===================================================================== Sin nube

localTest.describe('Registro, recorrido guiado y Perfil', () => {
  localTest.use({ tourAutoOffer: true });

  localTest(
    'B15. Registro con los permisos, el recorrido paso a paso y Perfil con Ver el recorrido',
    async ({ page }, info) => {
      localTest.setTimeout(300_000);
      const project = info.project.name;

      // El registro con los permisos, ya con Medición de uso entre ellos
      await page.goto(SCREENS.onboarding.path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expect(page.getByText(consentTexts.purposes.product_analytics[0])).toBeVisible();
      await page.evaluate(() => {
        window.scrollTo(0, 0);
      });
      await capture(page, B15_DIR, '01-registro-con-permisos', project);
      // capture deja la barra de abajo estática en esta página (para que no salga a media imagen en una toma de
      // página completa) y esa regla seguía puesta durante el recorrido. Los pasos 4, 7 y 8 salían con el menú
      // a media pantalla o sin menú, aunque la app lo pinta bien. Se recarga para ver la pantalla como la ve el
      // alumno
      await page.reload();
      await expect(page.getByLabel(t.onboarding.alias, { exact: true })).toBeVisible();

      // Crea la cuenta y el recorrido aparece solo al llegar a Inicio
      await page.getByLabel(t.onboarding.alias, { exact: true }).fill('Ana');
      await page.getByLabel(t.account.email, { exact: true }).fill('ana@ejemplo.mx');
      await page.getByLabel(t.accounts.signup.adultAccept(18)).check();
      await page.getByLabel(t.onboarding.privacyAccept).check();
      await page.getByRole('button', { name: t.onboarding.create }).click();
      await expect(stepDialog(page, 0)).toBeVisible({ timeout: 30_000 });

      // Los ocho pasos, uno por imagen. En el teléfono es una hoja encima de la barra y en computadora,
      // un globo junto al menú. Para dejar solo los pasos 1, 2, 4 y 8 que pide el plan basta cambiar esta lista
      const shots = [0, 1, 2, 3, 4, 5, 6, 7];
      for (const index of shots) {
        await expect(stepDialog(page, index)).toBeVisible();
        await expectBottomBarInPlace(page);
        await viewportShot(
          page,
          `02-recorrido-paso-${String(index + 1)}-${STEP_NAMES[index] ?? 'paso'}`,
          project,
        );
        await page
          .getByRole('button', {
            name: index === TOUR_STEPS.length - 1 ? tourTexts.finish : tourTexts.next,
          })
          .click();
      }
      await expect(page.getByRole('dialog')).toHaveCount(0);

      // Perfil, con la línea Recorrido por Studiare junto a Tu sesión
      await open(page, `${SCREENS.settings.path}#perfil`);
      const session = page.getByRole('region', { name: t.settingsPage.session.title });
      await expect(session.getByRole('button', { name: tourTexts.settings.button })).toBeVisible();
      await elementShot(session, '03-perfil-ver-el-recorrido', project);
    },
  );

  localTest(
    'B15. Ajustes del repaso con los recordatorios sin cuenta en la nube',
    async ({ page }, info) => {
      localTest.setTimeout(180_000);
      const project = info.project.name;
      // La bandera emailReminders está apagada en el build de las pruebas, que corre como la demo. Se
      // prende como lo hará el servidor, con la copia de banderas del navegador
      await page.addInitScript(() => {
        localStorage.setItem('enarm.feature-flags.v1', JSON.stringify({ emailReminders: true }));
      });
      await signUp(page, 'Ana');
      await page.goto(`${SCREENS.review.path}?ajustes=recordatorios`);
      const dialog = reviewPanel(page);
      await expect(dialog).toBeVisible({ timeout: 60_000 });
      await expect(reminderSection(page).getByText(reminderText.needsCloud)).toBeVisible();
      await sectionInPanel(reminderSection(page), dialog, '09-recordatorios-sin-nube', project);
    },
  );
});

// ===================================================================== Con la nube

cloudTest.describe('Recordatorios, baja, privacidad y Correos y alertas', () => {
  cloudTest.use({ baseURL: CLOUD_PREVIEW_URL, serviceWorkers: 'block' });

  cloudTest(
    'B15. Privacidad con Medición de uso, Ajustes del repaso con Recordatorios y la página de baja',
    async ({ page, cloud, browser, consoleErrors }, info) => {
      cloudTest.setTimeout(600_000);
      const project = info.project.name;
      const email = 'ana.b15@ejemplo.mx';
      await seedFlags(page, cloud, { emailReminders: true });
      await enterWithLink(page, cloud, email, 'Ana');

      // Privacidad con el permiso nuevo, apagado como empieza
      await open(
        page,
        `${CLOUD_PREVIEW_URL}${SCREENS.settings.path}#privacidad`,
        page.getByText(consentTexts.purposes.product_analytics[0]),
      );
      await tallShot(page, page.locator('#privacidad'), '04-privacidad-medicion-de-uso', project);

      // Ajustes del repaso, Recordatorios apagados
      // El panel es un diálogo modal, que esconde el h1 de la pantalla, así que no se espera el título
      await page.goto(`${CLOUD_PREVIEW_URL}${SCREENS.review.path}?ajustes=recordatorios`);
      const dialog = reviewPanel(page);
      await expect(dialog).toBeVisible({ timeout: 60_000 });
      const section = reminderSection(page);
      const reminders = section.getByRole('checkbox', { name: reminderText.enable });
      await expect(reminders).toBeVisible({ timeout: 60_000 });
      await expect(reminders).not.toBeChecked();
      await sectionInPanel(section, dialog, '05-recordatorios-apagados', project);

      // Prendidos, con la hora, la frecuencia y la casilla de solo si hay pendientes
      await reminders.check();
      await expect(section.getByLabel(reminderText.hour)).toBeVisible();
      await sectionInPanel(section, dialog, '06-recordatorios-prendidos', project);

      // Con Días que elijas salen las casillas de la semana
      await section.getByRole('button', { name: reminderText.frequencies.custom }).click();
      await sectionInPanel(section, dialog, '07-recordatorios-dias-que-elijas', project);

      // Guardan, y con la ficha de baja que dejó el servidor simulado se abre la página de baja
      await section.getByRole('button', { name: reminderText.frequencies.weekdays }).click();
      await section.getByRole('button', { name: t.settings.saveChanges }).click();
      await expect(section.getByText(reminderText.saved)).toBeVisible();
      const userId = cloud.userByEmail(email)?.id ?? '';
      await expect.poll(() => unsubscribeTokenOf(cloud.engagement, userId)).not.toBeNull();
      const token = unsubscribeTokenOf(cloud.engagement, userId) ?? '';

      // La página de baja es pública. Se abre como la abriría quien toca el enlace del correo, en un navegador sin
      // sesión, con la ficha en la dirección
      const visitor = await openSecondDevice(browser, cloud, consoleErrors);
      const guest = visitor.page;
      // Con las mismas banderas que el servidor, para que no salga el aviso de configuración nueva
      await seedFlags(guest, cloud, { emailReminders: true });
      await guest.goto(`${CLOUD_PREVIEW_URL}/correo/baja?t=${token}`);
      await expect(guest.getByText(unsubscribeText.question)).toBeVisible({ timeout: 60_000 });
      await capture(guest, B15_DIR, '10-baja-para-confirmar', project);
      await guest.getByRole('button', { name: unsubscribeText.confirm }).click();
      await expect(guest.getByText(unsubscribeText.done)).toBeVisible();
      await capture(guest, B15_DIR, '11-baja-lista', project);

      // Un enlace que ya no sirve. Con la forma buena el servidor es quien dice que ya no sirve, al tocar el botón
      await guest.goto(`${CLOUD_PREVIEW_URL}/correo/baja?t=${'0'.repeat(36)}`);
      await guest.getByRole('button', { name: unsubscribeText.confirm }).click();
      await expect(guest.getByText(unsubscribeText.invalid)).toBeVisible({ timeout: 60_000 });
      await capture(guest, B15_DIR, '12-baja-enlace-vencido', project);
      await visitor.context.close();
    },
  );

  cloudTest('B15. Plataforma con Correos y alertas', async ({ page, cloud }, info) => {
    cloudTest.setTimeout(300_000);
    const project = info.project.name;
    const email = 'admin.b15@ejemplo.mx';
    cloud.createUser({ email, alias: 'Admin', role: 'admin' });
    // Unos correos del último periodo, para que la tabla de conteos no se vea vacía
    const counts = { daily_review_reminder: [42, 3, 5, 1], trial_ending: [4, 0, 1, 0] } as const;
    cloud.engagement.overview = {
      days: 7,
      kinds: FAKE_EMAIL_KINDS.map((kind) => {
        const [sent = 0, queued = 0, skipped = 0, failed = 0] =
          kind === 'daily_review_reminder' || kind === 'trial_ending' ? counts[kind] : [];
        return { kind, sent, queued, skipped, failed };
      }),
    };
    await enterWithLink(page, cloud, email, 'Admin');
    await open(page, `${CLOUD_PREVIEW_URL}${SCREENS.adminSettings.path}`);
    const section = page.getByRole('region', { name: adminEngagementText.title });
    await expect(section).toBeVisible({ timeout: 60_000 });
    await tallShot(page, section, '13-plataforma-correos-y-alertas', project);
  });
});
