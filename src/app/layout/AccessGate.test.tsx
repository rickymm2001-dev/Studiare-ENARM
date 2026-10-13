// @vitest-environment jsdom
// Lo que falta para entrar de lleno (B9). El segundo factor del equipo con Supabase simulado, el
// registro que completa una cuenta de Google y el aviso de por qué Google no dejó entrar.
import 'fake-indexeddb/auto';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect } from 'react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PRIVACY_NOTICE_VERSION } from '@/config/legal';
import { useDataApi, type DataApi } from '@/data/context';
import { DataProvider } from '@/data/DataProvider';
import { makeFakeCloud, type FakeCloud } from '@/data/testing/fakeCloud';
import { EMPTY_DETAILS, findAccountByEmail, registerAccount } from '@/data/usecases/account';
import { currentConsents } from '@/data/usecases/profile';
import { t } from '@/i18n/es-MX';
import { useAccess, type MfaGateState } from '../accessState';
import { useCloud } from '../cloudState';
import { DEFAULT_PREFERENCES, usePreferences } from '../preferences';
import { screenPath } from '../screens';
import { AccessGate } from './AccessGate';
import { OAuthErrorNotice } from './OAuthErrorNotice';

vi.setConfig({ testTimeout: 30_000 });

const holder = vi.hoisted((): { cloud: unknown } => ({ cloud: null }));
vi.mock('@/data/cloud/client', () => ({
  getCloud: () => holder.cloud,
  cloudConfigured: () => holder.cloud !== null,
  loadCloud: () => Promise.resolve(holder.cloud),
}));

const AUTH_ID = '6f1c0f1e-6b4a-4d2a-9d55-6f2f3f6a1b10';
const SCREEN = 'Pantalla del equipo';
const captured: { api?: DataApi } = {};

function Capture() {
  const value = useDataApi();
  useEffect(() => {
    captured.api = value;
  });
  return null;
}

function mount(path: string = screenPath('home')) {
  render(
    <DataProvider kind="real">
      <Capture />
      <MemoryRouter initialEntries={[path]}>
        <OAuthErrorNotice />
        <AccessGate>
          <p>{SCREEN}</p>
        </AccessGate>
      </MemoryRouter>
    </DataProvider>,
  );
}

function linkedAs(
  fake: FakeCloud,
  role: 'physician' | 'admin' | 'owner' | 'student' = 'physician',
) {
  holder.cloud = fake.cloud;
  usePreferences.setState({ ...DEFAULT_PREFERENCES, role });
  useCloud.setState({
    state: {
      status: 'linked',
      identity: { authId: AUTH_ID, email: 'equipo@example.com', role, alias: 'Equipo' },
    },
  });
}

const gate = (mfa: MfaGateState) => {
  useAccess.setState({ mfa });
};

beforeEach(() => {
  useAccess.setState({ mfa: { status: 'not-required' }, signupFor: null, oauthError: null });
});

afterEach(async () => {
  cleanup();
  await captured.api?.deleteAllData?.();
  captured.api = undefined;
  holder.cloud = null;
  useCloud.setState({ state: { status: 'off' } });
  usePreferences.setState(DEFAULT_PREFERENCES);
  useAccess.setState({ mfa: { status: 'not-required' }, signupFor: null, oauthError: null });
});

describe('segundo factor del equipo', () => {
  it('sin la nube o sin nada pendiente deja ver la pantalla', () => {
    gate({ status: 'enroll' });
    mount();
    // Sin cuenta de la nube no hay nada que pedir
    expect(screen.getByText(SCREEN)).toBeVisible();
  });

  it('la primera vez da de alta el factor con el QR y la clave, y con el código correcto deja pasar', async () => {
    const typing = userEvent.setup();
    const fake = makeFakeCloud();
    linkedAs(fake);
    gate({ status: 'enroll' });
    mount();
    expect(
      await screen.findByRole('heading', { level: 1, name: t.accounts.mfa.enrollTitle }),
    ).toBeVisible();
    expect(screen.queryByText(SCREEN)).toBeNull();
    const qr = await screen.findByRole('img', { name: t.accounts.mfa.qrAlt });
    expect(qr.getAttribute('src')?.startsWith('data:image/svg+xml')).toBe(true);
    expect(screen.getByText('JBSW Y3DP EHPK 3PXP')).toBeVisible();
    expect(fake.mfa.enrollCalls).toBe(1);

    const code = screen.getByLabelText(t.accounts.mfa.codeLabel);
    await typing.type(code, '12');
    await typing.click(screen.getByRole('button', { name: t.accounts.mfa.verify }));
    expect(await screen.findByText(t.accounts.mfa.codeFormat)).toBeVisible();
    await typing.clear(code);
    await typing.type(code, '000000');
    await typing.click(screen.getByRole('button', { name: t.accounts.mfa.verify }));
    expect(await screen.findByText(t.accounts.mfa.errors.invalid)).toBeVisible();
    await typing.clear(code);
    await typing.type(code, '654 321');
    await typing.click(screen.getByRole('button', { name: t.accounts.mfa.verify }));
    expect(await screen.findByText(SCREEN)).toBeVisible();
    expect(useAccess.getState().mfa).toEqual({ status: 'verified' });
    expect(fake.mfa.level).toBe('aal2');
  });

  it('si no se pudo preparar el alta deja intentarlo otra vez', async () => {
    const typing = userEvent.setup();
    const fake = makeFakeCloud();
    fake.mfa.failEnroll = true;
    linkedAs(fake, 'admin');
    gate({ status: 'enroll' });
    mount();
    expect(await screen.findByText(t.accounts.mfa.prepareFailed)).toBeVisible();
    fake.mfa.failEnroll = false;
    await typing.click(screen.getByRole('button', { name: t.accounts.mfa.retry }));
    expect(await screen.findByRole('img', { name: t.accounts.mfa.qrAlt })).toBeVisible();
  });

  it('con un factor ya dado de alta solo pide el código', async () => {
    const typing = userEvent.setup();
    const fake = makeFakeCloud();
    fake.mfa.factors = [{ id: 'f1', factor_type: 'totp', status: 'verified' }];
    linkedAs(fake, 'owner');
    gate({ status: 'challenge', factorId: 'f1' });
    mount();
    expect(
      await screen.findByRole('heading', { level: 1, name: t.accounts.mfa.challengeTitle }),
    ).toBeVisible();
    expect(screen.queryByRole('img')).toBeNull();
    await typing.type(screen.getByLabelText(t.accounts.mfa.codeLabel), '654321');
    await typing.click(screen.getByRole('button', { name: t.accounts.mfa.verify }));
    expect(await screen.findByText(SCREEN)).toBeVisible();
    expect(fake.mfa.enrollCalls).toBe(0);
  });

  it('mientras revisa no enseña la pantalla y el aviso de privacidad siempre se puede leer', () => {
    linkedAs(makeFakeCloud());
    gate({ status: 'checking' });
    mount();
    expect(screen.queryByText(SCREEN)).toBeNull();
    cleanup();
    gate({ status: 'challenge', factorId: 'f1' });
    mount(screenPath('privacyNotice'));
    expect(screen.getByText(SCREEN)).toBeVisible();
  });
});

describe('completa tu registro', () => {
  it('una cuenta de Google confirma su edad y acepta el aviso antes de seguir', async () => {
    const typing = userEvent.setup();
    const fake = makeFakeCloud();
    linkedAs(fake, 'student');
    mount();
    await waitFor(() => {
      expect(captured.api).toBeDefined();
    });
    const api = captured.api as DataApi;
    const created = await registerAccount(api, {
      alias: 'gugle',
      email: 'gugle@example.com',
      dailyGoal: { metric: 'cards', value: 20 },
      details: EMPTY_DETAILS,
    });
    if (!created.ok) throw new Error('no se creó');
    useAccess.setState({ signupFor: created.user.id });

    expect(
      await screen.findByRole('heading', { level: 1, name: t.accounts.completeSignup.title }),
    ).toBeVisible();
    expect(screen.queryByText(SCREEN)).toBeNull();
    const alias = await screen.findByLabelText(t.onboarding.alias);
    expect(alias).toHaveValue('gugle');
    await typing.click(screen.getByRole('button', { name: t.accounts.completeSignup.save }));
    expect(await screen.findByText(t.accounts.signup.adultError(18))).toBeVisible();
    expect(screen.getByText(t.onboarding.privacyError)).toBeVisible();

    await typing.clear(alias);
    await typing.type(alias, 'Gugle MD');
    await typing.selectOptions(screen.getByLabelText(t.account.targetSpecialty), 'geriatrics');
    await typing.selectOptions(screen.getByLabelText(t.accounts.signup.heardFrom.label), 'google');
    await typing.click(screen.getByLabelText(t.onboarding.consents.anonymized_improvement[0]));
    await typing.click(screen.getByLabelText(t.accounts.signup.adultAccept(18)));
    await typing.click(screen.getByLabelText(t.onboarding.privacyAccept));
    await typing.click(screen.getByRole('button', { name: t.accounts.completeSignup.save }));

    expect(await screen.findByText(SCREEN)).toBeVisible();
    expect(useAccess.getState().signupFor).toBeNull();
    const account = await findAccountByEmail(api, 'gugle@example.com');
    expect(account).toMatchObject({
      targetSpecialty: 'geriatrics',
      heardFrom: { channel: 'google', influencerCode: null },
    });
    expect(account?.adultConfirmedAt).toBeDefined();
    expect((await api.repos.users.get(created.user.id))?.alias).toBe('Gugle MD');
    expect(await currentConsents(api, created.user.id)).toEqual({
      party: false,
      ai_analysis: false,
      anonymized_improvement: true,
    });
    // La aceptación del aviso queda también en la nube
    await waitFor(() => {
      expect(fake.acceptances).toEqual([PRIVACY_NOTICE_VERSION]);
    });
  });
});

describe('aviso de Google', () => {
  it('explica por qué no se pudo entrar y se descarta', async () => {
    const typing = userEvent.setup();
    useAccess.setState({ oauthError: 'invitation_required' });
    mount();
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(t.accounts.oauthError.title);
    expect(alert).toHaveTextContent(t.accounts.oauthError.invitation_required);
    await typing.click(screen.getByRole('button', { name: t.accounts.oauthError.dismiss }));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(useAccess.getState().oauthError).toBeNull();
  });
});
