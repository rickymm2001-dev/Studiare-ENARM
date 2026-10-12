// Análisis con IA del tutor en un plan de pago (8.1 a 8.5). Con la demo, que trae 60 días de
// errores, el plan Gratis dice que la IA es de pago. Con el pago simulado y el consentimiento de
// análisis apagado, como empieza desde B1, el tutor no llama a la IA. Al encenderlo desde la propia
// tarjeta, el proxy en modo simulado redacta hipótesis, informe y consejos, cada uno con la etiqueta
// de IA simulada y de borrador no validado por médico, y el consentimiento queda en Privacidad.
import { SCREENS } from '@/app/screens';
import { t } from '@/i18n/es-MX';
import { generateDemo, readTable, subscribeMonthly } from './support/b1';
import { expect, expectNoSeriousA11yViolations, test } from './support/fixtures';

test('con un plan de pago el análisis se enciende desde el tutor, llega simulado y en borrador, y sin consentimiento no llama a la IA', async ({
  page,
}) => {
  test.setTimeout(360_000);
  // Toda llamada a los motores del proxy pasa por aquí. La revisión de salud no cuenta
  const engineCalls: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/api/ai/')) engineCalls.push(request.url());
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
  expect(engineCalls).toEqual([]);
  expect(await readTable(page, 'aiCallLog', 'demo')).toEqual([]);
  await expectNoSeriousA11yViolations(page);

  // Encenderlo guarda el consentimiento y pide a los motores lo que falta, uno por uno
  await card.getByRole('button', { name: t.tutor.ai.turnOn }).click();
  await expect(card.getByText(t.tutor.ai.on)).toBeVisible();
  await expect(card.getByText(t.ai.badge.mock)).toBeVisible();
  await expect(page.getByText(t.tutor.ai.written.mock).first()).toBeVisible({ timeout: 90_000 });
  await expect(page.getByText(t.tutor.ai.draft).first()).toBeVisible();
  await expect(card.getByText(t.tutor.ai.working)).toHaveCount(0, { timeout: 90_000 });
  await expect(card.getByRole('status')).toHaveCount(0);
  await expectNoSeriousA11yViolations(page);

  // Las hipótesis abiertas, el informe y los consejos ya llevan texto de la IA simulada, todos en borrador
  const written = page.getByText(t.tutor.ai.written.mock);
  const drafts = page.getByText(t.tutor.ai.draft);
  expect(await written.count()).toBeGreaterThanOrEqual(2);
  expect(await drafts.count()).toBe(await written.count());
  await expect(
    page.getByRole('region', { name: t.tutor.report.title }).getByText(t.tutor.ai.written.mock),
  ).toBeVisible();

  // Cada llamada quedó en la bitácora de costo como simulada y cada resultado es un artefacto en borrador
  expect(engineCalls.length).toBeGreaterThan(0);
  const log = await readTable<{ mode: string; outcome: string }>(page, 'aiCallLog', 'demo');
  expect(log.length).toBe(engineCalls.length);
  expect(log.every((call) => call.mode === 'mock' && call.outcome === 'ok')).toBe(true);
  const artifacts = await readTable<{ status: string; mode: string; kind: string }>(
    page,
    'aiArtifacts',
    'demo',
  );
  const generated = artifacts.filter((artifact) => artifact.mode === 'mock');
  expect(generated.length).toBeGreaterThan(0);
  expect(generated.every((artifact) => artifact.status === 'draft')).toBe(true);
  expect(new Set(generated.map((artifact) => artifact.kind))).toContain('weekly_report');

  // El consentimiento se ve encendido en Configuración, Privacidad, con su evento
  await page.goto(`${SCREENS.settings.path}?seccion=privacy`);
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
