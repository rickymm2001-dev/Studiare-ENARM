// @vitest-environment jsdom
// Progreso, captura del puntaje oficial (D-119 B3, Fases E y P).
// Se movió de Configuración a Progreso.
import 'fake-indexeddb/auto';
import { cleanup, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SCREENS } from '@/app/screens';
import { renderApp, resetApp, type RenderedApp } from '@/app/testing/renderApp';
import { newId } from '@/data/testing/fixtures';
import { t } from '@/i18n/es-MX';

vi.setConfig({ testTimeout: 60_000 });
const WAIT = { timeout: 30_000 };

let app: RenderedApp | undefined;
afterEach(async () => {
  cleanup();
  await resetApp(app?.api);
  app = undefined;
});

const open = () =>
  renderApp(SCREENS.progress.path, {
    seed: async (api, user) => {
      await api.repos.consents.put({
        id: newId(),
        userId: user.id,
        purpose: 'anonymized_improvement',
        noticeVersion: '2026-10-01',
        status: 'granted',
        decidedAt: '2026-10-01T00:00:00.000Z',
      });
    },
  });

describe('OfficialScoreCard en Progreso', () => {
  it('guarda el puntaje oficial con el permiso', async () => {
    const typing = userEvent.setup();
    const { api, user } = (app = await open());
    expect(await screen.findByText(t.settings.privacy.none, {}, WAIT)).toBeInTheDocument();

    const score = await screen.findByLabelText(t.settings.privacy.score, {}, WAIT);
    await typing.type(score, '72.5');
    await typing.click(screen.getByRole('button', { name: t.settings.privacy.saveScore }));
    expect(
      await screen.findByText(t.settings.privacy.current(new Date().getFullYear(), 72.5), {}, WAIT),
    ).toBeInTheDocument();
    expect((await api.repos.officialScores.get(user.id))?.score).toBe(72.5);
  });

  it('un puntaje fuera de rango muestra el error y no se guarda', async () => {
    const typing = userEvent.setup();
    app = await open();
    const score = await screen.findByLabelText(t.settings.privacy.score, {}, WAIT);
    await typing.type(score, '101');
    await typing.click(screen.getByRole('button', { name: t.settings.privacy.saveScore }));
    expect(
      await screen.findByText(t.settings.privacy.scoreErrors.invalid_score, {}, WAIT),
    ).toBeInTheDocument();
    expect(await app.api.repos.officialScores.get(app.user.id)).toBeUndefined();
  });

  it('quitar el puntaje lo borra', async () => {
    const typing = userEvent.setup();
    app = await open();
    const score = await screen.findByLabelText(t.settings.privacy.score, {}, WAIT);
    await typing.type(score, '65');
    await typing.click(screen.getByRole('button', { name: t.settings.privacy.saveScore }));
    const removeBtn = await screen.findByRole('button', { name: t.settings.privacy.removeScore }, WAIT);
    await typing.click(removeBtn);
    expect(await screen.findByText(t.settings.privacy.scoreRemoved, {}, WAIT)).toBeInTheDocument();
    await waitFor(async () => {
      expect(await app?.api.repos.officialScores.get(app.user.id)).toBeUndefined();
    }, WAIT);
  });
});
