import { describe, expect, it, vi } from 'vitest';
import { t } from '@/i18n/es-MX';
import type { WeekShareCard } from './achievement';
import { shareWeek, type ShareDeps } from './shareAchievement';

const card: WeekShareCard = {
  brand: 'Marca',
  alias: null,
  weekStart: '2026-10-12',
  studyDays: 4,
  reviews: 120,
  questions: 35,
  streak: 6,
  simulated: false,
};
const render = () => Promise.resolve(new Blob(['png'], { type: 'image/png' }));

function deps(overrides: Partial<ShareDeps> = {}) {
  const share = vi.fn<(data: ShareData) => Promise<void>>(() => Promise.resolve());
  const download = vi.fn<(file: File) => void>();
  const value: ShareDeps = { share, canShare: () => true, download, ...overrides };
  return { value, share, download };
}

describe('compartir el resumen de la semana', () => {
  it('con el menú del sistema comparte la imagen con su texto y no descarga nada', async () => {
    const { value, share, download } = deps();
    await expect(shareWeek(card, render, value)).resolves.toBe('shared');
    expect(share).toHaveBeenCalledTimes(1);
    const data = share.mock.calls[0]?.[0];
    expect(data?.title).toBe(t.b7.weekShare.shareTitle);
    expect(data?.text).toContain('4 días de estudio');
    expect(data?.text).toContain('120 repasos');
    expect(data?.files).toHaveLength(1);
    expect(data?.files?.[0]).toMatchObject({ name: t.b7.weekShare.fileName, type: 'image/png' });
    expect(download).not.toHaveBeenCalled();
  });

  it('pregunta al navegador si puede compartir esa imagen antes de abrir el menú', async () => {
    const canShare = vi.fn<(data: ShareData) => boolean>(() => true);
    const { value } = deps({ canShare });
    await shareWeek(card, render, value);
    expect(canShare).toHaveBeenCalledWith(
      expect.objectContaining({ files: [expect.objectContaining({ type: 'image/png' })] }),
    );
  });

  it('sin Web Share API descarga la imagen', async () => {
    const { value, download } = deps({ share: undefined, canShare: undefined });
    await expect(shareWeek(card, render, value)).resolves.toBe('downloaded');
    expect(download).toHaveBeenCalledTimes(1);
    expect(download.mock.calls[0]?.[0].name).toBe(t.b7.weekShare.fileName);
  });

  it('si el navegador no puede compartir archivos descarga la imagen', async () => {
    const { value, share, download } = deps({ canShare: () => false });
    await expect(shareWeek(card, render, value)).resolves.toBe('downloaded');
    expect(share).not.toHaveBeenCalled();
    expect(download).toHaveBeenCalledTimes(1);
  });

  it('cancelar el menú no es un error y no descarga nada', async () => {
    const { value, download } = deps({
      share: () => Promise.reject(new DOMException('cancelado', 'AbortError')),
    });
    await expect(shareWeek(card, render, value)).resolves.toBe('cancelled');
    expect(download).not.toHaveBeenCalled();
  });

  it('otro fallo del menú cae al respaldo de la descarga', async () => {
    const { value, download } = deps({
      share: () => Promise.reject(new DOMException('no permitido', 'NotAllowedError')),
    });
    await expect(shareWeek(card, render, value)).resolves.toBe('downloaded');
    expect(download).toHaveBeenCalledTimes(1);
  });

  it('si no se puede dibujar la imagen no comparte ni descarga nada', async () => {
    const { value, share, download } = deps();
    await expect(
      shareWeek(card, () => Promise.reject(new Error('sin canvas')), value),
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
    await expect(shareWeek(card, render, value)).resolves.toBe('failed');
  });
});
