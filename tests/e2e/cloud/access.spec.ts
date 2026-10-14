// Cuentas y acceso (B9 del plan del cambio). Registro solo con invitación, Completa tu registro para una
// cuenta que entra por primera vez desde Ya tengo cuenta, Continuar con Google con un Google simulado, el
// aviso del enlace del correo que venció y el segundo factor del equipo, contra el Supabase simulado. El
// gancho Before User Created, Google y la app de autenticación los imita
// tests/e2e/support/fakeSupabase.ts. El servidor real pide además el segundo factor en los permisos por
// fila, y eso lo prueba supabase/tests/accounts_b9_test.sql
import type { Page } from '@playwright/test';
import { SCREENS } from '@/app/screens';
import { FLAGS_KEY } from '@/config/featureFlags';
import { t } from '@/i18n/es-MX';
import { expect, expectHome, openEmailLink, test } from '../support/cloudFixtures';
import type { FakeSupabaseServer } from '../support/fakeSupabase';
import { expectNoSeriousA11yViolations } from '../support/fixtures';

/**
 * Prende banderas en el servidor y deja la misma copia en el navegador antes de cargar, como si ya
 * hubiera recargado. Así no aparece el aviso de configuración nueva
 */
async function withFlags(
  page: Page,
  cloud: FakeSupabaseServer,
  flags: Record<string, boolean>,
): Promise<void> {
  cloud.setSetting('feature_flags', flags);
  await page.addInitScript(
    ([key, value]) => {
      localStorage.setItem(key, value);
    },
    [FLAGS_KEY, JSON.stringify(flags)] as const,
  );
}

/** Lo obligatorio del registro, sin el correo */
async function fillSignup(page: Page, alias: string): Promise<void> {
  await page.getByLabel(t.onboarding.alias, { exact: true }).fill(alias);
  await page.getByLabel(t.accounts.signup.adultAccept(18)).check();
  await page.getByLabel(t.onboarding.privacyAccept).check();
}

/** Escribe el código de la app de autenticación simulada */
async function typeTotp(page: Page, code: string): Promise<void> {
  await page.getByLabel(t.accounts.mfa.codeLabel).fill(code);
  await page.getByRole('button', { name: t.accounts.mfa.verify }).click();
}

test.describe('Registro solo con invitación', () => {
  test('un correo sin invitación no crea la cuenta y uno invitado entra con lo que llenó', async ({
    page,
    cloud,
  }) => {
    const INVITED = 'invitada@ejemplo.mx';
    cloud.registrationOpen = false;
    cloud.invite(INVITED);
    await page.goto(SCREENS.onboarding.path);
    await expect(page.getByText(t.accounts.signup.invitationOnly)).toBeVisible();
    await fillSignup(page, 'Invitada');
    // La especialidad está a la vista, fuera de los datos opcionales plegados
    await page.getByLabel(t.account.targetSpecialty).selectOption('pediatrics');
    await page.getByLabel(t.accounts.signup.heardFrom.label).selectOption('instagram');
    await page.getByLabel(t.accounts.signup.heardFrom.code).fill('ana_2026');

    await page.getByLabel(t.account.email, { exact: true }).fill('colado@ejemplo.mx');
    await page.getByRole('button', { name: t.onboarding.create }).click();
    await expect(page.getByText(t.accounts.signup.invitationRequired)).toBeVisible();
    expect(cloud.userByEmail('colado@ejemplo.mx')).toBeUndefined();
    await expectNoSeriousA11yViolations(page);

    await page.getByLabel(t.account.email, { exact: true }).fill(INVITED);
    await page.getByRole('button', { name: t.onboarding.create }).click();
    await expect(page.getByRole('heading', { name: t.cloud.sentTitle })).toBeVisible();
    const mail = cloud.lastEmail(INVITED);
    if (!mail) throw new Error('El servidor simulado no registró el correo');
    await openEmailLink(page, mail.link);
    await expectHome(page);

    // Cómo nos conoció llega a su tabla privada, y la edad y la especialidad a la cuenta
    await expect
      .poll(() => cloud.signupSourceOf(INVITED))
      .toEqual({ channel: 'instagram', influencerCode: 'ANA_2026' });
    await expect.poll(() => cloud.accountOf(INVITED)?.adult_confirmed_at).toBeTruthy();
    await expect.poll(() => cloud.accountOf(INVITED)?.target_specialty).toBe('pediatrics');
  });

  test('desde Ya tengo cuenta, un correo invitado que nunca se registró completa su registro antes de entrar', async ({
    page,
    cloud,
  }) => {
    const INVITED = 'ricardo.mendez@ejemplo.mx';
    cloud.registrationOpen = false;
    cloud.invite(INVITED);
    await page.goto(SCREENS.onboarding.path);
    await page.getByRole('tab', { name: t.onboarding.loginTab }).click();
    await page.getByLabel(t.account.email, { exact: true }).fill(INVITED);
    await page.getByRole('button', { name: t.cloud.sendLink }).click();
    await expect(page.getByRole('heading', { name: t.cloud.sentTitle })).toBeVisible();
    // El servidor crea la cuenta al pedir el código, sin su edad ni el aviso
    expect(cloud.accountOf(INVITED)?.adult_confirmed_at).toBeNull();
    const mail = cloud.lastEmail(INVITED);
    if (!mail) throw new Error('El servidor simulado no registró el correo');
    await openEmailLink(page, mail.link);

    // No entra a Inicio. Completa su registro y el alias no sale del correo
    const title = page.getByRole('heading', { level: 1, name: t.accounts.completeSignup.title });
    await expect(title).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('heading', { level: 2, name: t.home.reviewsTitle })).toHaveCount(0);
    const alias = page.getByLabel(t.onboarding.alias, { exact: true });
    await expect(alias).toHaveValue('');
    // Hasta guardar no se sube nada ni se acepta el aviso por la persona
    await expect.poll(() => cloud.deviceSessionOf(INVITED)?.deviceId).toBeTruthy();
    expect(cloud.acceptancesOf(INVITED)).toEqual([]);
    expect(cloud.userByEmail(INVITED)?.alias).toBe('Alumno');
    expect(cloud.rpcCalls('sync_push_records')).toHaveLength(0);
    await expectNoSeriousA11yViolations(page);

    // Recargar no se salta el registro
    await page.reload();
    await expect(title).toBeVisible({ timeout: 20_000 });

    await page.getByRole('button', { name: t.accounts.completeSignup.save }).click();
    await expect(page.getByText(t.accounts.signup.adultError(18))).toBeVisible();
    await alias.fill('Rick');
    await page.getByLabel(t.account.targetSpecialty).selectOption('pediatrics');
    await page.getByLabel(t.accounts.signup.heardFrom.code).fill('ana_2026');
    await page.getByLabel(t.accounts.signup.adultAccept(18)).check();
    await page.getByLabel(t.onboarding.privacyAccept).check();
    await page.getByRole('button', { name: t.accounts.completeSignup.save }).click();
    await expectHome(page);

    await expect.poll(() => cloud.accountOf(INVITED)?.adult_confirmed_at).toBeTruthy();
    await expect.poll(() => cloud.userByEmail(INVITED)?.alias).toBe('Rick');
    await expect.poll(() => cloud.accountOf(INVITED)?.target_specialty).toBe('pediatrics');
    expect(cloud.acceptancesOf(INVITED)).toHaveLength(1);
    // Un código sin canal cuenta como de un influencer
    await expect
      .poll(() => cloud.signupSourceOf(INVITED))
      .toEqual({ channel: 'influencer', influencerCode: 'ANA_2026' });
  });
});

test.describe('Enlace del correo', () => {
  test('un enlace que venció o ya se usó lo avisa como del correo y no como de Google', async ({
    page,
    cloud,
  }) => {
    await page.goto(cloud.expiredMagicLink());
    const notice = page.getByRole('alert').filter({ hasText: t.accounts.oauthError.linkTitle });
    await expect(notice).toContainText(t.accounts.oauthError.link_expired);
    await expect(page.getByText(t.accounts.oauthError.title)).toHaveCount(0);
    // La dirección ya no trae el error, así recargar no lo repite
    expect(page.url()).not.toContain('error');
    expect(page.url()).not.toContain('sb=');
    await expectNoSeriousA11yViolations(page);
    await notice.getByRole('button', { name: t.accounts.oauthError.dismiss }).click();
    await expect(notice).toBeHidden();
  });
});

test.describe('Continuar con Google', () => {
  test('crea la cuenta invitada con lo que llenó en Crear cuenta y reclama el dispositivo', async ({
    page,
    cloud,
  }) => {
    const GOOGLE = 'ana.google@gmail.com';
    await withFlags(page, cloud, { googleSignIn: true });
    cloud.registrationOpen = false;
    cloud.invite(GOOGLE);
    cloud.googleAccount = GOOGLE;
    await page.goto(SCREENS.onboarding.path);
    await fillSignup(page, 'Ana G');
    await page.getByLabel(t.account.targetSpecialty).selectOption('psychiatry');
    // Con Google no se pide el correo
    await page.getByRole('button', { name: t.accounts.signup.google }).click();
    await expectHome(page);

    // Un solo dispositivo activo, como al entrar con el correo
    await expect.poll(() => cloud.deviceSessionOf(GOOGLE)?.deviceId).toBeTruthy();
    await expect.poll(() => cloud.userByEmail(GOOGLE)?.alias).toBe('Ana G');
    await expect.poll(() => cloud.accountOf(GOOGLE)?.target_specialty).toBe('psychiatry');
    await expect.poll(() => cloud.accountOf(GOOGLE)?.adult_confirmed_at).toBeTruthy();
    await page.goto(SCREENS.settings.path);
    await expect(page.getByText(t.cloud.linked(GOOGLE))).toBeVisible();
  });

  test('un correo de Google sin invitación no crea la cuenta y cancelar en Google también avisa', async ({
    page,
    cloud,
  }) => {
    const STRANGER = 'sin.invitacion@gmail.com';
    await withFlags(page, cloud, { googleSignIn: true });
    cloud.registrationOpen = false;
    cloud.googleAccount = STRANGER;
    await page.goto(SCREENS.onboarding.path);
    await page.getByRole('tab', { name: t.onboarding.loginTab }).click();
    await page.getByRole('button', { name: t.accounts.signup.google }).click();

    const notice = page.getByRole('alert').filter({ hasText: t.accounts.oauthError.title });
    await expect(notice).toContainText(t.accounts.oauthError.invitation_required);
    expect(cloud.userByEmail(STRANGER)).toBeUndefined();
    // La dirección ya no trae el error, así recargar no lo repite
    expect(page.url()).not.toContain('error');
    await expectNoSeriousA11yViolations(page);
    await notice.getByRole('button', { name: t.accounts.oauthError.dismiss }).click();
    await expect(notice).toBeHidden();

    cloud.googleAccount = null;
    await page.goto(SCREENS.onboarding.path);
    await page.getByRole('tab', { name: t.onboarding.loginTab }).click();
    await page.getByRole('button', { name: t.accounts.signup.google }).click();
    await expect(
      page.getByRole('alert').filter({ hasText: t.accounts.oauthError.title }),
    ).toContainText(t.accounts.oauthError.cancelled);
  });

  test('desde Ya tengo cuenta, una cuenta nueva confirma su edad y acepta el aviso antes de entrar', async ({
    page,
    cloud,
  }) => {
    const NEW = 'nuevo@gmail.com';
    await withFlags(page, cloud, { googleSignIn: true });
    cloud.googleAccount = NEW;
    await page.goto(SCREENS.onboarding.path);
    await page.getByRole('tab', { name: t.onboarding.loginTab }).click();
    await page.getByRole('button', { name: t.accounts.signup.google }).click();

    await expect(
      page.getByRole('heading', { level: 1, name: t.accounts.completeSignup.title }),
    ).toBeVisible({ timeout: 20_000 });
    // El alias no sale del correo de Google y nada sube antes de guardar
    await expect(page.getByLabel(t.onboarding.alias, { exact: true })).toHaveValue('');
    expect(cloud.acceptancesOf(NEW)).toEqual([]);
    await page.getByRole('button', { name: t.accounts.completeSignup.save }).click();
    await expect(page.getByText(t.accounts.signup.adultError(18))).toBeVisible();
    await expectNoSeriousA11yViolations(page);
    await page.getByLabel(t.onboarding.alias, { exact: true }).fill('Nuevo');
    await page.getByLabel(t.accounts.signup.adultAccept(18)).check();
    await page.getByLabel(t.onboarding.privacyAccept).check();
    await page.getByRole('button', { name: t.accounts.completeSignup.save }).click();
    await expectHome(page);
    await expect.poll(() => cloud.accountOf(NEW)?.adult_confirmed_at).toBeTruthy();
    await expect.poll(() => cloud.userByEmail(NEW)?.alias).toBe('Nuevo');
    expect(cloud.acceptancesOf(NEW)).toHaveLength(1);
  });
});

test.describe('Segundo factor del equipo', () => {
  test('el admin da de alta su factor, entra con el código y después solo se le pide el código', async ({
    page,
    cloud,
  }) => {
    const ADMIN = 'admin@ejemplo.mx';
    await withFlags(page, cloud, { requireMfa: true });
    cloud.createUser({ email: ADMIN, alias: 'Admin', role: 'admin' });
    await openEmailLink(page, cloud.issueMagicLink(ADMIN));

    const enroll = page.getByRole('heading', { level: 1, name: t.accounts.mfa.enrollTitle });
    await expect(enroll).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('img', { name: t.accounts.mfa.qrAlt })).toBeVisible();
    await expectNoSeriousA11yViolations(page);
    await typeTotp(page, '000000');
    await expect(page.getByText(t.accounts.mfa.errors.invalid)).toBeVisible();
    await typeTotp(page, cloud.totpCode);
    await expect(enroll).toBeHidden();
    expect(cloud.factorsOf(ADMIN).map((factor) => factor.status)).toEqual(['verified']);

    // Con la sesión aal2 el servidor le da su rol y ve las cuentas
    await page.goto(SCREENS.adminUsers.path);
    await expect(page.getByText(ADMIN)).toBeVisible({ timeout: 20_000 });

    // Al volver a entrar ya no da de alta nada, solo escribe el código
    await page.goto(SCREENS.settings.path);
    await page.getByRole('button', { name: t.session.signOut }).click();
    await expect(page.getByRole('heading', { name: t.session.signedOutTitle })).toBeVisible();
    await openEmailLink(page, cloud.issueMagicLink(ADMIN));
    const challenge = page.getByRole('heading', {
      level: 1,
      name: t.accounts.mfa.challengeTitle,
    });
    await expect(challenge).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('img', { name: t.accounts.mfa.qrAlt })).toHaveCount(0);
    await typeTotp(page, cloud.totpCode);
    await expect(challenge).toBeHidden();
    expect(cloud.factorsOf(ADMIN)).toHaveLength(1);
  });

  test('el dueño restablece el segundo factor de una médica y cierra sus sesiones', async ({
    page,
    cloud,
  }) => {
    const OWNER = 'dueno@ejemplo.mx';
    const PHYSICIAN = 'medica@ejemplo.mx';
    await withFlags(page, cloud, { requireMfa: true });
    cloud.createUser({ email: OWNER, alias: 'Dueño', role: 'owner' });
    cloud.createUser({ email: PHYSICIAN, alias: 'Médica', role: 'physician' });
    cloud.enrollFactor(OWNER);
    cloud.enrollFactor(PHYSICIAN);
    // La médica tiene una sesión abierta en su dispositivo
    cloud.issueMagicLink(PHYSICIAN);
    expect(cloud.sessionsOf(PHYSICIAN)).toBeGreaterThan(0);

    await openEmailLink(page, cloud.issueMagicLink(OWNER));
    const challenge = page.getByRole('heading', {
      level: 1,
      name: t.accounts.mfa.challengeTitle,
    });
    await expect(challenge).toBeVisible({ timeout: 20_000 });
    await typeTotp(page, cloud.totpCode);
    await expect(challenge).toBeHidden();

    await page.goto(SCREENS.adminUsers.path);
    // Tabla desde 64rem y lista en el teléfono, con las mismas acciones por cuenta
    const row = page.getByRole('row').or(page.getByRole('listitem')).filter({ hasText: PHYSICIAN });
    const reset = t.accounts.admin.mfaReset;
    await row.getByRole('button', { name: reset.label('Médica') }).click();
    await expect(row.getByText(reset.confirm('Médica'))).toBeVisible();
    await row.getByRole('button', { name: t.accounts.admin.confirm }).click();
    await expect(page.getByText(reset.done('Médica'))).toBeVisible();
    expect(cloud.factorsOf(PHYSICIAN)).toEqual([]);
    expect(cloud.sessionsOf(PHYSICIAN)).toBe(0);
    // El dueño conserva su factor y su sesión
    expect(cloud.factorsOf(OWNER)).toHaveLength(1);
  });
});
