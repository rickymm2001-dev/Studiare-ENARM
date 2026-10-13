// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCloud } from '@/app/cloudState';
import { PENDING_REFERRAL_KEY } from '@/data/referrals/pendingReferral';
import { t } from '@/i18n/es-MX';
import { ReferralCard } from './ReferralCard';
import type { LinkShareDeps } from './referralLink';

const holder = vi.hoisted((): { cloud: unknown } => ({ cloud: null }));
vi.mock('@/data/cloud/client', () => ({
  getCloud: () => holder.cloud,
  cloudConfigured: () => holder.cloud !== null,
  loadCloud: () => Promise.resolve(holder.cloud),
}));

const base = {
  pending: 1,
  completed: 2,
  monthsEarned: 2,
  grantedUntil: '2026-12-01T00:00:00.000Z',
  referredBy: false,
};

function fakeCloudFor(options: { summary?: unknown; redeem?: string; failLoad?: boolean } = {}) {
  const state = {
    summary: options.summary ?? base,
    redeemCalls: [] as unknown[],
    redeemResult: options.redeem ?? 'ok',
  };
  holder.cloud = {
    rpc: (name: string, args?: unknown) => {
      if (options.failLoad) return Promise.resolve({ data: null, error: { message: 'x' } });
      if (name === 'my_referral_code') return Promise.resolve({ data: 'ABCD2345', error: null });
      if (name === 'my_referrals') return Promise.resolve({ data: state.summary, error: null });
      state.redeemCalls.push(args);
      if (state.redeemResult === 'ok') state.summary = { ...base, referredBy: true };
      return Promise.resolve({ data: state.redeemResult, error: null });
    },
  };
  return state;
}

const link = () => {
  useCloud.setState({
    state: {
      status: 'linked',
      identity: { authId: 'a', email: 'a@x.mx', role: 'student', alias: null },
    },
  });
};

beforeEach(() => {
  link();
});
afterEach(() => {
  cleanup();
  holder.cloud = null;
  useCloud.setState({ state: { status: 'off' } });
  localStorage.clear();
});

describe('referidos en Party', () => {
  it('sin la cuenta en la nube explica qué hace falta', () => {
    useCloud.setState({ state: { status: 'off' } });
    render(<ReferralCard />);
    expect(screen.getByText(t.referrals.needsCloud)).toBeVisible();
    expect(screen.queryByTestId('referral-code')).toBeNull();
  });

  it('muestra el código, los referidos y los meses ganados', async () => {
    fakeCloudFor();
    render(<ReferralCard />);
    expect(await screen.findByTestId('referral-code')).toHaveTextContent('ABCD2345');
    expect(screen.getByText(t.referrals.pending(1))).toBeVisible();
    expect(screen.getByText(t.referrals.completed(2))).toBeVisible();
    expect(screen.getByText(t.referrals.months(2))).toBeVisible();
    expect(
      screen.getByText(t.referrals.until(new Date(base.grantedUntil).toLocaleDateString('es-MX'))),
    ).toBeVisible();
    expect(screen.getByText(t.b7.referral.rule)).toBeVisible();
  });

  it('copia el código', async () => {
    fakeCloudFor();
    const typing = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
    render(<ReferralCard />);
    await typing.click(await screen.findByRole('button', { name: t.referrals.copy }));
    expect(writeText).toHaveBeenCalledWith('ABCD2345');
    expect(await screen.findByText(t.referrals.copied)).toBeVisible();
  });

  it('canjea el código de quien invitó y deja de pedirlo', async () => {
    const state = fakeCloudFor();
    const typing = userEvent.setup();
    render(<ReferralCard />);
    await typing.type(await screen.findByLabelText(t.referrals.redeemLabel), 'wxyz 6789');
    await typing.click(screen.getByRole('button', { name: t.referrals.redeem }));
    expect(await screen.findByText(t.referrals.redeemed)).toBeVisible();
    expect(state.redeemCalls).toEqual([{ p_code: 'WXYZ6789' }]);
    expect(await screen.findByText(t.referrals.alreadyReferred)).toBeVisible();
    expect(screen.queryByLabelText(t.referrals.redeemLabel)).toBeNull();
  });

  it('cada respuesta del servidor tiene su mensaje', async () => {
    for (const result of ['own', 'already', 'circular', 'too_late', 'already_paid'] as const) {
      fakeCloudFor({ redeem: result });
      const typing = userEvent.setup();
      const view = render(<ReferralCard />);
      await typing.type(await screen.findByLabelText(t.referrals.redeemLabel), 'WXYZ6789');
      await typing.click(screen.getByRole('button', { name: t.referrals.redeem }));
      expect(await screen.findByText(t.referrals.results[result])).toBeVisible();
      view.unmount();
    }
  });

  it('quien ya fue invitado no ve el formulario', async () => {
    fakeCloudFor({ summary: { ...base, referredBy: true } });
    render(<ReferralCard />);
    expect(await screen.findByText(t.referrals.alreadyReferred)).toBeVisible();
    expect(screen.queryByRole('button', { name: t.referrals.redeem })).toBeNull();
  });

  it('si la nube no responde lo dice', async () => {
    fakeCloudFor({ failLoad: true });
    render(<ReferralCard />);
    expect(await screen.findByText(t.referrals.loadFailed)).toBeVisible();
  });

  // Invita y gana un mes con enlace (respuesta 77 y 4.3 del plan del cambio, B7)
  describe('enlace de invitación', () => {
    const link = () => `${window.location.origin}/bienvenida?ref=ABCD2345`;

    it('la tarjeta se llama Invita y gana un mes y muestra el enlace con el código', async () => {
      fakeCloudFor();
      render(<ReferralCard />);
      expect(screen.getByRole('heading', { level: 2, name: t.b7.referral.title })).toBeVisible();
      expect(await screen.findByTestId('referral-link')).toHaveTextContent(link());
    });

    it('dentro de Perfil el título es h3, bajo el h2 de la sección', () => {
      render(<ReferralCard headingAs="h3" />);
      expect(screen.getByRole('heading', { level: 3, name: t.b7.referral.title })).toBeVisible();
    });

    it('comparte el enlace con el menú del teléfono', async () => {
      fakeCloudFor();
      const typing = userEvent.setup();
      const share = vi.fn<(data: ShareData) => Promise<void>>(() => Promise.resolve());
      const copy = vi.fn<(text: string) => Promise<void>>(() => Promise.resolve());
      const deps: LinkShareDeps = { share, copy };
      render(<ReferralCard shareDeps={deps} />);
      await typing.click(await screen.findByRole('button', { name: t.b7.referral.share }));
      expect(await screen.findByText(t.b7.referral.shared)).toBeVisible();
      expect(share).toHaveBeenCalledWith({
        title: t.b7.referral.shareTitle,
        text: t.b7.referral.shareText,
        url: link(),
      });
      expect(copy).not.toHaveBeenCalled();
    });

    it('sin menú de compartir copia el enlace', async () => {
      fakeCloudFor();
      const typing = userEvent.setup();
      const copy = vi.fn<(text: string) => Promise<void>>(() => Promise.resolve());
      render(<ReferralCard shareDeps={{ copy }} />);
      await typing.click(await screen.findByRole('button', { name: t.b7.referral.share }));
      expect(await screen.findByText(t.b7.referral.linkCopied)).toBeVisible();
      expect(copy).toHaveBeenCalledWith(link());
    });

    it('si el alumno cancela el menú no copia nada', async () => {
      fakeCloudFor();
      const typing = userEvent.setup();
      const copy = vi.fn<(text: string) => Promise<void>>(() => Promise.resolve());
      const share = () => Promise.reject(new DOMException('cancelado', 'AbortError'));
      render(<ReferralCard shareDeps={{ share, copy }} />);
      await typing.click(await screen.findByRole('button', { name: t.b7.referral.share }));
      expect(copy).not.toHaveBeenCalled();
      expect(screen.queryByText(t.b7.referral.linkCopied)).toBeNull();
    });

    it('si el código del enlace no se pudo canjear solo, ya viene escrito y al canjearlo se olvida', async () => {
      localStorage.setItem(PENDING_REFERRAL_KEY, 'WXYZ6789');
      const state = fakeCloudFor();
      const typing = userEvent.setup();
      render(<ReferralCard />);
      expect(await screen.findByLabelText(t.referrals.redeemLabel)).toHaveValue('WXYZ6789');
      await typing.click(screen.getByRole('button', { name: t.referrals.redeem }));
      expect(await screen.findByText(t.referrals.redeemed)).toBeVisible();
      expect(state.redeemCalls).toEqual([{ p_code: 'WXYZ6789' }]);
      expect(localStorage.getItem(PENDING_REFERRAL_KEY)).toBeNull();
    });

    it('un código escrito a mano que no vale no borra el del enlace', async () => {
      localStorage.setItem(PENDING_REFERRAL_KEY, 'WXYZ6789');
      fakeCloudFor({ redeem: 'invalid' });
      const typing = userEvent.setup();
      render(<ReferralCard />);
      const input = await screen.findByLabelText(t.referrals.redeemLabel);
      await typing.clear(input);
      await typing.type(input, 'ZZZZ9999');
      await typing.click(screen.getByRole('button', { name: t.referrals.redeem }));
      expect(await screen.findByText(t.referrals.results.invalid)).toBeVisible();
      expect(localStorage.getItem(PENDING_REFERRAL_KEY)).toBe('WXYZ6789');
    });
  });
});
