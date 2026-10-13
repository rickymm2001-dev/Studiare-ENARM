// Cuentas y acceso (B9 del plan del cambio). Registro solo con invitación, Continuar con Google con un
// Google simulado y el segundo factor del equipo, contra el Supabase simulado. El gancho Before User
// Created, Google y la app de autenticación los imita tests/e2e/support/fakeSupabase.ts. El servidor
// real pide además el segundo factor en los permisos por fila, y eso lo prueba
// supabase/tests/accounts_b9_test.sql
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
    const row = page.getByRole('listitem').filter({ hasText: PHYSICIAN });
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
