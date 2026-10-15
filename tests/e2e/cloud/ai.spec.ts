// La IA alojada con la nube simulada (B12, 7.5). La app habla con la Edge Function ai-proxy, que corre
// dentro de la prueba con el núcleo real y los dobles del paquete A (tests/e2e/support/fakeAi.ts), con
// la sesión, el plan y el dispositivo del Supabase simulado. Gratis ve el candado y el servidor contesta
// plan_required. Un plan de pago con la compuerta cerrada no ve botones de IA, ve el aviso y no sale
// ninguna llamada de motor. Con la compuerta abierta el Tutor trae informe y consejos, encola la
// hipótesis por lote, la prueba corre el ciclo y al volver la hipótesis aparece. Un presupuesto agotado
// se dice como pausa, un dispositivo desplazado tiene su aviso y las reestructuradas son solo del
// equipo. El admin ve el costo de la nube. Todo el texto de la IA es simulado y va en borrador.
import type { Page } from '@playwright/test';
import { biasTipInput, weeklyReportInput } from '@/ai/testing/aiSamples';
import { SCREENS } from '@/app/screens';
import { adminText } from '@/i18n/admin';
import { t } from '@/i18n/es-MX';
import { enterTeam } from '../support/bankTeam';
import { enterWithLink, expect, openSecondDevice, test } from '../support/cloudFixtures';
import { attachAi, type FakeSupabaseServer } from '../support/fakeSupabase';
import { expectNoSeriousA11yViolations } from '../support/fixtures';
import { seedTutorHistory } from '../support/tutorHistory';

const ANA = 'ana.ia@ejemplo.mx';
const ADMIN = 'admin.ia@ejemplo.mx';
const DAY_MS = 86_400_000;
const FUNCTION_URL = 'https://fakeproj.supabase.co/functions/v1/ai-proxy';

const MATERIAL =
  'La metformina es el tratamiento de primera línea de la diabetes mellitus tipo 2. ' +
  'La dosis inicial habitual es de 500 mg cada 12 horas con los alimentos. ' +
  'Nunca debe usarse con una tasa de filtrado glomerular menor de 30 ml/min. ' +
  'La retinopatía diabética se caracteriza por microaneurismas y hemorragias retinianas en el fondo de ojo.';

/** El mensaje del servidor cuando se acaba el presupuesto del día (supabase/functions/_shared/ai/messages.ts) */
const BUDGET_MESSAGE = 'La IA está en pausa por hoy. Vuelve mañana.';
/** Y cuando la cuenta está activa en otro dispositivo */
const OTHER_DEVICE = /activa en otro dispositivo/;

/** Una cuenta con un plan de pago, como la deja un cobro ya aplicado */
function payingStudent(cloud: FakeSupabaseServer, email: string) {
  cloud.createUser({ email, alias: 'Ana' });
  cloud.setSubscription(email, {
    plan: 'monthly',
    status: 'active',
    provider: 'stripe',
    currentPeriodEnd: new Date(Date.now() + 20 * DAY_MS).toISOString(),
  });
}

/** El token de la sesión que guardó Supabase en este navegador */
async function sessionToken(page: Page): Promise<string> {
  const token = await page.evaluate(() => {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (key && /^sb-[a-z0-9-]+-auth-token$/.test(key)) {
        const stored = JSON.parse(localStorage.getItem(key) ?? '{}') as { access_token?: string };
        if (stored.access_token) return stored.access_token;
      }
    }
    return null;
  });
  if (!token) throw new Error('No hay sesión de Supabase en este navegador');
  return token;
}

interface FunctionReply {
  status: number;
  body: { error?: string; message?: string; meta?: { mode?: string }; output?: unknown };
}

/**
 * Llama a la función desde la página, con la sesión del alumno, para ver qué contesta el servidor. El
 * navegador hace la llamada, así pasa por el mismo CORS que las de la app
 */
async function callFunction(
  page: Page,
  path: string,
  body: unknown = {},
  token?: string,
): Promise<FunctionReply> {
  const bearer = token ?? (await sessionToken(page));
  return page.evaluate(
    async ([target, payload, auth]) => {
      const response = await fetch(target, {
        method: 'POST',
        headers: { authorization: `Bearer ${auth}`, 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      return { status: response.status, body: (await response.json()) as FunctionReply['body'] };
    },
    [`${FUNCTION_URL}${path}`, body, bearer] as const,
  );
}

/** El sobre de una llamada con una entrada de ejemplo, igual al que arma la app */
const envelope = (engine: string, input: unknown) => ({
  studentRef: 'e2e-alumno-0001',
  promptVersion: `${engine}.local.v1`,
  input,
});

/** axe en claro y en oscuro, que el tema del sistema decide */
async function expectAccessibleInBothThemes(page: Page) {
  await page.emulateMedia({ colorScheme: 'light' });
  await expectNoSeriousA11yViolations(page);
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveClass(/dark/);
  await expectNoSeriousA11yViolations(page);
  await page.emulateMedia({ colorScheme: 'light' });
}

const cardsRegion = (page: Page) => page.getByRole('region', { name: t.aiCards.title });
const analysisRegion = (page: Page) => page.getByRole('region', { name: t.tutor.ai.title });

test.describe('IA alojada', () => {
  test('Gratis ve el candado y el servidor contesta plan_required aunque la compuerta esté abierta', async ({
    page,
    cloud,
  }) => {
    test.setTimeout(120_000);
    const ai = attachAi(cloud);
    await ai.openEngines('flashcards', 'forgetting', 'weekly_report', 'bias_tips');
    await enterWithLink(page, cloud, ANA, 'Ana');

    await page.goto(SCREENS.decks.path);
    await expect(
      page.getByText(t.billing.featureLocked(t.billing.featureNames.aiCards)),
    ).toBeVisible();
    await expect(cardsRegion(page)).toHaveCount(0);

    // El servidor lo niega por su cuenta, sin importar lo que muestre la app
    const reply = await callFunction(page, '/ai/flashcards');
    expect(reply.status).toBe(403);
    expect(reply.body.error).toBe('plan_required');
    expect(ai.engineCalls().every((call) => call.status === 403)).toBe(true);
    expect(ai.memory.ledger.log).toHaveLength(0);
    await expectNoSeriousA11yViolations(page);
  });

  test('de pago con la compuerta cerrada no hay botones de IA, se ve el aviso y no sale ninguna llamada de motor', async ({
    page,
    cloud,
  }) => {
    test.setTimeout(120_000);
    const ai = attachAi(cloud);
    payingStudent(cloud, ANA);
    await enterWithLink(page, cloud, ANA, 'Ana');

    await page.goto(SCREENS.decks.path);
    const cards = cardsRegion(page);
    await expect(cards).toBeVisible();
    await expect(cards.getByText(t.ai.access.gatedCards)).toBeVisible({ timeout: 30_000 });
    await expect(cards.getByRole('button', { name: t.aiCards.generate })).toHaveCount(0);
    await expectAccessibleInBothThemes(page);

    await page.goto(SCREENS.tutor.path);
    const analysis = analysisRegion(page);
    await expect(analysis.getByText(t.ai.access.gated)).toBeVisible({ timeout: 30_000 });
    await expect(analysis.getByRole('button', { name: t.tutor.ai.turnOn })).toHaveCount(0);
    await expectAccessibleInBothThemes(page);

    // La app solo preguntó cómo está la IA. Ningún motor recibió nada y nada se gastó
    expect(ai.calls.some((call) => call.path === '/health' && call.status === 200)).toBe(true);
    expect(ai.engineCalls()).toEqual([]);
    expect(ai.memory.ledger.log).toHaveLength(0);

    // Y el servidor dice lo mismo: gate_closed para un alumno de pago
    const closed = await callFunction(page, '/ai/flashcards');
    expect(closed.status).toBe(403);
    expect(closed.body.error).toBe('gate_closed');
    // Reestructurar es solo del equipo, esté abierta la compuerta o no
    await ai.openEngines('restructure');
    const staffOnly = await callFunction(page, '/ai/restructure');
    expect(staffOnly.status).toBe(403);
    expect(staffOnly.body.error).toBe('staff_only');
    expect(ai.memory.ledger.log).toHaveLength(0);
  });

  test('con la compuerta abierta el Tutor trae informe y consejos, encola la hipótesis y al correr el ciclo la muestra', async ({
    page,
    cloud,
  }) => {
    test.setTimeout(240_000);
    const ai = attachAi(cloud);
    await ai.openEngines('forgetting', 'weekly_report', 'bias_tips');
    payingStudent(cloud, ANA);
    await enterWithLink(page, cloud, ANA, 'Ana');
    await seedTutorHistory(page);

    // Apagado por omisión: sin el consentimiento nada viaja al servidor
    await page.goto(SCREENS.tutor.path);
    const analysis = analysisRegion(page);
    await expect(analysis.getByText(t.tutor.ai.off)).toBeVisible({ timeout: 60_000 });
    expect(ai.engineCalls()).toEqual([]);

    await analysis.getByRole('button', { name: t.tutor.ai.turnOn }).click();
    await expect(analysis.getByText(t.tutor.ai.on)).toBeVisible();
    await expect(analysis.getByText(t.ai.badge.real)).toBeVisible();

    // El informe y el consejo llegan al momento, con la etiqueta de borrador
    const report = page.getByRole('region', { name: t.tutor.report.title });
    await expect(report.getByText(t.tutor.ai.written.real)).toBeVisible({ timeout: 60_000 });
    await expect(report.getByText(t.tutor.ai.draft)).toBeVisible();
    // El encabezado del resumen ya no dice que es de plantilla fija ni promete la IA para después
    await expect(report.getByText(t.tutor.report.hintAi)).toBeVisible();
    await expect(report.getByText(t.tutor.report.hint)).toHaveCount(0);
    const tips = page.getByRole('region', { name: t.tutor.biasTips.title });
    await expect(tips.getByText(t.tutor.ai.written.real)).toBeVisible({ timeout: 60_000 });
    await expect(tips.getByText(t.tutor.ai.draft)).toBeVisible();

    // La hipótesis va por lote: queda en cola y la tarjeta dice que viene en camino
    const hypothesis = page
      .getByRole('region')
      .filter({ has: page.getByText(t.tutor.confirmedBadge) })
      .first();
    await expect(hypothesis.getByText(t.tutor.ai.pending)).toBeVisible({ timeout: 60_000 });
    await expect(hypothesis.getByText(t.tutor.ai.written.real)).toHaveCount(0);
    const userId = cloud.userIdOf(ANA) ?? '';
    expect(ai.jobsOf(userId).map((job) => [job.engine, job.status])).toEqual([
      ['forgetting', 'queued'],
    ]);
    expect(ai.engineCalls().map((call) => `${call.path} ${String(call.status)}`)).toEqual(
      expect.arrayContaining([
        '/ai/jobs/forgetting 202',
        '/ai/weekly_report 200',
        '/ai/bias_tips 200',
      ]),
    );
    // Lo del lote todavía no cuesta nada. Lo del momento ya se asentó
    expect(ai.memory.ledger.log.map((entry) => entry.engine).sort()).toEqual([
      'bias_tips',
      'weekly_report',
    ]);
    await expectAccessibleInBothThemes(page);

    // La prueba hace de pg_cron: manda el lote, Anthropic lo termina y se recogen los resultados
    const [sent, collected] = await ai.runBatchCycle();
    expect(sent.sent).toBe(1);
    expect(collected.ready).toBe(1);
    expect(ai.jobsOf(userId).map((job) => job.status)).toEqual(['ready']);

    // Al volver al Tutor la app recoge el resultado y la hipótesis ya trae la explicación de la IA
    await page.goto(SCREENS.home.path);
    await page.goto(SCREENS.tutor.path);
    await expect(hypothesis.getByText(t.tutor.ai.written.real)).toBeVisible({ timeout: 60_000 });
    await expect(hypothesis.getByText(t.tutor.ai.draft)).toBeVisible();
    await expect(hypothesis.getByText(t.tutor.ai.pending)).toHaveCount(0);
    // Costó a mitad de precio y se asentó como lote
    const batch = ai.memory.ledger.log.find((entry) => entry.mode === 'batch');
    expect(batch).toMatchObject({ engine: 'forgetting', outcome: 'ok', real: true });
    expect(batch?.costUsd ?? 0).toBeGreaterThan(0);
    await expectAccessibleInBothThemes(page);
  });

  test('si el servidor no tiene clave y responde con respuestas simuladas, el Tutor lo dice', async ({
    page,
    cloud,
  }) => {
    test.setTimeout(240_000);
    const ai = attachAi(cloud, { mode: 'mock' });
    await ai.openEngines('weekly_report', 'bias_tips');
    payingStudent(cloud, ANA);
    await enterWithLink(page, cloud, ANA, 'Ana');
    await seedTutorHistory(page);

    await page.goto(SCREENS.tutor.path);
    const analysis = analysisRegion(page);
    await analysis.getByRole('button', { name: t.tutor.ai.turnOn }).click();
    await expect(analysis.getByText(t.ai.badge.mock)).toBeVisible({ timeout: 60_000 });
    const report = page.getByRole('region', { name: t.tutor.report.title });
    await expect(report.getByText(t.tutor.ai.written.mock)).toBeVisible({ timeout: 60_000 });
    await expect(report.getByText(t.tutor.ai.draft)).toBeVisible();
    // En modo simulado nada gasta
    expect(ai.memory.ledger.log.length).toBeGreaterThan(0);
    expect(ai.memory.ledger.log.every((entry) => !entry.real && entry.costUsd === 0)).toBe(true);
    await expectNoSeriousA11yViolations(page);
  });

  test('con el presupuesto del día agotado las tarjetas avisan que la IA está en pausa y no se inventan', async ({
    page,
    cloud,
  }) => {
    test.setTimeout(120_000);
    const ai = attachAi(cloud);
    await ai.openEngines('flashcards');
    payingStudent(cloud, ANA);
    await enterWithLink(page, cloud, ANA, 'Ana');
    await ai.setSpentToday(5);

    await page.goto(SCREENS.decks.path);
    const cards = cardsRegion(page);
    await expect(cards.getByRole('button', { name: t.aiCards.generate })).toBeVisible({
      timeout: 30_000,
    });
    await cards.getByLabel(t.aiCards.textLabel).fill(MATERIAL);
    await cards.getByRole('button', { name: t.aiCards.generate }).click();
    await expect(cards.getByRole('alert')).toHaveText(BUDGET_MESSAGE, { timeout: 30_000 });
    // El servidor lo frenó antes de llamar al modelo, y la app no tapó la pausa con tarjetas simuladas
    expect(ai.engineCalls().map((call) => [call.path, call.status])).toEqual([
      ['/ai/flashcards', 429],
    ]);
    expect(ai.anthropic.batches.created).toHaveLength(0);
    await expect(cards.getByRole('heading', { name: t.aiCards.resultTitle })).toHaveCount(0);
    await expectNoSeriousA11yViolations(page);

    // Con una pausa del admin pasa lo mismo, con su propio aviso
    await ai.setSpentToday(0);
    ai.pause(true);
    const paused = await callFunction(page, '/ai/flashcards');
    expect(paused.status).toBe(503);
    expect(paused.body.error).toBe('paused');
  });

  test('una cuenta activa en otro dispositivo recibe el aviso del servidor y no gasta', async ({
    page,
    browser,
    cloud,
    consoleErrors,
  }) => {
    test.setTimeout(120_000);
    const ai = attachAi(cloud);
    await ai.openEngines('weekly_report');
    payingStudent(cloud, ANA);
    await enterWithLink(page, cloud, ANA, 'Ana');
    await expect.poll(() => cloud.deviceSessionOf(ANA)?.deviceId).toBeTruthy();
    const firstDevice = cloud.deviceSessionOf(ANA)?.deviceId;
    const token = await sessionToken(page);
    const request = envelope('weekly_report', weeklyReportInput());
    // Mientras es el dispositivo activo, el servidor atiende
    expect((await callFunction(page, '/ai/weekly_report', request, token)).status).toBe(200);

    // Otro navegador toma la cuenta. La sesión del primero sigue siendo válida, pero ya no es la activa
    const second = await openSecondDevice(browser, cloud, consoleErrors);
    await enterWithLink(second.page, cloud, ANA);
    await expect.poll(() => cloud.deviceSessionOf(ANA)?.deviceId).not.toBe(firstDevice);
    const displaced = await callFunction(page, '/ai/weekly_report', request, token);
    expect(displaced.status).toBe(403);
    expect(displaced.body.error).toBe('unauthorized');
    expect(displaced.body.message).toMatch(OTHER_DEVICE);
    // El segundo navegador sí puede, y solo se cobró la llamada buena de cada uno
    expect((await callFunction(second.page, '/ai/weekly_report', request)).status).toBe(200);
    expect(ai.memory.ledger.log).toHaveLength(2);
    await second.context.close();
  });

  test('el admin ve el costo de la IA en la nube por motor, por modo y por alumno', async ({
    page,
    browser,
    cloud,
    consoleErrors,
  }) => {
    test.setTimeout(150_000);
    const ai = attachAi(cloud);
    await ai.openEngines('weekly_report', 'bias_tips');
    payingStudent(cloud, ANA);
    cloud.createUser({ email: ADMIN, alias: 'Admin', role: 'admin' });
    await enterWithLink(page, cloud, ANA, 'Ana');
    // La alumna llama a dos motores, dos veces a uno y una al otro
    const weekly = envelope('weekly_report', weeklyReportInput());
    expect((await callFunction(page, '/ai/weekly_report', weekly)).status).toBe(200);
    expect((await callFunction(page, '/ai/weekly_report', weekly)).status).toBe(200);
    expect(
      (await callFunction(page, '/ai/bias_tips', envelope('bias_tips', biasTipInput()))).status,
    ).toBe(200);

    const admin = await openSecondDevice(browser, cloud, consoleErrors);
    await enterTeam(admin.page, cloud, ADMIN);
    await admin.page.goto(SCREENS.aiCosts.path);
    const text = adminText.adminCosts.cloud;
    const card = admin.page.getByRole('region', { name: text.title });
    await expect(card.getByText(text.totalCaption(3))).toBeVisible({ timeout: 30_000 });
    // Por motor, con las llamadas de cada uno, y por modo
    const engines = card.getByRole('region', { name: text.engineTitle });
    await expect(
      engines.getByRole('row', { name: new RegExp(adminText.adminCosts.engines.weekly_report) }),
    ).toContainText('2');
    await expect(
      engines.getByRole('row', { name: new RegExp(adminText.adminCosts.engines.bias_tips) }),
    ).toContainText('1');
    await expect(
      card.getByRole('region', { name: text.modeTitle }).getByText(text.modes.sync ?? ''),
    ).toBeVisible();
    // Un solo alumno con costo. Sin texto ni correo de nadie
    await expect(card.getByText(text.studentsCaption(1))).toBeVisible();
    await expect(card.getByText(ANA)).toHaveCount(0);
    // Con la nube conectada no se ven los ceros de este navegador ni su aviso de que no hay llamadas,
    // que contradirían a lo que cuenta la nube
    await expect(admin.page.getByText(adminText.adminCosts.empty.title)).toHaveCount(0);
    await expect(
      admin.page.getByRole('region', { name: adminText.adminCosts.stats.label }),
    ).toHaveCount(0);
    await expectNoSeriousA11yViolations(admin.page);
    await admin.context.close();
  });
});
