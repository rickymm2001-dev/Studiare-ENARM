// @vitest-environment jsdom
// Los candados de Gratis miden que se ven (B15, 1.5): solo cuál, y solo con el permiso Medición de uso
import 'fake-indexeddb/auto';
import { cleanup, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SCREENS } from '@/app/screens';
import { renderApp, resetApp, type RenderedApp } from '@/app/testing/renderApp';
import {
  resetAnalytics,
  setAnalyticsConsent,
  setAnalyticsSink,
  type AnalyticsRecord,
} from '@/data/analytics/catalog';
import { t } from '@/i18n/es-MX';

vi.setConfig({ testTimeout: 60_000 });
const WAIT = { timeout: 30_000 };

let app: RenderedApp | undefined;
afterEach(async () => {
  cleanup();
  await resetApp(app?.api);
  app = undefined;
  resetAnalytics();
});

function watch(consent: boolean | null) {
  const seen: AnalyticsRecord[] = [];
  setAnalyticsSink((record) => seen.push(record));
  setAnalyticsConsent(consent);
  return seen;
}

describe('paywall_viewed', () => {
  it('Apuntes en Gratis mide el candado de apuntes, con solo la función', async () => {
    const seen = watch(true);
    app = await renderApp(SCREENS.outlines.path);
    await screen.findByText(t.outlines.locked.title, {}, WAIT);
    // La medición sale de un efecto, que corre después de que el título ya se ve. Se espera a que llegue
    await waitFor(() => {
      expect(seen).toHaveLength(1);
    }, WAIT);
    expect(seen.map((record) => [record.event, record.properties])).toEqual([
      ['paywall_viewed', { feature: 'outlines' }],
    ]);
  });

  it('Party en Gratis mide el candado de Party', async () => {
    const seen = watch(true);
    app = await renderApp(SCREENS.party.path);
    await screen.findByText(t.freePlan.party.title, {}, WAIT);
    await waitFor(() => {
      expect(seen.map((record) => record.properties)).toContainEqual({ feature: 'party' });
    }, WAIT);
  });

  it('sin permiso el candado se ve igual y no se mide nada', async () => {
    const seen = watch(false);
    app = await renderApp(SCREENS.outlines.path);
    await screen.findByText(t.outlines.locked.title, {}, WAIT);
    expect(seen).toEqual([]);
  });

  it('sin saber el permiso tampoco', async () => {
    const seen = watch(null);
    app = await renderApp(SCREENS.outlines.path);
    await screen.findByText(t.outlines.locked.title, {}, WAIT);
    expect(seen).toEqual([]);
  });
});
