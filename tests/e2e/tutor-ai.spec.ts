// Análisis con IA del tutor en un plan de pago (8.1 a 8.5, B12 3.4). Con la demo, que trae 60 días de
// errores, el plan Gratis dice que la IA es de pago. Con el pago simulado y el consentimiento de
// análisis apagado, como empieza desde B1, el tutor no llama a la IA. Al encenderlo desde la propia
// tarjeta, el proxy en modo simulado redacta el informe y los consejos al momento y recibe cada
// hipótesis como un trabajo por lote. La hipótesis aparece primero con el aviso de que viene en camino
// y después con el texto de la IA simulada, y todo va en borrador y con la etiqueta de no validado por
// médico. El consentimiento queda en Privacidad.
import { SCREENS } from '@/app/screens';
import { t } from '@/i18n/es-MX';
import { generateDemo, readTable, subscribeMonthly } from './support/b1';
import { expect, expectNoSeriousA11yViolations, test } from './support/fixtures';

const ENGINE_URL = '/api/ai/';
const JOBS_URL = '/api/ai/jobs/';
const JOB_STATUS_URL = '/api/ai/jobs/status';

interface QueuedJob {
  jobKey: string;
  engine: string;
  queuedAt: string;
}

test('con un plan de pago el análisis se enciende desde el tutor, la hipótesis llega por lote primero pendiente y luego simulada y en borrador, y sin consentimiento no llama a la IA', async ({
  page,
}) => {
  test.setTimeout(360_000);
  // Toda llamada a los motores del proxy pasa por aquí. La revisión de salud no cuenta. Las que
  // asientan costo son las de los motores al momento y las que encolan un trabajo, que al llegar
  // asientan el suyo. Preguntar por el estado de los trabajos no asienta nada
  const everyCall: string[] = [];
  const settling: string[] = [];
  page.on('request', (request) => {
    const path = new URL(request.url()).pathname;
    if (!path.startsWith(ENGINE_URL)) return;
    everyCall.push(path);
    if (request.method() === 'POST' && path !== JOB_STATUS_URL) settling.push(path);
  });
  // El proxy de las pruebas lo comparten todas y reusa el resultado de una misma entrada. Para que el
  // aviso de que viene en camino se vea siempre, y no solo en la primera corrida, el servidor "todavía
  // no termina" cada trabajo hasta que la prueba lo suelta. El proxy de verdad recibe todo y es quien
  // da el resultado cuando se suelta
  let released = false;
  await page.route(`**${JOBS_URL}**`, async (route) => {
    if (released) {
      await route.continue();
      return;
    }
    const request = route.request();
    if (new URL(request.url()).pathname === JOB_STATUS_URL) {
      const asked = request.postDataJSON() as { jobKeys: string[] };
      await route.fulfill({
        json: {
          jobs: asked.jobKeys.map((jobKey) => ({
            jobKey,
            engine: 'forgetting',
            status: 'running',
            queuedAt: new Date().toISOString(),
            readyAt: null,
          })),
        },
      });
      return;
    }
    const real = await route.fetch();
    if (!real.ok()) {
      await route.fulfill({ response: real });
      return;
    }
    const job = (await real.json()) as QueuedJob;
    await route.fulfill({
      status: 202,
      json: {
        jobKey: job.jobKey,
        engine: job.engine,
        status: 'queued',
        queuedAt: job.queuedAt,
        readyAt: null,
      },
    });
  });
  await generateDemo(page);

  // En el plan Gratis la tarjeta manda a los planes
  await page.goto(SCREENS.tutor.path);
  const card = page.getByRole('region', { name: t.tutor.ai.title });
  await expect(card.getByText(t.tutor.ai.freePlan)).toBeVisible({ timeout: 90_000 });
  await expect(card.getByRole('button', { name: t.tutor.ai.turnOn })).toHaveCount(0);
  await card.getByRole('link', { name: t.tutor.ai.seePlans }).click();
  await expect(page).toHaveURL(new RegExp(`${SCREENS.subscription.path}$`));
  await subscribeMonthly(page);

  // De pago y con el consentimiento apagado, el tutor muestra sus hipótesis con plantillas y nada
  // viaja a la IA
  await page.goto(SCREENS.tutor.path);
  await expect(card.getByText(t.tutor.ai.off)).toBeVisible({ timeout: 90_000 });
  await expect(page.getByRole('region', { name: t.tutor.report.title })).toBeVisible();
  await expect(page.getByText(t.tutor.confirmedBadge).first()).toBeVisible();
  await expect(page.getByText(t.tutor.ai.written.mock)).toHaveCount(0);
  await expect(page.getByText(t.tutor.ai.pending)).toHaveCount(0);
  expect(everyCall).toEqual([]);
  expect(await readTable(page, 'aiCallLog', 'demo')).toEqual([]);
  await expectNoSeriousA11yViolations(page);

  // Encenderlo guarda el consentimiento y pide a los motores lo que falta. Las hipótesis quedan en cola
  await card.getByRole('button', { name: t.tutor.ai.turnOn }).click();
  await expect(card.getByText(t.tutor.ai.on)).toBeVisible();
  await expect(card.getByText(t.ai.badge.mock)).toBeVisible();
  const hypothesis = page
    .getByRole('region')
    .filter({ has: page.getByText(t.tutor.confirmedBadge) })
    .first();
  await expect(hypothesis.getByText(t.tutor.ai.pending)).toBeVisible({ timeout: 90_000 });
  // Mientras viene en camino, la hipótesis sigue con su plantilla y sin la etiqueta de la IA
  await expect(hypothesis.getByText(t.tutor.ai.written.mock)).toHaveCount(0);
  await expectNoSeriousA11yViolations(page);

  // Se suelta. El ciclo de lotes del proxy simulado las termina en segundos y la app las recoge sola
  released = true;
  await expect(page.getByText(t.tutor.ai.pending)).toHaveCount(0, { timeout: 90_000 });
  await expect(hypothesis.getByText(t.tutor.ai.written.mock)).toBeVisible();
  await expect(hypothesis.getByText(t.tutor.ai.draft)).toBeVisible();
  await expect(card.getByText(t.tutor.ai.working)).toHaveCount(0, { timeout: 90_000 });
  await expect(card.getByRole('status')).toHaveCount(0);
  await expectNoSeriousA11yViolations(page);

  // Las hipótesis abiertas, el informe y los consejos ya llevan texto de la IA simulada, todos en borrador
  const written = page.getByText(t.tutor.ai.written.mock);
  const drafts = page.getByText(t.tutor.ai.draft);
  expect(await written.count()).toBeGreaterThanOrEqual(3);
  expect(await drafts.count()).toBe(await written.count());
  await expect(
    page.getByRole('region', { name: t.tutor.report.title }).getByText(t.tutor.ai.written.mock),
  ).toBeVisible();

  // Cada hipótesis fue un trabajo y cada resultado entregado quedó una sola vez en la bitácora de
  // costo como simulado. Los motores al momento también. Todo es un artefacto en borrador
  expect(settling.some((path) => path.startsWith(JOBS_URL))).toBe(true);
  expect(everyCall.some((path) => path === JOB_STATUS_URL)).toBe(true);
  const log = await readTable<{ mode: string; outcome: string }>(page, 'aiCallLog', 'demo');
  expect(log).toHaveLength(settling.length);
  expect(log.every((call) => call.mode === 'mock' && call.outcome === 'ok')).toBe(true);
  const artifacts = await readTable<{ status: string; mode: string; kind: string }>(
    page,
    'aiArtifacts',
    'demo',
  );
  const generated = artifacts.filter((artifact) => artifact.mode === 'mock');
  expect(generated.length).toBeGreaterThan(0);
  expect(generated.every((artifact) => artifact.status === 'draft')).toBe(true);
  expect(new Set(generated.map((artifact) => artifact.kind))).toEqual(
    new Set(['hypothesis', 'weekly_report', 'bias_tip']),
  );

  // Al volver al tutor no se pide nada de nuevo, porque todo sigue vigente
  const before = settling.length;
  await page.goto(SCREENS.home.path);
  await page.goto(SCREENS.tutor.path);
  await expect(page.getByText(t.tutor.ai.written.mock).first()).toBeVisible({ timeout: 60_000 });
  expect(settling.length).toBe(before);

  // El consentimiento se ve encendido en Configuración, Privacidad, con su evento
  await page.goto(`${SCREENS.settings.path}#privacidad`);
  await expect(
    page.getByRole('checkbox', { name: t.onboarding.consents.ai_analysis[0] }),
  ).toBeChecked();
  const events = await readTable<{ type: string; payload: { purpose?: string; status?: string } }>(
    page,
    'events',
    'demo',
  );
  expect(
    events
      .filter(
        (event) => event.type === 'consent_changed' && event.payload.purpose === 'ai_analysis',
      )
      .at(-1)?.payload.status,
  ).toBe('granted');
});
