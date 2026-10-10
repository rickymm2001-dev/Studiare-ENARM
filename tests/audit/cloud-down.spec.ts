// Auditoría con la nube configurada pero que no responde. Es un fallo realista en producción, por una
// caída de Supabase o una red que la bloquea. La app debe dejar crear la cuenta y estudiar en el
// navegador, explicar qué pasó y abrir todas las pantallas sin romperse. Necesita el build con una
// nube inalcanzable, AUDIT_CLOUD=down npm run audit:ui -- -g "nube caída".
import { SCREEN_KEYS, SCREENS } from '@/app/screens';
import { t } from '@/i18n/es-MX';
import { expect, test } from '@playwright/test';

const NETWORK_NOISE =
  /Failed to load resource|ERR_NAME_NOT_RESOLVED|ERR_INTERNET|ERR_NETWORK|net::|Failed to fetch/i;

test('nube caída. Se crea la cuenta en el navegador y todas las pantallas abren', async ({
  page,
}) => {
  test.skip(process.env.AUDIT_CLOUD !== 'down', 'Necesita el build con una nube que no responde');
  test.setTimeout(600_000);
  const findings: string[] = [];
  let current = 'preparación';
  page.on('console', (message) => {
    if (message.type() === 'error' && !NETWORK_NOISE.test(message.text())) {
      findings.push(`${current} consola ${message.text().slice(0, 200)}`);
    }
  });
  page.on('pageerror', (error) => {
    findings.push(`${current} excepción ${error.message.slice(0, 200)}`);
  });

  // La cuenta se crea aunque no se pueda mandar el enlace, y se puede seguir en el navegador
  current = 'crear cuenta';
  await page.goto(SCREENS.onboarding.path);
  await page.getByLabel(t.onboarding.alias, { exact: true }).fill('Sin nube');
  await page.getByLabel(t.account.email, { exact: true }).fill('sinnube@ejemplo.mx');
  await page.getByLabel(t.onboarding.privacyAccept).check();
  await page.getByRole('button', { name: t.onboarding.create }).click();
  await expect(page.getByText(t.cloud.failedTitle)).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText(t.cloud.failedBody)).toBeVisible();
  await page.getByRole('button', { name: t.cloud.continueLocal }).click();
  await expect(page.getByRole('heading', { level: 1, name: t.screens.home.title })).toBeVisible();

  // Todas las pantallas abren, con título y sin pantalla de error ni desborde
  for (const key of SCREEN_KEYS) {
    if (key === 'roleSelector') continue;
    current = `${key} ${SCREENS[key].path}`;
    await page.goto(SCREENS[key].path);
    await page.waitForLoadState('networkidle').catch(() => undefined);
    const heading = page.getByRole('heading', { level: 1 }).first();
    await heading.waitFor({ timeout: 10_000 }).catch(() => {
      findings.push(`${current} sin título`);
    });
    if (
      await page
        .getByText(t.routeError.title, { exact: true })
        .isVisible()
        .catch(() => false)
    ) {
      findings.push(`${current} pantalla de error`);
    }
    const widths = await page.evaluate(() => ({
      content: document.documentElement.scrollWidth,
      screen: document.documentElement.clientWidth,
    }));
    if (widths.content > widths.screen) findings.push(`${current} desborde`);
    const text = await page.evaluate(() => document.body.innerText);
    if (/\bundefined\b|\bNaN\b|\[object Object\]|Invalid Date/.test(text)) {
      findings.push(`${current} texto roto`);
    }
  }

  // Un médico que ya había entrado, con la sesión vencida por las horas que pasaron, abre la app sin
  // que la nube responda. Supabase no puede renovar el token y la app no debe darlo por salido ni
  // quitarle su área
  current = 'sesión vencida';
  await page.evaluate(() => {
    const preferences = JSON.parse(localStorage.getItem('enarm.preferences.v1') ?? '{}') as object;
    localStorage.setItem(
      'enarm.preferences.v1',
      JSON.stringify({ ...preferences, role: 'physician' }),
    );
    const issued = Math.floor(Date.now() / 1000) - 7200;
    localStorage.setItem(
      'sb-nube-caida-auditoria-auth-token',
      JSON.stringify({
        access_token: 'a.b.c',
        token_type: 'bearer',
        expires_in: 3600,
        expires_at: issued + 3600,
        refresh_token: 'renovacion-vencida',
        user: {
          id: '00000000-0000-4000-8000-000000000001',
          aud: 'authenticated',
          email: 'medico@ejemplo.mx',
          app_metadata: {},
          user_metadata: {},
          created_at: new Date(issued * 1000).toISOString(),
        },
      }),
    );
  });

  // La cuenta dice con claridad que la nube no respondió y que lo estudiado sigue en el navegador
  current = 'perfil';
  await page.goto(SCREENS.profile.path);
  await expect(page.getByText(t.cloud.error)).toBeVisible({ timeout: 30_000 });

  // Y el médico conserva su área mientras la nube no responde
  current = 'área del médico';
  await page.goto(SCREENS.questionBank.path);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(t.screens.questionBank.title);

  // El rol no se puede cambiar a mano con la nube configurada
  current = 'rol';
  await page.goto(SCREENS.roleSelector.path);
  await expect(page.getByText(t.cloud.roleFromCloud)).toBeVisible();

  console.log(`NUBE CAIDA hallazgos ${findings.length}`);
  for (const finding of findings) console.log(`  - ${finding}`);
  expect(findings).toEqual([]);
});
