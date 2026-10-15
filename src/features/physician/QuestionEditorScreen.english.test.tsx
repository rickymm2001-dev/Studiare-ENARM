// @vitest-environment jsdom
// Editor de pregunta para Inglés médico (B13, 5.4 del plan de B13) con un repositorio de la nube de
// mentira. Al abrir una pregunta en inglés el texto, la pregunta y las opciones se leen en inglés
// (lang="en"), aparece la fuente del texto con su licencia y, mientras falte o no se acepte, la versión
// dice qué le falta y no se puede mandar a revisión. Guardar arma la fuente como primera referencia y manda el
// idioma. Elegir la rama Inglés médico en una pregunta en español abre la fuente, y en la demo esa rama no
// se ofrece. Todo el texto es simulado.
import 'fake-indexeddb/auto';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { usePreferences } from '@/app/preferences';
import { SCREENS } from '@/app/screens';
import { renderApp, resetApp, type RenderedApp } from '@/app/testing/renderApp';
import type { EditorQuestion, EditorVersion } from '@/data/bank/contracts';
import { PASSAGE_SOURCE_PREFIX } from '@/data/content/passageSource';
import { EditorialError, type EditorialRepo } from '@/data/editorial/editorialRepo';
import { t } from '@/i18n/es-MX';
import { physicianText } from '@/i18n/physician';
import type { QuestionDraft } from './editorDraft';
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
const text = physicianText.questionEditor;
const review = physicianText.review;
const passage = text.passage;
const SOURCE = `${PASSAGE_SOURCE_PREFIX}[Prueba] Artículo simulado. CC BY. https://example.org/articulo`;

const ID = {
  question: '11111111-1111-4111-8111-111111111111',
  version: '22222222-2222-4222-8222-222222222222',
};

/** Una versión en borrador de la autora. En inglés lleva el texto del caso y las opciones en inglés */
function version(over: Partial<EditorVersion> = {}): EditorVersion {
  const english = (over.branch ?? 'medical_english') === 'medical_english';
  return {
    versionId: ID.version,
    version: 1,
    status: 'draft',
    source: 'app',
    author: { id: 'autora', alias: 'Ana', code: 'AN' },
    createdAt: '2026-10-15T10:00:00.000Z',
    submittedAt: null,
    decidedAt: null,
    branch: english ? 'medical_english' : 'internal_medicine',
    topic: english ? 'reading_comprehension' : 'cardiology',
    subtopic: english ? 'english_internal_medicine' : 'heart_failure',
    difficulty: 3,
    itemKinds: [],
    structure: {
      polarity: 'affirmative',
      task: english ? 'data_interpretation' : 'diagnosis',
      format: 'direct',
      source: 'physician',
    },
    vignette: english ? '[Prueba] Simulated passage about a made-up topic.' : '[Prueba] Viñeta.',
    prompt: english ? '[Prueba] What does the passage say?' : '[Prueba] ¿Cuál es la respuesta?',
    explanation: '[Prueba] Explicación simulada.',
    gpcRefs: english ? [{ title: SOURCE, status: 'to_verify' }] : [],
    clues: [],
    caseId: null,
    caseOrder: null,
    variantOf: null,
    canonicalOptionIds: ['o1', 'o2', 'o3', 'o4'],
    options: ['A', 'B', 'C', 'D'].map((letter, position) => ({
      id: `o${String(position + 1)}`,
      optionId: `p${String(position + 1)}`,
      letter,
      position,
      text: `[Prueba] Option ${letter}`,
      isCorrect: position === 0,
      biasTag: position === 0 ? null : 'anchoring',
      secondaryBiasTags: [],
      rationale: `[Prueba] Justificación ${letter}`,
      hidden: false,
    })),
    incomplete: [],
    flags: [],
    decisions: [],
    ...over,
  };
}

function question(
  latest: EditorVersion,
  role: EditorQuestion['review']['role'] = 'author',
  state: EditorQuestion['review']['state'] = 'none',
) {
  return {
    question: {
      questionId: ID.question,
      sourceKey: null,
      latestVersionId: latest.versionId,
      version: latest.version,
      status: latest.status,
      publishedVersion: null,
      branch: latest.branch,
      topic: latest.topic,
      subtopic: latest.subtopic,
      difficulty: latest.difficulty,
      promptPreview: latest.prompt,
      author: latest.author,
      reviewer: null,
      myRole: role === 'none' ? 'author' : role,
      reviewState: state,
      incomplete: latest.incomplete,
      flags: [],
      openReports: 0,
      openDistractorFlags: 0,
      conflict: false,
      missing: false,
      retireRequested: false,
      retired: false,
      updatedAt: latest.createdAt,
    },
    versions: [latest],
    case: null,
    review: {
      role,
      state,
      myLabels: [],
      pendingOptionIds: state === 'blind_pending' ? ['p2', 'p3', 'p4'] : [],
    },
    reports: { open: 0, byReason: {} },
    distractorFlags: [],
    sync: {
      origin: 'app',
      sourceKey: null,
      lastRunAt: null,
      conflictSince: null,
      missingSince: null,
    },
  } satisfies EditorQuestion;
}

/** Un repositorio de la nube de mentira que devuelve esa pregunta y guarda lo que le mandan */
function repoWith(
  shown: EditorQuestion,
  kind: EditorialRepo['kind'] = 'cloud',
): { repo: EditorialRepo; saved: QuestionDraft[] } {
  const saved: QuestionDraft[] = [];
  const nothing = () => Promise.reject(new EditorialError('unknown'));
  const repo: EditorialRepo = {
    kind,
    list: nothing,
    question: () => Promise.resolve(shown),
    createQuestion: nothing,
    saveVersion: (_questionId, _baseVersionId, draft) => {
      saved.push(draft);
      return Promise.resolve({
        status: 'saved',
        questionId: ID.question,
        versionId: ID.version,
        version: 2,
        incomplete: [],
      });
    },
    submit: nothing,
    label: nothing,
    decide: nothing,
    reports: nothing,
    setReportsStatus: nothing,
    distractorQueue: nothing,
    resolveDistractor: nothing,
    labelPairs: nothing,
    myReviews: nothing,
    resolveSyncConflict: nothing,
  };
  return { repo, saved };
}

async function open(
  shown: EditorQuestion,
  options: { kind?: EditorialRepo['kind']; role?: 'physician' | 'admin' } = {},
) {
  const fake = repoWith(shown, options.kind);
  setEditorialRepoOverride(fake.repo);
  usePreferences.setState({ role: options.role ?? 'physician' });
  app = await renderApp(`${SCREENS.questionEditor.path}?pregunta=${ID.question}`);
  // Con la nube la pantalla lee otra vez cuando la sesión termina de cargar (cambia la marca de la
  // lectura), así que se espera a que se asiente para no tocar elementos que van a desaparecer
  await screen.findByText(text.status.title, { exact: false }, WAIT);
  await new Promise((resolve) => setTimeout(resolve, 400));
  await screen.findByText(text.status.title, { exact: false }, WAIT);
  return fake;
}

describe('editor de una pregunta en inglés', () => {
  it('lee el texto, la pregunta y las opciones en inglés y pide la fuente del texto', async () => {
    const draft = version({
      gpcRefs: [],
      incomplete: ['passage_source_missing'],
    });
    await open(question(draft));
    const vignette = await screen.findByLabelText(text.case.vignetteEnglish, undefined, WAIT);
    expect(vignette).toHaveAttribute('lang', 'en');
    expect(screen.getByLabelText(text.case.promptEnglish)).toHaveAttribute('lang', 'en');
    expect(screen.getByText(text.language.note)).toBeVisible();
    // La explicación y las justificaciones siguen en español
    expect(screen.getByLabelText(text.meta.explanation)).not.toHaveAttribute('lang');

    // La fuente a la vista junto al texto, vacía, y lo que le falta
    const source = screen.getByRole('region', { name: passage.title });
    expect(within(source).getByLabelText(passage.sourceTitle)).toHaveValue('');
    expect(within(source).getByLabelText(passage.license)).toHaveValue('');
    expect(within(source).getByText(incompleteText('passage_source_missing'))).toBeVisible();
    // No se puede mandar a revisión hasta completarla
    const submit = screen.getByRole('region', { name: review.submit.title });
    expect(within(submit).getByText(incompleteText('passage_source_missing'))).toBeVisible();
    expect(within(submit).getByRole('button', { name: review.submit.action })).toBeDisabled();
  });

  it('la fuente completa se guarda como la primera referencia y el idioma viaja', async () => {
    const typing = userEvent.setup({ delay: null });
    const fake = await open(
      question(version({ gpcRefs: [], incomplete: ['passage_source_missing'] })),
    );
    const source = await screen.findByRole('region', { name: passage.title }, WAIT);
    // user-event toma el corchete como una tecla, así que el título con la marca [Prueba] se pega entero
    await typing.click(within(source).getByLabelText(passage.sourceTitle));
    await typing.paste('[Prueba] Artículo simulado');
    await typing.selectOptions(within(source).getByLabelText(passage.license), 'CC BY');
    // CC BY pide el enlace: mientras falta, el campo lo dice y la fuente sigue incompleta
    expect(within(source).getByText(passage.urlMissing)).toBeVisible();
    await typing.type(within(source).getByLabelText(passage.url), 'https://example.org/articulo');
    expect(within(source).getByText(passage.complete)).toBeVisible();
    expect(within(source).getByText(passage.preview)).toBeVisible();

    await typing.click(screen.getByRole('button', { name: t.settings.saveChanges }));
    await waitFor(() => {
      expect(fake.saved).toHaveLength(1);
    }, WAIT);
    const [saved] = fake.saved;
    expect(saved?.language).toBe('en');
    expect(saved?.gpcRefs).toEqual([{ title: SOURCE, status: 'verified' }]);
    expect(saved).not.toHaveProperty('passage');
  });

  it('una licencia que no se acepta se muestra, dice que no está en la lista y se puede corregir', async () => {
    const typing = userEvent.setup({ delay: null });
    const shown = version({
      gpcRefs: [
        {
          title: `${PASSAGE_SOURCE_PREFIX}[Prueba] Artículo simulado. CC BY-NC. https://example.org/articulo`,
          status: 'to_verify',
        },
      ],
      incomplete: ['license_not_allowed'],
    });
    const fake = await open(question(shown));
    const source = await screen.findByRole('region', { name: passage.title }, WAIT);
    const license = within(source).getByLabelText(passage.license);
    expect(license).toHaveValue('CC BY-NC');
    expect(
      within(source).getByRole('option', { name: passage.licenseOutside('CC BY-NC') }),
    ).toBeVisible();
    expect(within(source).getByText(passage.licenseNotAllowed)).toBeVisible();
    expect(
      within(source).getAllByText(incompleteText('license_not_allowed')).length,
    ).toBeGreaterThan(0);

    await typing.selectOptions(license, 'CC BY-SA');
    expect(within(source).getByText(passage.complete)).toBeVisible();
    await typing.click(screen.getByRole('button', { name: t.settings.saveChanges }));
    await waitFor(() => {
      expect(fake.saved).toHaveLength(1);
    }, WAIT);
    expect(fake.saved[0]?.gpcRefs[0]?.title).toBe(
      `${PASSAGE_SOURCE_PREFIX}[Prueba] Artículo simulado. CC BY-SA. https://example.org/articulo`,
    );
  });

  it('una pregunta en español no muestra la fuente ni el idioma, y su guardado no cambia', async () => {
    const typing = userEvent.setup({ delay: null });
    const fake = await open(question(version({ branch: 'internal_medicine' })));
    await screen.findByLabelText(text.case.prompt, undefined, WAIT);
    expect(screen.queryByRole('region', { name: passage.title })).toBeNull();
    expect(screen.queryByText(text.language.note)).toBeNull();
    expect(screen.getByLabelText(text.case.prompt)).not.toHaveAttribute('lang');
    // Con la nube, la rama Inglés médico se ofrece
    expect(screen.getByRole('option', { name: 'Inglés médico' })).toBeInTheDocument();

    await typing.type(screen.getByLabelText(text.meta.explanation), ' Más.');
    await typing.click(screen.getByRole('button', { name: t.settings.saveChanges }));
    await waitFor(() => {
      expect(fake.saved).toHaveLength(1);
    }, WAIT);
    expect(fake.saved[0]).not.toHaveProperty('language');
    expect(fake.saved[0]).not.toHaveProperty('passage');
    expect(fake.saved[0]?.gpcRefs).toEqual([]);
  });

  it('elegir Inglés médico en una pregunta en español abre la fuente y el idioma', async () => {
    const typing = userEvent.setup({ delay: null });
    const fake = await open(question(version({ branch: 'internal_medicine' })));
    const branch = await screen.findByLabelText(text.meta.branch, undefined, WAIT);
    await typing.selectOptions(branch, 'medical_english');
    expect(await screen.findByRole('region', { name: passage.title })).toBeVisible();
    expect(screen.getByText(text.language.note)).toBeVisible();
    expect(screen.getByLabelText(text.case.vignetteEnglish)).toHaveAttribute('lang', 'en');
    // Volver a una rama en español la quita
    await typing.selectOptions(branch, 'internal_medicine');
    await waitFor(() => {
      expect(screen.queryByRole('region', { name: passage.title })).toBeNull();
    });
    expect(fake.saved).toHaveLength(0);
  });

  it('en la demo la rama Inglés médico no se ofrece, porque no trae textos en inglés', async () => {
    await open(question(version({ branch: 'internal_medicine' })), { kind: 'local' });
    await screen.findByLabelText(text.meta.branch, undefined, WAIT);
    expect(screen.queryByRole('option', { name: 'Inglés médico' })).toBeNull();
    expect(screen.getByRole('option', { name: 'Medicina interna' })).toBeInTheDocument();
  });

  it('el admin lee la pregunta con el diseño de lectura, la fuente bajo el texto y sin repetirla entre las referencias', async () => {
    const shown = version({
      gpcRefs: [
        { title: SOURCE, status: 'to_verify' },
        { title: '[Prueba] Guía simulada', status: 'to_verify' },
      ],
    });
    await open(question(shown, 'admin'), { role: 'admin' });
    const reading = await screen.findByRole('region', { name: text.sections.case }, WAIT);
    expect(within(reading).getByText(shown.vignette)).toHaveAttribute('lang', 'en');
    expect(within(reading).getByText(shown.prompt)).toHaveAttribute('lang', 'en');
    const link = within(reading).getByRole('link', { name: /https:\/\/example\.org\/articulo/ });
    expect(link).toHaveAttribute('href', 'https://example.org/articulo');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
    expect(within(reading).getByText(/Fuente del texto\./)).toBeVisible();
    // La referencia de la fuente no se repite en la lista, la guía sí
    expect(within(reading).getAllByText(/Fuente del texto\./)).toHaveLength(1);
    expect(within(reading).getByText('[Prueba] Guía simulada')).toBeVisible();
  });

  it('el revisor etiqueta a ciegas con el texto y la pregunta en inglés y la fuente a la vista', async () => {
    const base = version({ status: 'in_review' });
    const hidden = {
      ...base,
      options: base.options.map((option) =>
        option.isCorrect ? option : { ...option, biasTag: null, rationale: null, hidden: true },
      ),
    };
    await open(question(hidden, 'reviewer', 'blind_pending'), { role: 'physician' });
    const blind = await screen.findByRole('region', { name: review.blind.title }, WAIT);
    expect(within(blind).getByText(base.vignette)).toHaveAttribute('lang', 'en');
    expect(within(blind).getByText(base.prompt)).toHaveAttribute('lang', 'en');
    expect(within(blind).getByText(/A\. \[Prueba\] Option A/)).toHaveAttribute('lang', 'en');
    expect(within(blind).getByText(/Fuente del texto\./)).toBeVisible();
    expect(within(blind).getByRole('link', { name: /example\.org\/articulo/ })).toBeVisible();
    // A ciegas no se ve nada de lo del autor
    expect(screen.queryByText('[Prueba] Justificación B')).toBeNull();
    expect(within(blind).getAllByRole('combobox')).toHaveLength(3);
  });

  it('un texto en inglés sin fuente lo dice en la lectura en vez de esconderlo', async () => {
    await open(question(version({ gpcRefs: [] }), 'admin'), { role: 'admin' });
    const reading = await screen.findByRole('region', { name: text.sections.case }, WAIT);
    expect(within(reading).getByText(physicianText.sourceLine.missing)).toBeVisible();
  });
});
