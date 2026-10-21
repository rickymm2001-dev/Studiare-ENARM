// Capturas de cierre de B14, paquete C (modelo del alumno, comparación y pantallas del equipo). La tarjeta Cómo
// vas frente a otros con un grupo grande, con la especialidad y con un grupo chico que calibra, la pantalla
// Calibración del admin con su aviso de más de 48 horas, la sección Modelo del alumno y calibración de
// Plataforma, el historial de Acuerdo con una paridad que falla y la marca de la noche en Reportes. Del
// modelo en la demostración, la tarjeta con los alumnos simulados, los temas para reforzar y la fatiga del
// Tutor. De lo que dejó el paquete B, Simular con Adaptativo, calibrando y disponible, y Privacidad con el texto
// nuevo del permiso. Las de nube corren contra el build con la nube y el Supabase simulado de las e2e de nube,
// con la foto de la noche de fakeModelStore.ts y las funciones del equipo de fakeCalibrationAdmin.ts. Quedan en
// docs/screenshots/v3/b14, en 390, 1280 y 1920 y en claro y en oscuro: npm run screenshots:v3 -- b14.spec.ts
import type { Locator, Page } from '@playwright/test';
import { SCREENS } from '@/app/screens';
import { adaptiveTexts } from '@/i18n/adaptive';
import { calibrationAdminTexts } from '@/i18n/calibrationAdmin';
import { consentTexts } from '@/i18n/consents';
import { t } from '@/i18n/es-MX';
import { modelTexts } from '@/i18n/model';
import { physicianText } from '@/i18n/physician';
import { generateDemo } from '../../e2e/support/b1';
import { enterTeam, teamBank, type TeamMember } from '../../e2e/support/bankTeam';
import {
  cloudWith,
  downloadQuestions,
  enterWithOpenBank,
  seedOwnHistory,
} from '../../e2e/support/comparisonHistory';
import {
  enterWithLink,
  expect,
  reloadWithServerFlags,
  test as cloudTest,
} from '../../e2e/support/cloudFixtures';
import { openBank, seedBank } from '../../e2e/support/fakeBank';
import { attachCalibrationAdmin } from '../../e2e/support/fakeCalibrationAdmin';
import {
  createFakeBankStore,
  seedQuestions,
  type FakeBankStore,
} from '../../e2e/support/fakeBankStore';
import { assignQuestion } from '../../e2e/support/fakeEditorial';
import {
  createFakeModelStore,
  emptyPopulation,
  seedCalibration,
  seedComparison,
  seedRuns,
} from '../../e2e/support/fakeModelStore';
import { attachBank, attachModel } from '../../e2e/support/fakeSupabase';
import { CLOUD_PREVIEW_URL } from '../../e2e/support/fakeSupabaseConfig';
import { test as demoTest } from '../../e2e/support/fixtures';
import { capture as takeShot, outDirFor } from './capture';

const B14_DIR = outDirFor('b14');
const ADMIN: TeamMember = { email: 'admin.b14@ejemplo.mx', alias: 'Admin', role: 'admin' };
const PHYSICIAN: TeamMember = { email: 'medica.b14@ejemplo.mx', alias: 'Carla', role: 'physician' };
const comparison = modelTexts.comparison;
const admin = calibrationAdminTexts;
/** La alumna de las capturas de Simular con Adaptativo */
const ADAPTIVE_STUDENT = 'ana.adaptativo.b14@ejemplo.mx';

/** Captura desde arriba. Si la página quedó desplazada, la barra fija sale a media imagen */
async function capture(
  page: Page,
  name: string,
  project: string,
  options: { element?: Locator; maxHeight?: number } = {},
) {
  await page.evaluate(() => {
    window.scrollTo(0, 0);
  });
  await takeShot(page, B14_DIR, name, project, options);
}

const card = (page: Page, name: string) => page.getByRole('region', { name });

/** La versión más reciente de una pregunta del banco simulado */
function latestVersionOf(bank: FakeBankStore, questionId: string) {
  const question = bank.questions.get(questionId);
  const version = question ? bank.versions.get(question.latestVersionId) : undefined;
  if (!version) throw new Error(`Sin versión de ${questionId}`);
  return version;
}

async function openProgress(page: Page) {
  await page.goto(SCREENS.progress.path);
  const target = card(page, comparison.title);
  await expect(target).toBeVisible({ timeout: 60_000 });
  return target;
}

cloudTest.describe('Modelo del alumno, comparación y pantallas del equipo', () => {
  cloudTest.use({ baseURL: CLOUD_PREVIEW_URL, serviceWorkers: 'block' });

  cloudTest(
    'B14. Cómo vas frente a otros con un grupo grande y con la especialidad',
    async ({ page, cloud }, info) => {
      cloudTest.setTimeout(300_000);
      const project = info.project.name;
      cloudWith(
        cloud,
        (model) => {
          seedComparison(model, {
            students: 60,
            specialtyStudents: 40,
            specialty: 'general_surgery',
          });
        },
        'general_surgery',
      );
      await enterWithOpenBank(page, cloud);
      await downloadQuestions(page);
      await seedOwnHistory(page, { answers: 24, correct: 18, reviews: 120, days: 5 });
      const target = await openProgress(page);
      await expect(target.getByText(/^Percentil \d+$/).first()).toBeVisible({ timeout: 30_000 });
      await capture(page, '01-comparacion-grupo-grande', project, { element: target });

      await target.getByRole('button', { name: comparison.cohorts.specialty }).click();
      await expect(target.getByText(comparison.specialtyFor('Cirugía General'))).toBeVisible();
      await capture(page, '02-comparacion-especialidad', project, { element: target });
    },
  );

  cloudTest(
    'B14. Cómo vas frente a otros con un grupo chico que calibra y sin especialidad elegida',
    async ({ page, cloud }, info) => {
      cloudTest.setTimeout(300_000);
      const project = info.project.name;
      cloudWith(
        cloud,
        (model) => {
          seedComparison(model, { students: 12 });
        },
        null,
      );
      await enterWithOpenBank(page, cloud);
      const target = await openProgress(page);
      await expect(target.getByText(comparison.groupCalibrating(18)).first()).toBeVisible({
        timeout: 30_000,
      });
      await expect(target.getByText(comparison.noSpecialty)).toBeVisible();
      await capture(page, '03-comparacion-grupo-chico-calibrando', project, { element: target });
    },
  );

  for (const scenario of [
    { calibrated: 10, name: 'calibrando con cuántas preguntas hay' },
    { calibrated: 80, name: 'disponible, con el nivel que elige la app' },
  ]) {
    cloudTest(`B14. Simular con Adaptativo, ${scenario.name}`, async ({ page, cloud }, info) => {
      cloudTest.setTimeout(300_000);
      const project = info.project.name;
      const bank = createFakeBankStore();
      attachBank(cloud, bank);
      seedBank(bank, 80);
      const model = createFakeModelStore();
      attachModel(cloud, model);
      // Cuántas de las 80 preguntas ya tienen dificultad calculada con las respuestas de otros alumnos
      seedCalibration(model, bank, scenario.calibrated);
      openBank(cloud);
      cloud.setFeatureFlags({ freeTrial: true });
      await enterWithLink(page, cloud, ADAPTIVE_STUDENT, 'Ana');
      await reloadWithServerFlags(page);

      await page.goto(SCREENS.simulatorSetup.path);
      const practice = card(page, t.simulator.setupTitle);
      await expect(practice).toBeVisible({ timeout: 60_000 });
      if (scenario.calibrated < 50) {
        await expect(practice.getByText(adaptiveTexts.calibrating(50))).toBeVisible();
        await capture(page, '12-simular-adaptativo-calibrando', project, { element: practice });
        return;
      }
      // Con la dificultad calculada la opción aparece, y al prenderla el nivel lo elige la app
      const adaptive = practice.getByRole('checkbox', { name: adaptiveTexts.label });
      await expect(adaptive).toBeVisible({ timeout: 60_000 });
      await adaptive.check();
      await expect(practice.getByText(adaptiveTexts.difficultyLocked)).toBeVisible();
      await capture(page, '13-simular-adaptativo-disponible', project, { element: practice });
    });
  }

  cloudTest(
    'B14. Calibración, aviso de más de 48 horas, ajustes del modelo en Plataforma, historial de Acuerdo y marca de la noche',
    async ({ page, cloud, context }, info) => {
      cloudTest.setTimeout(600_000);
      const project = info.project.name;
      const { bank, users } = teamBank(cloud, [ADMIN, PHYSICIAN]);
      const doctor = users[1];
      if (!doctor) throw new Error('Falta la médica');
      const model = createFakeModelStore();
      attachModel(cloud, model);
      await attachCalibrationAdmin(context, cloud, model);
      seedRuns(model, { lastOkHoursAgo: 3, count: 8, parity: false });
      model.settings.calibration.enabled = true;
      model.itemCounts = { physician_estimate: 260, provisional: 30, calibrated: 10 };
      model.population = {
        ...emptyPopulation(),
        available: true,
        runAt: new Date().toISOString(),
        topics: {
          'pediatrics/neonatology': { students: 96, accuracy: 0.58, difficulty: 0.31 },
          'internal_medicine/cardiology': { students: 74, accuracy: 0.61, difficulty: 0.22 },
          'general_surgery/acute_abdomen': { students: 52, accuracy: 0.64, difficulty: 0.1 },
        },
        motives: {
          pediatrics: { reports: 830, knowledge: 0.41, time: 0.08, fatigue: 0.06 },
          internal_medicine: { reports: 612, knowledge: 0.37, time: 0.11, fatigue: 0.09 },
        },
        fatigue: { state: 'calibrating', students: 25, longSessions: 120 },
      };

      // La calibración con su última corrida y la paridad que falla
      await enterTeam(page, cloud, ADMIN.email);
      await page.goto(SCREENS.calibrationAdmin.path);
      await expect(card(page, admin.status.title)).toBeVisible({ timeout: 60_000 });
      await expect(card(page, admin.runs.title).getByRole('listitem').first()).toBeVisible();
      await capture(page, '04-calibracion-admin', project, { maxHeight: 2600 });

      // Pasaron más de 48 horas sin una corrida buena
      seedRuns(model, { lastOkHoursAgo: 60, count: 3 });
      await page.reload();
      await expect(page.getByText(admin.status.stale.title)).toBeVisible({ timeout: 60_000 });
      await capture(page, '05-calibracion-aviso-48-horas', project, {
        element: card(page, admin.status.title),
      });

      // Plataforma, con la sección del modelo del alumno
      await page.goto(SCREENS.adminSettings.path);
      const settings = card(page, admin.settings.title);
      await expect(settings).toBeVisible({ timeout: 60_000 });
      await capture(page, '06-plataforma-modelo-del-alumno', project, { element: settings });

      // El historial de Acuerdo, con una noche que no coincide
      seedRuns(model, { lastOkHoursAgo: 3, count: 8, parity: false });
      await page.goto('about:blank');
      await enterTeam(page, cloud, PHYSICIAN.email);
      await page.goto(SCREENS.agreement.path);
      const history = card(page, admin.agreementHistory.title);
      await expect(history.getByRole('table')).toBeVisible({ timeout: 60_000 });
      await capture(page, '07-acuerdo-historial-por-noche', project, { element: history });

      // Reportes, con la marca que dejó la noche
      const [question] = seedQuestions(bank, 1, {
        status: 'draft',
        origin: 'app',
        authorId: doctor.id,
      });
      if (!question) throw new Error('Sin pregunta sembrada');
      assignQuestion(bank, question.questionId, doctor.id, 'author');
      const version = latestVersionOf(bank, question.questionId);
      const option = version.options.find((item) => !item.isCorrect);
      if (!option) throw new Error('La pregunta no trae distractores');
      bank.distractorFlags.push({
        id: '0f000000-0000-4000-8000-000000000014',
        questionId: question.questionId,
        optionId: option.optionId,
        versionId: version.id,
        exposures: 140,
        choices: 3,
        attraction: 3 / 140,
        status: 'open',
        flaggedAt: new Date(Date.now() - 6 * 3_600_000).toISOString(),
        resolvedAt: null,
        resolvedBy: null,
        note: null,
      });
      await page.goto(SCREENS.contentReports.path);
      const queue = card(page, physicianText.distractors.title);
      await expect(queue.getByText(/^Calculado la noche del /)).toBeVisible({ timeout: 60_000 });
      await capture(page, '08-reportes-marca-de-la-noche', project, { element: queue });
    },
  );
});

demoTest.describe('Privacidad con el texto nuevo', () => {
  demoTest(
    'B14. Privacidad con el texto nuevo del permiso de mejora con tus datos sin nombre',
    async ({ page }, info) => {
      demoTest.setTimeout(300_000);
      const project = info.project.name;
      await generateDemo(page);
      await page.goto(`${SCREENS.settings.path}?seccion=privacy`);
      const consents = card(page, t.settings.privacy.consentsTitle);
      await expect(consents).toBeVisible({ timeout: 60_000 });
      const [label] = consentTexts.purposes.anonymized_improvement;
      await expect(consents.getByRole('checkbox', { name: label })).toBeVisible();
      await expect(consents.getByText(consentTexts.withdrawal)).toBeVisible();
      await capture(page, '14-privacidad-texto-nuevo', project, { element: consents });
    },
  );
});

demoTest.describe('Modelo del alumno en la demostración', () => {
  demoTest(
    'B14. La tarjeta de comparación con alumnos simulados, los temas para reforzar y la fatiga del Tutor',
    async ({ page }, info) => {
      demoTest.setTimeout(600_000);
      const project = info.project.name;
      await generateDemo(page);

      await page.goto(SCREENS.progress.path);
      const target = card(page, comparison.title);
      await expect(target).toBeVisible({ timeout: 60_000 });
      await expect(target.getByText(comparison.loading)).toHaveCount(0, { timeout: 180_000 });
      await expect(target.getByText(t.labels.simulatedData).first()).toBeVisible();
      await capture(page, '09-demo-comparacion-simulada', project, { element: target });

      await page.goto('/');
      const weak = card(page, t.home.topicsTitle);
      await expect(weak.getByRole('link', { name: /^Practicar / }).first()).toBeVisible({
        timeout: 60_000,
      });
      await capture(page, '10-demo-temas-para-reforzar', project, { element: weak });

      await page.goto(SCREENS.tutor.path);
      const fatigue = card(page, modelTexts.fatigue.title);
      await expect(fatigue).toBeVisible({ timeout: 60_000 });
      await capture(page, '11-demo-tutor-fatiga', project, { element: fatigue });
    },
  );
});
