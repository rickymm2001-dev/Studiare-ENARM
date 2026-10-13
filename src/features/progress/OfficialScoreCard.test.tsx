// @vitest-environment jsdom
// Puntaje oficial del ENARM al final de Progreso (D-101, B3 del plan del cambio). Solo se captura con
// el permiso de mejora anónima, que vive en Configuración, Privacidad, y se borra al retirarlo.
import 'fake-indexeddb/auto';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SCREENS } from '@/app/screens';
import { renderApp, resetApp, type RenderedApp } from '@/app/testing/renderApp';
import { newId } from '@/data/testing/fixtures';
import { changeConsent } from '@/data/usecases/privacy';
import { t } from '@/i18n/es-MX';

vi.setConfig({ testTimeout: 60_000 });
const WAIT = { timeout: 30_000 };
const text = t.settings.privacy;

let app: RenderedApp | undefined;
afterEach(async () => {
  cleanup();
  await resetApp(app?.api);
  app = undefined;
});

/** Progreso con el alumno de la prueba y, si se pide, el permiso de mejora anónima dado */
const open = (improvement = true) =>
  renderApp(SCREENS.progress.path, {
    seed: async (api, user) => {
      if (!improvement) return;
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

const card = () => screen.findByRole('region', { name: text.scoreTitle }, WAIT);

describe('puntaje oficial en Progreso', () => {
  it('sin el permiso no se captura y lleva a Privacidad a darlo', async () => {
    app = await open(false);
    const score = await card();
    expect(await within(score).findByText(text.scoreNeedsConsent, {}, WAIT)).toBeVisible();
    expect(within(score).queryByLabelText(text.score)).toBeNull();
    expect(
      within(score).getByRole('link', { name: t.settingsPage.officialScore.turnOn }),
    ).toHaveAttribute('href', `${SCREENS.settings.path}#privacidad`);
  });

  it('va al final de Progreso, se guarda con el permiso y se borra al retirar la mejora anónima', async () => {
    const typing = userEvent.setup();
    const { api, user } = (app = await open());
    const score = await card();
    // Es la última tarjeta de la pantalla
    const regions = screen.getAllByRole('region');
    expect(regions.at(-1)).toBe(score);
    expect(await within(score).findByText(text.none, {}, WAIT)).toBeInTheDocument();

    await typing.type(await within(score).findByLabelText(text.score, {}, WAIT), '72.5');
    await typing.click(within(score).getByRole('button', { name: text.saveScore }));
    expect(
      await within(score).findByText(text.current(new Date().getFullYear(), 72.5), {}, WAIT),
    ).toBeInTheDocument();
    expect((await api.repos.officialScores.get(user.id))?.score).toBe(72.5);

    // El permiso se retira en Privacidad. Progreso lo nota, quita la captura y el puntaje
    await changeConsent(api, user, 'anonymized_improvement', false);
    expect(await within(score).findByText(text.scoreNeedsConsent, {}, WAIT)).toBeInTheDocument();
    expect(within(score).queryByLabelText(text.score)).toBeNull();
    await waitFor(async () => {
      expect(await api.repos.officialScores.get(user.id)).toBeUndefined();
    }, WAIT);
    expect(await within(score).findByText(text.none, {}, WAIT)).toBeInTheDocument();
  });

  it('un puntaje fuera de rango muestra el error y no se guarda', async () => {
    const typing = userEvent.setup();
    app = await open();
    const score = await card();
    // La validación es la nuestra y no la del navegador, así el aviso sale en español
    await typing.type(await within(score).findByLabelText(text.score, {}, WAIT), '101');
    await typing.click(within(score).getByRole('button', { name: text.saveScore }));
    expect(
      await within(score).findByText(text.scoreErrors.invalid_score, {}, WAIT),
    ).toBeInTheDocument();
    expect(await app.api.repos.officialScores.get(app.user.id)).toBeUndefined();
  });

  it('quitar el puntaje lo borra sin tocar el permiso', async () => {
    const typing = userEvent.setup();
    const { api, user } = (app = await open());
    const score = await card();
    await typing.type(await within(score).findByLabelText(text.score, {}, WAIT), '65');
    await typing.click(within(score).getByRole('button', { name: text.saveScore }));
    await typing.click(await within(score).findByRole('button', { name: text.removeScore }, WAIT));
    expect(await within(score).findByText(text.scoreRemoved, {}, WAIT)).toBeInTheDocument();
    expect(await api.repos.officialScores.get(user.id)).toBeUndefined();
    const consents = (await api.repos.consents.list()).filter(
      (consent) => consent.userId === user.id && consent.purpose === 'anonymized_improvement',
    );
    expect(consents.at(-1)?.status).toBe('granted');
  });
});
