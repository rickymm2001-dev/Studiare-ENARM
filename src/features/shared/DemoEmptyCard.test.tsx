// @vitest-environment jsdom
// La demostración vacía no lleva a nadie a una pantalla que no puede usar (B3 del plan del cambio,
// 5.4). Solo el admin o el dueño con las herramientas de demostración van a generarla. Los demás
// vuelven a Mi cuenta.
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_PREFERENCES, usePreferences } from '@/app/preferences';
import { SCREENS } from '@/app/screens';
import { writeStoredFlags } from '@/config/featureFlags';
import type { Role } from '@/data/schemas/common';
import { t } from '@/i18n/es-MX';
import { canGenerateDemo } from './demoAccess';
import { DemoEmptyCard } from './DemoEmptyCard';

afterEach(() => {
  cleanup();
  localStorage.clear();
  usePreferences.setState(DEFAULT_PREFERENCES);
});

function show(role: Role) {
  usePreferences.setState({ role, database: 'demo' });
  render(
    <MemoryRouter>
      <DemoEmptyCard />
    </MemoryRouter>,
  );
}

describe('aviso de la demostración vacía', () => {
  it('solo el admin y el dueño con las herramientas de demostración pueden generarla', () => {
    expect(canGenerateDemo('admin', true)).toBe(true);
    expect(canGenerateDemo('owner', true)).toBe(true);
    expect(canGenerateDemo('admin', false)).toBe(false);
    expect(canGenerateDemo('student', true)).toBe(false);
    expect(canGenerateDemo('physician', true)).toBe(false);
  });

  it.each(['student', 'physician'] as const)(
    '%s. No lleva a Datos de demostración y vuelve a Mi cuenta',
    async (role) => {
      const typing = userEvent.setup();
      show(role);
      expect(screen.getByRole('heading', { name: t.session.demoEmptyTitle })).toBeVisible();
      expect(screen.getByText(t.settingsPage.demoEmpty.bodyBack)).toBeVisible();
      expect(screen.queryByRole('link', { name: t.settingsPage.demoEmpty.link })).toBeNull();
      await typing.click(screen.getByRole('button', { name: t.database.backToReal }));
      expect(usePreferences.getState().database).toBe('real');
    },
  );

  it('el admin con las herramientas de demostración va a generarla', () => {
    show('admin');
    expect(screen.getByText(t.settingsPage.demoEmpty.body)).toBeVisible();
    expect(screen.getByRole('link', { name: t.settingsPage.demoEmpty.link })).toHaveAttribute(
      'href',
      SCREENS.demoData.path,
    );
    expect(screen.queryByRole('button', { name: t.database.backToReal })).toBeNull();
  });

  it('con las herramientas apagadas, como en producción, el admin también vuelve a Mi cuenta', () => {
    writeStoredFlags({ demoTools: false });
    show('owner');
    expect(screen.queryByRole('link', { name: t.settingsPage.demoEmpty.link })).toBeNull();
    expect(screen.getByRole('button', { name: t.database.backToReal })).toBeVisible();
  });
});
