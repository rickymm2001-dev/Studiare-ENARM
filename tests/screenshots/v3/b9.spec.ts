// Capturas de cierre de B9 del plan del cambio (cuentas y acceso, respuestas 22, 26, 30, 45 y 52). El
// registro solo por invitación con un correo sin invitación, Continuar con Google, Completa tu registro
// con la edad mínima y Cómo nos conociste, Tus datos con la especialidad a la vista, el alta y el código
// del segundo factor del equipo, Usuarios del admin con Invitaciones, Cómo nos conocieron y Restablecer
// segundo factor, y el aviso de privacidad actualizado. Quedan en docs/screenshots/v3/b9. Todo va en
// teléfono y computadora, en claro y en oscuro, y lo clave además en 1920 claro. Corre contra el build
// con la nube y el Supabase simulado de las e2e de nube (tests/e2e/cloud/README.md), que imita el
// gancho del registro, el Google simulado y la app de autenticación.
import type { Locator, Page } from '@playwright/test';
import { SCREENS } from '@/app/screens';
import { FLAGS_KEY } from '@/config/featureFlags';
import { t } from '@/i18n/es-MX';
import {
  enterWithLink,
  expect,
  expectHome,
  openEmailLink,
  test,
} from '../../e2e/support/cloudFixtures';
import type { FakeSupabaseServer } from '../../e2e/support/fakeSupabase';
import { CLOUD_PREVIEW_URL } from '../../e2e/support/fakeSupabaseConfig';
import { capture, outDirFor } from './capture';

const B9_DIR = outDirFor('b9');

/** Lo clave también va en 1920 claro. 1920 oscuro no lleva capturas de B9 */
const KEY = new Set([
  '01-registro-por-invitacion',
  '03-completa-tu-registro',
  '05-segundo-factor-alta',
  '07-usuarios-admin',
  '09-aviso-actualizado',
]);
const wanted = (project: string, name: string) =>
  project === '1920-oscuro' ? false : project.startsWith('1920') ? KEY.has(name) : true;

const access = t.accounts;

/** Captura de página completa, solo en los proyectos que la llevan */
async function shot(page: Page, name: string, project: string) {
  if (!wanted(project, name)) return;
  // Arriba del todo, porque la barra de arriba es fija y en una página que ya bajó saldría a media
  // imagen en la captura de página completa
  await page.evaluate(() => {
    window.scrollTo(0, 0);
  });
  await capture(page, B9_DIR, name, project);
}

/** Captura lo que se ve, sin página completa, como la confirmación dentro de la tabla */
async function view(page: Page, name: string, project: string) {
  if (!wanted(project, name)) return;
  await page.screenshot({ path: `${B9_DIR}/${name}--${project}.jpg`, type: 'jpeg', quality: 60 });
}

/** Captura solo una tarjeta, como Tus datos */
async function card(region: Locator, name: string, project: string) {
  if (!wanted(project, name)) return;
  await region.scrollIntoViewIfNeeded();
  await region.screenshot({ path: `${B9_DIR}/${name}--${project}.jpg`, type: 'jpeg', quality: 60 });
}

/**
 * Prende banderas en el servidor y deja la misma copia en el navegador antes de cargar, como si ya
 * hubiera recargado. Así no aparece el aviso de configuración nueva
 */
async function withFlags(page: Page, cloud: FakeSupabaseServer, flags: Record<string, boolean>) {
  cloud.setSetting('feature_flags', flags);
  await page.addInitScript(
    ([key, value]) => {
      // El script corre en cada documento, también en el about:blank con el que openEmailLink
      // recarga la página, que no tiene almacenamiento y lanza al leer localStorage
      if (!location.protocol.startsWith('http')) return;
      localStorage.setItem(key, value);
    },
    [FLAGS_KEY, JSON.stringify(flags)] as const,
  );
}

/** Escribe el código de la app de autenticación simulada */
async function typeTotp(page: Page, code: string) {
  await page.getByLabel(access.mfa.codeLabel).fill(code);
  await page.getByRole('button', { name: access.mfa.verify }).click();
}

test.describe('Cuentas y acceso', () => {
  test.use({ baseURL: CLOUD_PREVIEW_URL, serviceWorkers: 'block' });

  test('B9. Registro por invitación, Continuar con Google, Completa tu registro y Tus datos', async ({
    page,
    cloud,
  }, info) => {
    test.setTimeout(600_000);
    const project = info.project.name;
    const INVITED = 'ricardo.b9@ejemplo.mx';
    await withFlags(page, cloud, { googleSignIn: true });
    cloud.registrationOpen = false;
    cloud.invite(INVITED);

    // Un correo sin invitación no crea la cuenta. El aviso del registro cerrado va arriba y el de la
    // invitación junto al botón, con Continuar con Google abajo
    await page.goto(SCREENS.onboarding.path);
    await expect(page.getByText(access.signup.invitationOnly)).toBeVisible({ timeout: 60_000 });
    await page.getByLabel(t.onboarding.alias, { exact: true }).fill('Colado');
    await page.getByLabel(t.account.email, { exact: true }).fill('colado.b9@ejemplo.mx');
    await page.getByLabel(access.signup.adultAccept(18)).check();
    await page.getByLabel(t.onboarding.privacyAccept).check();
    await page.getByRole('button', { name: t.onboarding.create }).click();
    await expect(page.getByText(access.signup.invitationRequired)).toBeVisible();
    await expect(page.getByRole('button', { name: access.signup.google })).toBeVisible();
    await shot(page, '01-registro-por-invitacion', project);

    // Ya tengo cuenta con Continuar con Google
    await page.goto(SCREENS.onboarding.path);
    await page.getByRole('tab', { name: t.onboarding.loginTab }).click();
    await expect(page.getByRole('button', { name: access.signup.google })).toBeVisible();
    await shot(page, '02-continuar-con-google', project);

    // El correo invitado entra desde Ya tengo cuenta sin haber pasado por Crear cuenta, así que completa
    // su registro antes de entrar
    await page.getByLabel(t.account.email, { exact: true }).fill(INVITED);
    await page.getByRole('button', { name: t.cloud.sendLink }).click();
    await expect(page.getByRole('heading', { name: t.cloud.sentTitle })).toBeVisible();
    const mail = cloud.lastEmail(INVITED);
    if (!mail) throw new Error('El servidor simulado no registró el correo');
    await openEmailLink(page, mail.link);
    await expect(
      page.getByRole('heading', { level: 1, name: access.completeSignup.title }),
    ).toBeVisible({ timeout: 60_000 });
    await page.getByLabel(t.onboarding.alias, { exact: true }).fill('Ricardo');
    await page.getByLabel(t.account.targetSpecialty).selectOption('pediatrics');
    await page.getByLabel(access.signup.heardFrom.label).selectOption('instagram');
    await page.getByLabel(access.signup.heardFrom.code).fill('ANA_2026');
    await page.getByLabel(access.signup.adultAccept(18)).check();
    await page.getByLabel(t.onboarding.privacyAccept).check();
    await shot(page, '03-completa-tu-registro', project);
    await page.getByRole('button', { name: access.completeSignup.save }).click();
    await expectHome(page);

    // Tus datos con la especialidad a la vista, primero
    await page.goto(`${SCREENS.settings.path}#perfil`);
    const data = page.getByRole('region', { name: t.settingsPage.profile.title });
    await expect(data.getByText('Pediatría')).toBeVisible({ timeout: 60_000 });
    await card(data, '04-tus-datos-especialidad', project);
  });

  test('B9. Segundo factor del equipo y Usuarios del admin', async ({ page, cloud }, info) => {
    test.setTimeout(600_000);
    const project = info.project.name;
    const ADMIN = 'admin.b9@ejemplo.mx';
    const OWNER = 'dueno.b9@ejemplo.mx';
    const PHYSICIAN = 'medica.b9@ejemplo.mx';
    await withFlags(page, cloud, { requireMfa: true });
    cloud.registrationOpen = false;
    cloud.createUser({ email: ADMIN, alias: 'Admin', role: 'admin' });
    cloud.createUser({ email: OWNER, alias: 'Dueño', role: 'owner' });
    cloud.createUser({ email: PHYSICIAN, alias: 'Médica', role: 'physician' });
    cloud.enrollFactor(OWNER);
    cloud.enrollFactor(PHYSICIAN);
    // Invitaciones, una ya con su cuenta creada, y respuestas de cómo nos conocieron
    const answers: [string, string, string?][] = [
      ['a.b9@ejemplo.mx', 'instagram', 'ANA_2026'],
      ['b.b9@ejemplo.mx', 'instagram', 'ANA_2026'],
      ['c.b9@ejemplo.mx', 'instagram'],
      ['d.b9@ejemplo.mx', 'tiktok', 'DRMEMO'],
      ['e.b9@ejemplo.mx', 'friend'],
      ['f.b9@ejemplo.mx', 'university'],
      [PHYSICIAN, 'google'],
    ];
    for (const [email, channel, code] of answers) cloud.answerSignupSource(email, channel, code);
    for (const email of ['paola.b9@ejemplo.mx', 'luis.b9@ejemplo.mx', 'a.b9@ejemplo.mx']) {
      cloud.invite(email);
    }

    // El admin entra por primera vez con la bandera prendida y da de alta su factor
    await openEmailLink(page, cloud.issueMagicLink(ADMIN));
    const enroll = page.getByRole('heading', { level: 1, name: access.mfa.enrollTitle });
    await expect(enroll).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole('img', { name: access.mfa.qrAlt })).toBeVisible();
    await shot(page, '05-segundo-factor-alta', project);
    await typeTotp(page, cloud.totpCode);
    await expect(enroll).toBeHidden();
    await page.goto(SCREENS.settings.path);
    await page.getByRole('button', { name: t.session.signOut }).click();
    await expect(page.getByRole('heading', { name: t.session.signedOutTitle })).toBeVisible();

    // El dueño ya tiene su factor. Solo escribe el código
    await openEmailLink(page, cloud.issueMagicLink(OWNER));
    const challenge = page.getByRole('heading', { level: 1, name: access.mfa.challengeTitle });
    await expect(challenge).toBeVisible({ timeout: 60_000 });
    await shot(page, '06-segundo-factor-codigo', project);
    await typeTotp(page, cloud.totpCode);
    await expect(challenge).toBeHidden();

    // Usuarios con la tabla de cuentas, las invitaciones y los conteos de cómo nos conocieron
    await page.goto(SCREENS.adminUsers.path);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 60_000 });
    const invitations = page.getByRole('region', { name: access.admin.invitations.title });
    const sources = page.getByRole('region', { name: access.admin.sources.title });
    await expect(invitations.getByText('paola.b9@ejemplo.mx')).toBeVisible({ timeout: 60_000 });
    await expect(sources.getByText(access.admin.sources.people(3))).toBeVisible({
      timeout: 60_000,
    });
    await expect(page.getByText(PHYSICIAN).first()).toBeVisible({ timeout: 60_000 });
    await shot(page, '07-usuarios-admin', project);

    // El dueño restablece el segundo factor de la médica
    const row = page.getByRole('row').or(page.getByRole('listitem')).filter({ hasText: PHYSICIAN });
    const reset = access.admin.mfaReset;
    await row.getByRole('button', { name: reset.label('Médica') }).click();
    const confirm = row.getByText(reset.confirm('Médica'));
    await expect(confirm).toBeVisible();
    await confirm.scrollIntoViewIfNeeded();
    await view(page, '08-restablecer-segundo-factor', project);
    await row.getByRole('button', { name: access.admin.confirm }).click();
    await expect(page.getByText(reset.done('Médica'))).toBeVisible();
  });

  test('B9. El aviso de privacidad actualizado a la versión de B9', async ({
    page,
    cloud,
  }, info) => {
    test.setTimeout(300_000);
    const project = info.project.name;
    const STUDENT = 'sofia.b9@ejemplo.mx';
    // Aceptó la versión de B7 en otro dispositivo. Al entrar aquí la app le pide la nueva
    cloud.createUser({ email: STUDENT, alias: 'Sofía', noticeVersion: '2026-10-14' });
    await enterWithLink(page, cloud, STUDENT, 'Sofía');
    const banner = page.getByRole('region', { name: t.noticeUpdate.title });
    await expect(banner.getByRole('button', { name: t.noticeUpdate.accept })).toBeVisible({
      timeout: 60_000,
    });
    await shot(page, '09-aviso-actualizado', project);
  });
});
