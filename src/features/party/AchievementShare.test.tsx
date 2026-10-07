// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { t } from '@/i18n/es-MX';
import { AchievementShare } from './AchievementShare';
import type { ShareDeps } from './shareAchievement';

const snapshot = {
  level: { level: 7, title: 'R2', xpIntoLevel: 10, xpForNext: 100 },
  streak: { current: 12 },
  weeklyXp: 1240,
} as never;
const png = () => Promise.resolve(new Blob(['png'], { type: 'image/png' }));

function setup(options: { simulated?: boolean; deps?: Partial<ShareDeps> } = {}) {
  const share = vi.fn<(data: ShareData) => Promise<void>>(() => Promise.resolve());
  const download = vi.fn<(file: File) => void>();
  const deps: ShareDeps = { share, canShare: () => true, download, ...options.deps };
  render(
    <AchievementShare
      snapshot={snapshot}
      alias="Ana"
      simulated={options.simulated ?? false}
      render={png}
      deps={deps}
    />,
  );
  return { share, download };
}

describe('botón de compartir el logro', () => {
  it('muestra la tarjeta con nivel, racha y XP y nada se comparte hasta tocar el botón', () => {
    const { share, download } = setup();
    const preview = screen.getByRole('figure', { name: t.party.share.previewLabel });
    expect(preview).toHaveTextContent('R2');
    expect(preview).toHaveTextContent(t.party.share.level(7));
    expect(preview).toHaveTextContent(t.party.share.streakValue(12));
    expect(preview).toHaveTextContent('1,240');
    expect(share).not.toHaveBeenCalled();
    expect(download).not.toHaveBeenCalled();
  });

  it('al tocarlo abre el menú de compartir con la imagen y el texto, y lo dice', async () => {
    const typing = userEvent.setup();
    const { share, download } = setup();
    await typing.click(screen.getByRole('button', { name: t.party.share.button }));
    expect(await screen.findByText(t.party.share.outcomes.shared)).toBeVisible();
    expect(share).toHaveBeenCalledTimes(1);
    expect(share.mock.calls[0]?.[0]).toMatchObject({
      title: t.party.share.shareTitle,
      files: [expect.objectContaining({ type: 'image/png' })],
    });
    expect(download).not.toHaveBeenCalled();
  });

  it('el alias solo va en la tarjeta y en el texto si se pide', async () => {
    const typing = userEvent.setup();
    const { share } = setup();
    const preview = screen.getByRole('figure', { name: t.party.share.previewLabel });
    expect(preview).not.toHaveTextContent('Ana');
    await typing.click(screen.getByRole('checkbox', { name: t.party.share.includeAlias }));
    expect(preview).toHaveTextContent('Ana');
    await typing.click(screen.getByRole('button', { name: t.party.share.button }));
    await screen.findByText(t.party.share.outcomes.shared);
    expect(share.mock.calls[0]?.[0].text).toContain('Ana');
  });

  it('sin Web Share API descarga la imagen y se lo explica', async () => {
    const typing = userEvent.setup();
    const { download } = setup({ deps: { share: undefined, canShare: undefined } });
    await typing.click(screen.getByRole('button', { name: t.party.share.button }));
    expect(await screen.findByText(t.party.share.outcomes.downloaded)).toBeVisible();
    expect(download).toHaveBeenCalledTimes(1);
  });

  it('si el alumno cancela el menú no se descarga nada', async () => {
    const typing = userEvent.setup();
    const { download } = setup({
      deps: { share: () => Promise.reject(new DOMException('cancelado', 'AbortError')) },
    });
    await typing.click(screen.getByRole('button', { name: t.party.share.button }));
    expect(await screen.findByText(t.party.share.outcomes.cancelled)).toBeVisible();
    expect(download).not.toHaveBeenCalled();
  });

  it('con datos de demostración la tarjeta lo dice y no se puede confundir con un logro real', () => {
    setup({ simulated: true });
    expect(screen.getByRole('figure', { name: t.party.share.previewLabel })).toHaveTextContent(
      t.party.share.simulatedBanner,
    );
  });
});
