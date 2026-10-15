// Capturas de cierre de B11, paquete C (médico, admin y taxonomía). El banco del médico con sus vistas,
// el editor en el paso a ciegas y en el paso de decidir, el acuerdo con kappa medido, Banco y Sheet con
// una corrida contra el Sheet de prueba y su reporte de renglones, Revisiones de médicos con tarifa,
// Catálogo de mazos con una versión en subida y la sección Banco de Plataforma. Corren contra el build
// con la nube y el Supabase simulado de las e2e de nube, con el banco de fakeEditorial.ts, y necesitan
// que fakeSupabase.ts ya mande ahí las rutas del equipo. Quedan en docs/screenshots/v3/b11:
// npm run screenshots:v3 -- b11.spec.ts --project=390-claro --project=1280-claro
// --project=1280-oscuro --project=1920-claro
import type { Locator, Page } from '@playwright/test';
import { SCREENS } from '@/app/screens';
import { bankAdminText } from '@/i18n/bankAdmin';
import { t } from '@/i18n/es-MX';
import { physicianText } from '@/i18n/physician';
import { callerOf, enterTeam, teamBank } from '../../e2e/support/bankTeam';
import { expect, openSecondDevice, test as cloudTest } from '../../e2e/support/cloudFixtures';
import { uploadDeckAsAdmin } from '../../e2e/support/deckCatalogAdmin';
import { FAKE_BANK_TEXT_MARK, seedPairs, seedQuestions } from '../../e2e/support/fakeBankStore';
import {
  assignQuestion,
  editorialFunction,
  editorialRpc,
  settleSyncRuns,
} from '../../e2e/support/fakeEditorial';
import { CLOUD_PREVIEW_URL } from '../../e2e/support/fakeSupabaseConfig';
import { capture, outDirFor } from './capture';

const B11_DIR = outDirFor('b11');
const AUTHOR = { email: 'autora.b11@ejemplo.mx', alias: 'Ana', role: 'physician' } as const;
const REVIEWER = { email: 'revisor.b11@ejemplo.mx', alias: 'Beto', role: 'physician' } as const;
const ADMIN = { email: 'admin.b11@ejemplo.mx', alias: 'Admin', role: 'admin' } as const;

/** Abre una ruta y espera su título y lo que se pide antes de capturar */
async function open(page: Page, path: string, ...ready: Locator[]) {
  await page.goto(path);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 60_000 });
  for (const locator of ready) await expect(locator).toBeVisible({ timeout: 60_000 });
}

cloudTest.describe('Médico y admin del banco en la nube', () => {
  cloudTest.use({ baseURL: CLOUD_PREVIEW_URL, serviceWorkers: 'block' });

  cloudTest(
    'B11. Banco del médico, revisión a ciegas, acuerdo, Banco y Sheet, revisiones y mazos',
    async ({ page, browser, cloud, consoleErrors }, info) => {
      cloudTest.setTimeout(600_000);
      const project = info.project.name;
      const {
        bank,
        users: [ana, beto, admin],
      } = teamBank(cloud, [AUTHOR, REVIEWER, ADMIN]);
      if (!ana || !beto || !admin) throw new Error('Faltan las cuentas del equipo');
      bank.physicianCodes.set(ana.id, 'AN');
      bank.physicianCodes.set(beto.id, 'BR');
      bank.settings.bankSync.enabled = true;
      bank.settings.physicianPay.perReviewMxn = 50;
      cloud.setSetting('bank_sync', { ...bank.settings.bankSync });
      cloud.setSetting('physician_pay', { perReviewMxn: 50 });

      // Un banco pequeño. Seis preguntas de Ana que revisa Beto, dos ya en revisión, una aprobada,
      // una con cambios pedidos y pares de autor y revisor de sobra para medir kappa
      const questions = seedQuestions(bank, 6, { status: 'draft', authorId: ana.id });
      for (const question of questions) {
        assignQuestion(bank, question.questionId, ana.id, 'author');
        assignQuestion(bank, question.questionId, beto.id, 'reviewer');
      }
      for (const [index, question] of questions.slice(0, 4).entries()) {
        const versionId = question.latestVersionId;
        editorialRpc(bank, 'editor_submit', callerOf(ana), { p_version_id: versionId });
        if (index < 2) continue;
        for (const option of bank.versions.get(versionId)?.options ?? []) {
          if (option.isCorrect) continue;
          editorialRpc(bank, 'editor_label_option', callerOf(beto), {
            p_version_id: versionId,
            p_option_id: option.optionId,
            p_tag: option.biasTag,
          });
        }
        if (index === 3) {
          editorialRpc(bank, 'editor_decide', callerOf(beto), {
            p_version_id: versionId,
            p_decision: 'request_changes',
            p_comment: `${FAKE_BANK_TEXT_MARK} Revisa la justificación de la opción C.`,
            p_checks: [],
          });
        }
      }
      seedPairs(bank, 40, 0.85, beto.id);
      const [blindQuestion, , decideQuestion] = questions;
      if (!blindQuestion || !decideQuestion) throw new Error('Sin preguntas sembradas');

      // El revisor. Banco, paso a ciegas, paso de decidir y acuerdo
      await enterTeam(page, cloud, REVIEWER.email);
      await open(
        page,
        SCREENS.questionBank.path,
        page.getByRole('region', { name: t.bank.listTitle }),
      );
      await capture(page, B11_DIR, '01-banco-medico', project);
      await open(
        page,
        `${SCREENS.questionEditor.path}?pregunta=${blindQuestion.questionId}`,
        page.getByRole('region', { name: physicianText.review.blind.title }),
      );
      await capture(page, B11_DIR, '02-editor-a-ciegas', project);
      await open(
        page,
        `${SCREENS.questionEditor.path}?pregunta=${decideQuestion.questionId}`,
        page.getByRole('region', { name: physicianText.review.decide.title }),
      );
      await capture(page, B11_DIR, '03-editor-decidir', project);
      await open(
        page,
        SCREENS.agreement.path,
        page.getByRole('region', { name: physicianText.agreementScreen.byTag.title }),
      );
      await capture(page, B11_DIR, '04-acuerdo', project);

      // El admin. Banco y Sheet después de una corrida contra el Sheet de prueba
      const adminDevice = await openSecondDevice(browser, cloud, consoleErrors);
      const adminPage = adminDevice.page;
      await enterTeam(adminPage, cloud, ADMIN.email);
      editorialFunction(bank, callerOf(admin), { target: 'test' });
      await settleSyncRuns(bank);
      await open(
        adminPage,
        SCREENS.bankAdmin.path,
        adminPage.getByText(bankAdminText.sync.run.status.partial ?? ''),
      );
      await adminPage
        .getByRole('region', { name: bankAdminText.sync.title })
        .getByRole('button', { name: bankAdminText.sync.run.show })
        .first()
        .click();
      await expect(
        adminPage.getByRole('region', { name: bankAdminText.sync.run.selected }).getByRole('table'),
      ).toBeVisible();
      await capture(adminPage, B11_DIR, '05-banco-y-sheet', project);

      await open(
        adminPage,
        SCREENS.physicianReviews.path,
        adminPage.getByRole('row', { name: /Beto/ }),
      );
      await capture(adminPage, B11_DIR, '06-revisiones-medicos', project);

      await uploadDeckAsAdmin(adminPage, {
        deckKey: 'prueba-b11',
        name: '[Prueba] Mazo simulado',
        author: 'Autor simulado',
        license: 'third_party',
        note: '[Prueba] Autorización simulada',
      });
      await capture(adminPage, B11_DIR, '07-catalogo-mazos', project);

      await open(
        adminPage,
        SCREENS.adminSettings.path,
        adminPage.getByRole('button', { name: bankAdminText.platform.save }),
      );
      await capture(adminPage, B11_DIR, '08-plataforma-banco', project);
      await adminDevice.context.close();
    },
  );
});
