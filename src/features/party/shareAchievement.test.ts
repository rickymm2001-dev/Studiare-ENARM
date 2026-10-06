import { describe, expect, it, vi } from 'vitest';
import { t } from '@/i18n/es-MX';
import type { AchievementCard } from './achievement';
import { shareAchievement, type ShareDeps } from './shareAchievement';

const card: AchievementCard = {
  brand: 'Marca',
  alias: null,
  level: 7,
  levelTitle: 'R2',
  streak: 12,
  weeklyXp: 1240,
  simulated: false,
};
const render = () => Promise.resolve(new Blob(['png'], { type: 'image/png' }));

function deps(overrides: Partial<ShareDeps> = {}) {
  const share = vi.fn<(data: ShareData) => Promise<void>>(() => Promise.resolve());
  const download = vi.fn<(file: File) => void>();
  const value: ShareDeps = { share, canShare: () => true, download, ...overrides };
  return { value, share, download };
}

describe('compartir la tarjeta de logro', () => {
  it('con el menú del sistema comparte la imagen con su texto y no descarga nada', async () => {
    const { value, share, download } = deps();
    await expect(shareAchievement(card, render, value)).resolves.toBe('shared');
    expect(share).toHaveBeenCalledTimes(1);
    const data = share.mock.calls[0]?.[0];
    expect(data?.title).toBe(t.party.share.shareTitle);
    expect(data?.text).toContain('nivel 7');
    expect(data?.files).toHaveLength(1);
    expect(data?.files?.[0]).toMatchObject({ name: t.party.share.fileName, type: 'image/png' });
    expect(download).not.toHaveBeenCalled();
  });

  it('sin Web Share API descarga la imagen', async () => {
    const { value, download } = deps({ share: undefined, canShare: undefined });
    await expect(shareAchievement(card, render, value)).resolves.toBe('downloaded');
    expect(download).toHaveBeenCalledTimes(1);
    expect(download.mock.calls[0]?.[0].name).toBe(t.party.share.fileName);
  });

  it('si el navegador no puede compartir archivos descarga la imagen', async () => {
    const { value, share, download } = deps({ canShare: () => false });
    await expect(shareAchievement(card, render, value)).resolves.toBe('downloaded');
    expect(share).not.toHaveBeenCalled();
    expect(download).toHaveBeenCalledTimes(1);
  });

  it('cancelar el menú no es un error y no descarga nada', async () => {
    const { value, download } = deps({
      share: () => Promise.reject(new DOMException('cancelado', 'AbortError')),
    });
    await expect(shareAchievement(card, render, value)).resolves.toBe('cancelled');
    expect(download).not.toHaveBeenCalled();
  });

  it('otro fallo del menú cae al respaldo de la descarga', async () => {
    const { value, download } = deps({
      share: () => Promise.reject(new DOMException('no permitido', 'NotAllowedError')),
    });
    await expect(shareAchievement(card, render, value)).resolves.toBe('downloaded');
    expect(download).toHaveBeenCalledTimes(1);
  });

  it('si no se puede dibujar la imagen no comparte ni descarga nada', async () => {
    const { value, share, download } = deps();
    await expect(
      shareAchievement(card, () => Promise.reject(new Error('sin canvas')), value),
    ).resolves.toBe('failed');
    expect(share).not.toHaveBeenCalled();
    expect(download).not.toHaveBeenCalled();
  });

  it('si ni la descarga funciona avisa que falló', async () => {
    const { value } = deps({
      share: undefined,
      download: () => {
        throw new Error('sin descargas');
      },
    });
    await expect(shareAchievement(card, render, value)).resolves.toBe('failed');
  });
});
