// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { cleanup, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PRIVACY_NOTICE_VERSION } from '@/config/legal';
import { currentConsents, noticeNeedsAcceptance } from '@/data/usecases/profile';
import { newId } from '@/data/testing/fixtures';
import { t } from '@/i18n/es-MX';
import { SCREENS } from '../screens';
import { renderApp, resetApp, type RenderedApp } from '../testing/renderApp';

vi.setConfig({ testTimeout: 30_000 });

let app: RenderedApp | undefined;
afterEach(async () => {
  cleanup();
  await resetApp(app?.api);
  app = undefined;
});

const open = (version: string) =>
  renderApp(SCREENS.review.path, {
    seed: async (api, user) => {
      await api.repos.consents.put({
        id: newId(),
        userId: user.id,
        purpose: 'party',
        noticeVersion: version,
        status: 'granted',
        decidedAt: '2026-10-01T00:00:00.000Z',
      });
    },
  });

describe('aviso de que cambió el aviso de privacidad', () => {
  it('a quien decidió bajo una versión anterior se lo pide, y al aceptar deja constancia y se va', async () => {
    const typing = userEvent.setup();
    const { api, user } = (app = await open('2026-01-01'));
    expect(await screen.findByText(t.noticeUpdate.title, {}, { timeout: 20_000 })).toBeVisible();
    expect(screen.getByRole('link', { name: t.noticeUpdate.read })).toHaveAttribute(
      'href',
      expect.stringContaining(SCREENS.privacyNotice.path),
    );
    await typing.click(screen.getByRole('button', { name: t.noticeUpdate.accept }));
    await waitFor(() => {
      expect(screen.queryByText(t.noticeUpdate.title)).toBeNull();
    });
    expect(await noticeNeedsAcceptance(api, user.id)).toBe(false);
    // Su decisión sigue igual
    expect((await currentConsents(api, user.id)).party).toBe(true);
  });

  it('a quien ya decidió bajo la versión actual no le aparece', async () => {
    app = await open(PRIVACY_NOTICE_VERSION);
    await screen.findByRole('heading', { level: 1 }, { timeout: 20_000 });
    expect(screen.queryByText(t.noticeUpdate.title)).toBeNull();
  });
});
