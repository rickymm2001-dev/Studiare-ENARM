// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { act, cleanup, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCloud } from '@/app/cloudState';
import { usePreferences } from '@/app/preferences';
import { renderApp, resetApp, type RenderedApp } from '@/app/testing/renderApp';
import {
  createPartyChallenge,
  createPartyDuel,
  createPartyGroup,
  joinPartyGroup,
  publishPartyNumbers,
} from '@/data/cloud/party';
import { makeFakeCloud, type FakeCloud } from '@/data/testing/fakeCloud';
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
});

describe('widget de Party con la nube', () => {
  it('muestra el lugar, el reto y el duelo pendiente, y el modo enfoque deja solo el grupo y el duelo', async () => {
    app = await renderApp('/', {
      seed: async (api, user) => {
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

    act(() => {
      usePreferences.getState().setAppearance({ focusMode: true });
    });
    expect(within(party).queryByText(t.widgets.party.rank(2, 2))).toBeNull();
    expect(within(party).queryByText('Mil tarjetas · 0%')).toBeNull();
    expect(within(party).getByText('Guardia')).toBeVisible();
    expect(within(party).getByText(t.widgets.party.duelsPending(1))).toBeVisible();
  });

  it('sin el permiso de Party no pide nada al servidor y explica qué falta', async () => {
    const before = fake.rpcCalls.length;
    app = await renderApp('/');
    const party = await screen.findByRole(
      'region',
      { name: t.widgets.names.party_challenge },
      { timeout: 15_000 },
    );
    expect(await within(party).findByText(t.partyCloud.widget.consent)).toBeVisible();
    expect(fake.rpcCalls.slice(before).filter((name) => name.startsWith('party_'))).toEqual([]);
  });
});
