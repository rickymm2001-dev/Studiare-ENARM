// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { act, cleanup, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCloud } from '@/app/cloudState';
import { useSyncStatus } from '@/app/syncState';
import { usePreferences } from '@/app/preferences';
import { SCREENS } from '@/app/screens';
import { renderApp, resetApp, type RenderedApp } from '@/app/testing/renderApp';
import {
  createPartyChallenge,
  createPartyDuel,
  createPartyGroup,
  joinPartyGroup,
  publishPartyNumbers,
} from '@/data/cloud/party';
import { makeFakeCloud, type FakeCloud } from '@/data/testing/fakeCloud';
import { subscribe } from '@/data/testing/fixtures';
import { setConsent } from '@/data/usecases/profile';
import { studyDayOf, weekStartOf } from '@/engines/studyDay';
import { t } from '@/i18n/es-MX';

vi.setConfig({ testTimeout: 30_000 });

const holder = vi.hoisted((): { cloud: unknown } => ({ cloud: null }));
vi.mock('@/data/cloud/client', () => ({
  getCloud: () => holder.cloud,
  cloudConfigured: () => holder.cloud !== null,
  loadCloud: () => Promise.resolve(holder.cloud),
}));

const ANA = '2f6c4b1e-8a3d-4c7e-9b10-6d2e5f7a8b01';
const BRUNO = '7a1d3c5e-2b4f-4a6c-8e9d-0f1a2b3c4d5e';
const week = () => weekStartOf(studyDayOf(new Date(), 'America/Merida'));

let fake: FakeCloud;
let app: RenderedApp | undefined;

beforeEach(async () => {
  fake = makeFakeCloud({ session: { id: BRUNO, email: 'bruno@ejemplo.mx' } });
  fake.aliases.set(ANA, 'Ana');
  fake.aliases.set(BRUNO, 'Bruno');
  // Party es de los planes de pago, también en el servidor (B8). Los dos pagan el mensual
  fake.plans.set(ANA, 'monthly');
  fake.plans.set(BRUNO, 'monthly');
  holder.cloud = fake.cloud;
  // Bruno crea el grupo, un reto y reta a Ana, que entra con el código
  const created = await createPartyGroup(fake.cloud, 'Guardia');
  if (!created.ok || created.value.status !== 'created') throw new Error('no se creó el grupo');
  await publishPartyNumbers(fake.cloud, { weekStart: week(), weeklyXp: 90, contributions: [] });
  fake.session = { id: ANA, email: 'ana@ejemplo.mx' };
  await joinPartyGroup(fake.cloud, created.value.inviteCode);
  fake.session = { id: BRUNO, email: 'bruno@ejemplo.mx' };
  await createPartyChallenge(fake.cloud, {
    groupId: created.value.groupId,
    title: 'Mil tarjetas',
    metric: 'cards',
    target: 1000,
  });
  await createPartyDuel(fake.cloud, {
    groupId: created.value.groupId,
    opponentId: ANA,
    questionIds: ['01J00000000000000000000001'],
  });
  fake.session = { id: ANA, email: 'ana@ejemplo.mx' };
  useCloud.setState({
    state: {
      status: 'linked',
      identity: { authId: ANA, email: 'ana@ejemplo.mx', role: 'student', alias: 'Ana' },
    },
  });
});

afterEach(async () => {
  cleanup();
  await resetApp(app?.api);
  app = undefined;
  holder.cloud = null;
  useCloud.setState({ state: { status: 'off' } });
  useSyncStatus.getState().reset();
});

/** El mensual como lo deja la nube con un pago */
const paid = (api: RenderedApp['api'], user: RenderedApp['user']) =>
  subscribe(api, user, 'monthly', 'cloud');

describe('widget de Party con la nube', () => {
  it('muestra el lugar, el reto y el duelo pendiente, y el modo enfoque quita la sección de Inicio', async () => {
    app = await renderApp('/', {
      seed: async (api, user) => {
        await paid(api, user);
        await setConsent(api, user, 'party', true);
      },
    });
    const party = await screen.findByRole(
      'region',
      { name: t.widgets.names.party_challenge },
      { timeout: 15_000 },
    );
    expect(await within(party).findByText('Guardia')).toBeVisible();
    expect(within(party).getByText(t.widgets.party.rank(2, 2))).toBeVisible();
    expect(within(party).getByText('Mil tarjetas · 0%')).toBeVisible();
    expect(within(party).getByText(t.widgets.party.duelsPending(1))).toBeVisible();

    // En modo enfoque Inicio quita toda la sección del reto de Party (tablas, XP y retos, respuesta 82)
    act(() => {
      usePreferences.getState().setAppearance({ focusMode: true });
    });
    expect(screen.queryByRole('region', { name: t.widgets.names.party_challenge })).toBeNull();
  });

  it('sin el permiso de Party no pide nada al servidor y explica qué falta', async () => {
    const before = fake.rpcCalls.length;
    app = await renderApp('/', { seed: paid });
    const party = await screen.findByRole(
      'region',
      { name: t.widgets.names.party_challenge },
      { timeout: 15_000 },
    );
    expect(await within(party).findByText(t.partyCloud.widget.consent)).toBeVisible();
    expect(fake.rpcCalls.slice(before).filter((name) => name.startsWith('party_'))).toEqual([]);
  });

  it('en Gratis lleva el aviso corto del candado con Ver planes y no le pide nada al servidor', async () => {
    const before = fake.rpcCalls.length;
    fake.plans.set(ANA, 'free');
    app = await renderApp('/', {
      seed: async (api, user) => {
        // Como lo deja la nube cuando my_plan contesta Gratis
        await subscribe(api, user, 'free', 'cloud');
        await setConsent(api, user, 'party', true);
      },
    });
    const party = await screen.findByRole(
      'region',
      { name: t.widgets.names.party_challenge },
      { timeout: 15_000 },
    );
    expect(await within(party).findByText(t.freePlan.widget)).toBeVisible();
    // Es un aviso fijo y no un cambio de estado, así el lector de pantalla no lo anuncia en cada visita
    expect(within(party).getByRole('note')).toHaveTextContent(t.freePlan.widget);
    expect(within(party).queryByRole('status')).toBeNull();
    expect(within(party).getByRole('link', { name: t.billing.featureSeePlans })).toHaveAttribute(
      'href',
      SCREENS.subscription.path,
    );
    expect(within(party).queryByText('Guardia')).toBeNull();
    expect(fake.rpcCalls.slice(before).filter((name) => name.startsWith('party_'))).toEqual([]);
  });

  it('si el servidor ya cerró Party, lleva el aviso corto y pide el plan otra vez', async () => {
    // Este navegador todavía cree que el plan es de pago, pero venció en el servidor
    fake.plans.set(ANA, 'free');
    const syncNow = vi.fn(() => Promise.resolve());
    useSyncStatus.setState({ syncNow });
    app = await renderApp('/', {
      seed: async (api, user) => {
        await paid(api, user);
        await setConsent(api, user, 'party', true);
      },
    });
    const party = await screen.findByRole(
      'region',
      { name: t.widgets.names.party_challenge },
      { timeout: 15_000 },
    );
    expect(await within(party).findByText(t.freePlan.widget)).toBeVisible();
    expect(within(party).queryByText('Guardia')).toBeNull();
    expect(syncNow).toHaveBeenCalled();
  });
});
