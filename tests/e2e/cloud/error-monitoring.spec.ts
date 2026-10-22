// Reporte de errores del navegador con permiso (B15, paquete B, 2.1 a 2.4 y 6.4 del plan de B15). Dos
// destinos, Supabase de siempre y Sentry, con el mismo permiso (Mejora con tus datos sin nombre) y el mismo
// límite. Sentry además pide la bandera errorMonitoring y un DSN, que el build de nube de estas pruebas
// lleva simulado (playwright.config.ts). fakeTelemetry.ts atiende ese origen dentro del navegador y guarda
// los sobres que llegan, así que ningún reporte sale a Sentry de verdad. Lo que se prueba es que sin permiso
// no sale nada y que lo que sale no lleva a nadie
import type { Page } from '@playwright/test';
import { SCREENS } from '@/app/screens';
import { BROWSER_TEST_MESSAGE } from '@/app/sentrySink';
import { adminEngagementText } from '@/i18n/adminEngagement';
import { consentTexts } from '@/i18n/consents';
import { t } from '@/i18n/es-MX';
import { enterTeam, teamBank, type TeamMember } from '../support/bankTeam';
import { enterWithLink, expect, test } from '../support/cloudFixtures';
import type { FakeSupabaseServer } from '../support/fakeSupabase';
import { seedFlags, watchRequestedUrls } from '../support/fakeTelemetry';
import { FAKE_SENTRY_ORIGIN, FAKE_SENTRY_PROJECT } from '../support/fakeSupabaseConfig';
import { expectNoSeriousA11yViolations } from '../support/fixtures';

const ANA = 'ana@ejemplo.mx';
const PRIVACY = `${SCREENS.settings.path}#privacidad`;
/** Un token con la forma de un JWT, armado por partes y sin firma real */
const TOKEN = ['eyJhbGciOiJub25lIn0', 'eyJzdWIiOiJzaW11bGFkbyJ9', 'firmaSimuladaDePrueba'].join(
  '.',
);

// Los errores que provocan las pruebas no tumban la prueba. Cualquier otro sigue tumbándola
test.use({ expectedPageErrors: [/Falla de prueba/] });

const improvement = (page: Page) =>
  page.getByRole('checkbox', { name: consentTexts.purposes.anonymized_improvement[0] });

async function giveImprovement(page: Page, granted: boolean) {
  await page.goto(PRIVACY);
  await expect(page.getByRole('heading', { name: t.settings.privacy.consentsTitle })).toBeVisible();
  await (granted ? improvement(page).check() : improvement(page).uncheck());
  await expect(page.getByText(t.settings.privacy.consentSaved)).toBeVisible();
}

/** Lanza un error sin atrapar, como un descuido de la app. window.onerror lo ve y el reporte lo recoge */
async function throwUncaught(page: Page, message: string) {
  await page.evaluate((text) => {
    setTimeout(() => {
      throw new Error(text);
    }, 0);
  }, message);
}

/** Lo que llegó a Supabase por report_client_error, con el mensaje y la huella */
const supabaseReports = (cloud: FakeSupabaseServer) =>
  cloud.rpcCalls('report_client_error').map((call) => {
    const body = call.body as { p_message: string; p_fingerprint: string };
    return { message: body.p_message, fingerprint: body.p_fingerprint };
  });

/** Los mensajes de los eventos que llegaron a Sentry */
const sentryMessages = (cloud: FakeSupabaseServer) =>
  cloud.telemetry.sentryEvents().map((event) => {
    const exception = event.exception as { values?: { value?: string }[] } | undefined;
    return exception?.values?.[0]?.value ?? '';
  });

const SENTRY_SDK_FILES = /\/(sentry|sentrySink)-[\w-]+\.js/;

test.describe('Reporte de errores con permiso', () => {
  test('con el permiso un error llega a Supabase y a Sentry, sin correo, token ni identificador, y con la misma huella', async ({
    page,
    cloud,
  }) => {
    await seedFlags(page, cloud, { errorMonitoring: true });
    const requested = watchRequestedUrls(page);
    await enterWithLink(page, cloud, ANA, 'Ana');
    const userId = cloud.userIdOf(ANA) ?? 'sin-id';
    await giveImprovement(page, true);
    await expectNoSeriousA11yViolations(page);
    // Todavía no hubo nada que reportar, así que el código de Sentry no se ha bajado
    expect(requested.filter((url) => SENTRY_SDK_FILES.test(url))).toEqual([]);

    await throwUncaught(
      page,
      `Falla de prueba uno de ${ANA} con ${TOKEN} y el usuario ${userId} en /perfil?nombre=Ana`,
    );
    await expect.poll(() => cloud.telemetry.sentryEvents().length).toBe(1);
    await expect.poll(() => supabaseReports(cloud).length).toBe(1);

    // El sobre salió al origen y proyecto de Sentry que lleva el build, y nada más
    const [request] = cloud.telemetry.sentry;
    expect(request?.method).toBe('POST');
    expect(
      request?.url.startsWith(`${FAKE_SENTRY_ORIGIN}/api/${FAKE_SENTRY_PROJECT}/envelope/`),
    ).toBe(true);
    expect(requested.some((url) => SENTRY_SDK_FILES.test(url))).toBe(true);

    const [event] = cloud.telemetry.sentryEvents();
    const exception = event?.exception as { values: { value: string }[] };
    expect(exception.values[0]?.value).toContain('Falla de prueba uno');
    // Solo el error: sin usuario, dirección, contexto, migas ni datos de más
    for (const field of ['user', 'request', 'contexts', 'breadcrumbs', 'extra', 'server_name']) {
      expect(event, `Sentry no debe recibir "${field}"`).not.toHaveProperty(field);
    }
    const tags = event?.tags as Record<string, string>;
    expect(Object.keys(tags).sort()).toEqual(['kind', 'screen']);
    expect(tags.kind).toBe('error');
    expect(tags.screen).toBe(SCREENS.settings.path);
    // La misma huella en los dos destinos
    const [report] = supabaseReports(cloud);
    expect(event?.fingerprint).toEqual([report?.fingerprint]);
    expect(report?.fingerprint).toMatch(/^[0-9a-f]{16}$/);

    // Ni el correo, ni el alias, ni el token, ni el id de la cuenta, ni la dirección de la app viajan
    const everything = JSON.stringify([
      cloud.telemetry.sentry,
      cloud.rpcCalls('report_client_error').map((call) => call.body),
    ]);
    const appHost = new URL(page.url()).host;
    for (const secret of [ANA, 'Ana', TOKEN, userId, appHost]) {
      expect(everything, `"${secret}" no debe viajar en un reporte`).not.toContain(secret);
    }
  });

  test('sin el permiso no sale ningún reporte, y al retirarlo se corta otra vez', async ({
    page,
    cloud,
  }) => {
    await seedFlags(page, cloud, { errorMonitoring: true });
    const requested = watchRequestedUrls(page);
    await enterWithLink(page, cloud, ANA, 'Ana');

    // Sin permiso. El error se descarta y el código de Sentry ni se baja
    await throwUncaught(page, 'Falla de prueba sin permiso');
    await giveImprovement(page, true);
    expect(requested.filter((url) => SENTRY_SDK_FILES.test(url))).toEqual([]);

    // Con permiso sale a los dos destinos
    await throwUncaught(page, 'Falla de prueba con permiso');
    await expect.poll(() => cloud.telemetry.sentryEvents().length).toBe(1);

    // Retirado, otra vez nada
    await giveImprovement(page, false);
    await throwUncaught(page, 'Falla de prueba retirado');

    // Vuelto a dar, sale, y ese reporte es el que marca que los anteriores ya habrían llegado si hubieran salido
    await giveImprovement(page, true);
    await throwUncaught(page, 'Falla de prueba otra vez con permiso');
    await expect.poll(() => cloud.telemetry.sentryEvents().length).toBe(2);
    await expect.poll(() => supabaseReports(cloud).length).toBe(2);

    expect(sentryMessages(cloud)).toEqual([
      expect.stringContaining('con permiso'),
      expect.stringContaining('otra vez con permiso'),
    ]);
    expect(sentryMessages(cloud).join(' ')).not.toMatch(/sin permiso|retirado/);
    expect(
      supabaseReports(cloud)
        .map((item) => item.message)
        .join(' '),
    ).not.toMatch(/sin permiso|retirado/);
  });

  test('con la bandera de Sentry apagada el reporte sigue llegando a Supabase y nada sale hacia Sentry', async ({
    page,
    cloud,
  }) => {
    // Sin seedFlags, el build de nube de las pruebas nace con errorMonitoring apagada
    const requested = watchRequestedUrls(page);
    await enterWithLink(page, cloud, ANA, 'Ana');
    await giveImprovement(page, true);
    await throwUncaught(page, 'Falla de prueba con la bandera apagada');
    await expect.poll(() => supabaseReports(cloud).length).toBe(1);

    expect(cloud.telemetry.sentry).toHaveLength(0);
    expect(requested.filter((url) => SENTRY_SDK_FILES.test(url))).toEqual([]);
  });

  test('un rechazo de promesa sin atender también se reporta, limpio, con el permiso', async ({
    page,
    cloud,
  }) => {
    await seedFlags(page, cloud, { errorMonitoring: true });
    await enterWithLink(page, cloud, ANA, 'Ana');
    await giveImprovement(page, true);
    await page.evaluate((text) => {
      void Promise.reject(new Error(text));
    }, `Falla de prueba por rechazo de ${ANA}`);
    await expect.poll(() => cloud.telemetry.sentryEvents().length).toBe(1);
    const [event] = cloud.telemetry.sentryEvents();
    expect((event?.tags as Record<string, string>).kind).toBe('rejection');
    expect(JSON.stringify(cloud.telemetry.sentry)).not.toContain(ANA);
  });
});

const ADMIN: TeamMember = { email: 'admin.alertas@ejemplo.mx', alias: 'Admin', role: 'admin' };

test.describe('Error de prueba del admin', () => {
  test('el botón manda el error de prueba del navegador, sin el permiso del admin, y llama a monitoring-test', async ({
    page,
    cloud,
  }) => {
    test.setTimeout(120_000);
    teamBank(cloud, [ADMIN]);
    await seedFlags(page, cloud, { errorMonitoring: true });
    await enterTeam(page, cloud, ADMIN.email);
    await page.goto(SCREENS.adminSettings.path);
    const section = page.getByRole('region', { name: adminEngagementText.title });
    await expect(section).toBeVisible({ timeout: 30_000 });
    await expectNoSeriousA11yViolations(page);

    // El admin no dio el permiso de mejora, y aun así la prueba que pide a propósito sale
    await section.getByRole('button', { name: adminEngagementText.alerts.button }).click();
    await expect(section.getByText(adminEngagementText.alerts.browser.sent)).toBeVisible({
      timeout: 30_000,
    });
    await expect(section.getByText(adminEngagementText.alerts.server.sent)).toBeVisible();
    expect(cloud.engagement.monitoring.calls).toBe(1);

    // Llegó un solo evento a Sentry, con el mensaje fijo y nada de nadie
    await expect.poll(() => cloud.telemetry.sentryEvents().length).toBe(1);
    const [event] = cloud.telemetry.sentryEvents();
    expect(event?.message).toBe(BROWSER_TEST_MESSAGE);
    const body = JSON.stringify(cloud.telemetry.sentry);
    expect(body).not.toContain(ADMIN.email);
    expect(body).not.toContain(cloud.userIdOf(ADMIN.email) ?? 'sin-id');
    // Y nada se guardó en client_errors, que es del permiso de mejora
    expect(supabaseReports(cloud)).toEqual([]);
  });

  test('sin DSN en las funciones el botón lo dice y el aviso del navegador sale igual', async ({
    page,
    cloud,
  }) => {
    test.setTimeout(120_000);
    teamBank(cloud, [ADMIN]);
    cloud.engagement.monitoring.dsn = false;
    await seedFlags(page, cloud, { errorMonitoring: true });
    await enterTeam(page, cloud, ADMIN.email);
    await page.goto(SCREENS.adminSettings.path);
    const section = page.getByRole('region', { name: adminEngagementText.title });
    await section.getByRole('button', { name: adminEngagementText.alerts.button }).click();
    await expect(section.getByText(adminEngagementText.alerts.server.missing_dsn)).toBeVisible({
      timeout: 30_000,
    });
    await expect(section.getByText(adminEngagementText.alerts.browser.sent)).toBeVisible();
  });
});
