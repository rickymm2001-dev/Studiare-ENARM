import { describe, expect, it, vi } from 'vitest';
import { referralCodeFromSearch } from '@/data/referrals/pendingReferral';
import { t } from '@/i18n/es-MX';
import { referralLink, shareReferralLink, type LinkShareDeps } from './referralLink';

describe('enlace de invitación', () => {
  it('lleva a la bienvenida con el código, en la raíz o bajo la ruta publicada', () => {
    expect(referralLink('ABCD2345', 'https://studiare.mx', '/')).toBe(
      'https://studiare.mx/bienvenida?ref=ABCD2345',
    );
    expect(referralLink('ABCD2345', 'https://ejemplo.github.io', '/Studiare-ENARM/')).toBe(
      'https://ejemplo.github.io/Studiare-ENARM/bienvenida?ref=ABCD2345',
    );
  });

  it('la bienvenida lee el mismo código que lleva el enlace', () => {
    const link = new URL(referralLink('ABCD2345', 'https://studiare.mx', '/'));
    expect(referralCodeFromSearch(link.search)).toBe('ABCD2345');
  });
});

describe('compartir el enlace', () => {
  const link = 'https://studiare.mx/bienvenida?ref=ABCD2345';

  function deps(overrides: Partial<LinkShareDeps> = {}) {
    const share = vi.fn<(data: ShareData) => Promise<void>>(() => Promise.resolve());
    const copy = vi.fn<(text: string) => Promise<void>>(() => Promise.resolve());
    return { value: { share, copy, ...overrides }, share, copy };
  }

  it('con el menú del sistema comparte el enlace con su texto y no copia', async () => {
    const { value, share, copy } = deps();
    await expect(shareReferralLink(link, value)).resolves.toBe('shared');
    expect(share).toHaveBeenCalledWith({
      title: t.b7.referral.shareTitle,
      text: t.b7.referral.shareText,
      url: link,
    });
    expect(copy).not.toHaveBeenCalled();
  });

  it('el texto no lleva nombres ni correos, solo la invitación', () => {
    expect(t.b7.referral.shareText).not.toMatch(/@/);
  });

  it('sin menú de compartir copia el enlace', async () => {
    const { value, copy } = deps({ share: undefined });
    await expect(shareReferralLink(link, value)).resolves.toBe('copied');
    expect(copy).toHaveBeenCalledWith(link);
  });

  it('cancelar no copia nada y otro fallo cae a copiar', async () => {
    const cancelled = deps({
      share: () => Promise.reject(new DOMException('cancelado', 'AbortError')),
    });
    await expect(shareReferralLink(link, cancelled.value)).resolves.toBe('cancelled');
    expect(cancelled.copy).not.toHaveBeenCalled();
    const denied = deps({
      share: () => Promise.reject(new DOMException('no', 'NotAllowedError')),
    });
    await expect(shareReferralLink(link, denied.value)).resolves.toBe('copied');
  });

  it('si tampoco se puede copiar lo dice', async () => {
    const { value } = deps({
      share: undefined,
      copy: () => Promise.reject(new Error('sin portapapeles')),
    });
    await expect(shareReferralLink(link, value)).resolves.toBe('failed');
  });
});
