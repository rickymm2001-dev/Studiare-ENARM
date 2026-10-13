// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_PREFERENCES, usePreferences } from '@/app/preferences';
import { t } from '@/i18n/es-MX';
import { DEFAULT_APPEARANCE } from '@/ui/appearance';
import type { WeekShareSource } from './achievement';
import { AchievementShare } from './AchievementShare';
import type { ShareDeps } from './shareAchievement';

const text = t.b7.weekShare;

/** Miércoles 14 de octubre. Dos días de estudio desde el lunes 12 */
const snapshot: WeekShareSource = {
  today: '2026-10-14',
  activity: {
    '2026-10-12': { cards: 30, questions: 10, focusMinutes: 20, xp: 400 },
    '2026-10-14': { cards: 1210, questions: 5, focusMinutes: 15, xp: 150 },
  },
  streak: {
    current: 12,
    best: 12,
    freezesAvailable: 0,
    freezeDays: [],
    todayMet: true,
    closedDays: [],
  },
};
const png = () => Promise.resolve(new Blob(['png'], { type: 'image/png' }));

afterEach(() => {
  cleanup();
  usePreferences.setState(DEFAULT_PREFERENCES);
});

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

const preview = () => screen.getByRole('figure', { name: text.previewLabel });

describe('Comparte tu semana', () => {
  it('muestra el resumen de la semana y nada se comparte hasta tocar el botón', () => {
    const { share, download } = setup();
    expect(screen.getByRole('heading', { name: text.title })).toBeVisible();
    const figure = preview();
    expect(figure).toHaveTextContent(text.heading);
    expect(figure).toHaveTextContent(text.week('12 de octubre'));
    // Cada cifra con su etiqueta, para el lector de pantalla
    const figures = within(figure).getAllByRole('definition');
    expect(figures.map((item) => item.textContent)).toEqual([
      text.studyDaysValue(2),
      '1,240',
      '15',
      text.streakValue(12),
    ]);
    expect(
      within(figure)
        .getAllByRole('term')
        .map((item) => item.textContent),
    ).toEqual([text.studyDays, text.reviews, text.questions, text.streak]);
    // Sin XP, nivel ni puntajes
    expect(figure).not.toHaveTextContent(/XP|Nivel|%/);
    expect(share).not.toHaveBeenCalled();
    expect(download).not.toHaveBeenCalled();
  });

  it('al tocarlo abre el menú de compartir con la imagen y el texto, y lo dice', async () => {
    const typing = userEvent.setup();
    const { share, download } = setup();
    await typing.click(screen.getByRole('button', { name: text.button }));
    expect(await screen.findByText(text.outcomes.shared)).toBeVisible();
    expect(share).toHaveBeenCalledTimes(1);
    expect(share.mock.calls[0]?.[0]).toMatchObject({
      title: text.shareTitle,
      files: [expect.objectContaining({ type: 'image/png', name: text.fileName })],
    });
    expect(share.mock.calls[0]?.[0].text).toContain('2 días de estudio');
    expect(download).not.toHaveBeenCalled();
  });

  it('el alias solo va en la imagen y en el texto si se pide', async () => {
    const typing = userEvent.setup();
    const { share } = setup();
    expect(preview()).not.toHaveTextContent('Ana');
    await typing.click(screen.getByRole('checkbox', { name: text.includeAlias }));
    expect(preview()).toHaveTextContent('Ana');
    await typing.click(screen.getByRole('button', { name: text.button }));
    await screen.findByText(text.outcomes.shared);
    expect(share.mock.calls[0]?.[0].text).toContain('Ana');
  });

  it('sin Web Share API descarga la imagen y se lo explica', async () => {
    const typing = userEvent.setup();
    const { download } = setup({ deps: { share: undefined, canShare: undefined } });
    await typing.click(screen.getByRole('button', { name: text.button }));
    expect(await screen.findByText(text.outcomes.downloaded)).toBeVisible();
    expect(download).toHaveBeenCalledTimes(1);
  });

  it('si el alumno cancela el menú no se descarga nada', async () => {
    const typing = userEvent.setup();
    const { download } = setup({
      deps: { share: () => Promise.reject(new DOMException('cancelado', 'AbortError')) },
    });
    await typing.click(screen.getByRole('button', { name: text.button }));
    expect(await screen.findByText(text.outcomes.cancelled)).toBeVisible();
    expect(download).not.toHaveBeenCalled();
  });

  it('con datos de demostración la imagen lo dice y no se puede confundir con una semana real', () => {
    setup({ simulated: true });
    expect(preview()).toHaveTextContent(text.simulatedBanner);
  });

  it('en modo enfoque no muestra ni comparte la racha', async () => {
    usePreferences.setState({ appearance: { ...DEFAULT_APPEARANCE, focusMode: true } });
    const typing = userEvent.setup();
    const { share } = setup();
    expect(screen.getByText(text.hintFocus)).toBeVisible();
    expect(within(preview()).queryByText(text.streak)).toBeNull();
    expect(within(preview()).getAllByRole('term')).toHaveLength(3);
    await typing.click(screen.getByRole('button', { name: text.button }));
    await screen.findByText(text.outcomes.shared);
    expect(share.mock.calls[0]?.[0].text).not.toContain('racha');
  });
});
