// @vitest-environment jsdom
// Cola de distractores de Reportes (pantalla 21, B14, 7.2 del plan de B14). Con la nube cada marca dice la
// noche en que la calibración la calculó y con cuántas exposiciones. La noche es el día de estudio de
// Mérida de la hora de la marca menos uno, porque la calibración corre a las 4 con 23 de la mañana. En la
// demostración no hay calibración nocturna y no se inventa una noche.
import 'fake-indexeddb/auto';
import { cleanup, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { usePreferences } from '@/app/preferences';
import { SCREENS } from '@/app/screens';
import { renderApp, resetApp, type RenderedApp } from '@/app/testing/renderApp';
import type { EditorDistractorFlag, EditorialRepo } from '@/data/editorial/editorialRepo';
import { EditorialError } from '@/data/editorial/editorialRepo';
import { calibrationAdminTexts } from '@/i18n/calibrationAdmin';
import { t } from '@/i18n/es-MX';
import { physicianText } from '@/i18n/physician';
import { setEditorialRepoOverride } from './useEditorialRepo';

vi.setConfig({ testTimeout: 120_000 });

let app: RenderedApp | undefined;
afterEach(async () => {
  cleanup();
  setEditorialRepoOverride(null);
  await resetApp(app?.api);
  app = undefined;
});

const WAIT = { timeout: 60_000 };
const text = physicianText.distractors;

const flag = (id: string, over: Partial<EditorDistractorFlag> = {}): EditorDistractorFlag => ({
  id,
  questionId: `00000000-0000-4000-8000-${id.padStart(12, '0')}`,
  questionKey: `GO-000${id}`,
  versionId: `10000000-0000-4000-8000-${id.padStart(12, '0')}`,
  optionId: `20000000-0000-4000-8000-${id.padStart(12, '0')}`,
  exposures: 140,
  choices: 3,
  attraction: 3 / 140,
  status: 'open',
  // 4:30 de la mañana en Mérida del 16 de octubre: la noche del 15
  flaggedAt: '2026-10-16T10:30:00.000Z',
  resolvedAt: null,
  note: null,
  ...over,
});

function repoWith(kind: EditorialRepo['kind'], flags: readonly EditorDistractorFlag[]) {
  const nothing = () => Promise.reject(new EditorialError('unknown'));
  const repo: EditorialRepo = {
    kind,
    list: nothing,
    question: nothing,
    createQuestion: nothing,
    saveVersion: nothing,
    submit: nothing,
    label: nothing,
    decide: nothing,
    reports: () => Promise.resolve({ questions: [], rows: [], notes: 0 }),
    setReportsStatus: nothing,
    distractorQueue: () => Promise.resolve([...flags]),
    resolveDistractor: nothing,
    labelPairs: nothing,
    myReviews: nothing,
    resolveSyncConflict: nothing,
  };
  return repo;
}

async function open(kind: EditorialRepo['kind'], flags: readonly EditorDistractorFlag[]) {
  setEditorialRepoOverride(repoWith(kind, flags));
  usePreferences.setState({ role: 'physician' });
  app = await renderApp(SCREENS.contentReports.path);
  await screen.findByRole('heading', { level: 1, name: t.screens.contentReports.title }, WAIT);
}

// La pantalla vuelve a leer cuando la sesión termina de cargar y rehace la cola, así que se consulta con
// screen y no con un elemento guardado de antes

describe('marcas de distractores de la noche', () => {
  it('con la nube cada marca dice la noche en que se marcó y las cifras no se atribuyen a esa noche', async () => {
    await open('cloud', [
      flag('1'),
      // 3:30 de la mañana en Mérida del 17: todavía cuenta para el día de estudio 16, la noche del 15
      flag('2', { flaggedAt: '2026-10-17T09:30:00.000Z', exposures: 212 }),
      // 5 de la mañana en Mérida del 17, ya del día de estudio 17: la noche del 16
      flag('3', { flaggedAt: '2026-10-17T11:00:00.000Z', exposures: 101 }),
    ]);
    const flagged = calibrationAdminTexts.distractors.flagged;
    // La lista se vuelve a leer cuando la sesión termina de cargar, así que se espera a que se asiente
    await waitFor(() => {
      expect(screen.getAllByText(flagged('15 de octubre'))).toHaveLength(2);
      expect(screen.getByText(flagged('16 de octubre'))).toBeVisible();
    }, WAIT);
    // Así se lee entero
    expect(screen.getAllByText('Marcada la noche del 15 de octubre')[0]).toBeVisible();
  });

  it('una marca que una noche posterior actualizó no dice que sus exposiciones son de la primera noche (revisión de B14, hallazgo 5)', async () => {
    // flaggedAt es de la primera noche. Una segunda noche subió las exposiciones a 600 sin cambiarlo
    await open('cloud', [
      flag('1', {
        flaggedAt: '2026-10-16T21:45:45.000Z',
        exposures: 600,
        choices: 9,
        attraction: 9 / 600,
      }),
    ]);
    await waitFor(() => {
      expect(screen.getByText(text.figures(600, 9, '1.5 %'))).toBeVisible();
    }, WAIT);
    expect(screen.getByText('Marcada la noche del 15 de octubre')).toBeVisible();
    expect(screen.queryByText(/Calculado la noche/)).toBeNull();
    expect(screen.queryByText(/con 600 exposiciones/)).toBeNull();
  });

  it('sigue diciendo las cifras de siempre', async () => {
    await open('cloud', [flag('1')]);
    await waitFor(() => {
      expect(screen.getByText(text.figures(140, 3, '2.1 %'))).toBeVisible();
    }, WAIT);
  });

  it('en la demostración no hay calibración nocturna y no se inventa una noche', async () => {
    await open('local', [flag('1')]);
    await waitFor(() => {
      expect(screen.getByText(text.figures(140, 3, '2.1 %'))).toBeVisible();
    }, WAIT);
    expect(screen.queryByText(/Marcada la noche/)).toBeNull();
  });
});
