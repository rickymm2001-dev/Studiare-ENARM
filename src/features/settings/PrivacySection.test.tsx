// @vitest-environment jsdom
// Configuración, sección Privacidad (D-101, B3 del plan del cambio). Los consentimientos se dan y se
// retiran con su evento, y aquí mismo se exportan y se borran los datos. La captura del puntaje
// oficial pasó a Progreso (sus pruebas están en OfficialScoreCard.test.tsx) y su permiso se queda.
import 'fake-indexeddb/auto';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SCREENS } from '@/app/screens';
import { renderApp, resetApp, type RenderedApp } from '@/app/testing/renderApp';
import { newId } from '@/data/testing/fixtures';
import { currentConsents } from '@/data/usecases/profile';
import { t } from '@/i18n/es-MX';
import { legalText } from '@/i18n/legal';

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
  renderApp(`${SCREENS.settings.path}#privacidad`, {
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

  it('trae exportar, borrar y el aviso de privacidad, y el puntaje oficial ya no se captura aquí', async () => {
    app = await open();
    const privacy = await screen.findByRole(
      'region',
      { name: t.settingsPage.sections.privacy },
      WAIT,
    );
    expect(
      within(privacy).getByRole('heading', { level: 3, name: t.settings.privacy.consentsTitle }),
    ).toBeVisible();
    expect(within(privacy).getByRole('button', { name: t.settings.export })).toBeVisible();
    expect(within(privacy).getByRole('button', { name: t.settings.delete })).toBeVisible();
    expect(within(privacy).getByRole('link', { name: legalText.links.privacy })).toHaveAttribute(
      'href',
      SCREENS.privacyNotice.path,
    );
    // El permiso de la mejora anónima sigue aquí y el puntaje se captura en Progreso
    expect(within(privacy).getByRole('checkbox', { name: IMPROVEMENT })).toBeInTheDocument();
    expect(screen.queryByLabelText(t.settings.privacy.score)).toBeNull();
    expect(
      within(privacy).getByRole('link', { name: t.settingsPage.privacy.goToProgress }),
    ).toHaveAttribute('href', SCREENS.progress.path);
  });
});
