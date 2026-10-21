// @vitest-environment jsdom
// Calibración (pantalla 39, 7.2 del plan de B14). Estado de la última corrida con su modo y hace cuánto,
// el aviso de más de 48 horas con los pasos para volver a prenderla, el interruptor y el modo con su
// confirmación al publicar, las corridas con sus conteos y el enlace a GitHub, y lo que publica la última
// buena con calibrando donde faltan 30 alumnos.
import 'fake-indexeddb/auto';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCloud } from '@/app/cloudState';
import { DataProvider } from '@/data/DataProvider';
import { calibrationAdminTexts } from '@/i18n/calibrationAdmin';
import { t } from '@/i18n/es-MX';
import { CalibrationAdminScreen } from './CalibrationAdminScreen';

vi.setConfig({ testTimeout: 30_000 });

const holder = vi.hoisted((): { cloud: unknown } => ({ cloud: null }));
vi.mock('@/data/cloud/client', () => ({
  getCloud: () => holder.cloud,
  cloudConfigured: () => holder.cloud !== null,
  loadCloud: () => Promise.resolve(holder.cloud),
}));

const text = calibrationAdminTexts;
/** El 16 de octubre a las 6 de la mañana en Mérida */
const NOW = new Date('2026-10-16T12:00:00.000Z');
const RUN_AT = '2026-10-16T10:23:05.000Z';

interface Setup {
  rpc: { name: string; args: unknown }[];
  upserts: { key: string; value: unknown }[];
}

const run = (over: Record<string, unknown> = {}) => ({
  id: '8d3c0000-0000-4000-8000-000000000001',
  trigger: 'schedule',
  mode: 'dry_run',
  status: 'ok',
  reason: null,
  startedAt: RUN_AT,
  finishedAt: '2026-10-16T10:31:40.000Z',
  runner: { runId: '123456789', sha: 'abcdef0' },
  counts: {
    consenters: 412,
    itemsPhysicianEstimate: 260,
    itemsProvisional: 30,
    itemsCalibrated: 10,
    flagsNew: 3,
    cellsReady: 20,
    cellsCalibrating: 8,
    fatigueState: 'calibrating',
    parity: true,
    answerPages: 7,
  },
  ...over,
});

const reply = (over: Record<string, unknown> = {}) => ({
  lastOkAt: '2026-10-16T10:31:40.000Z',
  publication: null,
  settings: {},
  runs: [run()],
  overview: {
    items: { physician_estimate: 260, provisional: 30, calibrated: 10 },
    hardestTopics: [{ key: 'pediatrics/neonatology', students: 96, accuracy: 0.58 }],
    motives: { pediatrics: { reports: 830, knowledge: 0.41, time: 0.08, fatigue: 0.06 } },
    fatigue: { state: 'calibrating', students: 25, longSessions: 120 },
    agreement: { kappa: 0.52, parity: true },
  },
  ...over,
});

function fakeCloud(
  data: Record<string, unknown>,
  stored: Record<string, unknown> = {},
  options: { writeError?: string } = {},
): Setup {
  const state: Setup = { rpc: [], upserts: [] };
  holder.cloud = {
    rpc: (name: string, args: unknown) => {
      state.rpc.push({ name, args });
      return Promise.resolve({ data, error: null });
    },
    from: () => {
      const query = {
        select: () => query,
        eq: () => query,
        maybeSingle: () => Promise.resolve({ data: { value: stored }, error: null }),
        upsert: (row: { key: string; value: unknown }) => {
          state.upserts.push({ key: row.key, value: row.value });
          return Promise.resolve({
            error: options.writeError === undefined ? null : { code: options.writeError },
          });
        },
      };
      return query;
    },
  };
  return state;
}

const showScreen = () =>
  render(
    <DataProvider kind="real">
      <MemoryRouter>
        <CalibrationAdminScreen />
      </MemoryRouter>
    </DataProvider>,
  );

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: NOW });
  useCloud.setState({
    state: {
      status: 'linked',
      identity: { authId: 'yo', email: 'yo@ejemplo.mx', role: 'admin', alias: null },
    },
  });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  holder.cloud = null;
  useCloud.setState({ state: { status: 'off' } });
});

describe('Calibración', () => {
  it('sin la nube dice que necesita la cuenta de un admin y no pide nada', () => {
    useCloud.setState({ state: { status: 'off' } });
    showScreen();
    expect(
      screen.getByRole('heading', { level: 1, name: t.screens.calibrationAdmin.title }),
    ).toBeVisible();
    expect(screen.getByText(text.needsCloud)).toBeVisible();
  });

  it('pide las 30 corridas con admin_calibration_runs', async () => {
    const state = fakeCloud(reply());
    showScreen();
    await screen.findByRole('heading', { name: text.status.title });
    expect(state.rpc).toEqual([{ name: 'admin_calibration_runs', args: { p_limit: 30 } }]);
  });

  it('dice cómo terminó la última corrida, su modo, hace cuánto y que está encendida o apagada', async () => {
    fakeCloud(reply());
    showScreen();
    const card = (await screen.findByRole('heading', { name: text.status.title })).closest(
      'section',
    ) as HTMLElement;
    expect(within(card).getByText(text.runStatus.ok as string)).toBeVisible();
    expect(within(card).getByText('Solo reporte · Programada')).toBeVisible();
    expect(within(card).getByText(/Empezó el .*, hace 1 hora\./)).toBeVisible();
    // Viene sin ajustes guardados, así que queda apagada y sin publicar
    expect(within(card).getByText(text.status.switchOff)).toBeVisible();
    expect(within(card).getByText(text.status.publication.none)).toBeVisible();
    // Una corrida reciente no trae el aviso de las 48 horas
    expect(screen.queryByText(text.status.stale.title)).toBeNull();
  });

  it('con lo publicado dice de qué corrida leen los alumnos', async () => {
    fakeCloud(reply({ publication: { runId: 'x', at: RUN_AT } }));
    showScreen();
    expect(await screen.findByText(text.status.publication.at('16 de octubre'))).toBeVisible();
  });

  it('avisa si la última corrida buena tiene más de 48 horas y trae los pasos para volver a prenderla', async () => {
    fakeCloud(
      reply({
        lastOkAt: '2026-10-13T10:31:40.000Z',
        settings: { calibration: { enabled: true, mode: 'dry_run' } },
        runs: [
          run({
            status: 'failed',
            reason: 'store_error',
            startedAt: '2026-10-16T10:23:05.000Z',
            counts: {},
          }),
        ],
      }),
    );
    showScreen();
    const notice = (await screen.findByText(text.status.stale.title)).closest('div') as HTMLElement;
    for (const step of text.status.stale.steps)
      expect(within(notice).getByText(step)).toBeVisible();
    expect(within(notice).getByText(/La última corrida buena fue hace 3 días\./)).toBeVisible();
    const link = within(notice).getByRole('link', { name: text.status.stale.open });
    expect(link).toHaveAttribute(
      'href',
      'https://github.com/rickymm2001-dev/Studiare-ENARM/actions/workflows/calibration.yml',
    );
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
    // La corrida fallida dice por qué
    expect(screen.getAllByText(text.reasons.store_error as string).length).toBeGreaterThan(0);
  });

  it('si el admin la apagó a propósito no avisa de las 48 horas ni manda a prenderla en GitHub (revisión de B14, hallazgo 8)', async () => {
    // Apagada, todas las corridas salen saltadas con disabled y la última buena envejece
    fakeCloud(
      reply({
        lastOkAt: '2026-10-13T10:31:40.000Z',
        runs: [
          run({
            status: 'skipped',
            reason: 'disabled',
            startedAt: '2026-10-16T10:23:05.000Z',
            counts: {},
          }),
        ],
      }),
    );
    showScreen();
    const card = (await screen.findByRole('heading', { name: text.status.title })).closest(
      'section',
    ) as HTMLElement;
    expect(within(card).getByText(text.status.switchOff)).toBeVisible();
    expect(within(card).queryByText(text.status.stale.title)).toBeNull();
    expect(within(card).queryByRole('link', { name: text.status.stale.open })).toBeNull();
    expect(within(card).queryByText(text.status.noGoodRun)).toBeNull();
    // La corrida saltada sigue diciendo por qué
    expect(screen.getAllByText(text.reasons.disabled as string).length).toBeGreaterThan(0);
  });

  it('sin ninguna corrida explica que puede faltar la llave', async () => {
    fakeCloud(
      reply({
        lastOkAt: null,
        runs: [],
        overview: {
          items: {},
          hardestTopics: [],
          motives: {},
          fatigue: null,
          agreement: null,
        },
      }),
    );
    showScreen();
    expect(await screen.findByText(text.status.noRuns)).toBeVisible();
    expect(screen.getByText(text.status.noRunsHelp)).toBeVisible();
    expect(screen.getByText(text.runs.empty)).toBeVisible();
    // Sin corrida buena no hay cifras que mostrar
    expect(screen.getByText(text.overview.none)).toBeVisible();
    expect(screen.queryByText(text.status.stale.title)).toBeNull();
  });

  it('lista las corridas con su línea, sus conteos con nombre y el enlace a GitHub por su número', async () => {
    fakeCloud(
      reply({
        runs: [
          run(),
          run({ id: 'dos', status: 'failed', reason: 'store_error', runner: null, counts: {} }),
        ],
      }),
    );
    showScreen();
    const card = (await screen.findByRole('heading', { name: text.runs.title })).closest(
      'section',
    ) as HTMLElement;
    const items = within(card).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    const first = items[0] as HTMLElement;
    expect(
      within(first).getByText(
        /412 alumnos con permiso · Preguntas 260 del médico, 30 provisionales, 10 calibradas · 3 marcas nuevas · Comparación 20 celdas listas y 8 calibrando · Fatiga calibrando · Kappa coincide/,
      ),
    ).toBeVisible();
    expect(
      within(first).getByRole('link', { name: text.runs.github('123456789') }),
    ).toHaveAttribute(
      'href',
      'https://github.com/rickymm2001-dev/Studiare-ENARM/actions/runs/123456789',
    );
    // Los conteos con nombre están dentro del detalle, y los técnicos no salen
    expect(within(first).getByText('Marcas nuevas')).toBeInTheDocument();
    expect(within(first).queryByText(/answerPages/)).toBeNull();
    const second = items[1] as HTMLElement;
    expect(within(second).getByText(text.runStatus.failed as string)).toBeVisible();
    expect(within(second).getByText(text.reasons.store_error as string)).toBeVisible();
    expect(within(second).queryByRole('link')).toBeNull();
  });

  it('enseña lo que publica la última buena y dice calibrando donde faltan alumnos', async () => {
    fakeCloud(
      reply({
        overview: {
          items: { physician_estimate: 260, provisional: 30, calibrated: 10 },
          hardestTopics: [],
          motives: {},
          fatigue: { state: 'calibrating', students: 25, longSessions: 120 },
          agreement: { kappa: null, parity: null },
        },
      }),
    );
    showScreen();
    const card = (await screen.findByRole('heading', { name: text.overview.title })).closest(
      'section',
    ) as HTMLElement;
    expect(within(card).getByText('260 de 300')).toBeVisible();
    expect(within(card).getByText(text.overview.topics.none)).toBeVisible();
    expect(within(card).getByText(text.overview.motives.none)).toBeVisible();
    expect(within(card).getByText(text.overview.fatigue.calibrating(25, 30))).toBeVisible();
    expect(within(card).getByText(text.overview.agreement.none)).toBeVisible();
  });

  it('con 30 alumnos o más enseña los temas que más cuestan, los motivos y el kappa con su paridad', async () => {
    fakeCloud(reply());
    showScreen();
    const card = (await screen.findByRole('heading', { name: text.overview.title })).closest(
      'section',
    ) as HTMLElement;
    expect(within(card).getByText('Pediatría, Neonatología')).toBeVisible();
    expect(within(card).getByText('58 % de acierto con 96 alumnos')).toBeVisible();
    expect(
      within(card).getByText('830 reportes · Conocimiento 41 % · Tiempo 8 % · Fatiga 6 %'),
    ).toBeVisible();
    expect(within(card).getByText('Kappa de la noche 0.52')).toBeVisible();
    expect(within(card).getByText(text.overview.agreement.match)).toBeVisible();
  });

  it('una paridad que falla se dice con todas sus letras', async () => {
    fakeCloud(
      reply({
        overview: { ...reply().overview, agreement: { kappa: 0.52, parity: false } },
      }),
    );
    showScreen();
    expect(await screen.findByText(text.overview.agreement.mismatch)).toBeVisible();
  });
});

describe('interruptor y modo', () => {
  it('prender la calibración en Solo reporte guarda sin pedir confirmación', async () => {
    const saved = {
      calibration: { enabled: false, mode: 'dry_run', minNoticeVersion: '2026-10-15b' },
    };
    const state = fakeCloud(reply({ settings: saved }), saved);
    const typing = userEvent.setup();
    showScreen();
    const enabled = await screen.findByRole('checkbox', { name: text.control.enabled });
    expect(enabled).not.toBeChecked();
    const save = screen.getByRole('button', { name: text.control.save });
    expect(save).toBeDisabled();
    await typing.click(enabled);
    await typing.click(save);
    expect(await screen.findByText(text.control.saved)).toBeVisible();
    expect(state.upserts).toHaveLength(1);
    expect(state.upserts[0]?.key).toBe('model_settings');
    expect(state.upserts[0]?.value).toMatchObject({
      calibration: { enabled: true, mode: 'dry_run', minNoticeVersion: '2026-10-15b' },
    });
  });

  it('pasar a Publicar pide confirmación y no guarda hasta que se confirma', async () => {
    const saved = {
      calibration: { enabled: true, mode: 'dry_run', minNoticeVersion: '2026-10-15b' },
    };
    const state = fakeCloud(reply({ settings: saved }), saved);
    const typing = userEvent.setup();
    showScreen();
    await screen.findByRole('checkbox', { name: text.control.enabled });
    await typing.click(screen.getByRole('button', { name: text.modes.apply as string }));
    expect(screen.getByText(text.control.modeHint.apply as string)).toBeVisible();
    await typing.click(screen.getByRole('button', { name: text.control.save }));
    expect(screen.getByText(text.control.confirm)).toBeVisible();
    expect(state.upserts).toEqual([]);
    await typing.click(screen.getByRole('button', { name: text.control.cancel }));
    expect(state.upserts).toEqual([]);
    await typing.click(screen.getByRole('button', { name: text.control.save }));
    await typing.click(screen.getByRole('button', { name: text.control.confirmYes }));
    expect(await screen.findByText(text.control.saved)).toBeVisible();
    expect(state.upserts[0]?.value).toMatchObject({
      calibration: { enabled: true, mode: 'apply' },
    });
  });

  it('si la base lo niega dice que no se pudo guardar', async () => {
    fakeCloud(reply(), {}, { writeError: '42501' });
    const typing = userEvent.setup();
    showScreen();
    await typing.click(await screen.findByRole('checkbox', { name: text.control.enabled }));
    await typing.click(screen.getByRole('button', { name: text.control.save }));
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(text.control.failed);
    });
  });
});
