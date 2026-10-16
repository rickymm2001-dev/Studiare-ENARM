// @vitest-environment jsdom
// Banco de preguntas del médico (pantalla 17) con Inglés médico (B13, 5.4 del plan de B13). Con la nube
// el filtro Sección separa Español, que son las ramas clínicas, de Inglés, que es una sola rama y viaja al
// servidor como rama. Una pregunta en inglés con la fuente del texto incompleta dice en su renglón qué le
// falta. En la demo, que no trae inglés, el filtro no se ofrece. Todo el texto es simulado.
import 'fake-indexeddb/auto';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { usePreferences } from '@/app/preferences';
import { SCREENS } from '@/app/screens';
import { renderApp, resetApp, type RenderedApp } from '@/app/testing/renderApp';
import type { EditorFilter, EditorListItem } from '@/data/bank/contracts';
import { EditorialError, type EditorialRepo } from '@/data/editorial/editorialRepo';
import { t } from '@/i18n/es-MX';
import { physicianText } from '@/i18n/physician';
import { incompleteText } from './reviewTexts';
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
const text = physicianText.bank;
const screenText = physicianText.bankScreen;

function item(number: number, over: Partial<EditorListItem> = {}): EditorListItem {
  return {
    questionId: `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`,
    sourceKey: `sheet:GO-${String(number).padStart(4, '0')}`,
    latestVersionId: `10000000-0000-4000-8000-${String(number).padStart(12, '0')}`,
    version: 1,
    status: 'draft',
    publishedVersion: null,
    branch: 'internal_medicine',
    topic: 'cardiology',
    subtopic: 'heart_failure',
    difficulty: 3,
    promptPreview: `[Prueba] Pregunta en español ${String(number)}`,
    author: null,
    reviewer: null,
    myRole: 'author',
    reviewState: 'none',
    incomplete: [],
    flags: [],
    openReports: 0,
    openDistractorFlags: 0,
    conflict: false,
    missing: false,
    retireRequested: false,
    retired: false,
    updatedAt: '2026-10-15T10:00:00.000Z',
    ...over,
  };
}

const english = (number: number, over: Partial<EditorListItem> = {}) =>
  item(number, {
    branch: 'medical_english',
    topic: 'reading_comprehension',
    subtopic: 'english_internal_medicine',
    promptPreview: `[Prueba] English question ${String(number)}`,
    ...over,
  });

const ITEMS = [
  item(1),
  item(2),
  english(3, { incomplete: ['passage_source_missing'] }),
  english(4, { incomplete: ['license_not_allowed'] }),
  english(5),
];

/** Un banco de mentira que filtra por rama como el servidor y anota qué filtros le llegaron */
function repoWith(kind: EditorialRepo['kind']): { repo: EditorialRepo; filters: EditorFilter[] } {
  const filters: EditorFilter[] = [];
  const nothing = () => Promise.reject(new EditorialError('unknown'));
  const repo: EditorialRepo = {
    kind,
    list: (filter) => {
      filters.push(filter);
      const items = ITEMS.filter((entry) => !filter.branch || entry.branch === filter.branch);
      return Promise.resolve({ total: items.length, items });
    },
    question: nothing,
    createQuestion: nothing,
    saveVersion: nothing,
    submit: nothing,
    label: nothing,
    decide: nothing,
    reports: nothing,
    setReportsStatus: nothing,
    distractorQueue: nothing,
    resolveDistractor: nothing,
    labelPairs: nothing,
    myReviews: (from, to) =>
      Promise.resolve({
        from,
        to,
        approved: 0,
        changesRequested: 0,
        rejected: 0,
        reviewed: 0,
        distractorsResolved: 0,
      }),
    resolveSyncConflict: nothing,
  };
  return { repo, filters };
}

async function open(kind: EditorialRepo['kind']) {
  const fake = repoWith(kind);
  setEditorialRepoOverride(fake.repo);
  usePreferences.setState({ role: 'physician' });
  app = await renderApp(SCREENS.questionBank.path);
  // La lista se vuelve a leer cuando la sesión termina de cargar, así que se espera a que se asiente
  await screen.findByText(text.count(ITEMS.length), undefined, WAIT);
  await new Promise((resolve) => setTimeout(resolve, 400));
  await screen.findByText(text.count(ITEMS.length), undefined, WAIT);
  return fake;
}

const list = () => screen.getByRole('region', { name: text.listTitle });
const shown = () => within(list()).getAllByRole('link', { name: /^Abrir la pregunta/ });

describe('banco del médico con Inglés médico', () => {
  it('con la nube el filtro Sección separa Español de Inglés y Inglés viaja como su rama', async () => {
    const typing = userEvent.setup({ delay: null });
    const fake = await open('cloud');
    expect(shown()).toHaveLength(5);
    const section = within(list()).getByLabelText(text.sectionLabel);
    expect(
      within(section)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual([text.all, 'Español', 'Inglés']);

    await typing.selectOptions(section, 'english');
    await waitFor(() => {
      expect(shown()).toHaveLength(3);
    }, WAIT);
    expect(fake.filters.at(-1)).toMatchObject({ branch: 'medical_english' });
    // La rama se elige entre las de la sección, y la de Inglés ya viene elegida
    const branch = within(list()).getByLabelText(t.topicPicker.trunks);
    expect(branch).toHaveValue('medical_english');
    expect(within(branch).getAllByRole('option')).toHaveLength(2);
    expect(screen.getByText(text.count(3))).toBeVisible();

    await typing.selectOptions(section, 'clinical');
    await waitFor(() => {
      expect(shown()).toHaveLength(2);
    }, WAIT);
    expect(fake.filters.at(-1)).not.toHaveProperty('branch');
    expect(within(list()).queryByText(/English question/)).toBeNull();
    expect(within(branch).queryByRole('option', { name: 'Inglés médico' })).toBeNull();

    await typing.selectOptions(section, '');
    await waitFor(() => {
      expect(shown()).toHaveLength(5);
    }, WAIT);
  });

  it('una pregunta en inglés sin fuente o con una licencia que no se acepta dice qué le falta', async () => {
    await open('cloud');
    const rows = within(list()).getAllByRole('listitem');
    const rowOf = (preview: RegExp) => {
      const found = rows.find((row) => preview.test(row.textContent));
      if (!found) throw new Error(`Sin renglón ${String(preview)}`);
      return found;
    };
    expect(
      within(rowOf(/English question 3/)).getByText(incompleteText('passage_source_missing')),
    ).toBeVisible();
    expect(
      within(rowOf(/English question 4/)).getByText(incompleteText('license_not_allowed')),
    ).toBeVisible();
    // Las demás no dicen nada de la fuente
    expect(within(rowOf(/English question 5/)).queryByText(/fuente del texto/i)).toBeNull();
    expect(within(rowOf(/en español 1/)).queryByText(/fuente del texto/i)).toBeNull();
  });

  it('en la demo no hay filtro Sección porque no trae preguntas en inglés', async () => {
    await open('local');
    expect(within(list()).queryByLabelText(text.sectionLabel)).toBeNull();
    expect(within(list()).getByLabelText(screenText.views.label ?? '')).toBeVisible();
    // La rama Inglés médico sigue en la lista de ramas, sin filtro de sección
    expect(
      within(within(list()).getByLabelText(t.topicPicker.trunks)).getByRole('option', {
        name: 'Inglés médico',
      }),
    ).toBeInTheDocument();
  });
});
