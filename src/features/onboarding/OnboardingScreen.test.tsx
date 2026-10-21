// @vitest-environment jsdom
// Entrar con el código del correo (D-115). El correo se abre en el teléfono y se entra en la
// computadora escribiendo el código, sin abrir el enlace en ella. Desde B9 también el registro con la
// edad mínima, la especialidad, cómo nos conociste, los permisos opcionales, el registro por
// invitación y Continuar con Google, con Supabase simulado.
import 'fake-indexeddb/auto';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CloudBridge } from '@/app/cloud';
import { useCloud } from '@/app/cloudState';
import { DEFAULT_PREFERENCES, usePreferences } from '@/app/preferences';
import { routes } from '@/app/router';
import { SCREENS } from '@/app/screens';
import { writeStoredFlags } from '@/config/featureFlags';
import { PRIVACY_NOTICE_VERSION } from '@/config/legal';
import { forgetDeviceClaim } from '@/data/cloud/device';
import { PENDING_SIGNUP_KEY } from '@/data/cloud/pendingSignup';
import { useDataApi, type DataApi } from '@/data/context';
import { DataProvider } from '@/data/DataProvider';
import { makeFakeCloud, type FakeCloud } from '@/data/testing/fakeCloud';
import { currentConsents } from '@/data/usecases/profile';
import { consentTexts } from '@/i18n/consents';
import { t } from '@/i18n/es-MX';

vi.setConfig({ testTimeout: 30_000 });

const holder = vi.hoisted((): { cloud: unknown } => ({ cloud: null }));
vi.mock('@/data/cloud/client', () => ({
  getCloud: () => holder.cloud,
  cloudConfigured: () => holder.cloud !== null,
  loadCloud: () => Promise.resolve(holder.cloud),
}));

const EMAIL = 'ana@x.mx';
const captured: { api?: DataApi } = {};

function Capture() {
  const value = useDataApi();
  useEffect(() => {
    captured.api = value;
  });
  return null;
}

function mount(fake: FakeCloud) {
  holder.cloud = fake.cloud;
  const router = createMemoryRouter(routes, { initialEntries: [SCREENS.onboarding.path] });
  render(
    <DataProvider kind="real">
      <Capture />
      <CloudBridge />
      <RouterProvider router={router} />
    </DataProvider>,
  );
  return router;
}

/**
 * Sin sesión en este navegador. El correo con el código se abrió en otro dispositivo. registered dice
 * si la cuenta ya completó su registro en otro dispositivo, como una cuenta que ya existía (B9)
 */
function phoneOnlyCloud(options: { registered?: boolean } = {}) {
  const fake = makeFakeCloud({ session: null });
  fake.codeSession = { id: '7a2d0f1e-6b4a-4d2a-9d55-6f2f3f6a1b20', email: EMAIL };
  if (options.registered) fake.acceptances = [PRIVACY_NOTICE_VERSION];
  return fake;
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  forgetDeviceClaim();
  usePreferences.setState(DEFAULT_PREFERENCES);
  useCloud.setState({ state: { status: 'checking' } });
});

afterEach(async () => {
  cleanup();
  await new Promise((resolve) => setTimeout(resolve, 100));
  await captured.api?.deleteAllData?.();
  captured.api = undefined;
  holder.cloud = null;
  localStorage.clear();
  forgetDeviceClaim();
  usePreferences.setState(DEFAULT_PREFERENCES);
  useCloud.setState({ state: { status: 'off' } });
});

describe('entrar con el código del correo', () => {
  it('en Ya tengo cuenta, el código abre la sesión, une la cuenta y entra a Inicio', async () => {
    const fake = phoneOnlyCloud({ registered: true });
    const typing = userEvent.setup();
    const router = mount(fake);
    await typing.click(await screen.findByRole('tab', { name: t.onboarding.loginTab }));
    await typing.type(screen.getByLabelText(t.account.email), EMAIL);
    await typing.click(screen.getByRole('button', { name: t.cloud.sendLink }));
    expect(await screen.findByText(t.cloud.sentBody(EMAIL))).toBeVisible();
    expect(fake.otpRequests).toEqual([{ email: EMAIL }]);

    await typing.type(screen.getByLabelText(t.cloud.code.label), '123 456');
    await typing.click(screen.getByRole('button', { name: t.cloud.code.submit }));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe(SCREENS.home.path);
    });
    expect(useCloud.getState().state.status).toBe('linked');
    await waitFor(() => {
      expect(usePreferences.getState().sessionUserId).not.toBeNull();
    });
    // Este navegador reclamó la cuenta, como si hubiera abierto el enlace
    expect(fake.claims).toHaveLength(1);
  });

  it('en Ya tengo cuenta, un correo invitado que nunca se registró completa su registro antes de entrar', async () => {
    const fake = phoneOnlyCloud();
    fake.remoteAccount = { adult_confirmed_at: null };
    // La base le pone Alumno a una cuenta que se creó al pedir el código, sin alias
    fake.profileAlias = 'Alumno';
    const typing = userEvent.setup();
    const router = mount(fake);
    await typing.click(await screen.findByRole('tab', { name: t.onboarding.loginTab }));
    await typing.type(screen.getByLabelText(t.account.email), EMAIL);
    await typing.click(screen.getByRole('button', { name: t.cloud.sendLink }));
    await typing.type(await screen.findByLabelText(t.cloud.code.label), '123456');
    await typing.click(screen.getByRole('button', { name: t.cloud.code.submit }));

    // Entra a Inicio, pero lo tapa Completa tu registro, sin abrir el perfil ni subir nada
    expect(
      await screen.findByRole('heading', { level: 1, name: t.accounts.completeSignup.title }),
    ).toBeVisible();
    expect(router.state.location.pathname).toBe(SCREENS.home.path);
    expect(usePreferences.getState().sessionUserId).toBeNull();
    expect(fake.accountUpdates).toEqual([]);
    expect(fake.acceptances).toEqual([]);
    const alias = screen.getByLabelText(t.onboarding.alias);
    expect(alias).toHaveValue('');

    await typing.type(alias, 'Ana');
    await typing.click(screen.getByLabelText(t.accounts.signup.adultAccept(18)));
    await typing.click(screen.getByLabelText(t.onboarding.privacyAccept));
    await typing.click(screen.getByRole('button', { name: t.accounts.completeSignup.save }));
    await waitFor(() => {
      expect(usePreferences.getState().sessionUserId).not.toBeNull();
    });
    expect(
      screen.queryByRole('heading', { level: 1, name: t.accounts.completeSignup.title }),
    ).toBeNull();
    // Ya con su registro, el aviso queda aceptado una vez y la edad sube a la nube
    await waitFor(() => {
      expect(fake.acceptances).toEqual([PRIVACY_NOTICE_VERSION]);
    });
    await waitFor(() => {
      expect(fake.accountUpdates.some((row) => typeof row.adult_confirmed_at === 'string')).toBe(
        true,
      );
    });
  });

  it('un código equivocado lo dice y no entra', async () => {
    const fake = phoneOnlyCloud();
    const typing = userEvent.setup();
    const router = mount(fake);
    await typing.click(await screen.findByRole('tab', { name: t.onboarding.loginTab }));
    await typing.type(screen.getByLabelText(t.account.email), EMAIL);
    await typing.click(screen.getByRole('button', { name: t.cloud.sendLink }));
    await typing.type(await screen.findByLabelText(t.cloud.code.label), '999999');
    await typing.click(screen.getByRole('button', { name: t.cloud.code.submit }));
    expect(await screen.findByText(t.cloud.code.errors.invalid)).toBeVisible();
    expect(router.state.location.pathname).toBe(SCREENS.onboarding.path);
    expect(usePreferences.getState().sessionUserId).toBeNull();
    expect(fake.claims).toHaveLength(0);
  });

  it('pide un código de 6 a 10 dígitos antes de mandarlo', async () => {
    const fake = phoneOnlyCloud();
    const typing = userEvent.setup();
    mount(fake);
    await typing.click(await screen.findByRole('tab', { name: t.onboarding.loginTab }));
    await typing.type(screen.getByLabelText(t.account.email), EMAIL);
    await typing.click(screen.getByRole('button', { name: t.cloud.sendLink }));
    await typing.type(await screen.findByLabelText(t.cloud.code.label), '123');
    await typing.click(screen.getByRole('button', { name: t.cloud.code.submit }));
    expect(await screen.findByText(t.cloud.code.format)).toBeVisible();
  });

  it('al crear la cuenta, el código del correo entra con el mismo perfil', async () => {
    const fake = phoneOnlyCloud();
    const typing = userEvent.setup();
    const router = mount(fake);
    await typing.type(await screen.findByLabelText(t.onboarding.alias), 'Ana');
    await typing.type(screen.getByLabelText(t.account.email), EMAIL);
    await typing.click(screen.getByLabelText(t.accounts.signup.adultAccept(18)));
    await typing.click(screen.getByLabelText(t.onboarding.privacyAccept));
    await typing.click(screen.getByRole('button', { name: t.onboarding.create }));
    expect(await screen.findByText(t.cloud.sentBody(EMAIL))).toBeVisible();
    const local = await captured.api?.repos.accounts.list();
    expect(local).toHaveLength(1);

    await typing.type(screen.getByLabelText(t.cloud.code.label), '123456');
    await typing.click(screen.getByRole('button', { name: t.cloud.code.submit }));
    await waitFor(() => {
      expect(useCloud.getState().state.status).toBe('linked');
    });
    // Inicio se baja aparte, así que llegar puede tardar un poco más que unir la cuenta
    await waitFor(() => {
      expect(router.state.location.pathname).toBe(SCREENS.home.path);
    });
    // No se creó un segundo perfil. La nube se unió al que se acaba de crear
    expect(usePreferences.getState().sessionUserId).toBe(local?.[0]?.userId);
    expect(await captured.api?.repos.accounts.list()).toHaveLength(1);
  });
});

/** Llena lo obligatorio del registro, sin el correo */
async function fillRequired(typing: ReturnType<typeof userEvent.setup>, alias = 'Ana') {
  await typing.type(await screen.findByLabelText(t.onboarding.alias), alias);
  await typing.click(screen.getByLabelText(t.accounts.signup.adultAccept(18)));
  await typing.click(screen.getByLabelText(t.onboarding.privacyAccept));
}

/** Prende Continuar con Google en el servidor y en la copia del navegador, como tras recargar */
function withGoogle(fake: FakeCloud) {
  fake.flags = { googleSignIn: true };
  writeStoredFlags({ googleSignIn: true });
  return fake;
}

describe('lo que pide el registro (B9)', () => {
  it('sin confirmar la edad mínima no crea la cuenta ni manda el correo', async () => {
    const fake = phoneOnlyCloud();
    const typing = userEvent.setup();
    mount(fake);
    await typing.type(await screen.findByLabelText(t.onboarding.alias), 'Ana');
    await typing.type(screen.getByLabelText(t.account.email), EMAIL);
    await typing.click(screen.getByLabelText(t.onboarding.privacyAccept));
    await typing.click(screen.getByRole('button', { name: t.onboarding.create }));
    expect(await screen.findByText(t.accounts.signup.adultError(18))).toBeVisible();
    expect(fake.otpRequests).toEqual([]);
    expect(await captured.api?.repos.accounts.list()).toHaveLength(0);
  });

  it('guarda la especialidad, cómo nos conoció, la edad y solo los permisos que prendió', async () => {
    const fake = phoneOnlyCloud();
    const typing = userEvent.setup();
    mount(fake);
    await fillRequired(typing);
    await typing.type(screen.getByLabelText(t.account.email), EMAIL);
    // La especialidad está a la vista, fuera de los datos opcionales plegados
    await typing.selectOptions(screen.getByLabelText(t.account.targetSpecialty), 'pediatrics');
    await typing.selectOptions(
      screen.getByLabelText(t.accounts.signup.heardFrom.label),
      'influencer',
    );
    await typing.type(screen.getByLabelText(t.accounts.signup.heardFrom.code), 'ana 2026');
    await typing.click(screen.getByRole('button', { name: t.onboarding.create }));
    // Un código con espacios no se acepta
    expect(await screen.findByText(t.accounts.signup.heardFrom.codeError)).toBeVisible();
    expect(fake.otpRequests).toEqual([]);
    await typing.clear(screen.getByLabelText(t.accounts.signup.heardFrom.code));
    await typing.type(screen.getByLabelText(t.accounts.signup.heardFrom.code), 'ana_2026');
    await typing.click(screen.getByLabelText(consentTexts.purposes.party[0]));
    await typing.click(screen.getByRole('button', { name: t.onboarding.create }));
    expect(await screen.findByText(t.cloud.sentBody(EMAIL))).toBeVisible();

    const [account] = (await captured.api?.repos.accounts.list()) ?? [];
    expect(account).toMatchObject({
      targetSpecialty: 'pediatrics',
      heardFrom: { channel: 'influencer', influencerCode: 'ANA_2026' },
    });
    expect(account?.adultConfirmedAt).toBeDefined();
    // Lo del registro no lleva fecha y entra campo por campo, sin pisar la nube (H29)
    expect(account?.detailsChangedAt).toBeUndefined();
    expect(account?.detailsFromSignup).toBe(true);
    expect(await currentConsents(captured.api as DataApi, account?.userId ?? '')).toEqual({
      party: true,
      ai_analysis: false,
      anonymized_improvement: false,
    });
  });
});

describe('registro solo con invitación (B9)', () => {
  const rejection = {
    status: 403,
    message:
      'Studiare está abierto solo con invitación y este correo no tiene una (invitation_required)',
  };

  it('un correo sin invitación no crea la cuenta en la nube ni en este navegador', async () => {
    const fake = phoneOnlyCloud();
    fake.otpError = rejection;
    const typing = userEvent.setup();
    mount(fake);
    // Mientras el registro esté cerrado, la bienvenida lo dice antes
    expect(await screen.findByText(t.accounts.signup.invitationOnly)).toBeVisible();
    await fillRequired(typing);
    await typing.type(screen.getByLabelText(t.account.email), EMAIL);
    await typing.click(screen.getByRole('button', { name: t.onboarding.create }));
    expect(await screen.findByText(t.accounts.signup.invitationRequired)).toBeVisible();
    expect(fake.otpRequests).toEqual([{ email: EMAIL }]);
    expect(await captured.api?.repos.accounts.list()).toHaveLength(0);
    expect(screen.queryByText(t.cloud.sentTitle)).toBeNull();
  });

  it('con el registro abierto no avisa de la invitación', async () => {
    const fake = phoneOnlyCloud();
    fake.registrationOpen = true;
    mount(fake);
    expect(await screen.findByLabelText(t.onboarding.alias)).toBeVisible();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByText(t.accounts.signup.invitationOnly)).toBeNull();
  });

  it('en Ya tengo cuenta, un correo sin cuenta ni invitación lo dice y no espera un correo', async () => {
    const fake = phoneOnlyCloud();
    fake.otpError = rejection;
    const typing = userEvent.setup();
    mount(fake);
    await typing.click(await screen.findByRole('tab', { name: t.onboarding.loginTab }));
    await typing.type(screen.getByLabelText(t.account.email), EMAIL);
    await typing.click(screen.getByRole('button', { name: t.cloud.sendLink }));
    expect(await screen.findByText(t.accounts.signup.invitationRequired)).toBeVisible();
    expect(screen.queryByText(t.cloud.sentTitle)).toBeNull();
  });
});

describe('Continuar con Google (B9)', () => {
  it('sin la bandera no hay botón de Google', async () => {
    mount(phoneOnlyCloud());
    expect(await screen.findByLabelText(t.onboarding.alias)).toBeVisible();
    expect(screen.queryByRole('button', { name: t.accounts.signup.google })).toBeNull();
  });

  it('en Crear cuenta pide lo obligatorio menos el correo, guarda lo llenado y va a Google', async () => {
    const fake = withGoogle(phoneOnlyCloud());
    const typing = userEvent.setup();
    mount(fake);
    const google = await screen.findByRole('button', { name: t.accounts.signup.google });
    await typing.click(google);
    // Sin alias, edad ni aviso no sale a Google
    expect(await screen.findByText(t.onboarding.aliasError)).toBeVisible();
    expect(screen.getByText(t.accounts.signup.adultError(18))).toBeVisible();
    expect(screen.queryByText(t.account.emailError)).toBeNull();
    expect(fake.oauthRequests).toEqual([]);

    await fillRequired(typing, 'Ricky');
    await typing.selectOptions(screen.getByLabelText(t.account.targetSpecialty), 'psychiatry');
    await typing.selectOptions(screen.getByLabelText(t.accounts.signup.heardFrom.label), 'tiktok');
    await typing.click(screen.getByRole('button', { name: t.accounts.signup.google }));
    await waitFor(() => {
      expect(fake.oauthRequests).toHaveLength(1);
    });
    expect(fake.oauthRequests[0]).toEqual({
      provider: 'google',
      redirectTo: new URL('/', window.location.origin).toString(),
    });
    const pending = JSON.parse(sessionStorage.getItem(PENDING_SIGNUP_KEY) ?? 'null') as {
      alias: string;
      details: { targetSpecialty: string };
      heardFrom: { channel: string };
      adultConfirmedAt: string;
    } | null;
    expect(pending).toMatchObject({
      alias: 'Ricky',
      details: { targetSpecialty: 'psychiatry' },
      heardFrom: { channel: 'tiktok', influencerCode: null },
    });
    expect(pending?.adultConfirmedAt).toBeDefined();
    // Nada se crea aquí. El perfil nace cuando vuelve de Google con la sesión
    expect(await captured.api?.repos.accounts.list()).toHaveLength(0);
  });

  it('en Ya tengo cuenta va directo a Google y borra un registro pendiente viejo', async () => {
    const fake = withGoogle(phoneOnlyCloud());
    sessionStorage.setItem(PENDING_SIGNUP_KEY, '{"alias":"viejo"}');
    const typing = userEvent.setup();
    mount(fake);
    await typing.click(await screen.findByRole('tab', { name: t.onboarding.loginTab }));
    await typing.click(screen.getByRole('button', { name: t.accounts.signup.google }));
    await waitFor(() => {
      expect(fake.oauthRequests).toHaveLength(1);
    });
    expect(sessionStorage.getItem(PENDING_SIGNUP_KEY)).toBeNull();
  });
});
