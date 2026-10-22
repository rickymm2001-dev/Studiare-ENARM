// Medición de uso con permiso (B15, paquete B, 1.1 a 1.5 y 6.4 del plan de B15). Lo más importante del bloque
// es que sin el permiso del alumno no sale ni un evento. El build de nube de estas pruebas lleva una llave de
// PostHog y un host simulados (playwright.config.ts), así que si la app midiera sin permiso, fakeTelemetry.ts
// lo vería llegar. Cada prueba que dice "no sale nada" tiene antes o después un caso que sí mide, para que no
// pase en vacío.
import type { Page } from '@playwright/test';
import { SCREENS } from '@/app/screens';
import { consentTexts } from '@/i18n/consents';
import { t } from '@/i18n/es-MX';
import { enterWithLink, expect, expectHome, test } from '../support/cloudFixtures';
import type { FakeSupabaseServer } from '../support/fakeSupabase';
import {
  COMMON_EVENT_PROPERTIES,
  flushAnalytics,
  gotoWhenMeasuring,
  seedFlags,
  watchRequestedUrls,
} from '../support/fakeTelemetry';
import { FAKE_POSTHOG_HOST, FAKE_POSTHOG_KEY } from '../support/fakeSupabaseConfig';
import { expectNoSeriousA11yViolations } from '../support/fixtures';

const ANA = 'ana@ejemplo.mx';
const PRIVACY = `${SCREENS.settings.path}#privacidad`;
const text = t.settings.privacy;

const usage = (page: Page) =>
  page.getByRole('checkbox', { name: consentTexts.purposes.product_analytics[0] });
const improvement = (page: Page) =>
  page.getByRole('checkbox', { name: consentTexts.purposes.anonymized_improvement[0] });
const scoreCard = (page: Page) => page.getByRole('region', { name: text.scoreTitle });

/** El identificador de la cuenta en el servidor simulado, o undefined si todavía no lo tiene */
const identityOf = (cloud: FakeSupabaseServer, email: string) => {
  const userId = cloud.userIdOf(email);
  return userId === undefined ? undefined : cloud.engagement.identities.get(userId);
};

/**
 * Espera a que el servidor tenga el permiso de la cuenta en ese valor. Es una señal real, la llamada del guardián,
 * y con la máquina cargada tarda más que los 5 segundos de siempre
 */
const serverConsentIs = (cloud: FakeSupabaseServer, granted: boolean) =>
  expect.poll(() => identityOf(cloud, ANA)?.consent, { timeout: 20_000 }).toBe(granted);

/** Los eventos que llegaron a PostHog con ese nombre */
const sentNamed = (cloud: FakeSupabaseServer, name: string) =>
  cloud.telemetry.posthogEvents().filter((item) => item.event === name);

/** Espera a que lleguen n eventos con ese nombre, pidiendo a la analítica que entregue lo que tenga en cola */
async function untilSent(page: Page, cloud: FakeSupabaseServer, name: string, count = 1) {
  await expect
    .poll(
      async () => {
        await flushAnalytics(page);
        return sentNamed(cloud, name).length;
      },
      // Margen para el envío con la máquina cargada. Que el evento salga lo decide haber esperado a la medición
      // antes de la acción (gotoWhenMeasuring), no este plazo
      { timeout: 20_000 },
    )
    .toBe(count);
}

/**
 * Otros eventos de la lista cerrada pueden salir mientras la prueba navega, por ejemplo paywall_viewed cuando
 * Inicio enseña una función de pago, y eso es medir bien. Lo que no puede salir es un nombre fuera del catálogo
 */
function expectOnlyCatalogEvents(cloud: FakeSupabaseServer, allowed: readonly string[]) {
  const names = new Set(cloud.telemetry.posthogEvents().map((item) => item.event));
  expect([...names].filter((name) => !allowed.includes(name))).toEqual([]);
}

async function setConsent(page: Page, box: ReturnType<typeof usage>, granted: boolean) {
  await page.goto(PRIVACY);
  await expect(page.getByRole('heading', { name: text.consentsTitle })).toBeVisible();
  await (granted ? box.check() : box.uncheck());
  await expect(page.getByText(text.consentSaved)).toBeVisible();
}

/**
 * Guarda un puntaje oficial en Progreso, que es un evento que la medición cuenta (sin el puntaje). Con cloud, la
 * prueba espera a que la medición esté lista antes de guardarlo, porque se espera que ese evento salga. Sin
 * cloud no espera, que es lo que hace falta cuando el permiso no está dado
 */
async function captureScore(page: Page, score: number, measuredBy?: FakeSupabaseServer) {
  if (measuredBy) await gotoWhenMeasuring(page, measuredBy, SCREENS.progress.path);
  else await page.goto(SCREENS.progress.path);
  const card = scoreCard(page);
  await card.getByLabel(text.score, { exact: true }).fill(String(score));
  await card.getByRole('button', { name: text.saveScore }).click();
  await expect(card.getByText(text.current(new Date().getFullYear(), score))).toBeVisible();
}

test.describe('Medición de uso con permiso', () => {
  // Cada prueba navega muchas veces y espera al servidor simulado. Con la máquina cargada pasan de los 30 segundos
  test.describe.configure({ timeout: 90_000 });

  test('sin el permiso no sale ni un evento aunque la bandera y la llave estén puestas, y al darlo solo se mide lo de después', async ({
    page,
    cloud,
  }) => {
    await seedFlags(page, cloud, { productAnalytics: true });
    const requested = watchRequestedUrls(page);
    await enterWithLink(page, cloud, ANA, 'Ana');

    // Aparece apagado en Privacidad, sin que nadie lo haya dado, y la pantalla cumple axe
    await page.goto(PRIVACY);
    await expect(page.getByRole('heading', { name: text.consentsTitle })).toBeVisible();
    await expect(usage(page)).not.toBeChecked();
    await expect(
      page.getByText(consentTexts.purposes.product_analytics[1], { exact: false }),
    ).toBeVisible();
    await expectNoSeriousA11yViolations(page);

    // Da otro permiso, la mejora, y hace algo que la medición contaría: guardar su puntaje oficial
    await improvement(page).check();
    await expect(page.getByText(text.consentSaved)).toBeVisible();
    await captureScore(page, 72.5);
    await flushAnalytics(page);
    for (const path of [SCREENS.home.path, SCREENS.review.path, SCREENS.settings.path]) {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    }
    await flushAnalytics(page);

    // Nada a PostHog, ni siquiera la pregunta por un identificador al servidor, ni cookies ni almacenamiento
    expect(cloud.telemetry.posthog).toHaveLength(0);
    expect(cloud.rpcCalls('analytics_identity')).toHaveLength(0);
    expect(cloud.rpcCalls('set_analytics_consent')).toHaveLength(0);
    expect(identityOf(cloud, ANA)).toBeUndefined();
    // El código del puente de la bitácora ni se bajó, porque nadie dio el permiso
    expect(requested.filter((url) => url.includes('/fromAppEvents-'))).toEqual([]);
    expect(await page.evaluate(() => document.cookie)).toBe('');
    expect(
      await page.evaluate(() =>
        Object.keys(localStorage).filter((key) => /posthog|^ph_|analytics/i.test(key)),
      ),
    ).toEqual([]);

    // El mismo camino con el permiso sí mide, y solo lo que pasa después de darlo
    await setConsent(page, usage(page), true);
    await serverConsentIs(cloud, true);
    await captureScore(page, 80, cloud);
    await untilSent(page, cloud, 'official_score_captured');
    expectOnlyCatalogEvents(cloud, ['official_score_captured', 'paywall_viewed']);
  });

  test('con el permiso el evento sale con el identificador seudónimo y solo con propiedades de la lista cerrada, sin nada del alumno', async ({
    page,
    cloud,
  }) => {
    await seedFlags(page, cloud, { productAnalytics: true });
    await enterWithLink(page, cloud, ANA, 'Ana');
    await setConsent(page, improvement(page), true);
    await setConsent(page, usage(page), true);
    await serverConsentIs(cloud, true);
    const analyticsId = identityOf(cloud, ANA)?.analyticsId;
    expect(analyticsId).toMatch(/^[0-9a-f-]{36}$/);
    // No es el id de la cuenta ni se parece a él
    expect(analyticsId).not.toBe(cloud.userIdOf(ANA));

    await captureScore(page, 72.5, cloud);
    await untilSent(page, cloud, 'official_score_captured');

    const [request] = cloud.telemetry.posthog;
    expect(request?.method).toBe('POST');
    expect(request?.url).toBe(`${FAKE_POSTHOG_HOST}/batch/`);
    const [event] = sentNamed(cloud, 'official_score_captured');
    expect(event?.api_key).toBe(FAKE_POSTHOG_KEY);
    expect(event?.event).toBe('official_score_captured');
    expect(event?.distinct_id).toBe(analyticsId);
    // El evento del puntaje no lleva propiedades propias, y las comunes son rangos y listas cerradas
    expect(Object.keys(event?.properties ?? {}).sort()).toEqual([...COMMON_EVENT_PROPERTIES]);
    expect(event?.properties).toMatchObject({
      $process_person_profile: false,
      $geoip_disable: true,
      plan_kind: 'free',
      role: 'student',
    });
    // Ni el correo, ni el alias, ni el puntaje, ni el id de la cuenta viajan en ningún lado de la petición
    const everything = JSON.stringify(cloud.telemetry.posthog);
    for (const secret of [ANA, 'Ana', '72.5', cloud.userIdOf(ANA) ?? 'sin-id']) {
      expect(everything, `"${secret}" no debe viajar a PostHog`).not.toContain(secret);
    }
    // Sin cookies ni almacenamiento propios de la medición
    expect(await page.context().cookies(FAKE_POSTHOG_HOST)).toEqual([]);
    expect(
      await page.evaluate(() =>
        Object.keys(localStorage).filter((key) => /posthog|^ph_/i.test(key)),
      ),
    ).toEqual([]);
  });

  test('retirar el permiso corta la medición y cambia el identificador, y volver a darlo no recupera lo anterior', async ({
    page,
    cloud,
  }) => {
    await seedFlags(page, cloud, { productAnalytics: true });
    await enterWithLink(page, cloud, ANA, 'Ana');
    await setConsent(page, improvement(page), true);
    await setConsent(page, usage(page), true);
    await serverConsentIs(cloud, true);
    const first = identityOf(cloud, ANA)?.analyticsId;

    await captureScore(page, 70, cloud);
    await untilSent(page, cloud, 'official_score_captured');
    expect(sentNamed(cloud, 'official_score_captured')[0]?.distinct_id).toBe(first);

    // Lo retira. El servidor se entera y el identificador cambia, así lo que se mida después no se une con lo de antes
    await setConsent(page, usage(page), false);
    await serverConsentIs(cloud, false);
    const rotated = identityOf(cloud, ANA)?.analyticsId;
    expect(rotated).not.toBe(first);

    // Sin permiso ya no sale nada, aunque haga lo mismo que antes
    await flushAnalytics(page);
    const sentBefore = cloud.telemetry.posthog.length;
    await captureScore(page, 75);
    await flushAnalytics(page);
    await page.goto(SCREENS.home.path);
    await expectHome(page);
    await flushAnalytics(page);
    expect(cloud.telemetry.posthog).toHaveLength(sentBefore);
    expect(sentNamed(cloud, 'official_score_captured')).toHaveLength(1);

    // Lo vuelve a dar. Mide otra vez, pero con el identificador nuevo
    await setConsent(page, usage(page), true);
    await serverConsentIs(cloud, true);
    await captureScore(page, 78, cloud);
    await untilSent(page, cloud, 'official_score_captured', 2);
    const last = sentNamed(cloud, 'official_score_captured')[1]?.distinct_id;
    expect(last).toBe(identityOf(cloud, ANA)?.analyticsId);
    expect(last).not.toBe(first);
  });

  test('al crear la cuenta con la casilla marcada se mide el registro, sin cómo nos conoció ni el correo', async ({
    page,
    cloud,
  }) => {
    await seedFlags(page, cloud, { productAnalytics: true });
    await page.goto(SCREENS.onboarding.path);
    await page.getByLabel(t.onboarding.alias, { exact: true }).fill('Ana');
    await page.getByLabel(t.account.email, { exact: true }).fill(ANA);
    await page.getByLabel(t.accounts.signup.adultAccept(18)).check();
    await page.getByLabel(t.onboarding.privacyAccept).check();
    // Empieza apagada, como todos los permisos opcionales del registro
    await expect(usage(page)).not.toBeChecked();
    await expectNoSeriousA11yViolations(page);
    await usage(page).check();
    await page.getByRole('button', { name: t.onboarding.create }).click();
    await expect(page.getByRole('heading', { name: t.cloud.sentTitle })).toBeVisible();

    // Entra con el código en esta misma pestaña, que es la que tiene el evento esperando el identificador
    const email = cloud.lastEmail(ANA);
    if (!email) throw new Error('El servidor simulado no registró el correo');
    const form = page.getByRole('form', { name: t.cloud.code.formLabel });
    await form.getByLabel(t.cloud.code.label).fill(email.code);
    await form.getByRole('button', { name: t.cloud.code.submit }).click();
    await expectHome(page);

    await serverConsentIs(cloud, true);
    await untilSent(page, cloud, 'signup_completed');
    // Mientras corre la prueba también puede salir un paywall_viewed, que es otro evento de la lista
    expectOnlyCatalogEvents(cloud, ['signup_completed', 'paywall_viewed']);
    const [event] = sentNamed(cloud, 'signup_completed');
    expect(event?.distinct_id).toBe(identityOf(cloud, ANA)?.analyticsId);
    // Sin heard_from ni has_code (D-132): solo el método y si puso su especialidad meta
    expect(Object.keys(event?.properties ?? {}).sort()).toEqual(
      [...COMMON_EVENT_PROPERTIES, 'method', 'target_specialty_set'].sort(),
    );
    expect(event?.properties).toMatchObject({ method: 'email', target_specialty_set: false });
    const everything = JSON.stringify(cloud.telemetry.posthog);
    for (const secret of [ANA, 'Ana', cloud.userIdOf(ANA) ?? 'sin-id']) {
      expect(everything, `"${secret}" no debe viajar a PostHog`).not.toContain(secret);
    }
  });

  test('al crear la cuenta sin marcar la casilla no se mide el registro ni se le pide nada al servidor', async ({
    page,
    cloud,
  }) => {
    await seedFlags(page, cloud, { productAnalytics: true });
    await page.goto(SCREENS.onboarding.path);
    await page.getByLabel(t.onboarding.alias, { exact: true }).fill('Ana');
    await page.getByLabel(t.account.email, { exact: true }).fill(ANA);
    await page.getByLabel(t.accounts.signup.adultAccept(18)).check();
    await page.getByLabel(t.onboarding.privacyAccept).check();
    await page.getByRole('button', { name: t.onboarding.create }).click();
    await expect(page.getByRole('heading', { name: t.cloud.sentTitle })).toBeVisible();
    const email = cloud.lastEmail(ANA);
    if (!email) throw new Error('El servidor simulado no registró el correo');
    const form = page.getByRole('form', { name: t.cloud.code.formLabel });
    await form.getByLabel(t.cloud.code.label).fill(email.code);
    await form.getByRole('button', { name: t.cloud.code.submit }).click();
    await expectHome(page);
    await page.goto(PRIVACY);
    await expect(usage(page)).not.toBeChecked();
    await flushAnalytics(page);

    expect(cloud.telemetry.posthog).toHaveLength(0);
    expect(cloud.rpcCalls('analytics_identity')).toHaveLength(0);
    expect(identityOf(cloud, ANA)).toBeUndefined();
  });

  test('con la bandera apagada no sale nada aunque el alumno haya dado el permiso, y la medición ni se baja', async ({
    page,
    cloud,
  }) => {
    // Sin seedFlags, el build de nube de las pruebas nace con productAnalytics apagada
    const requested = watchRequestedUrls(page);
    await enterWithLink(page, cloud, ANA, 'Ana');
    await setConsent(page, improvement(page), true);
    await setConsent(page, usage(page), true);
    await captureScore(page, 72.5);
    await page.goto(SCREENS.home.path);
    await expectHome(page);
    await flushAnalytics(page);

    expect(cloud.telemetry.posthog).toHaveLength(0);
    expect(cloud.rpcCalls('analytics_identity')).toHaveLength(0);
    expect(cloud.rpcCalls('set_analytics_consent')).toHaveLength(0);
    // Ni el guardián ni el puente se descargaron: con la bandera apagada no hay nada que medir
    expect(requested.filter((url) => /\/(AnalyticsGate|fromAppEvents)-/.test(url))).toEqual([]);
  });

  test('la demostración nunca mide, aunque la cuenta real haya dado el permiso en ese navegador', async ({
    page,
    cloud,
  }) => {
    await seedFlags(page, cloud, { productAnalytics: true, demoTools: true });
    await enterWithLink(page, cloud, ANA, 'Ana');
    await setConsent(page, improvement(page), true);
    await setConsent(page, usage(page), true);
    await serverConsentIs(cloud, true);
    await captureScore(page, 72.5, cloud);
    await untilSent(page, cloud, 'official_score_captured');

    // El navegador pasa a la base de demostración, como lo hace quien abre el selector de la demo
    await page.evaluate(() => {
      const key = 'enarm.preferences.v1';
      const stored = JSON.parse(localStorage.getItem(key) ?? '{}') as Record<string, unknown>;
      localStorage.setItem(key, JSON.stringify({ ...stored, database: 'demo' }));
    });
    await flushAnalytics(page);
    const sentBefore = cloud.telemetry.posthog.length;
    const askedBefore = cloud.rpcCalls('analytics_identity').length;
    await page.goto(SCREENS.home.path);
    // Prueba de que de verdad está en la demostración
    await expect(page.getByText(t.database.banner)).toBeVisible();
    for (const path of [SCREENS.review.path, SCREENS.progress.path, SCREENS.settings.path]) {
      await page.goto(path);
      await expect(page.getByText(t.database.banner)).toBeVisible();
    }
    await flushAnalytics(page);
    expect(cloud.telemetry.posthog).toHaveLength(sentBefore);
    // Ni siquiera le pregunta al servidor por un identificador mientras está en la demostración
    expect(cloud.rpcCalls('analytics_identity')).toHaveLength(askedBefore);
  });

  test('si el servidor aún no tiene las funciones de la medición la app sigue entera y no sale nada', async ({
    page,
    cloud,
  }) => {
    cloud.engagement.deployed = false;
    await seedFlags(page, cloud, { productAnalytics: true });
    await enterWithLink(page, cloud, ANA, 'Ana');
    await setConsent(page, improvement(page), true);
    await setConsent(page, usage(page), true);
    await expect(usage(page)).toBeChecked();
    await expect
      .poll(() => cloud.rpcCalls('analytics_identity').length, { timeout: 20_000 })
      .toBeGreaterThan(0);
    await captureScore(page, 72.5);
    await flushAnalytics(page);
    await page.goto(SCREENS.home.path);
    await expectHome(page);
    await flushAnalytics(page);

    // Sin identificador del servidor los eventos esperan en la memoria y no salen
    expect(cloud.telemetry.posthog).toHaveLength(0);
    expect(identityOf(cloud, ANA)).toBeUndefined();
  });
});
