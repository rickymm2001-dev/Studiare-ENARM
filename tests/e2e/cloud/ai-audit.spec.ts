// La compuerta 1 de la IA con la nube simulada (B12, 5 y 7.5). El admin importa una muestra de textos que
// escribió la IA y asigna a dos médicos. Cada uno califica sin ver al otro. El admin cierra la muestra, ve
// el veredicto por motor que calcula la base, abre el motor de consejos y un alumno de pago ya recibe
// consejos con IA. También cierra el motor y pausa la IA para todos. La función de la compuerta es el
// doble de las pruebas unitarias (src/data/testing/fakeAiGateServer.ts) y la de IA, la de fakeAi.ts.
import type { Browser, Page } from '@playwright/test';
import { biasTipInput } from '@/ai/testing/aiSamples';
import { SCREENS } from '@/app/screens';
import { aiAuditText } from '@/i18n/aiAudit';
import { adminText } from '@/i18n/admin';
import { t } from '@/i18n/es-MX';
import { enterTeam } from '../support/bankTeam';
import {
  enterWithLink,
  expect,
  openSecondDevice,
  test,
  type SecondDevice,
} from '../support/cloudFixtures';
import { attachAi, type FakeSupabaseServer } from '../support/fakeSupabase';
import { expectNoSeriousA11yViolations } from '../support/fixtures';
import { seedTutorHistory } from '../support/tutorHistory';

const reviewer = aiAuditText.reviewer;
const admin = aiAuditText.admin;

const ADMIN = { email: 'admin.audit@ejemplo.mx', alias: 'Admin' } as const;
const LUCIA = { email: 'lucia.audit@ejemplo.mx', alias: 'Lucía' } as const;
const MATEO = { email: 'mateo.audit@ejemplo.mx', alias: 'Mateo' } as const;
const NADIE = { email: 'nadia.audit@ejemplo.mx', alias: 'Nadia' } as const;
const ANA = 'ana.audit@ejemplo.mx';
const DAY_MS = 86_400_000;
const FUNCTION_URL = 'https://fakeproj.supabase.co/functions/v1/ai-proxy';
const SAMPLE_ID = 'b12-prueba';
const TEXTS = 6;
const SECRET_COMMENT = 'Comentario que solo debe ver Mateo';

/** Las cuentas del equipo médico y la alumna de pago */
function accounts(cloud: FakeSupabaseServer) {
  cloud.createUser({ email: ADMIN.email, alias: ADMIN.alias, role: 'admin' });
  cloud.createUser({ email: LUCIA.email, alias: LUCIA.alias, role: 'physician' });
  cloud.createUser({ email: MATEO.email, alias: MATEO.alias, role: 'physician' });
  cloud.createUser({ email: NADIE.email, alias: NADIE.alias, role: 'physician' });
  cloud.createUser({ email: ANA, alias: 'Ana' });
  cloud.setSubscription(ANA, {
    plan: 'monthly',
    status: 'active',
    provider: 'stripe',
    currentPeriodEnd: new Date(Date.now() + 20 * DAY_MS).toISOString(),
  });
}

/** Otro navegador con la sesión de alguien del equipo, ya dentro de Auditoría de la IA */
async function openAudit(
  browser: Browser,
  cloud: FakeSupabaseServer,
  consoleErrors: string[],
  email: string,
): Promise<SecondDevice> {
  const device = await openSecondDevice(browser, cloud, consoleErrors);
  await enterTeam(device.page, cloud, email);
  await device.page.goto(SCREENS.aiAudit.path);
  await expect(
    device.page.getByRole('heading', { level: 1, name: t.screens.aiAudit.title }),
  ).toBeVisible();
  return device;
}

/** Elige una opción de la rúbrica del texto que está a la vista */
const choose = (page: Page, group: string, option: string) =>
  page
    .getByRole('group', { name: group })
    .getByRole('button', { name: option, exact: true })
    .click();

/** Califica el texto que está a la vista con una rúbrica completa y buena. Se guarda sola al completarla */
async function rateGood(page: Page, comment?: string) {
  if (comment) await page.getByLabel(reviewer.comment).fill(comment);
  await choose(page, reviewer.accuracy.label, reviewer.accuracy.correct);
  await choose(page, reviewer.grounded.label, reviewer.grounded.yes);
  await choose(page, reviewer.safety.label, reviewer.safety.no);
  await choose(page, reviewer.usefulness.label, '4');
  await choose(page, reviewer.clarity.label, '4');
  await choose(page, reviewer.verdict.label, reviewer.verdict.approved);
  await expect(page.getByText(reviewer.saved, { exact: true })).toBeVisible();
}

/** Califica los textos de la muestra, uno por uno, y pasa de uno a otro con los botones */
async function rateAll(page: Page, firstComment?: string) {
  for (let index = 1; index <= TEXTS; index += 1) {
    await expect(
      page.getByText(reviewer.position(index, TEXTS), { exact: true }).first(),
    ).toBeVisible();
    await rateGood(page, index === 1 ? firstComment : undefined);
    if (index < TEXTS) await page.getByRole('button', { name: reviewer.next, exact: true }).click();
  }
  await expect(page.getByText(reviewer.progress(TEXTS, TEXTS), { exact: true })).toBeVisible();
}

/** La llamada de un alumno de consejos por sesgo, para ver qué contesta el servidor */
async function tipsCall(page: Page): Promise<{ status: number; error?: string }> {
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
  return page.evaluate(
    async ([target, auth, body]) => {
      const response = await fetch(`${target}/ai/bias_tips`, {
        method: 'POST',
        headers: { authorization: `Bearer ${auth}`, 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const parsed = (await response.json()) as { error?: string };
      return { status: response.status, ...(parsed.error ? { error: parsed.error } : {}) };
    },
    [
      FUNCTION_URL,
      token ?? '',
      { studentRef: 'e2e-alumno-0001', promptVersion: 'bias_tips.local.v1', input: biasTipInput() },
    ] as const,
  );
}

test.describe('Auditoría de la IA', () => {
  test('el admin importa la muestra y asigna a dos médicos, cada uno califica sin ver al otro, y al abrir el motor el alumno recibe consejos con IA', async ({
    page,
    browser,
    cloud,
    consoleErrors,
  }) => {
    test.setTimeout(420_000);
    const ai = attachAi(cloud);
    accounts(cloud);

    // Antes de la auditoría los motores siguen cerrados para el alumno
    const student = await openSecondDevice(browser, cloud, consoleErrors);
    await enterWithLink(student.page, cloud, ANA);
    await seedTutorHistory(student.page);
    await student.page.goto(SCREENS.tutor.path);
    await expect(
      student.page.getByRole('region', { name: t.tutor.ai.title }).getByText(t.ai.access.gated),
    ).toBeVisible({ timeout: 60_000 });

    // El admin importa una muestra de 6 textos de consejos y asigna a dos médicos
    await enterTeam(page, cloud, ADMIN.email);
    await page.goto(SCREENS.aiAudit.path);
    await expect(page.getByText(admin.samplesEmpty)).toBeVisible({ timeout: 30_000 });
    const file = await ai.sampleFile(SAMPLE_ID, { bias_tips: TEXTS });
    await page.getByLabel(admin.fileLabel).setInputFiles({
      name: `${SAMPLE_ID}.json`,
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(file)),
    });
    await expect(page.getByText(admin.fileSummary(SAMPLE_ID, TEXTS))).toBeVisible();
    await expect(
      page.getByText(admin.fileEngines(aiAuditText.engines.bias_tips, TEXTS)),
    ).toBeVisible();
    // Dos médicos distintos
    await page.getByLabel(admin.reviewer1).selectOption({ label: LUCIA.alias });
    await page.getByLabel(admin.reviewer2).selectOption({ label: LUCIA.alias });
    await expect(page.getByText(admin.sameReviewer)).toBeVisible();
    await expect(page.getByRole('button', { name: admin.import, exact: true })).toBeDisabled();
    await page.getByLabel(admin.reviewer2).selectOption({ label: MATEO.alias });
    await page.getByRole('button', { name: admin.import, exact: true }).click();
    await expect(page.getByText(admin.imported(SAMPLE_ID))).toBeVisible();
    await expect(page.getByText(admin.sampleRow(SAMPLE_ID, TEXTS, admin.statusOpen))).toBeVisible();
    await expectNoSeriousA11yViolations(page);

    // Una médica que no es de la muestra no tiene nada por calificar
    const outsider = await openAudit(browser, cloud, consoleErrors, NADIE.email);
    await expect(outsider.page.getByText(reviewer.empty)).toBeVisible({ timeout: 30_000 });
    await outsider.context.close();

    // Cada médico califica sus 6 textos. Lucía va primero y Mateo deja un comentario que solo él ve
    const lucia = await openAudit(browser, cloud, consoleErrors, LUCIA.email);
    await expect(lucia.page.getByText(reviewer.blindNote)).toBeVisible({ timeout: 30_000 });
    await expect(lucia.page.getByText(reviewer.progress(0, TEXTS), { exact: true })).toBeVisible();
    await rateAll(lucia.page);
    const mateo = await openAudit(browser, cloud, consoleErrors, MATEO.email);
    await expect(mateo.page.getByText(reviewer.progress(0, TEXTS), { exact: true })).toBeVisible({
      timeout: 30_000,
    });
    await rateAll(mateo.page, SECRET_COMMENT);

    // A ciegas: la base entrega a cada uno solo lo suyo y la pantalla de Lucía no trae lo de Mateo
    const luciaId = cloud.userIdOf(LUCIA.email) ?? '';
    const mateoId = cloud.userIdOf(MATEO.email) ?? '';
    expect(ai.gate.reviewsOf(luciaId).size).toBe(TEXTS);
    expect(ai.gate.reviewsOf(mateoId).size).toBe(TEXTS);
    expect([...ai.gate.reviewsOf(luciaId).values()].some((review) => review.comment !== null)).toBe(
      false,
    );
    await lucia.page.reload();
    await expect(
      lucia.page.getByText(reviewer.progress(TEXTS, TEXTS), { exact: true }),
    ).toBeVisible({
      timeout: 30_000,
    });
    await expect(lucia.page.getByText(SECRET_COMMENT)).toHaveCount(0);
    expect(await lucia.page.content()).not.toContain(SECRET_COMMENT);
    await expectNoSeriousA11yViolations(lucia.page);
    await lucia.context.close();
    await mateo.context.close();

    // El admin ve el avance de los dos, cierra la muestra y la base calcula el veredicto
    await page.reload();
    await page.getByRole('button', { name: admin.selectLabel(SAMPLE_ID) }).click();
    const sample = page.getByRole('region', { name: admin.selected(SAMPLE_ID) });
    await expect(
      sample.getByText(admin.reviewerProgress(LUCIA.alias, TEXTS, TEXTS, 0)).first(),
    ).toBeVisible({ timeout: 30_000 });
    await expect(
      sample.getByText(admin.reviewerProgress(MATEO.alias, TEXTS, TEXTS, 0)).first(),
    ).toBeVisible();
    await sample.getByRole('button', { name: admin.closeSample, exact: true }).click();
    await sample.getByRole('button', { name: admin.confirmClose, exact: true }).click();
    await expect(page.getByText(admin.sampleClosed)).toBeVisible();
    const verdict = sample.getByRole('listitem').filter({ hasText: aiAuditText.engines.bias_tips });
    await expect(verdict.getByText(admin.verdictPassed)).toBeVisible();
    await expect(verdict.getByText(/Anclaje 100%/)).toBeVisible();
    await expectNoSeriousA11yViolations(page);

    // Los motores siguen cerrados hasta que el admin abre uno. Abre el de consejos, nada más
    expect(ai.gate.state.engines.bias_tips?.open ?? false).toBe(false);
    await sample
      .getByRole('button', { name: admin.openWith(aiAuditText.engines.bias_tips, SAMPLE_ID) })
      .click();
    await expect(page.getByText(admin.opened(aiAuditText.engines.bias_tips))).toBeVisible();
    expect(ai.gate.state.engines.bias_tips).toMatchObject({ open: true, sampleId: SAMPLE_ID });
    expect(ai.gate.state.engines.weekly_report).toBeUndefined();
    const gateCard = page.getByRole('region', { name: admin.gateTitle });
    await expect(
      gateCard
        .getByRole('listitem')
        .filter({ hasText: aiAuditText.engines.bias_tips })
        .getByText(admin.state.open),
    ).toBeVisible();

    // El alumno ya recibe consejos con IA y lo demás sigue sin IA
    await student.page.goto(SCREENS.home.path);
    await student.page.goto(SCREENS.tutor.path);
    const analysis = student.page.getByRole('region', { name: t.tutor.ai.title });
    await analysis.getByRole('button', { name: t.tutor.ai.turnOn }).click();
    const tips = student.page.getByRole('region', { name: t.tutor.biasTips.title });
    await expect(tips.getByText(t.tutor.ai.written.real)).toBeVisible({ timeout: 60_000 });
    await expect(tips.getByText(t.tutor.ai.draft)).toBeVisible();
    const report = student.page.getByRole('region', { name: t.tutor.report.title });
    await expect(report.getByText(t.tutor.ai.written.real)).toHaveCount(0);
    expect(
      ai
        .engineCalls()
        .filter((call) => call.status === 200)
        .map((call) => call.engine),
    ).toEqual(['bias_tips']);

    // Cerrar el motor lo vuelve a cerrar para el alumno, y el servidor lo hace cumplir
    await gateCard
      .getByRole('button', { name: admin.closeLabel(aiAuditText.engines.bias_tips) })
      .click();
    await expect(page.getByText(admin.closed(aiAuditText.engines.bias_tips))).toBeVisible();
    const closed = await tipsCall(student.page);
    expect(closed).toEqual({ status: 403, error: 'gate_closed' });

    // La pausa frena la IA para todos y quitarla la devuelve
    await sample
      .getByRole('button', { name: admin.openWith(aiAuditText.engines.bias_tips, SAMPLE_ID) })
      .click();
    await expect(page.getByText(admin.opened(aiAuditText.engines.bias_tips))).toBeVisible();
    expect((await tipsCall(student.page)).status).toBe(200);
    await gateCard.getByRole('button', { name: admin.pause, exact: true }).click();
    await expect(page.getByText(admin.pausedDone)).toBeVisible();
    await expect(gateCard.getByText(admin.paused)).toBeVisible();
    expect(await tipsCall(student.page)).toEqual({ status: 503, error: 'paused' });
    await gateCard.getByRole('button', { name: admin.unpause, exact: true }).click();
    await expect(page.getByText(admin.unpausedDone)).toBeVisible();
    expect((await tipsCall(student.page)).status).toBe(200);
    await student.context.close();
  });

  test('las pantallas nuevas pasan axe en claro y en oscuro, la del médico, la del admin y la del costo', async ({
    page,
    browser,
    cloud,
    consoleErrors,
  }) => {
    test.setTimeout(240_000);
    const ai = attachAi(cloud);
    accounts(cloud);
    const adminId = cloud.userIdOf(ADMIN.email) ?? '';
    const luciaId = cloud.userIdOf(LUCIA.email) ?? '';
    const mateoId = cloud.userIdOf(MATEO.email) ?? '';
    // La muestra de cuatro consejos y dos hipótesis, ya asignada. Lucía calificó dos y falta lo demás
    const file = await ai.sampleFile(SAMPLE_ID, { bias_tips: 4, forgetting: 2 });
    const created = ai.gate.call(
      'admin_ai_gate_sample_create',
      { userId: adminId, role: 'admin' },
      { p_sample: file, p_reviewers: [luciaId, mateoId] },
    );
    expect(created?.error).toBeNull();
    for (const item of file.items.slice(0, 2)) {
      const reviewed = ai.gate.call(
        'ai_gate_review',
        { userId: luciaId, role: 'physician' },
        {
          p_item: item.id,
          p_review: {
            accuracy: 'correct',
            grounded: true,
            safetyIssue: false,
            usefulness: 4,
            clarity: 3,
            verdict: 'approved',
            comment: null,
          },
        },
      );
      expect(reviewed?.error).toBeNull();
    }
    // Algo de gasto, para que el costo de la nube tenga qué mostrar
    await ai.setSpentToday(0.4);

    const both = async (target: Page) => {
      await target.emulateMedia({ colorScheme: 'light' });
      await expectNoSeriousA11yViolations(target);
      await target.emulateMedia({ colorScheme: 'dark' });
      await expect(target.locator('html')).toHaveClass(/dark/);
      await expectNoSeriousA11yViolations(target);
      await target.emulateMedia({ colorScheme: 'light' });
    };

    // La médica, con su muestra, un texto a la vista y su rúbrica
    const lucia = await openAudit(browser, cloud, consoleErrors, LUCIA.email);
    await expect(lucia.page.getByText(reviewer.progress(2, 6), { exact: true })).toBeVisible({
      timeout: 30_000,
    });
    await expect(lucia.page.getByRole('group', { name: reviewer.accuracy.label })).toBeVisible();
    await both(lucia.page);
    await lucia.context.close();

    // El admin, con la compuerta, la muestra elegida y el veredicto de una muestra incompleta
    await enterTeam(page, cloud, ADMIN.email);
    await page.goto(SCREENS.aiAudit.path);
    await page.getByRole('button', { name: admin.selectLabel(SAMPLE_ID) }).click();
    const sample = page.getByRole('region', { name: admin.selected(SAMPLE_ID) });
    await expect(
      sample.getByText(admin.reviewerProgress(LUCIA.alias, 2, 6, 0)).first(),
    ).toBeVisible({ timeout: 30_000 });
    await sample.getByRole('button', { name: admin.closeSample, exact: true }).click();
    await sample.getByRole('button', { name: admin.confirmClose, exact: true }).click();
    await expect(page.getByText(admin.sampleClosed)).toBeVisible();
    const hypotheses = sample
      .getByRole('listitem')
      .filter({ hasText: aiAuditText.engines.forgetting });
    await expect(hypotheses.getByText(admin.verdictFailed)).toBeVisible();
    await expect(hypotheses.getByText(admin.reasons.incomplete ?? '')).toBeVisible();
    await both(page);

    // El costo de la nube, con lo que gastó la IA hoy
    await page.goto(SCREENS.aiCosts.path);
    const card = page.getByRole('region', { name: adminText.adminCosts.cloud.title });
    await expect(card.getByText(adminText.adminCosts.cloud.totalCaption(1))).toBeVisible({
      timeout: 30_000,
    });
    await both(page);
  });

  test('un alumno no entra a la auditoría y el costo de la nube lo ve solo el admin', async ({
    page,
    cloud,
  }) => {
    test.setTimeout(120_000);
    attachAi(cloud);
    accounts(cloud);
    await enterWithLink(page, cloud, ANA);
    await page.goto(SCREENS.aiAudit.path);
    // La ruta es del equipo médico. Al alumno le dice que no es suya y no le muestra nada de la auditoría
    await expect(
      page.getByRole('heading', { level: 1, name: t.access.physicianTitle }),
    ).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(aiAuditText.reviewer.blindNote)).toHaveCount(0);
    // Y el costo de la nube es del admin
    await page.goto(SCREENS.aiCosts.path);
    await expect(page.getByRole('heading', { level: 1, name: t.access.adminTitle })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByRole('region', { name: adminText.adminCosts.cloud.title })).toHaveCount(
      0,
    );
  });
});
