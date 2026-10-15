// @vitest-environment jsdom
// La tabla de planes de Suscripción y de la portada dice lo mismo que los candados del plan Gratis
// (respuesta 20 y 4.25 del plan del cambio, B8). Apuntes, el catálogo de mazos, subir mazos y Party
// no van en Gratis y sí en los planes de pago.
import 'fake-indexeddb/auto';
import { cleanup, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { usePreferences } from '@/app/preferences';
import { SCREENS } from '@/app/screens';
import { renderApp, resetApp, type RenderedApp } from '@/app/testing/renderApp';
import { writeStoredFlags } from '@/config/featureFlags';
import { t } from '@/i18n/es-MX';

vi.setConfig({ testTimeout: 30_000 });

// La nube configurada solo cambia cloudConfigured. Las pruebas de aquí no llaman al servidor
const cloudMock = vi.hoisted(() => ({ configured: false }));
vi.mock('@/data/cloud/client', () => ({
  getCloud: () => null,
  cloudConfigured: () => cloudMock.configured,
  loadCloud: () => Promise.resolve(null),
}));

let app: RenderedApp | undefined;
afterEach(async () => {
  cleanup();
  await resetApp(app?.api);
  app = undefined;
  cloudMock.configured = false;
});

const WAIT = { timeout: 15_000 };
const CLOSED_IN_FREE = ['outlines', 'deckCatalog', 'importDecks', 'party'] as const;

/** El renglón de la tabla de un plan, por su texto */
function rowOf(card: HTMLElement, label: string): HTMLElement {
  const row = within(card).getByText(label).closest('li');
  if (!row) throw new Error(`No está el renglón ${label}`);
  return row;
}

describe('tabla de planes con el plan Gratis', () => {
  it('Suscripción dice que Gratis no incluye Apuntes, el catálogo, subir mazos ni Party, y los de pago sí', async () => {
    app = await renderApp(SCREENS.subscription.path);
    const free = await screen.findByRole('region', { name: t.billing.plans.free }, WAIT);
    const monthly = screen.getByRole('region', { name: t.billing.plans.monthly });
    const annual = screen.getByRole('region', { name: t.billing.plans.annual });
    expect(rowOf(free, t.billing.access.dailyQuestions(20))).toHaveTextContent(t.billing.included);
    for (const lock of CLOSED_IN_FREE) {
      const label = t.billing.access[lock];
      expect(rowOf(free, label), lock).toHaveTextContent(t.billing.notIncluded);
      expect(rowOf(monthly, label), lock).toHaveTextContent(t.billing.included);
      expect(rowOf(annual, label), lock).toHaveTextContent(t.billing.included);
    }
  });

  it('la portada lista en cada plan solo lo que incluye', async () => {
    // renderApp abre sesión, así que aquí se cierra para ver la portada
    app = await renderApp(SCREENS.home.path);
    usePreferences.setState({ sessionUserId: null });
    await screen.findByRole('heading', { level: 1, name: t.landing.title }, WAIT);
    const pricing = screen.getByRole('region', { name: t.landing.pricingTitle });
    const card = (plan: string) => {
      const section = within(pricing)
        .getByRole('heading', { level: 3, name: plan })
        .closest('section');
      if (!section) throw new Error(`No está la tarjeta de ${plan}`);
      return section;
    };
    const free = card(t.billing.plans.free);
    const monthly = card(t.billing.plans.monthly);
    expect(within(free).getByText(t.billing.access.dailyQuestions(20))).toBeVisible();
    for (const lock of CLOSED_IN_FREE) {
      expect(within(free).queryByText(t.billing.access[lock]), lock).toBeNull();
      expect(within(monthly).getByText(t.billing.access[lock]), lock).toBeVisible();
    }
  });
});

describe('la portada con la prueba gratis (B10, 3.4)', () => {
  it('dice Prueba 7 días gratis con tarjeta solo con la bandera y la nube, y muestra el anual Fundador', async () => {
    const pricingOf = async () => {
      await screen.findByRole('heading', { level: 1, name: t.landing.title }, WAIT);
      return screen.getByRole('region', { name: t.landing.pricingTitle });
    };
    writeStoredFlags({ freeTrial: true });
    // Sin la nube configurada no hay prueba, aunque la bandera esté prendida
    app = await renderApp(SCREENS.home.path);
    usePreferences.setState({ sessionUserId: null });
    let pricing = await pricingOf();
    expect(within(pricing).queryByText(t.billing.trialLine)).toBeNull();
    // El anual muestra el precio Fundador de 749
    expect(within(pricing).getByText(t.billing.price(749))).toBeVisible();
    expect(within(pricing).getByText(t.billing.founderSavings(20))).toBeVisible();
    cleanup();
    await resetApp(app.api);

    cloudMock.configured = true;
    writeStoredFlags({ freeTrial: true });
    app = await renderApp(SCREENS.home.path);
    usePreferences.setState({ sessionUserId: null });
    pricing = await pricingOf();
    expect(within(pricing).getAllByText(t.billing.trialLine)).toHaveLength(2);
  });
});
