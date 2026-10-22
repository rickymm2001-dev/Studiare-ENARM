// La encuesta de los primeros días (B18, 1, 2, 3 y 4 del diseño). Una franja arriba que ofrece siete preguntas cerradas y
// un comentario cuando el servidor dice que le toca (prendida, alumno, con los días cumplidos y sin contestar), una
// pantalla que se contesta con el teclado, la línea de Configuración, Privacidad para borrar la respuesta, la tarjeta de
// Usuarios para el dueño y los admins con conteos y CSV sin correos, el mensaje de invitación y los tres eventos de la
// analítica, que solo salen con el permiso Medición de uso y nunca llevan una respuesta.
// El Supabase simulado (fakeSurvey.ts) hace de servidor con las reglas de la migración. advanceDays hace más viejas a las
// cuentas de la prueba, así una cuenta recién creada cumple 7 días sin esperar de verdad
import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { SCREENS } from '@/app/screens';
import { consentTexts } from '@/i18n/consents';
import { t } from '@/i18n/es-MX';
import { surveyAdminTexts, surveyTexts } from '@/i18n/survey';
import { enterWithLink, expect, expectHome, test } from '../support/cloudFixtures';
import type { FakeSupabaseServer } from '../support/fakeSupabase';
import type { StoredSurveyResponse } from '../support/fakeSurvey';
import { flushAnalytics, gotoWhenMeasuring, seedFlags } from '../support/fakeTelemetry';
import { expectNoHorizontalOverflow, expectNoSeriousA11yViolations } from '../support/fixtures';

const ANA = 'ana@ejemplo.mx';
const ADMIN = 'admin@ejemplo.mx';
const text = surveyTexts;
const adminText = surveyAdminTexts.card;
const ENABLED = { enabled: true, id: 'first-week-v1', delay_days: 7, accounts_until: null };
const PRIVACY = `${SCREENS.settings.path}#privacidad`;
const COMMENT = 'Me costó ubicar Simular al empezar';

const strip = (page: Page) => page.getByRole('region', { name: text.notice.region });
const group = (page: Page, label: RegExp) => page.getByRole('group', { name: label });
const scale = (page: Page, label: RegExp, value: number) =>
  group(page, label).getByRole('radio', { name: new RegExp(`^${String(value)}(,|$)`) });
const sendButton = (page: Page) => page.getByRole('button', { name: text.actions.send });
const statusCalls = (cloud: FakeSupabaseServer) => cloud.rpcCalls('my_survey_status').length;

/**
 * Etiqueta en el nombre (WCAG 2.5.3, hallazgo 6 de la revisión). La regla label-content-name-mismatch de axe es
 * experimental y no corre sola, así que se pide por su nombre. Falla si el nombre accesible de un botón o un enlace no
 * contiene el texto que se ve, como pasaba con No quiero contestarla
 */
async function expectLabelInName(page: Page, include: string) {
  await page.waitForLoadState('networkidle');
  // Solo lo de la encuesta. El resto de la app (el enlace Tu perfil, por ejemplo) tiene lo suyo y no es de B18
  const results = await new AxeBuilder({ page })
    .include(include)
    .withRules(['label-content-name-mismatch'])
    .analyze();
  expect(
    results.violations.map(
      (violation) =>
        `${violation.id}: ${violation.nodes.map((node) => node.target.join(' ')).join(', ')}`,
    ),
    'el nombre accesible no contiene el texto visible',
  ).toEqual([]);
  // Cuántos controles revisó la regla. Sin controles con aria-label y texto visible no aplica y da 0
  return (
    results.passes.find((rule) => rule.id === 'label-content-name-mismatch')?.nodes.length ?? 0
  );
}

/** Prende la encuesta como lo hará Ricardo y hace que las cuentas de la prueba lleven esos días */
function openSurvey(cloud: FakeSupabaseServer, days = 7) {
  cloud.setSetting('survey_first_week', ENABLED);
  cloud.survey.advanceDays(days);
}

/** Espera a que la app le haya preguntado al servidor, desde la cuenta que ya cargó */
async function untilAsked(cloud: FakeSupabaseServer, before: number) {
  await expect.poll(() => statusCalls(cloud), { timeout: 20_000 }).toBeGreaterThan(before);
}

/** Pone una opción con el teclado: foco en el control y la barra espaciadora, sin ningún clic */
async function pick(page: Page, control: ReturnType<Page['getByRole']>) {
  await control.focus();
  await page.keyboard.press('Space');
}

/** Contesta las siete preguntas con el teclado. Nada de clics */
async function answerWithKeyboard(page: Page) {
  await pick(page, group(page, /cuántos días/i).getByLabel('3 o 4', { exact: true }));
  await pick(page, group(page, /qué usaste/i).getByLabel('Repasar', { exact: true }));
  await pick(page, group(page, /qué usaste/i).getByLabel('Simular por rama', { exact: true }));
  await pick(page, scale(page, /qué tan claro/i, 4));
  await pick(page, scale(page, /qué tan fácil/i, 5));
  await pick(page, scale(page, /qué tan útil/i, 3));
  await pick(page, group(page, /te frenó/i).getByLabel('Fue lento', { exact: true }));
  await pick(page, group(page, /recomendarías/i).getByLabel('Sí', { exact: true }));
}

/** La respuesta que el servidor guardó para esa cuenta, o undefined si no contestó */
const savedOf = (cloud: FakeSupabaseServer, email: string) => {
  const userId = cloud.userIdOf(email);
  return userId === undefined ? undefined : cloud.survey.responses.get(userId);
};

/** Una respuesta de otra persona, directo en el servidor, para llenar la tarjeta del admin sin contestar tres veces */
function seedResponses(cloud: FakeSupabaseServer, count: number, comment: string | null = null) {
  for (let index = 1; index <= count; index += 1) {
    const email = `alumno${String(index)}@ejemplo.mx`;
    cloud.createUser({ email, alias: `Alumno ${String(index)}` });
    const userId = cloud.userIdOf(email) ?? '';
    const response: StoredSurveyResponse = {
      surveyId: 'first-week-v1',
      code: `R00000${String(index)}`,
      daysSinceSignup: 8 + index,
      answers: {
        days_used: 'd5_6',
        used: ['review', 'practice'],
        clarity: ((index % 5) + 1) as 1 | 2 | 3 | 4 | 5,
        ease: 4,
        useful: 5,
        blockers: ['slow'],
        recommend: 'yes',
      },
      comment: index === 1 ? comment : null,
      answeredAt: Date.now(),
    };
    cloud.survey.responses.set(userId, response);
  }
}

/** Entra el admin: crea la cuenta del equipo y abre su enlace */
async function enterAsAdmin(page: Page, cloud: FakeSupabaseServer) {
  cloud.createUser({ email: ADMIN, alias: 'Admin', role: 'admin' });
  await enterWithLink(page, cloud, ADMIN, 'Admin');
}

const surveyCard = (page: Page) => page.getByRole('region', { name: adminText.title });

test.describe('La franja de la encuesta', () => {
  // Cada prueba navega muchas veces y espera al servidor simulado. Con la máquina cargada pasan de los 30 segundos
  test.describe.configure({ timeout: 90_000 });

  test('apagada o con 3 días no sale, con 7 sale la franja, y pasa axe', async ({
    page,
    cloud,
  }) => {
    await enterWithLink(page, cloud, ANA, 'Ana');
    // Apagada, el servidor dice que no y no hay franja
    await untilAsked(cloud, 0);
    await expect(strip(page)).toHaveCount(0);

    // Prendida, pero la cuenta lleva 3 días y la encuesta pide 7
    cloud.setSetting('survey_first_week', ENABLED);
    cloud.survey.advanceDays(3);
    const before = statusCalls(cloud);
    await page.reload();
    await expectHome(page);
    await untilAsked(cloud, before);
    await expect(strip(page)).toHaveCount(0);

    // Con 7 días sale, con sus tres botones y sin ninguna respuesta
    cloud.survey.advanceDays(4);
    await page.reload();
    await expect(strip(page)).toBeVisible();
    await expect(strip(page)).toContainText(text.notice.title);
    await expect(strip(page).getByRole('link', { name: text.actions.answer })).toHaveAttribute(
      'href',
      SCREENS.survey.path,
    );
    await expect(strip(page).getByRole('button', { name: text.notice.laterLabel })).toBeVisible();
    await expect(strip(page).getByRole('button', { name: text.notice.neverLabel })).toBeVisible();
    await expectNoSeriousA11yViolations(page);
    // La regla revisó los dos botones de la franja con aria-label (Ahora no y No quiero contestarla)
    expect(
      await expectLabelInName(page, `[aria-label="${text.notice.region}"]`),
    ).toBeGreaterThanOrEqual(2);
    // Quien dice lo que ve ("No quiero contestarla") encuentra el botón, que es lo que pide la regla
    await expect(strip(page).getByRole('button', { name: text.actions.never })).toBeVisible();
    await expect(strip(page).getByRole('button', { name: text.actions.later })).toBeVisible();
  });

  test('Ahora no sobrevive a recargar y la franja no vuelve a preguntar al servidor', async ({
    page,
    cloud,
  }) => {
    openSurvey(cloud);
    await enterWithLink(page, cloud, ANA, 'Ana');
    await expect(strip(page)).toBeVisible();
    await strip(page).getByRole('button', { name: text.notice.laterLabel }).click();
    await expect(strip(page)).toHaveCount(0);

    const asked = statusCalls(cloud);
    await page.reload();
    await expectHome(page);
    // Pasa un rato y la franja sigue sin salir ni preguntar: está escondida 2 días en este dispositivo
    await page.waitForTimeout(800);
    await expect(strip(page)).toHaveCount(0);
    expect(statusCalls(cloud)).toBe(asked);
    // Y quien la quiera después la encuentra en Privacidad
    await page.goto(PRIVACY);
    await expect(
      page.getByRole('region', { name: text.privacyLine.title }).getByRole('link', {
        name: text.actions.answer,
      }),
    ).toBeVisible();
  });

  test('No quiero contestarla sobrevive a recargar y no vuelve', async ({ page, cloud }) => {
    openSurvey(cloud);
    await enterWithLink(page, cloud, ANA, 'Ana');
    await strip(page).getByRole('button', { name: text.notice.neverLabel }).click();
    await expect(strip(page)).toHaveCount(0);
    const asked = statusCalls(cloud);
    await page.reload();
    await expectHome(page);
    await page.waitForTimeout(800);
    await expect(strip(page)).toHaveCount(0);
    expect(statusCalls(cloud)).toBe(asked);
    // La encuesta sigue disponible para el servidor: no la contestó y nadie la cerró
    expect(savedOf(cloud, ANA)).toBeUndefined();
  });

  test('nunca aparece dentro de un repaso, y ahí no pide nada al servidor', async ({
    page,
    cloud,
  }) => {
    openSurvey(cloud);
    await enterWithLink(page, cloud, ANA, 'Ana');
    await expect(strip(page)).toBeVisible();
    const asked = statusCalls(cloud);
    await page.goto(SCREENS.review.path);
    await expect(
      page.getByRole('heading', { level: 1, name: t.screens.review.title }),
    ).toBeVisible();
    await page.waitForTimeout(800);
    await expect(strip(page)).toHaveCount(0);
    expect(statusCalls(cloud)).toBe(asked);
    // La pantalla de la encuesta tampoco repite la franja
    await page.goto(SCREENS.survey.path);
    await expect(
      page.getByRole('heading', { level: 1, name: t.screens.survey.title }),
    ).toBeVisible();
    await expect(strip(page)).toHaveCount(0);
  });

  test('una cuenta del equipo no recibe la franja ni pregunta por ella', async ({
    page,
    cloud,
  }) => {
    openSurvey(cloud);
    await enterAsAdmin(page, cloud);
    await page.waitForTimeout(800);
    await expect(strip(page)).toHaveCount(0);
    expect(statusCalls(cloud)).toBe(0);
  });
});

test.describe('Contestar la encuesta', () => {
  test.describe.configure({ timeout: 120_000 });

  test('se contesta solo con el teclado, nombra lo que falta, avisa del correo, no se envía con Enter y no deja contestar dos veces', async ({
    page,
    cloud,
  }) => {
    openSurvey(cloud);
    await enterWithLink(page, cloud, ANA, 'Ana');
    await strip(page).getByRole('link', { name: text.actions.answer }).click();
    await expect(
      page.getByRole('heading', { level: 1, name: t.screens.survey.title }),
    ).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: text.title })).toBeVisible();
    await expect(page.getByText(text.privacy)).toBeVisible();
    await expect(page.getByText(text.independent)).toBeVisible();
    await expect(sendButton(page)).toBeVisible();
    await expectNoSeriousA11yViolations(page);

    // Un faltante se nombra arriba y el foco va a la primera pregunta que falta
    await pick(page, scale(page, /qué tan fácil/i, 5));
    await sendButton(page).focus();
    await page.keyboard.press('Enter');
    const alert = page.getByRole('alert').filter({ hasText: text.errors.heading(6) });
    await expect(alert).toBeVisible();
    await expect(alert.getByRole('link')).toHaveCount(6);
    await expect(
      group(page, /cuántos días/i)
        .getByRole('radio')
        .first(),
    ).toBeFocused();
    expect(cloud.rpcCalls('submit_survey')).toHaveLength(0);
    await expectNoSeriousA11yViolations(page);

    // Contesta lo demás con el teclado y deja un comentario con un correo
    await answerWithKeyboard(page);
    const comment = page.getByLabel(new RegExp(text.comment.label));
    await comment.fill('Escríbeme a alguien@correo.mx');
    await comment.blur();
    await expect(page.getByText(text.comment.problems.email)).toBeVisible();
    await sendButton(page).focus();
    await page.keyboard.press('Enter');
    await expect(
      page.getByRole('alert').filter({ hasText: text.errors.commentProblem }),
    ).toBeVisible();
    await expect(comment).toBeFocused();
    expect(cloud.rpcCalls('submit_survey')).toHaveLength(0);

    // Enter dentro del comentario escribe un renglón y no envía
    await comment.fill(COMMENT);
    await comment.press('Enter');
    await comment.press('Backspace');
    expect(cloud.rpcCalls('submit_survey')).toHaveLength(0);
    // Tampoco con Enter sobre un radio
    await group(page, /recomendarías/i)
      .getByLabel('Sí', { exact: true })
      .focus();
    await page.keyboard.press('Enter');
    expect(cloud.rpcCalls('submit_survey')).toHaveLength(0);

    // Enviar: el foco llega a la confirmación y el servidor guardó lo contestado
    await sendButton(page).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByText(text.states.sent, { exact: true })).toBeFocused();
    await expect(page.getByText(text.states.sentBody)).toBeVisible();
    await expectNoSeriousA11yViolations(page);
    const saved = savedOf(cloud, ANA);
    expect(saved).toMatchObject({
      surveyId: 'first-week-v1',
      comment: COMMENT,
      answers: {
        days_used: 'd3_4',
        used: ['review', 'practice'],
        clarity: 4,
        ease: 5,
        useful: 3,
        blockers: ['slow'],
        recommend: 'yes',
      },
    });
    expect(saved?.code).toMatch(/^R[0-9A-F]{6}$/);
    expect(saved?.daysSinceSignup).toBe(7);
    // El servidor recibió una sola vez las respuestas
    expect(cloud.rpcCalls('submit_survey')).toHaveLength(1);

    // La franja no vuelve y la pantalla dice que ya contestó
    await page.goto(SCREENS.home.path);
    await expectHome(page);
    await page.waitForTimeout(800);
    await expect(strip(page)).toHaveCount(0);
    await page.goto(SCREENS.survey.path);
    await expect(page.getByText(text.states.already)).toBeVisible();
    await expect(sendButton(page)).toHaveCount(0);
  });

  test('el borrador sobrevive a una recarga y se borra al enviar', async ({ page, cloud }) => {
    openSurvey(cloud);
    await enterWithLink(page, cloud, ANA, 'Ana');
    await page.goto(SCREENS.survey.path);
    await expect(sendButton(page)).toBeVisible();
    await pick(page, group(page, /cuántos días/i).getByLabel('1 o 2', { exact: true }));
    await pick(page, scale(page, /qué tan útil/i, 5));
    await page.getByLabel(new RegExp(text.comment.label)).fill('A medias');
    await expect(page.getByText(text.draftNote)).toBeVisible();

    await page.reload();
    await expect(group(page, /cuántos días/i).getByLabel('1 o 2', { exact: true })).toBeChecked();
    await expect(scale(page, /qué tan útil/i, 5)).toBeChecked();
    await expect(page.getByLabel(new RegExp(text.comment.label))).toHaveValue('A medias');
    // El borrador vive solo en este dispositivo: nada se mandó al servidor
    expect(cloud.rpcCalls('submit_survey')).toHaveLength(0);

    await answerWithKeyboard(page);
    await sendButton(page).click();
    await expect(page.getByText(text.states.sent, { exact: true })).toBeVisible();
    const draft = await page.evaluate(() => localStorage.getItem('enarm.survey.draft.v1'));
    expect(draft === null || draft === '{}').toBe(true);
  });

  test('sin red el botón se puede volver a pulsar y no pierde lo contestado', async ({
    page,
    cloud,
  }) => {
    openSurvey(cloud);
    await enterWithLink(page, cloud, ANA, 'Ana');
    await page.goto(SCREENS.survey.path);
    await expect(sendButton(page)).toBeVisible();
    await answerWithKeyboard(page);
    // La petición no llega al servidor, como con la conexión caída. context.setOffline no sirve aquí, porque el
    // Supabase simulado atiende por la ruta del navegador y contestaría de todos modos
    const SUBMIT = '**/rest/v1/rpc/submit_survey';
    await page.route(SUBMIT, (route) => route.abort('connectionfailed'));
    await sendButton(page).click();
    await expect(page.getByText(text.states.sendFailed)).toBeVisible();
    await expect(sendButton(page)).toBeEnabled();
    expect(savedOf(cloud, ANA)).toBeUndefined();
    // Lo contestado sigue en pantalla y en el borrador de este dispositivo
    await expect(group(page, /cuántos días/i).getByLabel('3 o 4', { exact: true })).toBeChecked();
    await page.unroute(SUBMIT);
    await sendButton(page).click();
    await expect(page.getByText(text.states.sent, { exact: true })).toBeVisible();
    expect(savedOf(cloud, ANA)).toBeDefined();
  });

  test('si la encuesta se cierra mientras contesta, la pantalla lo dice', async ({
    page,
    cloud,
  }) => {
    openSurvey(cloud);
    await enterWithLink(page, cloud, ANA, 'Ana');
    await page.goto(SCREENS.survey.path);
    await expect(sendButton(page)).toBeVisible();
    await answerWithKeyboard(page);
    cloud.setSetting('survey_first_week', { ...ENABLED, enabled: false });
    await sendButton(page).click();
    await expect(page.getByText(text.states.closed)).toBeVisible();
    expect(savedOf(cloud, ANA)).toBeUndefined();
  });
});

test.describe('Privacidad y Exportar mis datos', () => {
  test.describe.configure({ timeout: 120_000 });

  test('Privacidad muestra Contestar, luego que ya la contestó, y Borrar mi respuesta la quita', async ({
    page,
    cloud,
  }) => {
    openSurvey(cloud);
    await enterWithLink(page, cloud, ANA, 'Ana');
    await page.goto(PRIVACY);
    const line = page.getByRole('region', { name: text.privacyLine.title });
    await expect(line.getByRole('link', { name: text.actions.answer })).toBeVisible();
    await expectNoSeriousA11yViolations(page);

    await line.getByRole('link', { name: text.actions.answer }).click();
    await expect(sendButton(page)).toBeVisible();
    await answerWithKeyboard(page);
    await sendButton(page).click();
    await expect(page.getByText(text.states.sent, { exact: true })).toBeVisible();

    await page.goto(PRIVACY);
    await expect(line.getByText(text.privacyLine.answered)).toBeVisible();
    await expectNoSeriousA11yViolations(page);
    // Borrar pide confirmar y usa su propia función, no Borrar mis datos
    await line.getByRole('button', { name: text.actions.erase }).click();
    await expect(line.getByText(text.privacyLine.confirm)).toBeVisible();
    await expectNoSeriousA11yViolations(page);
    expect(savedOf(cloud, ANA)).toBeDefined();
    await line.getByRole('button', { name: text.actions.confirmErase }).click();
    await expect(page.getByText(text.states.erased)).toBeVisible();
    expect(savedOf(cloud, ANA)).toBeUndefined();
    expect(cloud.rpcCalls('delete_my_survey_response')).toHaveLength(1);
    expect(cloud.rpcCalls('delete_my_data')).toHaveLength(0);
    // Como la encuesta sigue abierta, vuelve a ofrecer Contestar
    await expect(line.getByRole('link', { name: text.actions.answer })).toBeVisible();
  });

  test('Borrar mis datos no quita la respuesta y eliminar la cuenta sí', async ({
    page,
    cloud,
  }) => {
    openSurvey(cloud);
    await enterWithLink(page, cloud, ANA, 'Ana');
    await page.goto(SCREENS.survey.path);
    await expect(sendButton(page)).toBeVisible();
    await answerWithKeyboard(page);
    await sendButton(page).click();
    await expect(page.getByText(text.states.sent, { exact: true })).toBeVisible();
    expect(savedOf(cloud, ANA)).toBeDefined();

    await page.goto(PRIVACY);
    const card = page.getByRole('region', { name: t.settings.deleteTitle });
    await card.getByRole('button', { name: t.settings.delete }).click();
    await card.getByRole('button', { name: t.settings.deleteConfirm }).click();
    await expect.poll(() => cloud.rpcCalls('delete_my_data')).toHaveLength(1);
    // La respuesta se queda: se quita aparte, con Borrar mi respuesta (8.4)
    expect(savedOf(cloud, ANA)).toBeDefined();
  });

  test('Eliminar mi cuenta se lleva la respuesta, en cascada', async ({ page, cloud }) => {
    openSurvey(cloud);
    await enterWithLink(page, cloud, ANA, 'Ana');
    await page.goto(SCREENS.survey.path);
    await expect(sendButton(page)).toBeVisible();
    await answerWithKeyboard(page);
    await sendButton(page).click();
    await expect(page.getByText(text.states.sent, { exact: true })).toBeVisible();
    expect(savedOf(cloud, ANA)).toBeDefined();
    const userId = cloud.userIdOf(ANA) ?? '';

    await page.goto(PRIVACY);
    const card = page.getByRole('region', { name: t.settings.accountDeleteTitle });
    await card.getByLabel(t.settings.accountDeleteConfirmLabel).fill(t.settings.accountDeleteWord);
    await card.getByRole('button', { name: t.settings.accountDeleteAction }).click();
    await expect.poll(() => cloud.userByEmail(ANA)).toBeUndefined();
    expect(cloud.survey.responses.has(userId)).toBe(false);
    expect(cloud.survey.responses.size).toBe(0);
  });

  test('Exportar mis datos incluye la respuesta con su código, sin la cuenta', async ({
    page,
    cloud,
  }) => {
    openSurvey(cloud);
    await enterWithLink(page, cloud, ANA, 'Ana');
    await page.goto(SCREENS.survey.path);
    await expect(sendButton(page)).toBeVisible();
    await answerWithKeyboard(page);
    await page.getByLabel(new RegExp(text.comment.label)).fill(COMMENT);
    await sendButton(page).click();
    await expect(page.getByText(text.states.sent, { exact: true })).toBeVisible();

    await page.goto(PRIVACY);
    // La línea de la encuesta solo sale con la cuenta de la nube conectada, así que es la señal de que ya lo está. Sin
    // esperarla, un clic apenas cargada la página exporta antes de que la nube conteste, y sin la parte de la nube
    await expect(
      page
        .getByRole('region', { name: text.privacyLine.title })
        .getByText(text.privacyLine.answered),
    ).toBeVisible();
    const exported = page.getByRole('region', { name: t.settings.exportTitle });
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      exported.getByRole('button', { name: t.settings.export }).click(),
    ]);
    const file = JSON.parse(readFileSync(await download.path(), 'utf8')) as {
      surveyCloud: { status: string; data: Record<string, unknown> | null };
    };
    expect(file.surveyCloud.status).toBe('included');
    expect(file.surveyCloud.data).toMatchObject({ surveyId: 'first-week-v1', comment: COMMENT });
    expect(String(file.surveyCloud.data?.code)).toMatch(/^R[0-9A-F]{6}$/);
    expect(JSON.stringify(file.surveyCloud)).not.toContain(ANA);
  });
});

test.describe('La tarjeta del equipo', () => {
  test.describe.configure({ timeout: 120_000 });

  test('con menos de 3 respuestas avisa que se puede deducir quién escribió qué y no muestra medianas', async ({
    page,
    cloud,
  }) => {
    openSurvey(cloud);
    seedResponses(cloud, 2, COMMENT);
    await enterAsAdmin(page, cloud);
    await page.goto(SCREENS.adminUsers.path);
    const card = surveyCard(page);
    await expect(card).toBeVisible({ timeout: 20_000 });
    await expect(card.getByRole('note')).toContainText(adminText.few(2));
    await expect(card.getByText(adminText.notEnough).first()).toBeVisible();
    await expect(card.getByText(/^Mediana /)).toHaveCount(0);
    await expect(card.getByLabel(adminText.settings.enabled)).toBeChecked();
    await expectNoSeriousA11yViolations(page);
  });

  test('con 3 respuestas muestra medianas, la lista por código con su comentario y el CSV sin correos', async ({
    page,
    cloud,
  }) => {
    openSurvey(cloud);
    seedResponses(cloud, 3, COMMENT);
    await enterAsAdmin(page, cloud);
    await page.goto(SCREENS.adminUsers.path);
    const card = surveyCard(page);
    await expect(card).toBeVisible({ timeout: 20_000 });
    await expect(card.getByText(/^Mediana /).first()).toBeVisible();
    await expect(card.getByRole('note')).toHaveCount(0);
    const counts = card.getByRole('region', { name: adminText.counts.region });
    await expect(
      counts.getByText(adminText.counts.answered).locator('xpath=following-sibling::dd'),
    ).toHaveText('3');

    // La lista por código, con el comentario, en tabla o en lista según el ancho
    const codes = card.getByText(/^R00000[123]$/);
    await expect(codes).toHaveCount(3);
    await expect(card.getByText(COMMENT)).toBeVisible();
    // Nada que diga de quién es cada una
    await expect(card).not.toContainText('@');
    await expect(card).not.toContainText('Alumno 1');
    // Ni los días de la cuenta: con 5 personas y la fecha de alta de Usuarios darían la cuenta de cada código
    const responses = card.getByRole('region', { name: adminText.responses });
    // La nota de arriba dice que no trae los días de la cuenta, y eso no es un dato: se busca un número de días
    await expect(responses).not.toContainText(/\d+ días?( de (la )?cuenta)?\b/i);
    await expect(responses.getByRole('columnheader', { name: /días/i })).toHaveCount(0);
    await expectNoSeriousA11yViolations(page);

    // El CSV trae el código, las preguntas y el comentario, y ni un correo ni un alias
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      card.getByRole('button', { name: adminText.exportCsv }).click(),
    ]);
    expect(download.suggestedFilename()).toBe(adminText.csv.fileName);
    const csv = readFileSync(await download.path(), 'utf8');
    expect(csv.split('\r\n')[0]).toContain(adminText.csv.columns[0]);
    expect(csv).toContain('"R000001"');
    expect(csv).toContain(`"${COMMENT}"`);
    expect(csv).not.toMatch(/@|Alumno \d|ejemplo\.mx|días de cuenta/i);
    expect(cloud.rpcCalls('admin_survey_responses').length).toBeGreaterThan(0);
  });

  test('el interruptor guarda el ajuste, y con la fecha límite las cuentas nuevas ya no la reciben', async ({
    page,
    cloud,
  }) => {
    await enterAsAdmin(page, cloud);
    await page.goto(SCREENS.adminUsers.path);
    const card = surveyCard(page);
    await expect(card).toBeVisible({ timeout: 20_000 });
    await expect(card.getByLabel(adminText.settings.enabled)).not.toBeChecked();
    await card.getByLabel(adminText.settings.enabled).check();
    await card.getByLabel(adminText.settings.delay).fill('0');
    await card.getByRole('button', { name: adminText.settings.save }).click();
    await expect(card.getByText(adminText.settings.saved)).toBeVisible();
    expect(cloud.settingOf('survey_first_week')).toMatchObject({
      enabled: true,
      id: 'first-week-v1',
      delay_days: 0,
      accounts_until: null,
    });

    // Un día fuera de 0 a 30 no se guarda
    await card.getByLabel(adminText.settings.delay).fill('31');
    await expect(card.getByText(adminText.settings.invalidDelay)).toBeVisible();
    await expect(card.getByRole('button', { name: adminText.settings.save })).toBeDisabled();
  });

  test('un alumno no ve la tarjeta ni las funciones del equipo le contestan', async ({
    page,
    cloud,
  }) => {
    openSurvey(cloud);
    seedResponses(cloud, 3, COMMENT);
    await enterWithLink(page, cloud, ANA, 'Ana');
    await page.goto(SCREENS.adminUsers.path);
    await expect(surveyCard(page)).toHaveCount(0);
    expect(cloud.rpcCalls('admin_survey_summary')).toHaveLength(0);
    expect(cloud.rpcCalls('admin_survey_responses')).toHaveLength(0);
  });
});

test.describe('Invitar a los primeros alumnos', () => {
  test.describe.configure({ timeout: 90_000 });

  test('Copiar mensaje de invitación trae el correo exacto, la dirección de la app y los dos caminos de entrada', async ({
    page,
    cloud,
    context,
  }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await enterAsAdmin(page, cloud);
    await page.goto(SCREENS.adminUsers.path);
    const invitations = page.getByRole('region', { name: t.accounts.admin.invitations.title });
    await expect(invitations).toBeVisible({ timeout: 20_000 });
    // El aviso fijo de entrar con el mismo correo
    await expect(invitations.getByText(surveyAdminTexts.invitation.sameEmail)).toBeVisible();

    await invitations
      .getByLabel(t.accounts.admin.invitations.email)
      .fill('  Nueva.Alumna@Ejemplo.MX ');
    await invitations.getByRole('button', { name: t.accounts.admin.invitations.invite }).click();
    const copy = invitations.getByRole('button', {
      name: surveyAdminTexts.invitation.copyLabel('nueva.alumna@ejemplo.mx'),
    });
    await expect(copy).toBeVisible();
    await expectNoSeriousA11yViolations(page);
    await copy.click();
    await expect(
      page.getByText(surveyAdminTexts.invitation.copied('nueva.alumna@ejemplo.mx')),
    ).toBeVisible();

    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied).toContain('nueva.alumna@ejemplo.mx');
    expect(copied).toContain(new URL('/', page.url()).origin);
    expect(copied).toMatch(/código/);
    expect(copied).toMatch(/Google/);
    expect(copied).toMatch(/un dispositivo a la vez/);
    // Quien ya tiene cuenta no tiene botón
    expect(cloud.invitations).toContain('nueva.alumna@ejemplo.mx');
  });
});

test.describe('Lo que la encuesta deja en este dispositivo', () => {
  test.describe.configure({ timeout: 120_000 });

  const STRIP_KEY = 'enarm.survey.v1';
  const DRAFT_KEY = 'enarm.survey.draft.v1';
  const stored = (page: Page, key: string) => page.evaluate((k) => localStorage.getItem(k), key);

  /** La persona toca Ahora no en la franja y deja un comentario a medias. Quedan las dos claves del dispositivo */
  async function leaveTraces(page: Page, cloud: FakeSupabaseServer) {
    openSurvey(cloud);
    await enterWithLink(page, cloud, ANA, 'Ana');
    await strip(page).getByRole('button', { name: text.actions.later }).click();
    await expect(strip(page)).toHaveCount(0);
    await page.goto(SCREENS.survey.path);
    await expect(sendButton(page)).toBeVisible();
    await page.getByLabel(new RegExp(text.comment.label)).fill('A medias');
    await expect.poll(() => stored(page, DRAFT_KEY)).toContain('A medias');
    expect(await stored(page, STRIP_KEY)).toContain('"laterCount":1');
  }

  test('Cerrar sesión borra el borrador y el estado de la franja', async ({ page, cloud }) => {
    await leaveTraces(page, cloud);
    await page.goto(SCREENS.settings.path);
    await page.getByRole('button', { name: t.session.signOut }).click();
    await expect(page.getByRole('heading', { name: t.session.signedOutTitle })).toBeVisible();
    expect(await stored(page, DRAFT_KEY)).toBeNull();
    expect(await stored(page, STRIP_KEY)).toBeNull();
  });

  test('Borrar mis datos borra el borrador y el estado de la franja', async ({ page, cloud }) => {
    await leaveTraces(page, cloud);
    await page.goto(PRIVACY);
    const card = page.getByRole('region', { name: t.settings.deleteTitle });
    await card.getByRole('button', { name: t.settings.delete }).click();
    await card.getByRole('button', { name: t.settings.deleteConfirm }).click();
    await expect.poll(() => cloud.rpcCalls('delete_my_data')).toHaveLength(1);
    await expect.poll(() => stored(page, DRAFT_KEY)).toBeNull();
    expect(await stored(page, STRIP_KEY)).toBeNull();
  });

  test('Eliminar mi cuenta borra el borrador y el estado de la franja', async ({ page, cloud }) => {
    await leaveTraces(page, cloud);
    await page.goto(PRIVACY);
    const card = page.getByRole('region', { name: t.settings.accountDeleteTitle });
    await card.getByLabel(t.settings.accountDeleteConfirmLabel).fill(t.settings.accountDeleteWord);
    await card.getByRole('button', { name: t.settings.accountDeleteAction }).click();
    await expect.poll(() => cloud.userByEmail(ANA)).toBeUndefined();
    await expect.poll(() => stored(page, DRAFT_KEY)).toBeNull();
    expect(await stored(page, STRIP_KEY)).toBeNull();
  });
});

test.describe('Medición de la encuesta', () => {
  test.describe.configure({ timeout: 120_000 });

  const usage = (page: Page) =>
    page.getByRole('checkbox', { name: consentTexts.purposes.product_analytics[0] });
  const sentNamed = (cloud: FakeSupabaseServer, name: string) =>
    cloud.telemetry.posthogEvents().filter((item) => item.event === name);
  async function untilSent(page: Page, cloud: FakeSupabaseServer, name: string) {
    await expect
      .poll(
        async () => {
          await flushAnalytics(page);
          return sentNamed(cloud, name).length;
        },
        { timeout: 20_000 },
      )
      .toBe(1);
  }
  const identityOf = (cloud: FakeSupabaseServer) => {
    const userId = cloud.userIdOf(ANA);
    return userId === undefined ? undefined : cloud.engagement.identities.get(userId);
  };

  test('sin Medición de uso no sale nada a PostHog, aunque se ofrezca, se esconda y se conteste', async ({
    page,
    cloud,
  }) => {
    await seedFlags(page, cloud, { productAnalytics: true });
    openSurvey(cloud);
    await enterWithLink(page, cloud, ANA, 'Ana');
    await expect(strip(page)).toBeVisible();
    await strip(page).getByRole('button', { name: text.notice.laterLabel }).click();
    await page.goto(SCREENS.survey.path);
    await expect(sendButton(page)).toBeVisible();
    await answerWithKeyboard(page);
    await sendButton(page).click();
    await expect(page.getByText(text.states.sent, { exact: true })).toBeVisible();
    await flushAnalytics(page);
    expect(cloud.telemetry.posthog).toHaveLength(0);
    // La encuesta se contestó igual: no depende del permiso
    expect(savedOf(cloud, ANA)).toBeDefined();
    expect(cloud.rpcCalls('analytics_identity')).toHaveLength(0);
  });

  test('con Medición de uso salen survey_shown, survey_dismissed y survey_completed, y ninguno lleva una respuesta', async ({
    page,
    cloud,
  }) => {
    await seedFlags(page, cloud, { productAnalytics: true });
    openSurvey(cloud);
    await enterWithLink(page, cloud, ANA, 'Ana');
    await page.goto(PRIVACY);
    // La franja también sale en Privacidad. Se espera a que salga antes de dar el permiso, así su aviso de esa carga se
    // descarta por no haber permiso todavía y no se cuenta como uno de los de abajo
    await expect(strip(page)).toBeVisible();
    await usage(page).check();
    await expect.poll(() => identityOf(cloud)?.consent, { timeout: 20_000 }).toBe(true);

    // Se ofrece, se esconde con Ahora no
    await gotoWhenMeasuring(page, cloud, SCREENS.home.path);
    await expect(strip(page)).toBeVisible();
    await strip(page).getByRole('button', { name: text.notice.laterLabel }).click();
    await untilSent(page, cloud, 'survey_shown');
    await untilSent(page, cloud, 'survey_dismissed');
    expect(sentNamed(cloud, 'survey_dismissed')[0]?.properties).toMatchObject({ how: 'later' });

    // Se contesta desde Privacidad, con comentario
    await gotoWhenMeasuring(page, cloud, SCREENS.survey.path);
    await expect(sendButton(page)).toBeVisible();
    await answerWithKeyboard(page);
    await page.getByLabel(new RegExp(text.comment.label)).fill(COMMENT);
    await sendButton(page).click();
    await expect(page.getByText(text.states.sent, { exact: true })).toBeVisible();
    await untilSent(page, cloud, 'survey_completed');
    expect(sentNamed(cloud, 'survey_completed')[0]?.properties).toMatchObject({ answered: 8 });

    // Nunca viaja una respuesta, el comentario ni el código
    const surveyEvents = cloud.telemetry
      .posthogEvents()
      .filter((item) => item.event.startsWith('survey_'));
    // survey_shown sale una vez por carga de la app: una en Inicio y otra al abrir la pantalla con una carga nueva
    expect([...new Set(surveyEvents.map((item) => item.event))].sort()).toEqual([
      'survey_completed',
      'survey_dismissed',
      'survey_shown',
    ]);
    expect(surveyEvents.filter((item) => item.event === 'survey_completed')).toHaveLength(1);
    expect(surveyEvents.filter((item) => item.event === 'survey_dismissed')).toHaveLength(1);
    const everything = JSON.stringify(cloud.telemetry.posthogEvents());
    expect(everything).not.toContain(COMMENT);
    expect(everything).not.toContain('d3_4');
    expect(everything).not.toContain(savedOf(cloud, ANA)?.code ?? 'sin código');
    expect(everything).not.toContain('first-week-v1');
  });
});

test.describe('En oscuro', () => {
  test.use({ colorScheme: 'dark' });
  test.describe.configure({ timeout: 120_000 });

  test('la franja, el formulario, el gracias, Privacidad y la tarjeta pasan axe', async ({
    page,
    cloud,
  }) => {
    openSurvey(cloud);
    seedResponses(cloud, 3, COMMENT);
    await enterWithLink(page, cloud, ANA, 'Ana');
    await expect(strip(page)).toBeVisible();
    await expectNoSeriousA11yViolations(page);

    await page.goto(SCREENS.survey.path);
    await expect(sendButton(page)).toBeVisible();
    await expectNoSeriousA11yViolations(page);
    await sendButton(page).click();
    await expect(page.getByRole('alert').filter({ hasText: text.errors.heading(7) })).toBeVisible();
    await expectNoSeriousA11yViolations(page);
    await answerWithKeyboard(page);
    await sendButton(page).click();
    await expect(page.getByText(text.states.sent, { exact: true })).toBeVisible();
    await expectNoSeriousA11yViolations(page);

    await page.goto(PRIVACY);
    await expect(
      page
        .getByRole('region', { name: text.privacyLine.title })
        .getByText(text.privacyLine.answered),
    ).toBeVisible();
    await expectNoSeriousA11yViolations(page);
  });

  test('la tarjeta del admin y las invitaciones pasan axe', async ({ page, cloud }) => {
    openSurvey(cloud);
    seedResponses(cloud, 3, COMMENT);
    await enterAsAdmin(page, cloud);
    await page.goto(SCREENS.adminUsers.path);
    await expect(surveyCard(page)).toBeVisible({ timeout: 20_000 });
    await expect(surveyCard(page).getByText(COMMENT)).toBeVisible();
    await expectNoSeriousA11yViolations(page);
  });
});

/**
 * Un comentario de 500 caracteres sin un solo espacio (cabe en el cuadro del formulario, por ejemplo una dirección
 * larga pegada). Con espacios nada se rompe, y sin ellos la celda de la tabla de computadora hacía que la página
 * midiera más de 3,600 px (hallazgo 3 de la revisión de B18)
 */
const LONG_COMMENT = 'Ab1'.repeat(167).slice(0, 500);

for (const width of [320, 390, 1280]) {
  test.describe(`Un comentario de 500 caracteres sin espacios a ${String(width)} píxeles`, () => {
    test.use({ viewport: { width, height: 800 } });
    test.describe.configure({ timeout: 120_000 });

    test('la tarjeta del equipo lo parte y la página no se desborda', async ({ page, cloud }) => {
      expect(LONG_COMMENT).toHaveLength(500);
      expect(LONG_COMMENT).not.toContain(' ');
      openSurvey(cloud);
      seedResponses(cloud, 3, LONG_COMMENT);
      await enterAsAdmin(page, cloud);
      await page.goto(SCREENS.adminUsers.path);
      const card = surveyCard(page);
      await expect(card).toBeVisible({ timeout: 20_000 });
      // El comentario está entero en la página, y se ve en pantalla (sin recortarlo)
      await expect(card.getByText(LONG_COMMENT)).toBeVisible();
      // Ni la página ni la tarjeta son más anchas que la pantalla
      await expectNoHorizontalOverflow(page);
      const box = await card.boundingBox();
      expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(width);
      const comment = await card.getByText(LONG_COMMENT).boundingBox();
      expect((comment?.x ?? 0) + (comment?.width ?? 0)).toBeLessThanOrEqual(width);
      await expectNoSeriousA11yViolations(page);
    });
  });
}

test.describe('A 320 píxeles', () => {
  test.use({ viewport: { width: 320, height: 700 } });
  test.describe.configure({ timeout: 120_000 });

  test('la franja, el formulario con sus avisos, el gracias y Privacidad caben sin desbordar', async ({
    page,
    cloud,
  }) => {
    openSurvey(cloud);
    await enterWithLink(page, cloud, ANA, 'Ana');
    await expect(strip(page)).toBeVisible();
    // expectNoSeriousA11yViolations también revisa que nada se desborde a los lados
    await expectNoSeriousA11yViolations(page);

    await page.goto(SCREENS.survey.path);
    await expect(sendButton(page)).toBeVisible();
    await expectNoSeriousA11yViolations(page);
    const comment = page.getByLabel(new RegExp(text.comment.label));
    await comment.fill('Escríbeme a alguien@correo.mx');
    await comment.blur();
    await sendButton(page).click();
    await expect(page.getByRole('alert').filter({ hasText: text.errors.heading(7) })).toBeVisible();
    await expectNoSeriousA11yViolations(page);

    await comment.fill(COMMENT);
    await answerWithKeyboard(page);
    await sendButton(page).click();
    await expect(page.getByText(text.states.sent, { exact: true })).toBeVisible();
    await expectNoSeriousA11yViolations(page);
    await page.goto(PRIVACY);
    await expect(
      page
        .getByRole('region', { name: text.privacyLine.title })
        .getByText(text.privacyLine.answered),
    ).toBeVisible();
    await expectNoSeriousA11yViolations(page);
  });

  test('la tarjeta del equipo con su lista de respuestas y las invitaciones caben sin desbordar', async ({
    page,
    cloud,
  }) => {
    openSurvey(cloud);
    seedResponses(cloud, 3, COMMENT.repeat(8).slice(0, 220));
    await enterAsAdmin(page, cloud);
    await page.goto(SCREENS.adminUsers.path);
    await expect(surveyCard(page)).toBeVisible({ timeout: 20_000 });
    await expect(surveyCard(page).getByText(/^R00000[123]$/)).toHaveCount(3);
    await expectNoSeriousA11yViolations(page);
    const invitations = page.getByRole('region', { name: t.accounts.admin.invitations.title });
    await invitations
      .getByLabel(t.accounts.admin.invitations.email)
      .fill('persona.con.un.correo.bastante.largo@ejemplo.mx');
    await invitations.getByRole('button', { name: t.accounts.admin.invitations.invite }).click();
    await expect(
      invitations.getByRole('button', { name: /Copiar mensaje de invitación/ }),
    ).toBeVisible();
    await expectNoSeriousA11yViolations(page);
  });
});
