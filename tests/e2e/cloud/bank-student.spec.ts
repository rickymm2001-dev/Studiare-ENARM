// El alumno con el banco en la nube (B11, paquete B, 5 y 6.3 del plan de B11). Con cloudBank apagada
// sigue el banco de demostración con su aviso. Al abrir el banco, Simular elige del catálogo de la nube,
// baja los cuerpos al empezar y el aviso de demostración se va solo. Gratis abre 20 preguntas nuevas
// por día de estudio, contadas en el servidor, y la explicación aparece después de contestar. Un plan
// de pago no tiene tope, pero el freno del servidor avisa. Sin conexión estudia con lo ya bajado. Corre
// contra el Supabase simulado con el banco de tests/e2e/support/fakeBank.ts. Todo el texto es simulado.
import type { Page } from '@playwright/test';
import { SCREENS } from '@/app/screens';
import { cloudBankScreensText as bankText } from '@/i18n/cloudBankScreens';
import { t } from '@/i18n/es-MX';
import { enterWithLink, expect, reloadWithServerFlags, test } from '../support/cloudFixtures';
import { goOffline, openBank, seedBank, setQuota } from '../support/fakeBank';
import { createFakeBankStore } from '../support/fakeBankStore';
import { attachBank, type FakeSupabaseServer } from '../support/fakeSupabase';
import { answerPracticeQuestion, expectNoSeriousA11yViolations } from '../support/fixtures';
import { openFromMenu } from '../support/navigation';

const ANA = 'ana.banco@ejemplo.mx';
const DAY_MS = 86_400_000;

/** El banco simulado enganchado al Supabase de la prueba, con n preguntas publicadas */
function bankWith(cloud: FakeSupabaseServer, questions: number) {
  const store = createFakeBankStore();
  attachBank(cloud, store);
  seedBank(store, questions);
  return store;
}

const rpcCalls = (cloud: FakeSupabaseServer, name: string) =>
  cloud.calls.filter((call) => call.path.endsWith(`/rpc/${name}`)).length;

const demoNotice = (page: Page) => page.getByRole('region', { name: t.labels.demoVersion });
const setup = (page: Page) => page.getByRole('region', { name: t.simulator.setupTitle });

/** Simular con la cantidad elegida, listo para empezar */
async function openSimulator(page: Page, count: '5' | '10' | '20') {
  await page.goto(SCREENS.simulatorSetup.path);
  const practice = setup(page);
  await expect(practice).toBeVisible({ timeout: 30_000 });
  await practice
    .getByRole('combobox', { name: t.simulator.count, exact: true })
    .selectOption(count);
  return practice;
}

/** Entra con el banco abierto y la prueba gratis prendidos en el servidor, como lo hará Ricardo */
async function enterWithOpenBank(page: Page, cloud: FakeSupabaseServer) {
  openBank(cloud);
  cloud.setFeatureFlags({ freeTrial: true });
  await enterWithLink(page, cloud, ANA, 'Ana');
  await reloadWithServerFlags(page);
}

test.describe('Banco en la nube para el alumno', () => {
  test('con el banco cerrado sigue la demostración y al abrirlo Simular elige del catálogo sin el aviso', async ({
    page,
    cloud,
  }) => {
    test.setTimeout(180_000);
    bankWith(cloud, 25);
    await enterWithLink(page, cloud, ANA, 'Ana');
    await expect(demoNotice(page)).toBeVisible();
    await page.goto(SCREENS.simulatorSetup.path);
    await expect(setup(page)).toBeVisible({ timeout: 60_000 });
    // La demostración no le pide nada al banco de la nube
    expect(rpcCalls(cloud, 'catalog_changes')).toBe(0);
    expect(rpcCalls(cloud, 'fetch_questions')).toBe(0);

    // La app lee las banderas del servidor al abrir, así que hay que recargar para que vea el cambio
    openBank(cloud);
    await page.reload();
    await reloadWithServerFlags(page);
    await page.goto(SCREENS.simulatorSetup.path);
    await expect(setup(page).getByText(bankText.bankNote(25))).toBeVisible({ timeout: 30_000 });
    await expect(demoNotice(page)).toHaveCount(0);
    expect(rpcCalls(cloud, 'catalog_changes')).toBeGreaterThan(0);
    // Abrir la pantalla no gasta del tope
    expect(rpcCalls(cloud, 'fetch_questions')).toBe(0);
    await expectNoSeriousA11yViolations(page);
  });

  test('Gratis practica 20 con su explicación al final y la 21 muestra el aviso con la prueba gratis', async ({
    page,
    cloud,
  }) => {
    test.setTimeout(240_000);
    const store = bankWith(cloud, 25);
    await enterWithOpenBank(page, cloud);
    const practice = await openSimulator(page, '20');
    await practice.getByRole('button', { name: t.simulator.start }).click();
    await expect(page.getByText(t.simulator.progress(1, 20), { exact: true })).toBeVisible({
      timeout: 30_000,
    });
    // El servidor contó 20 lecturas nuevas, todas con propósito de práctica
    expect(store.reads).toHaveLength(20);
    expect(new Set(store.reads.map((read) => read.purpose))).toEqual(new Set(['practice']));
    // La explicación no se ve antes de contestar
    await expect(page.getByText(/Explicación simulada/)).toHaveCount(0);
    for (let number = 1; number <= 20; number += 1) {
      await answerPracticeQuestion(page, number, 20);
    }
    // En el resumen, ya contestadas, cada una trae su explicación
    await expect(page.getByText(/Explicación simulada/).first()).toBeVisible();

    await page.goto(SCREENS.simulatorSetup.path);
    const limited = setup(page);
    await expect(limited.getByText(t.simulator.limitReached)).toBeVisible({ timeout: 30_000 });
    await expect(limited.getByRole('link', { name: t.billing.freeTrialCta })).toBeVisible();
    await expect(limited.getByRole('button', { name: t.simulator.start })).toHaveCount(0);
    expect(store.reads).toHaveLength(20);
    await expectNoSeriousA11yViolations(page);
  });

  test('un plan de pago practica sin tope y el freno del servidor avisa cuántas llegaron', async ({
    page,
    cloud,
  }) => {
    test.setTimeout(180_000);
    const store = bankWith(cloud, 10);
    // El freno simulado deja 3 preguntas nuevas por minuto
    setQuota(store, { perMinute: 3 });
    cloud.createUser({ email: ANA, alias: 'Ana' });
    cloud.setSubscription(ANA, {
      plan: 'monthly',
      status: 'active',
      provider: 'stripe',
      currentPeriodEnd: new Date(Date.now() + 20 * DAY_MS).toISOString(),
    });
    await enterWithOpenBank(page, cloud);
    const practice = await openSimulator(page, '5');
    await expect(
      page
        .getByRole('region', { name: t.simulator.stats.label })
        .getByText(t.simulator.stats.unlimited)
        .first(),
    ).toBeVisible();
    await practice.getByRole('button', { name: t.simulator.start }).click();
    // Empieza con lo concedido y el marco de la app dice por qué faltó lo demás
    await expect(page.getByText(t.simulator.progress(1, 3), { exact: true })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText(bankText.shortfall.started(3, 5))).toBeVisible();
    await expect(page.getByText(/Vas muy rápido/).first()).toBeVisible();
    expect(store.readAlerts.map((alert) => alert.kind)).toContain('brake');
    await expectNoSeriousA11yViolations(page);
    await page.getByRole('button', { name: bankText.shortfall.dismiss }).click();
    await expect(page.getByText(bankText.shortfall.started(3, 5))).toHaveCount(0);
  });

  test('sin conexión estudia con lo que ya bajó', async ({ page, context, cloud }) => {
    test.setTimeout(180_000);
    // Un banco de 20 del que solo se bajan 5 (M2 de la revisión de B11)
    const store = bankWith(cloud, 20);
    await enterWithOpenBank(page, cloud);
    // Con conexión baja cinco preguntas al empezar
    const practice = await openSimulator(page, '5');
    await practice.getByRole('button', { name: t.simulator.start }).click();
    await expect(page.getByText(t.simulator.progress(1, 5), { exact: true })).toBeVisible({
      timeout: 30_000,
    });
    expect(store.reads).toHaveLength(5);
    const fetches = rpcCalls(cloud, 'fetch_questions');

    // Sin red vuelve a Simular desde el menú y empieza otra práctica con lo bajado
    await goOffline(context);
    await openFromMenu(page, t.navItems.simulate);
    const offline = setup(page);
    await expect(offline).toBeVisible({ timeout: 30_000 });
    await offline.getByRole('combobox', { name: t.simulator.count, exact: true }).selectOption('5');
    await offline.getByRole('button', { name: t.simulator.start }).click();
    await expect(page.getByText(t.simulator.progress(1, 5), { exact: true })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText(t.offlineBanner)).toBeVisible();
    // Las cinco salen de lo ya bajado y el marco lo dice
    await expect(page.getByText(bankText.shortfall.fromStored)).toBeVisible();
    expect(rpcCalls(cloud, 'fetch_questions')).toBe(fetches);
    await context.setOffline(false);
  });
});
