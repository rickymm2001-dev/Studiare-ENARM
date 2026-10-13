// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DataProvider } from '@/data/DataProvider';
import { makeUser } from '@/data/testing/fixtures';
import { t } from '@/i18n/es-MX';
import { buildSnapshot } from '../home/snapshot';
import type { ReadySession } from '../shared/RequireSession';
import { DemoParty } from './DemoParty';

vi.setConfig({ testTimeout: 30_000 });

const user = makeUser({ alias: 'Alumno de demostración' });
const session: ReadySession = { status: 'ready', user, settings: user.settings, isDemo: true };
const snapshot = buildSnapshot({ events: [], user, settings: user.settings, now: new Date() });

const frame = (node: ReactNode) => (
  <DataProvider kind="demo">
    <MemoryRouter>{node}</MemoryRouter>
  </DataProvider>
);

afterEach(() => {
  cleanup();
});

describe('Party de la demostración', () => {
  it('crea un grupo con compañeros simulados marcados y el modo enfoque oculta tabla y retos', async () => {
    const view = render(
      frame(
        <DemoParty
          session={session}
          events={[]}
          snapshot={snapshot}
          focus={false}
          inviteCode={null}
        />,
      ),
    );
    const create = await screen.findByRole('region', { name: t.party.createTitle });
    expect(within(create).getByLabelText(t.party.withFriends)).toBeChecked();
    await userEvent.type(within(create).getByLabelText(t.party.groupName), 'Guardia simulada');
    await userEvent.click(within(create).getByRole('button', { name: t.party.create }));

    const group = await screen.findByRole('region', { name: 'Guardia simulada' });
    // El alumno y sus seis compañeros simulados, cada uno marcado. Los compañeros llegan un poco después
    await waitFor(() => {
      expect(within(within(group).getByRole('table')).getAllByRole('row')).toHaveLength(8);
    });
    expect(within(group).getAllByText(t.labels.simulatedData).length).toBeGreaterThan(0);
    expect(within(group).getAllByText(`· ${t.party.simulated}`)).toHaveLength(6);
    // El reto simulado de bienvenida está en su sección y los duelos van aparte
    expect(within(group).getByText(t.party.challenges)).toBeVisible();
    expect(within(group).getByText(t.partyCloud.duels.title)).toBeVisible();

    view.rerender(
      frame(
        <DemoParty session={session} events={[]} snapshot={snapshot} focus inviteCode={null} />,
      ),
    );
    const focused = await screen.findByRole('region', { name: 'Guardia simulada' });
    expect(within(focused).queryByRole('table')).toBeNull();
    expect(within(focused).queryByText(t.party.challenges)).toBeNull();
    expect(within(focused).queryByRole('progressbar')).toBeNull();
    expect(within(focused).getByRole('list', { name: t.partyCloud.membersTitle })).toBeVisible();
    expect(within(focused).getByRole('button', { name: t.party.duel.newButton })).toBeVisible();
  });
});
