// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCloud } from '@/app/cloudState';
import { SCREENS } from '@/app/screens';
import { renderApp, resetApp, type RenderedApp } from '@/app/testing/renderApp';
import { writeStoredFlags } from '@/config/featureFlags';
import type { CatalogRow } from '@/data/bank/contracts';
import { fakeBankServer, wireBody, wireRow } from '@/data/testing/bankCloud';
import { TEST_ENGLISH_SOURCE } from '@/data/testing/english';
import { cloudId } from '@/data/testing/bankCloud';
import { englishText } from '@/i18n/english';
import { t } from '@/i18n/es-MX';
import { useBankNotice } from '../shared/bankNotice';
import { usePractice } from './practice';

vi.setConfig({ testTimeout: 30_000 });

// Simular con los casos de lectura en inglés del banco de la nube (B13, 2.1). getCloud devuelve el banco
// falso de cada prueba
const holder = vi.hoisted((): { cloud: unknown } => ({ cloud: null }));
vi.mock('@/data/cloud/client', () => ({
  getCloud: () => holder.cloud,
  cloudConfigured: () => true,
  loadCloud: () => Promise.resolve(holder.cloud),
}));

let app: RenderedApp | undefined;
const copy = englishText.practice;

const spanish = (count: number) =>
  Array.from({ length: count }, (_, index) => wireRow({ seq: index + 1 }));

/** Casos de lectura con las preguntas que se pidan por caso, a partir del seq que sigue */
function reading(sizes: readonly number[], start: number): CatalogRow[] {
  let seq = start;
  return sizes.flatMap((size) => {
    const caseId = cloudId();
    return Array.from({ length: size }, (_, index) => {
      seq += 1;
      return wireRow({
        seq,
        language: 'en',
        branch: 'medical_english',
        topic: 'reading_comprehension',
        subtopic: 'english_pediatrics',
        format: 'serial_case',
        task: 'data_interpretation',
        caseId,
        caseOrder: index + 1,
        caseSize: size,
      });
    });
  });
}

function bank(catalog: CatalogRow[], options: Parameters<typeof fakeBankServer>[1] = {}) {
  const server = fakeBankServer(catalog, options);
  for (const row of catalog) {
    if (row.language === 'en') {
      server.bodies.set(
        row.versionId,
        wireBody(row, {
          gpcRefs: [{ title: TEST_ENGLISH_SOURCE, status: 'to_verify' }],
          prompt: '[Prueba] Which statement is correct?',
        }),
      );
    }
  }
  holder.cloud = server.server;
  return server;
}

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

const englishCard = () => screen.findByRole('region', { name: copy.title }, { timeout: 20_000 });
const setup = () =>
  screen.findByRole('region', { name: t.simulator.setupTitle }, { timeout: 20_000 });

describe('Simular con Inglés médico', () => {
  it('sin casos de lectura la tarjeta dice Sin textos y la práctica en español no ofrece Inglés médico', async () => {
    bank(spanish(25));
    app = await renderApp(SCREENS.simulatorSetup.path);
    const practice = await setup();
    const card = await englishCard();
    expect(within(card).getByText(copy.none.title)).toBeVisible();
    expect(within(card).queryByRole('button', { name: copy.start })).toBeNull();
    // La práctica en español no trae Inglés médico entre sus ramas ni cuenta sus reactivos
    expect(within(practice).queryByText(t.branchNames.medical_english as string)).toBeNull();
    expect(within(practice).getByText(new RegExp(`^${t.simulator.available(25)}`))).toBeVisible();
  });

  it('con dos casos de 5 reactivos está en Calibrando con 5 de 30 y no mezcla el inglés con el español', async () => {
    bank([...spanish(25), ...reading([2, 3], 25)]);
    app = await renderApp(SCREENS.simulatorSetup.path);
    const practice = await setup();
    const card = await englishCard();
    expect(
      await within(card).findByText(/5 de 30 reactivos de inglés\. Faltan 25 reactivos de inglés/),
    ).toBeVisible();
    // La marca Calibrando de los reactivos va antes que la de dirigir las opciones a las trampas
    expect(within(card).getAllByText(t.states.calibrating.title).length).toBeGreaterThan(0);
    expect(within(card).getByText(`${copy.texts(2)} · ${copy.suggested(90)}`)).toBeVisible();
    // Las 25 del español siguen siendo 25 y la nota del banco no cuenta el inglés
    await waitFor(() => {
      expect(within(practice).getByText(/Banco de Studiare con 25 preguntas\./)).toBeVisible();
    });
  });

  it('empieza con textos completos, baja solo esos cuerpos y deja la práctica de inglés en curso', async () => {
    const typing = userEvent.setup();
    const server = bank([...spanish(25), ...reading([2, 3], 25)]);
    app = await renderApp(SCREENS.simulatorSetup.path);
    const card = await englishCard();
    await typing.selectOptions(within(card).getByRole('combobox', { name: copy.countLabel }), '3');
    await typing.click(await within(card).findByRole('button', { name: copy.start }));
    await waitFor(() => {
      expect(usePractice.getState().questionIds).toHaveLength(5);
    });
    const state = usePractice.getState();
    expect(state).toMatchObject({ section: 'english', secondsPerItem: 90, kind: 'practice' });
    const fetch = server.server.calls.find((call) => call.name === 'fetch_questions');
    expect(fetch?.args?.p_purpose).toBe('practice');
    expect(new Set(fetch?.args?.p_version_ids as string[]).size).toBe(5);
    // El servidor contó los 5 reactivos de los dos casos
    expect(server.read.size).toBe(5);
    const events = await app.api.repos.events.query({ userId: app.user.id });
    expect(events.find((event) => event.type === 'session_started')?.payload).toMatchObject({
      kind: 'practice',
      config: { section: 'english', cases: 2, secondsPerItem: 90, targeted: false, count: 5 },
    });
  });

  it('con 2 preguntas libres en Gratis y textos de 3 lo dice y no deja empezar', async () => {
    const server = bank([...spanish(25), ...reading([3, 3], 25)]);
    // Ya abrió 18 preguntas nuevas hoy
    for (const row of spanish(18)) server.read.add(row.versionId);
    app = await renderApp(SCREENS.simulatorSetup.path);
    const card = await englishCard();
    expect(await within(card).findByText(copy.noFit(2, 3))).toBeVisible();
    expect(within(card).getByRole('button', { name: copy.start })).toBeDisabled();
  });

  it('con la bandera apagada no hay tarjeta de inglés ni casilla en el examen', async () => {
    const typing = userEvent.setup();
    writeStoredFlags({ cloudBank: true, medicalEnglish: false });
    bank([...spanish(25), ...reading([2, 3], 25)]);
    app = await renderApp(SCREENS.simulatorSetup.path);
    await setup();
    // El examen completo es el modo Examen del mismo formulario (D-150)
    await typing.click(screen.getByRole('radio', { name: new RegExp(t.simulator.mode.exam) }));
    await waitFor(() => {
      expect(screen.getByRole('region', { name: t.exam.cardTitle })).toBeVisible();
    });
    expect(screen.queryByRole('region', { name: copy.title })).toBeNull();
    expect(screen.queryByRole('checkbox', { name: englishText.exam.include })).toBeNull();
  });

  it('con la bandera prendida el examen ofrece su parte en inglés y la tarjeta de inglés va debajo', async () => {
    const typing = userEvent.setup();
    bank([...spanish(25), ...reading([2, 3], 25)]);
    app = await renderApp(SCREENS.simulatorSetup.path);
    await setup();
    expect(await englishCard()).toBeVisible();
    await typing.click(screen.getByRole('radio', { name: new RegExp(t.simulator.mode.exam) }));
    expect(await screen.findByRole('checkbox', { name: englishText.exam.include })).toBeChecked();
    expect(screen.getByRole('region', { name: t.exam.cardTitle })).toBeVisible();
  });
});
