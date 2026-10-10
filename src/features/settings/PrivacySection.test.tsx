// @vitest-environment jsdom
// Configuración, sección Privacidad (D-101). Los consentimientos se dan y se retiran con su evento, y
// el puntaje oficial solo se captura con el permiso de mejora anónima y se borra al retirarlo.
import 'fake-indexeddb/auto';
import { cleanup, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SCREENS } from '@/app/screens';
import { renderApp, resetApp, type RenderedApp } from '@/app/testing/renderApp';
import { newId } from '@/data/testing/fixtures';
import { currentConsents } from '@/data/usecases/profile';
import { t } from '@/i18n/es-MX';

vi.setConfig({ testTimeout: 60_000 });
const WAIT = { timeout: 30_000 };

let app: RenderedApp | undefined;
afterEach(async () => {
  cleanup();
  await resetApp(app?.api);
  app = undefined;
});

const [PARTY, AI, IMPROVEMENT] = [
  t.onboarding.consents.party[0],
  t.onboarding.consents.ai_analysis[0],
  t.onboarding.consents.anonymized_improvement[0],
];

/** El alumno de la prueba con los tres permisos dados, como al crear su perfil */
const open = () =>
  renderApp(`${SCREENS.settings.path}?seccion=privacy`, {
    seed: async (api, user) => {
      for (const purpose of ['party', 'ai_analysis', 'anonymized_improvement'] as const) {
        await api.repos.consents.put({
          id: newId(),
          userId: user.id,
          purpose,
          noticeVersion: '2026-10-01',
          status: 'granted',
          decidedAt: '2026-10-01T00:00:00.000Z',
        });
      }
    },
  });

describe('Privacidad en Configuración', () => {
  it('muestra los tres permisos y retirar uno lo guarda como evento', async () => {
    const typing = userEvent.setup();
    const { api, user } = (app = await open());
    const party = await screen.findByRole('checkbox', { name: PARTY }, WAIT);
    await waitFor(() => {
      expect(party).toBeChecked();
    }, WAIT);
    expect(screen.getByRole('checkbox', { name: AI })).toBeChecked();

    await typing.click(party);
    expect(await screen.findByText(t.settings.privacy.consentSaved, {}, WAIT)).toBeInTheDocument();
    await waitFor(async () => {
      expect((await currentConsents(api, user.id)).party).toBe(false);
    }, WAIT);
    await waitFor(() => {
      expect(screen.getByRole('checkbox', { name: PARTY })).not.toBeChecked();
    }, WAIT);
  });

  it('guarda el puntaje oficial con el permiso y lo borra al retirar la mejora anónima', async () => {
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

    await typing.click(screen.getByRole('checkbox', { name: IMPROVEMENT }));
    expect(
      await screen.findByText(t.settings.privacy.scoreNeedsConsent, {}, WAIT),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText(t.settings.privacy.score)).not.toBeInTheDocument();
    await waitFor(async () => {
      expect(await api.repos.officialScores.get(user.id)).toBeUndefined();
    }, WAIT);
    expect(await screen.findByText(t.settings.privacy.none, {}, WAIT)).toBeInTheDocument();
  });

  it('un puntaje fuera de rango muestra el error y no se guarda', async () => {
    const typing = userEvent.setup();
    app = await open();
    const score = await screen.findByLabelText(t.settings.privacy.score, {}, WAIT);
    // La validación es la nuestra y no la del navegador, así el aviso sale en español
    await typing.type(score, '101');
    await typing.click(screen.getByRole('button', { name: t.settings.privacy.saveScore }));
    expect(
      await screen.findByText(t.settings.privacy.scoreErrors.invalid_score, {}, WAIT),
    ).toBeInTheDocument();
    expect(await app.api.repos.officialScores.get(app.user.id)).toBeUndefined();
  });

  it('quitar el puntaje lo borra sin tocar el permiso', async () => {
    const typing = userEvent.setup();
    app = await open();
    const score = await screen.findByLabelText(t.settings.privacy.score, {}, WAIT);
    await typing.type(score, '65');
    await typing.click(screen.getByRole('button', { name: t.settings.privacy.saveScore }));
    await typing.click(
      await screen.findByRole('button', { name: t.settings.privacy.removeScore }, WAIT),
    );
    expect(await screen.findByText(t.settings.privacy.scoreRemoved, {}, WAIT)).toBeInTheDocument();
    expect(await app.api.repos.officialScores.get(app.user.id)).toBeUndefined();
    expect(screen.getByRole('checkbox', { name: IMPROVEMENT })).toBeChecked();
  });
});
