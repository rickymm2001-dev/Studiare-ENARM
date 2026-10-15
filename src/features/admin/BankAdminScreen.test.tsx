// @vitest-environment jsdom
// Banco y Sheet (pantalla 35, 4.3 del plan de B11). Avance contra la meta, el interruptor que abre el
// banco con su confirmación, Sincronizar ahora y el reporte de renglones con cada código traducido a su
// frase y su acción
import 'fake-indexeddb/auto';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCloud } from '@/app/cloudState';
import { DataProvider } from '@/data/DataProvider';
import { topicTaxonomy } from '@/demo/content';
import { bankAdminText } from '@/i18n/bankAdmin';
import { t } from '@/i18n/es-MX';
import { BankAdminScreen } from './BankAdminScreen';

vi.setConfig({ testTimeout: 30_000 });

const holder = vi.hoisted((): { cloud: unknown } => ({ cloud: null }));
vi.mock('@/data/cloud/client', () => ({
  getCloud: () => holder.cloud,
  cloudConfigured: () => holder.cloud !== null,
  loadCloud: () => Promise.resolve(holder.cloud),
}));

const text = bankAdminText;
const RUN = '01234567-89ab-4cde-8f01-23456789abcd';
const AT = '2026-10-14T15:00:00.000Z';
const FIRST = topicTaxonomy.branches[0];
const SECOND = topicTaxonomy.branches[1];

interface FakeState {
  /** La corrida ya terminó. Mientras corre no tiene renglones */
  finished: boolean;
  flags: Record<string, boolean>;
  upserts: { key: string; value: unknown }[];
  invoked: unknown[];
  rpc: string[];
}

function fakeCloud(options: { open?: boolean; running?: boolean } = {}): FakeState {
  const state: FakeState = {
    finished: options.running !== true,
    flags: { cloudBank: options.open ?? false, requireMfa: false },
    upserts: [],
    invoked: [],
    rpc: [],
  };
  const settings: Record<string, unknown> = {
    bank_sync: { enabled: true, mode: 'dry_run' },
  };
  holder.cloud = {
    rpc: (name: string) => {
      state.rpc.push(name);
      const data: Record<string, unknown> = {
        admin_bank_overview: {
          goal: 300,
          published: 120,
          englishPublished: 4,
          byBranch: [{ branch: 'obstetrics_gynecology', published: 108 }],
          drafts: 30,
          incomplete: 12,
          inReview: 5,
          conflicts: 1,
          missing: 2,
          retireRequested: 0,
          retired: 0,
          open: state.flags.cloudBank === true,
        },
        admin_bank_sync_runs: [
          {
            id: RUN,
            trigger: 'manual',
            target: 'test',
            mode: 'dry_run',
            status: state.finished ? 'partial' : 'running',
            reason: state.finished ? 'id_formula' : null,
            counts: state.finished ? { read: 3, created: 1, rejected: 2 } : {},
            startedAt: AT,
            finishedAt: state.finished ? AT : null,
          },
        ],
        admin_bank_sync_rows: !state.finished
          ? []
          : [
              {
                rowNumber: 45,
                sheetKey: 'GO-0045',
                outcome: 'rejected',
                incomplete: [],
                notices: [],
                problems: [
                  { code: 'subtopic_is_topic', column: 'Subtema', value: 'Control prenatal' },
                ],
                questionId: null,
              },
              {
                rowNumber: 46,
                sheetKey: 'GO-0046',
                outcome: 'created',
                incomplete: ['references_missing'],
                notices: ['topic_inferred'],
                problems: [],
                questionId: null,
              },
            ],
        editor_list: { total: 0, items: [] },
        admin_bank_read_alerts: [
          {
            id: 1,
            userId: 'u1',
            alias: 'Carla',
            day: '2026-10-14',
            kind: 'daily_volume',
            value: 650,
            createdAt: AT,
            seenAt: null,
          },
        ],
        admin_list_users: [],
        admin_bank_settings: { limits: {}, pay: { perReviewMxn: null } },
        admin_bank_team: {
          codes: [],
          topicReviewers: [
            {
              branch: FIRST?.key,
              topic: FIRST?.topics[0]?.key,
              physicianId: 'p1',
              alias: 'Dra. Ruiz',
              active: true,
            },
            {
              branch: SECOND?.key,
              topic: SECOND?.topics[0]?.key,
              physicianId: 'p2',
              alias: 'Dr. Paz',
              active: false,
            },
          ],
        },
      };
      return Promise.resolve({ data: data[name] ?? null, error: null });
    },
    from: () => {
      let key = '';
      const query = {
        select: () => query,
        eq: (_column: string, value: string) => {
          key = value;
          return query;
        },
        maybeSingle: () =>
          Promise.resolve({
            data:
              key === 'feature_flags'
                ? { value: state.flags }
                : key in settings
                  ? { value: settings[key] }
                  : null,
            error: null,
          }),
        upsert: (row: { key: string; value: unknown }) => {
          state.upserts.push({ key: row.key, value: row.value });
          if (row.key === 'feature_flags') state.flags = row.value as Record<string, boolean>;
          return Promise.resolve({ error: null });
        },
      };
      return query;
    },
    functions: {
      invoke: (name: string, options: { body: unknown }) => {
        state.invoked.push([name, options.body]);
        return Promise.resolve({
          data: { runId: RUN, status: 'running', mode: 'dry_run' },
          error: null,
        });
      },
    },
  };
  return state;
}

const showScreen = () =>
  render(
    <DataProvider kind="real">
      <MemoryRouter>
        <BankAdminScreen />
      </MemoryRouter>
    </DataProvider>,
  );

beforeEach(() => {
  useCloud.setState({
    state: {
      status: 'linked',
      identity: { authId: 'yo', email: 'yo@ejemplo.mx', role: 'admin', alias: null },
    },
  });
});
afterEach(() => {
  cleanup();
  holder.cloud = null;
  useCloud.setState({ state: { status: 'off' } });
});

describe('Banco y Sheet', () => {
  it('sin la nube dice que necesita la cuenta de un admin', () => {
    useCloud.setState({ state: { status: 'off' } });
    showScreen();
    expect(
      screen.getByRole('heading', { level: 1, name: t.screens.bankAdmin.title }),
    ).toBeVisible();
    expect(screen.getByText(text.needsCloud)).toBeVisible();
  });

  it('muestra el avance contra la meta, Inglés aparte y los avisos de lectura sin preguntas', async () => {
    fakeCloud();
    showScreen();
    expect(await screen.findByText(text.overview.goal(120, 300))).toBeVisible();
    // Inglés aparte de la meta de las siete ramas, con su propia meta de 30 para la parte del examen
    expect(screen.getByText(text.overview.english(4, 30))).toBeVisible();
    expect(screen.getByText(text.overview.englishHint(300, 30))).toBeVisible();
    expect(screen.getByRole('progressbar', { name: text.overview.title })).toHaveAttribute(
      'aria-valuenow',
      '120',
    );
    const english = screen.getByRole('progressbar', { name: text.overview.english(4, 30) });
    expect(english).toHaveAttribute('aria-valuenow', '4');
    expect(english).toHaveAttribute('aria-valuemax', '30');
    expect(
      await screen.findByText(
        text.alerts.line('Carla', text.alerts.kinds.daily_volume ?? '', '2026-10-14', '650'),
      ),
    ).toBeVisible();
  });

  it('abrir el banco pide confirmar con las aprobadas y prende cloudBank sin tocar las demás banderas', async () => {
    const state = fakeCloud();
    const typing = userEvent.setup();
    showScreen();
    await typing.click(await screen.findByRole('button', { name: text.open.open }));
    expect(screen.getByText(text.open.confirmOpen(120, 300))).toBeVisible();
    expect(state.upserts).toEqual([]);
    await typing.click(screen.getByRole('button', { name: text.open.confirm }));
    await waitFor(() => {
      expect(state.upserts).toEqual([
        { key: 'feature_flags', value: { cloudBank: true, requireMfa: false } },
      ]);
    });
    expect(await screen.findByText(text.open.opened)).toBeVisible();
  });

  it('Sincronizar ahora va contra el Sheet de prueba y el reporte traduce cada código a su acción', async () => {
    const state = fakeCloud();
    const typing = userEvent.setup();
    showScreen();
    const card = await screen.findByRole('region', { name: text.sync.title });
    expect(await within(card).findByText(text.sync.modeLabel('Solo reporte'))).toBeVisible();
    await typing.click(within(card).getByRole('button', { name: text.sync.now }));
    await waitFor(() => {
      expect(state.invoked).toEqual([['bank-sync', { target: 'test' }]]);
    });
    expect(await within(card).findByText(text.sync.started)).toBeVisible();
    expect(within(card).getByText(text.sync.reasons.id_formula ?? '')).toBeVisible();

    const rows = await screen.findByRole('region', { name: text.sync.run.selected });
    expect(
      await within(rows).findByText(
        'Renglón 45. El subtema Control prenatal es una subespecialidad. Elige el subtema en la lista.',
      ),
    ).toBeVisible();
    expect(within(rows).getByText('Renglón 46. Faltan las referencias.')).toBeVisible();
    expect(within(rows).getByText(`Renglón 46. ${text.sync.notices.topic_inferred}`)).toBeVisible();
    expect(within(rows).getByRole('button', { name: text.sync.rows.csv })).toBeVisible();
    // La tabla con su propio scroll se enfoca para recorrerla con el teclado (axe en el teléfono)
    expect(within(rows).getByRole('region', { name: text.sync.rows.title })).toHaveAttribute(
      'tabindex',
      '0',
    );
  });

  it('Asignaciones dice quién es el revisor por omisión y avisa si ya no es médico', async () => {
    fakeCloud();
    const typing = userEvent.setup();
    showScreen();
    const card = await screen.findByRole('region', { name: text.assign.title });
    expect(await within(card).findByText(text.assign.currentDefault('Dra. Ruiz'))).toBeVisible();
    const list = within(card).getByRole('region', { name: text.assign.defaults });
    expect(
      within(list).getByText(
        `${SECOND?.topics[0]?.name ?? ''} · Dr. Paz · ${text.assign.inactive}`,
      ),
    ).toBeVisible();
    await typing.selectOptions(within(card).getByLabelText(text.assign.branch), SECOND?.key ?? '');
    expect(within(card).getByText(text.assign.inactiveDefault('Dr. Paz'))).toBeVisible();
  });

  it('los renglones de una corrida que seguía corriendo aparecen al actualizar cuando termina', async () => {
    const state = fakeCloud({ running: true });
    const typing = userEvent.setup();
    showScreen();
    const card = await screen.findByRole('region', { name: text.sync.title });
    await typing.click(await within(card).findByRole('button', { name: text.sync.run.show }));
    const rows = await screen.findByRole('region', { name: text.sync.run.selected });
    expect(await within(rows).findByText(text.sync.rows.none)).toBeVisible();

    state.finished = true;
    await typing.click(within(card).getByRole('button', { name: text.sync.refresh }));
    expect(
      await within(rows).findByText(
        'Renglón 45. El subtema Control prenatal es una subespecialidad. Elige el subtema en la lista.',
      ),
    ).toBeVisible();
  });
});
