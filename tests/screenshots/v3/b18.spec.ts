// Capturas de cierre de B18, Primeros alumnos (5 del diseño). Quedan en docs/screenshots/v3/b18, en 390, 1280 y 1920 y en
// claro y en oscuro (los seis proyectos de playwright.screenshots.v3.config.ts).
//   01  Inicio con la franja de la encuesta de los primeros días, con sus tres botones
//   02  La pantalla de la encuesta con el aviso de que faltan preguntas y el de que el comentario parece traer un correo
//   03  La confirmación, Listo, gracias
//   04  Configuración, Privacidad, con la línea de la encuesta ya contestada y Borrar mi respuesta, y 04b con la confirmación
//   05  Usuarios, la tarjeta Encuesta de los primeros días con tres respuestas de prueba, el interruptor, los conteos,
//       una tabla por pregunta con su mediana y la lista por código
//   06  La misma tarjeta con solo dos respuestas, que avisa que se puede deducir quién escribió qué y no muestra medianas
//   07  Usuarios, Invitaciones, con el aviso de entrar con el mismo correo y el botón Copiar mensaje de invitación
// Todo corre contra el build con la nube y el Supabase simulado de las e2e de nube (tests/e2e/cloud/README.md). Las
// respuestas del admin son de prueba, cada comentario de ejemplo empieza con [Prueba] y cada toma de la tarjeta del equipo
// (05, 06 y 07) lleva arriba el rótulo Datos simulados. El rótulo lo inyecta esta captura en la imagen y no existe en el
// producto. Ninguna respuesta es de una persona
// npm run screenshots:v3 -- b18.spec.ts
import type { Locator, Page } from '@playwright/test';
import { SCREENS } from '@/app/screens';
import type { SurveyAnswers } from '@/config/surveys';
import { t } from '@/i18n/es-MX';
import { surveyAdminTexts, surveyTexts } from '@/i18n/survey';
import { enterWithLink, expect, test as cloudTest } from '../../e2e/support/cloudFixtures';
import type { FakeSupabaseServer } from '../../e2e/support/fakeSupabase';
import { CLOUD_PREVIEW_URL } from '../../e2e/support/fakeSupabaseConfig';
import { capture, outDirFor } from './capture';

const B18_DIR = outDirFor('b18');

const text = surveyTexts;
const adminText = surveyAdminTexts.card;
const ENABLED = { enabled: true, id: 'first-week-v1', delay_days: 7, accounts_until: null };

const group = (page: Page, label: RegExp) => page.getByRole('group', { name: label });
const scale = (page: Page, label: RegExp, value: number) =>
  group(page, label).getByRole('radio', { name: new RegExp(`^${String(value)}(,|$)`) });
const sendButton = (page: Page) => page.getByRole('button', { name: text.actions.send });

/** El rótulo que lleva cada toma del equipo. Solo vive en la imagen: lo pone la captura y se quita al terminar */
const SIMULATED_LABEL = 'Datos simulados';

/**
 * Pone el rótulo Datos simulados arriba de lo que se va a capturar. Es todo de prueba (respuestas, códigos, conteos,
 * medianas y correos de ejemplo), y el producto no lleva ninguna marca porque en producción no habría nada simulado. Colores
 * propios, para que se lea igual en claro y en oscuro
 */
async function markSimulated(target: Locator) {
  await target.evaluate((element, label) => {
    const banner = document.createElement('p');
    banner.dataset.captureLabel = 'simulated';
    banner.textContent = label;
    banner.style.cssText =
      'margin:0 0 12px;padding:6px 12px;align-self:flex-start;border:1px solid #92400e;border-radius:6px;' +
      'background:#fde68a;color:#1c1917;font:600 14px/1.4 system-ui,sans-serif;';
    element.prepend(banner);
  }, SIMULATED_LABEL);
}

/** Quita el rótulo para que el siguiente paso de la prueba vea la pantalla como es */
async function unmarkSimulated(target: Locator) {
  await target.evaluate((element) => {
    element.querySelectorAll('[data-capture-label="simulated"]').forEach((node) => {
      node.remove();
    });
  });
}

/** Prende la encuesta y hace que la cuenta de la prueba lleve 7 días */
function openSurvey(cloud: FakeSupabaseServer) {
  cloud.setSetting('survey_first_week', ENABLED);
  cloud.survey.advanceDays(7);
}

/** Respuestas de otras personas de prueba, directo en el servidor simulado. Todo comentario dice [Prueba] */
const SEEDED: readonly { code: string; answers: SurveyAnswers; comment: string | null }[] = [
  {
    code: 'R7B21C4',
    answers: {
      days_used: 'd5_6',
      used: ['review', 'practice'],
      clarity: 3,
      ease: 4,
      useful: 5,
      blockers: ['unclear_start'],
      recommend: 'yes',
    },
    comment: '[Prueba] No encontré rápido dónde empezar a simular.',
  },
  {
    code: 'RA03F9E',
    answers: {
      days_used: 'd3_4',
      used: ['review'],
      clarity: 4,
      ease: 4,
      useful: 4,
      blockers: ['slow'],
      recommend: 'maybe',
    },
    comment: null,
  },
  {
    code: 'R5D80A1',
    answers: {
      days_used: 'd7',
      used: ['review', 'practice', 'exam'],
      clarity: 5,
      ease: 3,
      useful: 5,
      blockers: ['nothing'],
      recommend: 'yes',
    },
    comment: '[Prueba] Me gustó repasar todos los días un rato.',
  },
];

/** Todo comentario de ejemplo empieza con [Prueba]. Si alguien agrega uno sin la marca, la captura no corre */
const PRUEBA = '[Prueba]';
for (const seeded of SEEDED) {
  if (seeded.comment !== null && !seeded.comment.startsWith(PRUEBA)) {
    throw new Error(`El comentario de ejemplo de ${seeded.code} no empieza con ${PRUEBA}`);
  }
}

function seedResponses(cloud: FakeSupabaseServer, count: number) {
  for (const [index, seeded] of SEEDED.slice(0, count).entries()) {
    const email = `prueba${String(index + 1)}@ejemplo.mx`;
    cloud.createUser({ email, alias: `Persona de prueba ${String(index + 1)}` });
    cloud.survey.responses.set(cloud.userIdOf(email) ?? '', {
      surveyId: 'first-week-v1',
      code: seeded.code,
      daysSinceSignup: 8 + index,
      answers: seeded.answers,
      comment: seeded.comment,
      answeredAt: Date.now(),
    });
  }
}

/** Contesta las siete preguntas. Lo hace con el teclado, que es lo que la spec de e2e también prueba */
async function answerAll(page: Page) {
  const pick = async (control: Locator) => {
    await control.focus();
    await page.keyboard.press('Space');
  };
  await pick(group(page, /cuántos días/i).getByLabel('5 o 6', { exact: true }));
  await pick(group(page, /qué usaste/i).getByLabel('Repasar', { exact: true }));
  await pick(group(page, /qué usaste/i).getByLabel('Simular por rama', { exact: true }));
  await pick(scale(page, /qué tan claro/i, 4));
  await pick(scale(page, /qué tan fácil/i, 5));
  await pick(scale(page, /qué tan útil/i, 4));
  await pick(group(page, /te frenó/i).getByLabel('Fue lento', { exact: true }));
  await pick(group(page, /recomendarías/i).getByLabel('Sí', { exact: true }));
}

/** Abre una ruta con la dirección completa, que es la del build de nube, y espera su título */
async function open(page: Page, path: string, ...ready: Locator[]) {
  await page.goto(`${CLOUD_PREVIEW_URL}${path}`);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 60_000 });
  for (const locator of ready) await expect(locator).toBeVisible({ timeout: 60_000 });
}

cloudTest.describe('La encuesta de los primeros días', () => {
  cloudTest.use({ baseURL: CLOUD_PREVIEW_URL, serviceWorkers: 'block' });

  cloudTest(
    'B18. La franja, la pantalla con sus avisos, la confirmación y la línea de Privacidad',
    async ({ page, cloud }, info) => {
      cloudTest.setTimeout(300_000);
      const project = info.project.name;
      openSurvey(cloud);
      await enterWithLink(page, cloud, 'ana.b18@ejemplo.mx', 'Ana');

      // 01. Inicio con la franja
      const strip = page.getByRole('region', { name: text.notice.region });
      await expect(strip).toBeVisible({ timeout: 60_000 });
      await page.evaluate(() => {
        window.scrollTo(0, 0);
      });
      await capture(page, B18_DIR, '01-franja-en-inicio', project, { maxHeight: 900 });

      // 02. La pantalla con un faltante y el aviso del comentario. Contesta lo mínimo para ver los dos avisos
      await page.goto(`${CLOUD_PREVIEW_URL}${SCREENS.survey.path}`);
      await expect(sendButton(page)).toBeVisible({ timeout: 60_000 });
      await scale(page, /qué tan fácil/i, 4).focus();
      await page.keyboard.press('Space');
      const comment = page.getByLabel(new RegExp(text.comment.label));
      await comment.fill('[Prueba] Escríbeme a alguien@ejemplo.mx para platicar');
      await comment.blur();
      await sendButton(page).click();
      await expect(
        page.getByRole('alert').filter({ hasText: text.errors.heading(6) }),
      ).toBeVisible();
      await expect(page.getByText(text.comment.problems.email)).toBeVisible();
      await page.evaluate(() => {
        window.scrollTo(0, 0);
      });
      await capture(page, B18_DIR, '02-pantalla-con-avisos', project, { maxHeight: 2400 });

      // 03. Ya contestada y enviada
      await comment.fill('[Prueba] Me costó ubicar Simular al empezar.');
      await answerAll(page);
      await sendButton(page).click();
      await expect(page.getByText(text.states.sent, { exact: true })).toBeVisible({
        timeout: 60_000,
      });
      await capture(page, B18_DIR, '03-gracias', project, { maxHeight: 900 });

      // 04. Configuración, Privacidad, con la línea de la encuesta contestada
      await open(
        page,
        `${SCREENS.settings.path}#privacidad`,
        page.getByRole('region', { name: text.privacyLine.title }),
      );
      await expect(
        page
          .getByRole('region', { name: text.privacyLine.title })
          .getByText(text.privacyLine.answered),
      ).toBeVisible({ timeout: 60_000 });
      const line = page.getByRole('region', { name: text.privacyLine.title });
      await capture(page, B18_DIR, '04-privacidad-con-la-encuesta', project, { element: line });
      await line.getByRole('button', { name: text.actions.erase }).click();
      await expect(line.getByText(text.privacyLine.confirm)).toBeVisible();
      await capture(page, B18_DIR, '04b-privacidad-confirmar-el-borrado', project, {
        element: line,
      });
    },
  );

  cloudTest(
    'B18. La tarjeta del equipo con tres respuestas y con dos, y las invitaciones con el aviso',
    async ({ page, cloud }, info) => {
      cloudTest.setTimeout(300_000);
      const project = info.project.name;
      openSurvey(cloud);
      seedResponses(cloud, 3);
      cloud.createUser({ email: 'admin.b18@ejemplo.mx', alias: 'Admin', role: 'admin' });
      await enterWithLink(page, cloud, 'admin.b18@ejemplo.mx', 'Admin');

      // 05. La tarjeta con tres respuestas, con medianas
      await open(page, SCREENS.adminUsers.path);
      const card = page.getByRole('region', { name: adminText.title });
      await expect(card).toBeVisible({ timeout: 60_000 });
      await expect(card.getByText(/^Mediana /).first()).toBeVisible({ timeout: 60_000 });
      await expect(
        card.getByText('[Prueba] No encontré rápido dónde empezar a simular.'),
      ).toBeVisible();
      await markSimulated(card);
      await expect(card.getByText(SIMULATED_LABEL, { exact: true })).toBeVisible();
      await capture(page, B18_DIR, '05-tarjeta-del-equipo', project, { element: card });
      await unmarkSimulated(card);

      // 06. Con dos respuestas se avisa y no hay medianas
      cloud.survey.responses.delete(cloud.userIdOf('prueba3@ejemplo.mx') ?? '');
      await page.reload();
      await expect(card).toBeVisible({ timeout: 60_000 });
      await expect(card.getByRole('note')).toBeVisible({ timeout: 60_000 });
      await markSimulated(card);
      await expect(card.getByText(SIMULATED_LABEL, { exact: true })).toBeVisible();
      await capture(page, B18_DIR, '06-tarjeta-con-pocas-respuestas', project, { element: card });
      await unmarkSimulated(card);

      // 07. Invitaciones, con una invitación pendiente y su botón de copiar
      const invitations = page.getByRole('region', { name: t.accounts.admin.invitations.title });
      await expect(invitations).toBeVisible({ timeout: 60_000 });
      await invitations
        .getByLabel(t.accounts.admin.invitations.email)
        .fill('primera.alumna@ejemplo.mx');
      await invitations.getByRole('button', { name: t.accounts.admin.invitations.invite }).click();
      await expect(
        invitations.getByRole('button', {
          name: surveyAdminTexts.invitation.copyLabel('primera.alumna@ejemplo.mx'),
        }),
      ).toBeVisible({ timeout: 60_000 });
      await markSimulated(invitations);
      await expect(invitations.getByText(SIMULATED_LABEL, { exact: true })).toBeVisible();
      await capture(page, B18_DIR, '07-invitaciones-con-el-aviso', project, {
        element: invitations,
      });
      await unmarkSimulated(invitations);
    },
  );
});
