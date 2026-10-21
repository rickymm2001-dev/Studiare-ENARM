// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCloud } from '@/app/cloudState';
import { SCREENS } from '@/app/screens';
import { renderApp, resetApp, type RenderedApp } from '@/app/testing/renderApp';
import { writeStoredFlags } from '@/config/featureFlags';
import { readModelSettings } from '@/config/modelSettings';
import type { CatalogRow } from '@/data/bank/contracts';
import { uuidToUlid } from '@/data/cloud/cloudIds';
import type { DataApi } from '@/data/context';
import { createEvent } from '@/data/events/createEvent';
import { fakeBankServer, wireRow } from '@/data/testing/bankCloud';
import { adaptiveTexts } from '@/i18n/adaptive';
import { t } from '@/i18n/es-MX';
import { useBankNotice } from '../shared/bankNotice';
import { usePractice } from './practice';

vi.setConfig({ testTimeout: 30_000 });

// Simular con el modo adaptativo (B14, 4.5). Va con el banco de la nube, que es el que trae la
// calibración de la noche en cada fila del catálogo
const holder = vi.hoisted((): { cloud: unknown } => ({ cloud: null }));
vi.mock('@/data/cloud/client', () => ({
  getCloud: () => holder.cloud,
  cloudConfigured: () => true,
  loadCloud: () => Promise.resolve(holder.cloud),
}));

let app: RenderedApp | undefined;

/** Una fila del catálogo con lo que calculó la noche. La del médico queda en 3, Media */
type Wire = CatalogRow & { calibration: unknown };
const measuredRow = (index: number, difficulty: number, state = 'calibrated'): Wire => {
  const row = wireRow({ seq: index + 1 });
  return {
    ...row,
    calibration: {
      versionId: row.versionId,
      state,
      difficulty,
      se: 0.2,
      students: state === 'calibrated' ? 140 : 45,
      elo: difficulty,
      extreme: false,
      studyDay: '2026-10-15',
    },
  };
};
const plainRow = (index: number): Wire => ({ ...wireRow({ seq: index + 1 }), calibration: null });

/** Dificultades repartidas de -2 a 2 */
const spread = (count: number) =>
  Array.from({ length: count }, (_, index) => -2 + (4 * index) / Math.max(count - 1, 1));

const catalog = (measured: number, plain = 0): Wire[] => [
  ...spread(measured).map((difficulty, index) => measuredRow(index, difficulty)),
  ...Array.from({ length: plain }, (_, index) => plainRow(measured + index)),
];

function bank(rows: Wire[], options: Parameters<typeof fakeBankServer>[1] = { plan: 'monthly' }) {
  const server = fakeBankServer(rows, options);
  holder.cloud = server.server;
  return server;
}

/** Los ajustes del modelo que bajó la noche, guardados como lo hace ensureModelSnapshots */
const withSettings = (raw: unknown) => async (api: DataApi) => {
  await api.repos.bankState.put({
    key: 'model_settings',
    settings: readModelSettings(raw),
    fetchedDay: '2026-10-15',
    at: '2026-10-15T16:00:00.000Z',
  });
};

beforeEach(() => {
  localStorage.clear();
  writeStoredFlags({ cloudBank: true });
  useCloud.setState({
    state: {
      status: 'linked',
      identity: { authId: 'cuenta', email: 'ana@ejemplo.mx', role: 'student', alias: 'Ana' },
    },
  });
});

afterEach(async () => {
  vi.restoreAllMocks();
  cleanup();
  await resetApp(app?.api);
  app = undefined;
  holder.cloud = null;
  localStorage.clear();
  useCloud.setState({ state: { status: 'off' } });
  useBankNotice.getState().clear();
});

/** La configuración de la última práctica que empezó, como la dejó session_started */
async function lastConfig(started: RenderedApp): Promise<Record<string, unknown>> {
  const events = await started.api.repos.events.query({
    userId: started.user.id,
    types: ['session_started'],
  });
  const last = events.at(-1);
  if (last?.type !== 'session_started') throw new Error('No hubo session_started');
  return last.payload.config;
}

const setup = () =>
  screen.findByRole('region', { name: t.simulator.setupTitle }, { timeout: 20_000 });
const adaptiveBox = (practice: HTMLElement) =>
  within(practice).queryByRole('checkbox', { name: adaptiveTexts.label });

describe('Adaptativo, cerca de tu nivel', () => {
  it('con pocas preguntas calibradas dice calibrando y cuántas hay, y no ofrece la casilla', async () => {
    bank(catalog(10, 20));
    app = await renderApp(SCREENS.simulatorSetup.path);
    const practice = await setup();
    expect(await within(practice).findByText(adaptiveTexts.label)).toBeVisible();
    expect(adaptiveBox(practice)).toBeNull();
    // 10 de las 50 que hacen falta, y lo dice con la nota de calibrando de siempre
    expect(within(practice).getByText(/10 de 50 preguntas calibradas/)).toBeVisible();
    expect(within(practice).getByText(adaptiveTexts.calibrating(50))).toBeVisible();
  });

  it('con 50 o más preguntas calibradas en lo elegido ofrece la casilla y bloquea el nivel', async () => {
    const user = userEvent.setup();
    bank(catalog(60));
    app = await renderApp(SCREENS.simulatorSetup.path);
    const practice = await setup();
    const box = await within(practice).findByRole('checkbox', { name: adaptiveTexts.label });
    expect(box).not.toBeChecked();
    const level = within(practice).getByLabelText(t.simulator.difficulty);
    expect(level).toBeEnabled();
    await user.click(box);
    expect(box).toBeChecked();
    expect(level).toBeDisabled();
    expect(within(practice).getByText(adaptiveTexts.difficultyLocked)).toBeVisible();
  });

  it('lo calibrado cuenta solo en lo que el alumno eligió', async () => {
    const user = userEvent.setup();
    // 60 preguntas calibradas, todas afirmativas
    bank(catalog(60));
    app = await renderApp(SCREENS.simulatorSetup.path);
    const practice = await setup();
    await within(practice).findByRole('checkbox', { name: adaptiveTexts.label });
    // La estructura que elige sí cuenta: ninguna de las 60 es negativa
    await user.selectOptions(within(practice).getByLabelText(t.simulator.structure), 'negative');
    await waitFor(() => {
      expect(adaptiveBox(practice)).toBeNull();
    });
    expect(within(practice).getByText(/0 de 50 preguntas calibradas/)).toBeVisible();
  });

  it('el umbral sale de los ajustes del modelo', async () => {
    bank(catalog(8, 12));
    app = await renderApp(SCREENS.simulatorSetup.path, {
      seed: withSettings({ thresholds: { adaptiveMinItems: 8 } }),
    });
    const practice = await setup();
    expect(
      await within(practice).findByRole('checkbox', { name: adaptiveTexts.label }),
    ).toBeVisible();
  });

  it('si el servidor apaga el modo adaptativo no aparece nada', async () => {
    bank(catalog(60));
    app = await renderApp(SCREENS.simulatorSetup.path, {
      seed: withSettings({ features: { adaptive: false } }),
    });
    const practice = await setup();
    await waitFor(() => {
      expect(within(practice).queryByText(adaptiveTexts.loading)).toBeNull();
    });
    expect(within(practice).queryByText(adaptiveTexts.label)).toBeNull();
  });

  it('la sesión sale cerca del nivel, guarda en session_started el modo y la habilidad, y respeta el tope', async () => {
    const user = userEvent.setup();
    const rows = catalog(80);
    bank(rows, { plan: 'free', freeLimit: 6 });
    app = await renderApp(SCREENS.simulatorSetup.path);
    const practice = await setup();
    await user.click(await within(practice).findByRole('checkbox', { name: adaptiveTexts.label }));
    await user.selectOptions(within(practice).getByLabelText(t.simulator.count), '20');
    await user.click(within(practice).getByRole('button', { name: t.simulator.start }));
    await waitFor(() => {
      expect(usePractice.getState().questionIds.length).toBeGreaterThan(0);
    });
    // Gratis solo puede abrir 6, aunque pidió 20
    const ids = usePractice.getState().questionIds;
    expect(ids.length).toBeLessThanOrEqual(6);
    const difficultyOf = new Map(
      rows.map((row) => [
        uuidToUlid(row.versionId) ?? '',
        (row.calibration as { difficulty: number }).difficulty,
      ]),
    );
    const mean = (list: number[]) => list.reduce((a, b) => a + b, 0) / list.length;
    // Sin respuestas la habilidad queda en 0, así que salen cercanas a 0 y no repartidas de -2 a 2
    expect(mean(ids.map((id) => Math.abs(difficultyOf.get(id) ?? 9)))).toBeLessThan(0.7);
    const config = await lastConfig(app);
    expect(config).toMatchObject({ adaptive: true, ability: 0 });
    expect((config as { abilitySe: number }).abilitySe).toBeGreaterThan(0.9);
  });

  it('un alumno que ya contestó bien preguntas difíciles recibe preguntas más difíciles', async () => {
    const user = userEvent.setup();
    const rows = catalog(80);
    bank(rows, { plan: 'monthly' });
    const hard = rows.filter((row) => (row.calibration as { difficulty: number }).difficulty > 0.8);
    app = await renderApp(SCREENS.simulatorSetup.path, {
      seed: async (api, student) => {
        // Acertó 20 de las difíciles
        for (const row of hard.slice(0, 20)) {
          await api.recordEvent(
            createEvent(
              'question_answered',
              {
                questionVersionId: uuidToUlid(row.versionId) ?? '',
                optionVersionId: uuidToUlid(row.versionId) ?? '',
                correct: true,
                confidence: null,
                msToAnswer: 20_000,
                changeCount: 0,
                highlightEnabled: false,
              },
              {
                userId: student.id,
                tz: 'America/Merida',
                // Hace unos días, para que no cuenten contra el tope de hoy
                clock: { now: () => new Date(Date.now() - 3 * 86_400_000) },
              },
            ),
          );
        }
      },
    });
    const practice = await setup();
    await user.click(await within(practice).findByRole('checkbox', { name: adaptiveTexts.label }));
    await user.selectOptions(within(practice).getByLabelText(t.simulator.count), '10');
    await user.click(within(practice).getByRole('button', { name: t.simulator.start }));
    await waitFor(() => {
      expect(usePractice.getState().questionIds.length).toBe(10);
    });
    const difficultyOf = new Map(
      rows.map((row) => [
        uuidToUlid(row.versionId) ?? '',
        (row.calibration as { difficulty: number }).difficulty,
      ]),
    );
    const chosen = usePractice.getState().questionIds.map((id) => difficultyOf.get(id) ?? 0);
    expect(chosen.reduce((a, b) => a + b, 0) / chosen.length).toBeGreaterThan(0.4);
    const config = await lastConfig(app);
    expect((config as { ability: number }).ability).toBeGreaterThan(0.3);
  });

  it('sin la casilla la práctica sale como siempre y no deja la marca de adaptativo', async () => {
    const user = userEvent.setup();
    bank(catalog(60));
    app = await renderApp(SCREENS.simulatorSetup.path);
    const practice = await setup();
    await within(practice).findByRole('checkbox', { name: adaptiveTexts.label });
    await user.click(within(practice).getByRole('button', { name: t.simulator.start }));
    await waitFor(() => {
      expect(usePractice.getState().questionIds.length).toBe(10);
    });
    const config = await lastConfig(app);
    expect(config).not.toHaveProperty('adaptive');
  });
});

describe('dificultad que usan los filtros (B14, 4.4)', () => {
  it('Difícil, Media y Fácil siguen la dificultad calibrada y no la del médico', async () => {
    const user = userEvent.setup();
    // La del médico es 3, Media, en todas. La calibrada dice 1.6, 0 y -1.6
    const rows = [
      ...[1.6, 1.7, 1.8].map((difficulty, index) => measuredRow(index, difficulty)),
      ...[0, 0.1].map((difficulty, index) => measuredRow(10 + index, difficulty)),
      measuredRow(20, -1.6),
      plainRow(30),
    ];
    bank(rows);
    app = await renderApp(SCREENS.simulatorSetup.path);
    const practice = await setup();
    const available = () =>
      screen.getByRole('region', { name: t.simulator.stats.label }).textContent;
    const level = await within(practice).findByLabelText(t.simulator.difficulty);
    await user.selectOptions(level, 'hard');
    await waitFor(() => {
      expect(available()).toContain(`${t.simulator.stats.available}3`);
    });
    await user.selectOptions(level, 'easy');
    await waitFor(() => {
      expect(available()).toContain(`${t.simulator.stats.available}1`);
    });
    // La que no se calibró conserva la del médico, Media, junto con las calibradas en cero
    await user.selectOptions(level, 'medium');
    await waitFor(() => {
      expect(available()).toContain(`${t.simulator.stats.available}3`);
    });
  });
});
