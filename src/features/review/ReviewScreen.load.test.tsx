// @vitest-environment jsdom
// Carga diaria en Repasar (D-085, filas 5, 6 y 14). Atrasos con deshacer, perfil guía, sugerencia de
// tarjetas nuevas, sin límite y las banderas de acceso por función.
import 'fake-indexeddb/auto';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SCREENS } from '@/app/screens';
import { renderApp, resetApp, type RenderedApp } from '@/app/testing/renderApp';
import { PLANS } from '@/config/billing';
import { seedOverdueCards } from '@/data/testing/seedCards';
import { UserSettingsSchema } from '@/data/schemas/people';
import { t } from '@/i18n/es-MX';

// El confeti usa un canvas que jsdom no trae
vi.mock('@/ui/celebrate', () => ({ celebrate: () => undefined }));

// Sembrar decenas de repasos tarda más que el tiempo por defecto
vi.setConfig({ testTimeout: 60_000 });

let app: RenderedApp | undefined;
afterEach(async () => {
  cleanup();
  await resetApp(app?.api);
  app = undefined;
});

/** Abre el bloque de límites de hoy, el que trae el perfil guía y la sugerencia de nuevas */
async function openLimits(typing: ReturnType<typeof userEvent.setup>) {
  await typing.click(
    await screen.findByText(
      t.reviewSetup.limits,
      { selector: 'summary span' },
      { timeout: 15_000 },
    ),
  );
}

const rescheduleEvents = async (api: RenderedApp['api'], userId: string) =>
  (await api.repos.events.query({ userId })).filter((event) => event.type === 'cards_rescheduled');

describe('atrasos en Repasar', () => {
  it('con pocas atrasadas no avisa de recuperación pero deja repartir y deshacer', async () => {
    const typing = userEvent.setup();
    app = await renderApp(SCREENS.review.path, {
      seed: async (api, user) => {
        await seedOverdueCards(api, user, { overdue: 6 });
      },
    });
    const tools = await screen.findByText(t.overdue.title, {}, { timeout: 10_000 });
    expect(screen.queryByText(t.overdue.recoveryTitle(6))).not.toBeInTheDocument();
    await typing.click(tools);
    // Las que ya vencían hoy se quedan donde están, solo cambian de día las demás
    await typing.click(await screen.findByRole('button', { name: /^Repartir \d+ tarjetas?$/ }));
    expect(await screen.findByText(/tarjetas? repartidas?\.$/)).toBeInTheDocument();

    const { user, api } = app;
    const events = await rescheduleEvents(api, user.id);
    expect(events.length).toBeGreaterThan(0);

    // Deshacer regresa las tarjetas y también queda como evento nuevo, nada se borra
    await typing.click(await screen.findByRole('button', { name: t.overdue.undoButton }));
    expect(await screen.findByText(/a su fecha de antes\.$/)).toBeInTheDocument();
    const after = await rescheduleEvents(api, user.id);
    expect(after.length).toBeGreaterThan(events.length);
    for (const original of events) expect(after.map((event) => event.id)).toContain(original.id);
  });

  it('con muchas atrasadas avisa y el botón del aviso las reparte', async () => {
    const typing = userEvent.setup();
    app = await renderApp(SCREENS.review.path, {
      // Con 60 repasos por día el aviso salta al pasar de 40 vencidas, que es el mínimo
      user: { settings: UserSettingsSchema.parse({ reviewsPerDay: 60 }) },
      seed: async (api, user) => {
        await seedOverdueCards(api, user, { overdue: 45 });
      },
    });
    expect(
      await screen.findByText(t.overdue.recoveryTitle(45), {}, { timeout: 15_000 }),
    ).toBeInTheDocument();
    const banner = screen.getByRole('region', { name: t.overdue.recoveryTitle(45) });
    await typing.click(within(banner).getByRole('button', { name: /^Repartir/ }));
    // El resultado se ve aunque el bloque de herramientas siga cerrado
    expect(await screen.findByText(/tarjetas repartidas\.$/)).toBeVisible();
    await waitFor(() => {
      expect(screen.queryByText(t.overdue.recoveryTitle(45))).not.toBeInTheDocument();
    });
  });

  it('sin tarjetas repasadas no muestra las herramientas de atrasos', async () => {
    app = await renderApp(SCREENS.review.path, {
      seed: async (api, user) => {
        await seedOverdueCards(api, user, { overdue: 0, unseen: 3 });
      },
    });
    await screen.findByText(t.reviewSetup.title, {}, { timeout: 10_000 });
    expect(screen.queryByText(t.overdue.title)).not.toBeInTheDocument();
  });
});

describe('carga diaria en los límites de hoy', () => {
  it('el perfil guía muestra qué cambia y lo aplica con un botón', async () => {
    const typing = userEvent.setup();
    app = await renderApp(SCREENS.review.path, {
      seed: async (api, user) => {
        await seedOverdueCards(api, user, { overdue: 2, unseen: 1 });
      },
    });
    await openLimits(typing);
    const guide = await screen.findByRole('region', { name: t.dailyLoad.guideTitle });
    // La retención de fábrica es 90 y el tope es 21, así que el tope sí cambia
    expect(within(guide).getByText(/Intervalo máximo pasa de 21 días a/)).toBeInTheDocument();
    await typing.click(within(guide).getByRole('button', { name: t.dailyLoad.guideApply }));
    expect(await within(guide).findByText(t.dailyLoad.guideApplied)).toBeInTheDocument();
    await waitFor(() => {
      expect(within(guide).getByText(t.dailyLoad.guideAlready)).toBeInTheDocument();
    });
    const saved = await app.api.repos.users.get(app.user.id);
    expect(saved?.settings.maxIntervalDays).toBeGreaterThan(21);
  });

  it('sugiere cuántas nuevas, avisa que está calibrando y las guarda con un botón', async () => {
    const typing = userEvent.setup();
    app = await renderApp(SCREENS.review.path, {
      user: { dailyMinutes: 120 },
      seed: async (api, user) => {
        await seedOverdueCards(api, user, { overdue: 2, unseen: 8, daysLate: 0 });
      },
    });
    await openLimits(typing);
    const section = await screen.findByRole('region', { name: t.dailyLoad.suggestionTitle });
    await typing.click(within(section).getByRole('button', { name: t.dailyLoad.calculate }));
    // Hay 8 nuevas por ver, la sugerencia no pasa de ahí
    const use = await within(section).findByRole('button', { name: t.dailyLoad.use(8) });
    expect(within(section).getByText(t.dailyLoad.suggested(8))).toBeInTheDocument();
    // Con 2 repasos propios todavía no se mide el ritmo y se dice
    expect(within(section).getByText(t.dailyLoad.referenceTimes)).toBeInTheDocument();
    await typing.click(use);
    expect(await within(section).findByText(t.dailyLoad.applied)).toBeInTheDocument();
    const saved = await app.api.repos.users.get(app.user.id);
    expect(saved?.settings.newCardsPerDay).toBe(8);
    // El campo de arriba ya muestra el número nuevo y no queda un borrador viejo por guardar
    expect(screen.getByRole('spinbutton', { name: t.settings.newCardsPerDay })).toHaveValue(8);
    expect(screen.getByRole('button', { name: t.settings.saveChanges })).toBeDisabled();
  });

  it('sin minutos de estudio pide ponerlos en Plan', async () => {
    const typing = userEvent.setup();
    app = await renderApp(SCREENS.review.path, {
      user: { dailyMinutes: null },
      seed: async (api, user) => {
        await seedOverdueCards(api, user, { overdue: 2, unseen: 3 });
      },
    });
    await openLimits(typing);
    const section = await screen.findByRole('region', { name: t.dailyLoad.suggestionTitle });
    await typing.click(within(section).getByRole('button', { name: t.dailyLoad.calculate }));
    expect(await within(section).findByText(t.dailyLoad.needsMinutes)).toBeInTheDocument();
    expect(within(section).getByRole('link', { name: t.dailyLoad.goToPlan })).toHaveAttribute(
      'href',
      SCREENS.planner.path,
    );
  });

  it('sin límite apaga el campo de nuevas, avisa y la cola deja de recortar', async () => {
    const typing = userEvent.setup();
    app = await renderApp(SCREENS.review.path, {
      user: { settings: UserSettingsSchema.parse({ newCardsPerDay: 2 }) },
      seed: async (api, user) => {
        await seedOverdueCards(api, user, { overdue: 0, unseen: 6 });
      },
    });
    // Con límite de 2 solo tocan 2 de las 6 nuevas
    expect(
      await screen.findByRole('button', { name: t.reviewSetup.start(2) }, { timeout: 10_000 }),
    ).toBeInTheDocument();
    await openLimits(typing);
    const section = await screen.findByRole('region', { name: t.dailyLoad.suggestionTitle });
    await typing.click(
      within(section).getByRole('checkbox', { name: t.settings.unlimitedNewCards }),
    );
    expect(await within(section).findByText(t.dailyLoad.unlimitedOn)).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: t.reviewSetup.start(6) })).toBeInTheDocument();
    expect(screen.getByRole('spinbutton', { name: t.settings.newCardsPerDay })).toBeDisabled();
    const saved = await app.api.repos.users.get(app.user.id);
    expect(saved?.settings.unlimitedNewCards).toBe(true);
    // El número guardado no se pierde, al apagar el modo vuelve a regir
    expect(saved?.settings.newCardsPerDay).toBe(2);
  });
});

describe('banderas de acceso por función', () => {
  it('una función cerrada en el plan muestra el aviso con el enlace a los planes', async () => {
    const { FeatureGate } = await import('../shared/FeatureGate');
    const { MemoryRouter } = await import('react-router');
    const { DataProvider } = await import('@/data/DataProvider');
    const closed = {
      ...PLANS,
      free: { ...PLANS.free, features: { ...PLANS.free.features, overdueTools: false } },
    };
    render(
      <DataProvider kind="real">
        <MemoryRouter>
          <FeatureGate userId="usuario-sin-plan" feature="overdueTools" plans={closed}>
            <p>Herramientas</p>
          </FeatureGate>
          <FeatureGate userId="usuario-sin-plan" feature="explore" plans={closed}>
            <p>Explorar abierto</p>
          </FeatureGate>
        </MemoryRouter>
      </DataProvider>,
    );
    expect(
      await screen.findByText(t.billing.featureLocked(t.billing.featureNames.overdueTools)),
    ).toBeInTheDocument();
    expect(screen.queryByText('Herramientas')).not.toBeInTheDocument();
    expect(screen.getByText('Explorar abierto')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: t.billing.featureSeePlans })).toHaveAttribute(
      'href',
      SCREENS.subscription.path,
    );
    await resetApp();
  });
});
