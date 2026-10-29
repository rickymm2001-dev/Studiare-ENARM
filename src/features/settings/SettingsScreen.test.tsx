// @vitest-environment jsdom
// Configuración en una sola página (B3 del plan del cambio, comentarios 5, 6 y 16). Tres secciones
// con su subtítulo y sin pestañas, Perfil de solo lectura con Editar perfil, Guardar y Cancelar, el
// aviso al salir con cambios sin guardar y los enlaces viejos con ?seccion=.
import 'fake-indexeddb/auto';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePreferences } from '@/app/preferences';
import { SCREENS } from '@/app/screens';
import { renderApp, resetApp, type RenderedApp } from '@/app/testing/renderApp';
import { DataProvider } from '@/data/DataProvider';
import { makeUser } from '@/data/testing/fixtures';
import { UserSettingsSchema, type Account } from '@/data/schemas/people';
import { DEMO_STUDENT_ALIAS } from '@/demo/constants';
import { t } from '@/i18n/es-MX';
import { AccountDataCard } from '../profile/AccountDataCard';
import { SessionCard } from '../profile/SessionCard';

vi.setConfig({ testTimeout: 60_000 });
const WAIT = { timeout: 20_000 };
const page = t.settingsPage;

let app: RenderedApp | undefined;
// jsdom no implementa scrollIntoView. Se pone uno de prueba para ver a qué sección lleva la página
const scrolled = vi.fn();
beforeEach(() => {
  Object.defineProperty(Element.prototype, 'scrollIntoView', {
    value: scrolled,
    configurable: true,
    writable: true,
  });
});
afterEach(async () => {
  cleanup();
  Reflect.deleteProperty(Element.prototype, 'scrollIntoView');
  await resetApp(app?.api);
  app = undefined;
});

/** Configuración con un alumno que tiene cuenta con correo y algunos datos opcionales */
const open = (path: string = SCREENS.settings.path) =>
  renderApp(path, {
    user: { alias: 'Ana' },
    seed: async (api, user) => {
      const account: Account = {
        userId: user.id,
        email: 'ana@ejemplo.mx',
        birthYear: 1999,
        sex: 'female',
        state: 'YUC',
        situation: 'internship',
        attempt: 2,
        targetSpecialty: 'anesthesiology',
        avatar: { kind: 'initials' },
        updatedAt: '2026-10-01T00:00:00.000Z',
      };
      await api.repos.accounts.put(account);
    },
  });

const profile = async () => screen.findByRole('region', { name: page.sections.profile }, WAIT);
const dataCard = async () =>
  within(await profile()).getByRole('region', { name: page.profile.title });

describe('Configuración en una sola página', () => {
  it('tiene exactamente cuatro secciones con subtítulo, un índice que las enlaza y ninguna pestaña', async () => {
    app = await open();
    await profile();
    // El héroe del diseño (D-150). Kicker, título en marino y la explicación en cursiva
    expect(screen.getByRole('heading', { level: 1, name: t.settings.heroTitle })).toBeVisible();
    expect(screen.getByText(t.screens.settings.description)).toBeVisible();
    const titles = screen.getAllByRole('heading', { level: 2 }).map((title) => title.textContent);
    expect(titles).toEqual([
      page.sections.profile,
      t.dailyLoad.title,
      page.sections.appearance,
      page.sections.privacy,
    ]);
    expect(screen.queryByRole('tablist')).toBeNull();
    expect(screen.queryAllByRole('tab')).toHaveLength(0);
    // El índice en tarjeta lleva a cada sección real, con Perfil marcada mientras no se pide otra
    const index = screen.getByRole('navigation', { name: page.indexLabel });
    const links = within(index).getAllByRole('link');
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '#perfil',
      '#carga',
      '#apariencia',
      '#privacidad',
    ]);
    expect(links[0]).toHaveAttribute('aria-current', 'location');
    expect(links[1]).not.toHaveAttribute('aria-current');
    // Lo de estudio, Pomodoro y la base de demostración ya no está aquí
    expect(screen.queryByText(t.settings.cardTimerEnabled)).toBeNull();
    expect(screen.queryByLabelText(t.pomodoro.focusMinutes)).toBeNull();
    expect(screen.queryByText(t.database.legend)).toBeNull();
    expect(screen.queryByText(t.ai.cardTitle)).toBeNull();
  });

  it('Carga diaria solo lee los límites guardados y enlaza a Ajustes del repaso', async () => {
    const { user } = (app = await open());
    const load = await screen.findByRole('region', { name: t.dailyLoad.title }, WAIT);
    const card = t.settings.dailyLoadCard;
    const { reviewsPerDay, newCardsPerDay, questionsPerDay } = user.settings;
    for (const [label, value] of [
      [card.reviews, reviewsPerDay],
      [card.newCards, newCardsPerDay],
      [card.questions, questionsPerDay],
    ] as const) {
      expect(within(load).getByText(label)).toBeVisible();
      expect(within(load).getByText(value.toLocaleString('es-MX'))).toBeVisible();
    }
    // El tope real del plan Gratis y ningún campo para escribir, porque se cambia en el panel
    expect(within(load).getByText(card.freeNote(20))).toBeVisible();
    expect(within(load).queryByRole('spinbutton')).toBeNull();
    expect(within(load).getByRole('link', { name: page.reviewSettings.change })).toHaveAttribute(
      'href',
      `${SCREENS.review.path}?ajustes=1`,
    );
  });

  it('Perfil empieza con el plan y muestra tus datos de solo lectura con Editar perfil', async () => {
    const { user } = (app = await open());
    const section = await profile();
    const plan = within(section).getByRole('region', { name: page.plan.title });
    expect(within(plan).getByText(t.billing.plans.free)).toBeVisible();
    expect(within(plan).getByRole('link', { name: page.plan.change })).toHaveAttribute(
      'href',
      SCREENS.subscription.path,
    );
    // El plan va antes que tus datos y tu sesión, con Invita y gana un mes junto al plan (B7)
    const cards = within(section).getAllByRole('region');
    expect(cards.map((card) => card.getAttribute('aria-labelledby'))).toEqual([
      'plan-titulo',
      'referidos-titulo',
      'datos-titulo',
      'sesion-titulo',
    ]);

    const data = await dataCard();
    expect(within(data).getByText('Ana')).toBeVisible();
    expect(await within(data).findByText('ana@ejemplo.mx')).toBeVisible();
    // La zona horaria con la que se cuentan sus días de estudio, de solo lectura (D-150)
    expect(within(data).getByText(t.settings.timeZone)).toBeVisible();
    expect(within(data).getByText(user.timeZone)).toBeVisible();
    for (const value of [
      t.account.sexes.female,
      '1999',
      'Yucatán',
      t.account.situations.internship,
      t.account.attempts(2),
      'Anestesiología',
      '14 de septiembre de 2027',
    ]) {
      expect(within(data).getByText(value)).toBeVisible();
    }
    // De solo lectura no hay campos para escribir
    expect(within(data).queryByRole('textbox')).toBeNull();
    expect(within(data).queryByRole('combobox')).toBeNull();
    expect(within(data).getByRole('button', { name: page.profile.edit })).toBeVisible();

    const sessionCard = within(section).getByRole('region', { name: page.session.title });
    expect(within(sessionCard).getByRole('button', { name: t.session.signOut })).toBeVisible();
    // XP, nivel y racha viven en la barra de arriba, no en Perfil
    expect(within(section).queryByText(/XP en total/)).toBeNull();
  });

  it('Cancelar regresa lo que estaba guardado', async () => {
    const typing = userEvent.setup();
    const { api, user } = (app = await open());
    const data = await dataCard();
    await typing.click(within(data).getByRole('button', { name: page.profile.edit }));
    const alias = within(data).getByRole('textbox', { name: t.onboarding.alias });
    expect(alias).toHaveValue('Ana');
    await typing.clear(alias);
    await typing.type(alias, 'Otro alias');
    await typing.selectOptions(within(data).getByRole('combobox', { name: t.account.sex }), 'male');
    await typing.click(within(data).getByRole('button', { name: page.profile.cancel }));

    expect(within(data).queryByRole('textbox')).toBeNull();
    expect(within(data).getByText('Ana')).toBeVisible();
    expect(within(data).getByText(t.account.sexes.female)).toBeVisible();
    expect((await api.repos.users.get(user.id))?.alias).toBe('Ana');
    expect((await api.repos.accounts.get(user.id))?.sex).toBe('female');
    // Al volver a editar empieza con lo guardado
    await typing.click(within(data).getByRole('button', { name: page.profile.edit }));
    expect(within(data).getByRole('textbox', { name: t.onboarding.alias })).toHaveValue('Ana');
    expect(within(data).getByRole('combobox', { name: t.account.sex })).toHaveValue('female');
  });

  it('Guardar guarda el alias y los datos de la cuenta y vuelve a solo lectura', async () => {
    const typing = userEvent.setup();
    const { api, user } = (app = await open());
    const data = await dataCard();
    await typing.click(within(data).getByRole('button', { name: page.profile.edit }));
    const alias = within(data).getByRole('textbox', { name: t.onboarding.alias });
    await typing.clear(alias);
    await typing.type(alias, 'Ana Luisa');
    await typing.selectOptions(
      within(data).getByRole('combobox', { name: t.account.situation }),
      'graduated',
    );
    await typing.click(within(data).getByRole('button', { name: page.profile.save }));

    expect(await within(data).findByText(page.profile.saved)).toBeInTheDocument();
    expect(await within(data).findByText('Ana Luisa')).toBeVisible();
    expect(within(data).getByText(t.account.situations.graduated)).toBeVisible();
    expect(within(data).queryByRole('textbox')).toBeNull();
    expect((await api.repos.users.get(user.id))?.alias).toBe('Ana Luisa');
    expect((await api.repos.accounts.get(user.id))?.situation).toBe('graduated');
    // El cambio de alias queda como evento, como todo cambio del perfil
    const keys = (await api.repos.events.query({ userId: user.id }))
      .filter((event) => event.type === 'settings_changed')
      .map((event) => event.payload.key);
    expect(keys).toContain('alias');
  });

  it('un alias vacío no se guarda', async () => {
    const typing = userEvent.setup();
    const { api, user } = (app = await open());
    const data = await dataCard();
    await typing.click(within(data).getByRole('button', { name: page.profile.edit }));
    await typing.clear(within(data).getByRole('textbox', { name: t.onboarding.alias }));
    await typing.click(within(data).getByRole('button', { name: page.profile.save }));
    expect(await within(data).findByText(t.onboarding.aliasError)).toBeVisible();
    expect((await api.repos.users.get(user.id))?.alias).toBe('Ana');
  });

  it('salir con cambios sin guardar avisa, deja seguir editando o salir', async () => {
    const typing = userEvent.setup();
    app = await open();
    const data = await dataCard();
    await typing.click(within(data).getByRole('button', { name: page.profile.edit }));
    // Sin cambios todavía se puede salir sin aviso de la pestaña
    const before = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(before);
    expect(before.defaultPrevented).toBe(false);

    await typing.type(within(data).getByRole('textbox', { name: t.onboarding.alias }), ' Luisa');
    const unload = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(unload);
    expect(unload.defaultPrevented).toBe(true);

    await typing.click(screen.getByRole('link', { name: page.plan.change }));
    const warning = await screen.findByRole('alertdialog', { name: page.unsaved.title });
    await typing.click(within(warning).getByRole('button', { name: page.unsaved.stay }));
    await waitFor(() => {
      expect(screen.queryByRole('alertdialog')).toBeNull();
    });
    expect(within(data).getByRole('textbox', { name: t.onboarding.alias })).toHaveValue(
      'Ana Luisa',
    );

    await typing.click(screen.getByRole('link', { name: page.plan.change }));
    await typing.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', {
        name: page.unsaved.leave,
      }),
    );
    expect(
      await screen.findByRole('heading', { level: 1, name: t.screens.subscription.title }, WAIT),
    ).toBeVisible();
    expect((await app.api.repos.users.get(app.user.id))?.alias).toBe('Ana');
  });

  it('sin sesión quedan el aviso para entrar, como en las otras pantallas, y Apariencia', async () => {
    app = await open();
    await profile();
    act(() => {
      usePreferences.setState({ sessionUserId: null });
    });
    expect(await screen.findByRole('link', { name: t.session.goToWelcome }, WAIT)).toHaveAttribute(
      'href',
      SCREENS.onboarding.path,
    );
    expect(screen.getAllByRole('heading', { level: 2 }).map((title) => title.textContent)).toEqual([
      t.session.signedOutTitle,
      page.sections.appearance,
    ]);
    expect(screen.queryByRole('region', { name: page.sections.profile })).toBeNull();
  });
});

describe('enlaces viejos con ?seccion=', () => {
  it('Privacidad y Apariencia llevan a su sección de la página', async () => {
    app = await open(`${SCREENS.settings.path}?seccion=privacy`);
    await profile();
    await waitFor(() => {
      expect(scrolled.mock.contexts).toContain(document.getElementById('privacidad'));
    });
  });

  it('el ancla lleva a su sección', async () => {
    app = await open(`${SCREENS.settings.path}#apariencia`);
    await profile();
    await waitFor(() => {
      expect(scrolled.mock.contexts).toContain(document.getElementById('apariencia'));
    });
  });

  it('Estudio y Pomodoro llevan a Ajustes del repaso en Repasar', async () => {
    app = await open(`${SCREENS.settings.path}?seccion=pomodoro`);
    const dialog = await screen.findByRole('dialog', { name: page.reviewSettings.title }, WAIT);
    expect(
      within(dialog).getByRole('region', { name: t.settings.pomodoroTitle }),
    ).toBeInTheDocument();
    // Detrás del panel ya está Repasar. El panel esconde lo de atrás del lector de pantalla
    expect(
      screen.getByRole('heading', { level: 1, name: t.screens.review.title, hidden: true }),
    ).toBeInTheDocument();
  });
});

describe('Perfil del alumno de demostración', () => {
  it('sin cuenta se ve sin fallar, sin correo ni sesión que cerrar, y solo cambia su alias', async () => {
    const typing = userEvent.setup();
    const user = makeUser({ alias: DEMO_STUDENT_ALIAS });
    const session = {
      status: 'ready' as const,
      user,
      settings: UserSettingsSchema.parse(user.settings),
      isDemo: true,
    };
    const router = createMemoryRouter([
      {
        path: '/',
        element: (
          <>
            <AccountDataCard session={session} account={null} />
            <SessionCard session={session} />
          </>
        ),
      },
    ]);
    render(
      <DataProvider kind="real">
        <RouterProvider router={router} />
      </DataProvider>,
    );
    const data = await screen.findByRole('region', { name: page.profile.title });
    expect(within(data).getByText(DEMO_STUDENT_ALIAS)).toBeVisible();
    expect(within(data).getByText(page.profile.noEmail)).toBeVisible();
    expect(screen.getByText(page.session.demo)).toBeVisible();
    expect(screen.queryByRole('button', { name: t.session.signOut })).toBeNull();

    await typing.click(within(data).getByRole('button', { name: page.profile.edit }));
    expect(within(data).getByRole('textbox', { name: t.onboarding.alias })).toBeVisible();
    expect(within(data).getByText(page.profile.demoNote)).toBeVisible();
    expect(within(data).queryByRole('combobox')).toBeNull();
    expect(within(data).queryByRole('button', { name: t.account.uploadPhoto })).toBeNull();
  });
});

// Bloque B7 del plan del cambio. Referidos en Perfil (respuesta 77 y 4.3) y modo enfoque (respuesta 82)
describe('Configuración con lo nuevo de B7', () => {
  it('Perfil tiene Invita y gana un mes también en el plan Gratis', async () => {
    app = await open();
    const section = await profile();
    const plan = within(section).getByRole('region', { name: page.plan.title });
    expect(within(plan).getByText(t.billing.plans.free)).toBeVisible();
    const referral = within(section).getByRole('region', { name: t.b7.referral.title });
    expect(
      within(referral).getByRole('heading', { level: 3, name: t.b7.referral.title }),
    ).toBeVisible();
    // Sin la cuenta en la nube explica qué hace falta, sin candado de plan
    expect(within(referral).getByText(t.referrals.needsCloud)).toBeVisible();
  });

  it('el modo enfoque es un interruptor de Apariencia que se aplica al guardar', async () => {
    const typing = userEvent.setup();
    app = await open();
    const toggle = await screen.findByRole('switch', { name: t.b7.focusMode.label }, WAIT);
    const appearance = document.getElementById('apariencia') as HTMLElement;
    expect(appearance).toContainElement(toggle);
    expect(toggle).not.toBeChecked();
    expect(within(appearance).getByText(t.b7.focusMode.hint)).toBeVisible();
    await typing.click(toggle);
    expect(toggle).toBeChecked();
    // Aún no se guarda
    expect(usePreferences.getState().appearance.focusMode).toBe(false);
    await typing.click(within(appearance).getByRole('button', { name: t.settings.saveChanges }));
    expect(usePreferences.getState().appearance.focusMode).toBe(true);
  });
});
