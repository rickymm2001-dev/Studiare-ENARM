// @vitest-environment jsdom
// Producción sin herramientas de demostración (pregunta 73, 5.4 del plan del cambio, B7). Sin la
// bandera demoTools nadie cambia de rol ni de base desde el dispositivo.
import 'fake-indexeddb/auto';
import { cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { usePreferences } from '@/app/preferences';
import { SCREENS } from '@/app/screens';
import { renderApp, resetApp, type RenderedApp } from '@/app/testing/renderApp';
import { writeStoredFlags } from '@/config/featureFlags';
import { t } from '@/i18n/es-MX';

let app: RenderedApp | undefined;
afterEach(async () => {
  cleanup();
  vi.unstubAllGlobals();
  await resetApp(app?.api);
  app = undefined;
});

/** El grupo de opciones de Radix dentro de un formulario mide su casilla oculta. jsdom no lo trae */
class NoResizeObserver {
  observe() {
    // Sin medidas en jsdom
  }
  unobserve() {
    // Sin medidas en jsdom
  }
  disconnect() {
    // Sin medidas en jsdom
  }
}

const enterAs = (role: keyof typeof t.roles.names) =>
  screen.queryByRole('button', { name: t.roles.enterAs(t.roles.names[role]) });

describe('selector de rol y base sin la bandera demoTools', () => {
  it('con la bandera prendida, como en la demo, el selector deja elegir el rol', async () => {
    vi.stubGlobal('ResizeObserver', NoResizeObserver);
    app = await renderApp(SCREENS.roleSelector.path);
    expect(
      await screen.findByRole('button', { name: t.roles.enterAs(t.roles.names.student) }),
    ).toBeVisible();
    expect(screen.queryByText(t.b7.demoLock.roleLocked)).toBeNull();
  });

  it('sin la bandera, como en producción, el selector queda cerrado aunque falte la nube', async () => {
    writeStoredFlags({ demoTools: false });
    app = await renderApp(SCREENS.roleSelector.path);
    expect(await screen.findByText(t.b7.demoLock.roleLocked)).toBeVisible();
    expect(enterAs('student')).toBeNull();
    expect(enterAs('admin')).toBeNull();
    expect(screen.queryByRole('radio')).toBeNull();
  });

  it('sin la bandera ningún botón deja la base de demostración ni un rol elegido a mano', () => {
    writeStoredFlags({ demoTools: false });
    const store = usePreferences.getState();
    store.setDatabase('demo');
    store.setRole('owner');
    expect(usePreferences.getState().database).toBe('real');
    expect(usePreferences.getState().role).toBe('student');
  });

  it('con la bandera prendida la base de demostración sí se puede elegir', () => {
    usePreferences.getState().setDatabase('demo');
    expect(usePreferences.getState().database).toBe('demo');
    usePreferences.getState().setDatabase('real');
    expect(usePreferences.getState().database).toBe('real');
  });
});
