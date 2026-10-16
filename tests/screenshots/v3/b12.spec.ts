// Capturas de cierre de B12, paquete B (IA real). El Tutor con su hipótesis en camino y el informe y los
// consejos con IA, las tarjetas con el aviso de la compuerta cerrada, la Auditoría de la IA de la médica con
// su rúbrica y la del admin con el veredicto por motor, los costos de la nube y el aviso de Configuración
// cuando un cambio cierra un motor para los alumnos. Corren contra el build con la nube y el Supabase
// simulado de las e2e de nube, con la función de IA de fakeAi.ts. Quedan en docs/screenshots/v3/b12:
// npm run screenshots:v3 -- b12.spec.ts
import type { Browser, BrowserContext, Locator, Page } from '@playwright/test';
import { SCREENS } from '@/app/screens';
import { aiAuditText } from '@/i18n/aiAudit';
import { adminText } from '@/i18n/admin';
import { t } from '@/i18n/es-MX';
import { enterTeam } from '../../e2e/support/bankTeam';
import {
  enterWithLink,
  expect,
  test as cloudTest,
  watchConsole,
} from '../../e2e/support/cloudFixtures';
import { createFakeBankStore } from '../../e2e/support/fakeBankStore';
import { attachAi, attachBank, type FakeSupabaseServer } from '../../e2e/support/fakeSupabase';
import { CLOUD_PREVIEW_URL } from '../../e2e/support/fakeSupabaseConfig';
import { seedTutorHistory } from '../../e2e/support/tutorHistory';
import { capture as takeShot, outDirFor } from './capture';

const B12_DIR = outDirFor('b12');
const ADMIN = { email: 'admin.b12@ejemplo.mx', alias: 'Admin' } as const;
const LUCIA = { email: 'lucia.b12@ejemplo.mx', alias: 'Lucía' } as const;
const MATEO = { email: 'mateo.b12@ejemplo.mx', alias: 'Mateo' } as const;
const ANA = 'ana.b12@ejemplo.mx';
const DAY_MS = 86_400_000;
const SAMPLE_ID = 'b12-2026-10';

const GOOD = {
  accuracy: 'correct',
  grounded: true,
  safetyIssue: false,
  usefulness: 4,
  clarity: 4,
  verdict: 'approved',
  comment: null,
} as const;
const SEVERE = { ...GOOD, accuracy: 'severe', verdict: 'rejected' } as const;

/** Captura desde arriba. Si la página quedó desplazada, la barra fija sale a media imagen */
async function capture(page: Page, dir: string, name: string, project: string) {
  await page.evaluate(() => {
    window.scrollTo(0, 0);
  });
  await takeShot(page, dir, name, project);
}

/** Abre una ruta y espera su título y lo que se pide antes de capturar */
async function open(page: Page, path: string, ...ready: Locator[]) {
  await page.goto(path);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 60_000 });
  for (const locator of ready) await expect(locator).toBeVisible({ timeout: 60_000 });
}

/**
 * Otro navegador contra el build con la nube. openSecondDevice toma la dirección del proyecto, que en las
 * capturas es el build sin nube, y ahí cualquier cuenta se ve como alumno
 */
async function openCloudDevice(
  browser: Browser,
  cloud: FakeSupabaseServer,
  consoleErrors: string[],
): Promise<{ context: BrowserContext; page: Page }> {
  const use = cloudTest.info().project.use;
  const context = await browser.newContext({
    baseURL: CLOUD_PREVIEW_URL,
    serviceWorkers: 'block',
    viewport: use.viewport,
    deviceScaleFactor: use.deviceScaleFactor,
    isMobile: use.isMobile,
    hasTouch: use.hasTouch,
    userAgent: use.userAgent,
    locale: use.locale,
    timezoneId: use.timezoneId,
    reducedMotion: use.reducedMotion,
    colorScheme: use.colorScheme,
  });
  await cloud.attach(context);
  const page = await context.newPage();
  watchConsole(page, consoleErrors);
  return { context, page };
}

cloudTest.describe('IA real', () => {
  cloudTest.use({ baseURL: CLOUD_PREVIEW_URL, serviceWorkers: 'block' });

  cloudTest(
    'B12. Tutor, tarjetas con la compuerta cerrada, auditoría de la médica y del admin, costos de la nube y aviso de configuración',
    async ({ page, browser, cloud, consoleErrors }, info) => {
      cloudTest.setTimeout(600_000);
      const project = info.project.name;
      const ai = attachAi(cloud);
      // Un banco vacío, para que la sección Banco de Configuración cargue como en el servidor de verdad
      attachBank(cloud, createFakeBankStore());
      cloud.createUser({ email: ADMIN.email, alias: ADMIN.alias, role: 'admin' });
      cloud.createUser({ email: LUCIA.email, alias: LUCIA.alias, role: 'physician' });
      cloud.createUser({ email: MATEO.email, alias: MATEO.alias, role: 'physician' });
      cloud.createUser({ email: ANA, alias: 'Ana' });
      cloud.setSubscription(ANA, {
        plan: 'monthly',
        status: 'active',
        provider: 'stripe',
        currentPeriodEnd: new Date(Date.now() + 20 * DAY_MS).toISOString(),
      });
      const adminId = cloud.userIdOf(ADMIN.email) ?? '';
      const luciaId = cloud.userIdOf(LUCIA.email) ?? '';
      const mateoId = cloud.userIdOf(MATEO.email) ?? '';

      // La alumna de pago. Con los motores cerrados, las tarjetas dicen cuándo se abren
      await enterWithLink(page, cloud, ANA, 'Ana');
      await open(
        page,
        SCREENS.decks.path,
        page.getByRole('region', { name: t.aiCards.title }).getByText(t.ai.access.gatedCards),
      );
      await capture(page, B12_DIR, '01-tarjetas-compuerta-cerrada', project);

      // Con el análisis encendido, el informe y los consejos llegan con IA y la hipótesis viene en camino
      await ai.openEngines('forgetting', 'weekly_report', 'bias_tips');
      await seedTutorHistory(page);
      await open(page, SCREENS.tutor.path);
      const analysis = page.getByRole('region', { name: t.tutor.ai.title });
      await analysis.getByRole('button', { name: t.tutor.ai.turnOn }).click();
      await expect(analysis.getByText(t.ai.badge.real)).toBeVisible();
      await expect(
        page.getByRole('region', { name: t.tutor.report.title }).getByText(t.tutor.ai.written.real),
      ).toBeVisible({ timeout: 60_000 });
      await expect(
        page
          .getByRole('region', { name: t.tutor.biasTips.title })
          .getByText(t.tutor.ai.written.real),
      ).toBeVisible({ timeout: 60_000 });
      await expect(page.getByText(t.tutor.ai.pending).first()).toBeVisible({ timeout: 60_000 });
      await capture(page, B12_DIR, '02-tutor-hipotesis-en-camino', project);

      // La médica califica una muestra de 6 consejos y 2 hipótesis. Va en 4 de 8
      const file = await ai.sampleFile(SAMPLE_ID, { bias_tips: 6, forgetting: 2 });
      const created = ai.gate.call(
        'admin_ai_gate_sample_create',
        { userId: adminId, role: 'admin' },
        { p_sample: file, p_reviewers: [luciaId, mateoId] },
      );
      expect(created?.error).toBeNull();
      const rate = (userId: string, itemId: string, review: typeof GOOD | typeof SEVERE) => {
        const reply = ai.gate.call(
          'ai_gate_review',
          { userId, role: 'physician' },
          { p_item: itemId, p_review: review },
        );
        expect(reply?.error).toBeNull();
      };
      for (const item of file.items.slice(0, 4)) rate(luciaId, item.id, GOOD);
      const lucia = await openCloudDevice(browser, cloud, consoleErrors);
      await enterTeam(lucia.page, cloud, LUCIA.email);
      await open(
        lucia.page,
        SCREENS.aiAudit.path,
        lucia.page.getByRole('group', { name: aiAuditText.reviewer.accuracy.label }),
      );
      await expect(lucia.page.getByText(aiAuditText.reviewer.progress(4, 8))).toBeVisible();
      await capture(lucia.page, B12_DIR, '03-auditoria-medica', project);
      await lucia.context.close();

      // Los motores que se abrieron para enseñar el Tutor vuelven a estar sin auditar, como al empezar
      ai.gate.setState({ paused: false, engines: {} });

      // Los dos terminan. Mateo marca un error grave en una hipótesis y el admin cierra la muestra
      for (const item of file.items.slice(4)) rate(luciaId, item.id, GOOD);
      for (const item of file.items) {
        rate(mateoId, item.id, item.engine === 'forgetting' ? SEVERE : GOOD);
      }
      const closed = ai.gate.call(
        'admin_ai_gate_close',
        { userId: adminId, role: 'admin' },
        { p_sample: SAMPLE_ID },
      );
      expect(closed?.error).toBeNull();

      // El admin. La compuerta, la muestra con su avance y el veredicto por motor
      const adminDevice = await openCloudDevice(browser, cloud, consoleErrors);
      const adminPage = adminDevice.page;
      await enterTeam(adminPage, cloud, ADMIN.email);
      await open(
        adminPage,
        SCREENS.aiAudit.path,
        adminPage.getByRole('button', { name: aiAuditText.admin.selectLabel(SAMPLE_ID) }),
      );
      await adminPage
        .getByRole('button', { name: aiAuditText.admin.selectLabel(SAMPLE_ID) })
        .click();
      await expect(
        adminPage
          .getByRole('region', { name: aiAuditText.admin.selected(SAMPLE_ID) })
          .getByText(aiAuditText.admin.verdictTitle),
      ).toBeVisible({ timeout: 30_000 });
      await capture(adminPage, B12_DIR, '04-auditoria-admin', project);

      // Los costos de la nube, con lo que gastó la IA y la hipótesis que entregó el lote
      await ai.runBatchCycle();
      await open(
        adminPage,
        SCREENS.aiCosts.path,
        adminPage.getByRole('region', { name: adminText.adminCosts.cloud.title }),
      );
      await expect(
        adminPage
          .getByRole('region', { name: adminText.adminCosts.cloud.title })
          .getByText(adminText.adminCosts.cloud.totalCaption(3)),
      ).toBeVisible({ timeout: 30_000 });
      await capture(adminPage, B12_DIR, '05-costos-nube', project);

      // Configuración. Apagar el razonamiento de un motor abierto avisa que lo cierra para los alumnos
      await ai.openEngines('flashcards');
      await open(
        adminPage,
        SCREENS.adminSettings.path,
        adminPage.getByRole('region', { name: adminText.adminConfig.aiForm.title }),
      );
      const form = adminPage.getByRole('region', { name: adminText.adminConfig.aiForm.title });
      await form
        .getByRole('group', { name: adminText.adminCosts.engines.flashcards })
        .getByLabel(adminText.adminConfig.aiForm.thinking)
        .selectOption('off');
      await expect(
        form.getByText(
          adminText.adminConfig.aiForm.gateAffected(adminText.adminCosts.engines.flashcards),
        ),
      ).toBeVisible();
      await capture(adminPage, B12_DIR, '06-configuracion-aviso-compuerta', project);
      await adminDevice.context.close();
    },
  );
});
