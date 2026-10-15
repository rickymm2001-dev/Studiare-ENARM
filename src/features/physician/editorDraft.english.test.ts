// El borrador del editor para Inglés médico (B13, 1.4, 1.6 y 5.4 del plan de B13). El idioma sale de la
// rama, la fuente del texto se separa de las referencias para editarla en tres campos y al guardar vuelve
// a ser la primera referencia con la forma fija de passageSource.ts. Que falte la fuente o que su licencia
// no sea de la lista no impide guardar, deja el pendiente que impide aprobar. La lectura del editor
// coincide con la de la base sobre los mismos casos de tests/fixtures/passage-sources.json (EN9).
import { describe, expect, it } from 'vitest';
import { parsePassageSource } from '@/data/content/passageSource';
import { QuestionSchema } from '@/data/schemas/bank';
import { makeQuestionWithOptions, newId } from '@/data/testing/fixtures';
import { biasTaxonomy, topicTaxonomy } from '@/demo/content';
import passageCases from '../../../tests/fixtures/passage-sources.json';
import {
  buildNextVersion,
  changedParts,
  draftForSave,
  draftFromVersion,
  EMPTY_PASSAGE,
  passageIssue,
  passageProblems,
  taxonomyViewFrom,
  validateDraft,
  type QuestionDraft,
} from './editorDraft';

const taxonomy = taxonomyViewFrom({
  branches: topicTaxonomy.branches,
  taggable: biasTaxonomy.biases.filter((bias) => bias.taggable).map((bias) => bias.key),
});

const CC_BY = '[Prueba] Artículo simulado. CC BY. https://example.org/articulo';
const SOURCE = `Fuente del texto. ${CC_BY}`;

/** Una pregunta de Inglés médico, con las referencias que se pidan */
function englishSample(refs: string[] = [SOURCE, '[Prueba] Guía de práctica clínica simulada']) {
  const { question, options } = makeQuestionWithOptions();
  const english = {
    ...question,
    branch: 'medical_english',
    topic: 'reading_comprehension',
    subtopic: 'english_internal_medicine',
    gpcRefs: refs.map((title) => ({ title, status: 'to_verify' as const })),
  };
  return { question: english, options, draft: draftFromVersion(english, options) };
}

const codes = (draft: QuestionDraft) => validateDraft(draft, taxonomy).map((issue) => issue.code);

describe('borrador de una pregunta en inglés', () => {
  it('el idioma sale de la rama y la fuente se separa de las demás referencias', () => {
    const { draft } = englishSample();
    expect(draft.language).toBe('en');
    expect(draft.passage).toEqual({
      title: '[Prueba] Artículo simulado',
      license: 'CC BY',
      url: 'https://example.org/articulo',
    });
    expect(draft.gpcRefs).toEqual([
      { title: '[Prueba] Guía de práctica clínica simulada', status: 'to_verify' },
    ]);
  });

  it('el texto propio del equipo se lee sin título ni enlace', () => {
    const { draft } = englishSample(['Fuente del texto. Texto propio del equipo Studiare.']);
    expect(draft.passage).toEqual({
      title: '',
      license: 'Texto propio del equipo Studiare',
      url: '',
    });
    expect(draft.gpcRefs).toEqual([]);
    expect(passageIssue(draft)).toBeNull();
  });

  it('sin fuente en las referencias el pasaje queda vacío y las referencias no cambian', () => {
    const { draft } = englishSample(['[Prueba] Solo una guía']);
    expect(draft.language).toBe('en');
    expect(draft.passage).toEqual({ title: '', license: '', url: '' });
    expect(draft.gpcRefs).toHaveLength(1);
    expect(passageIssue(draft)).toBe('passage_source_missing');
  });

  it('una pregunta en español queda igual que antes, sin idioma ni pasaje, aunque una referencia se parezca', () => {
    const { question, options } = makeQuestionWithOptions();
    const spanish = {
      ...question,
      gpcRefs: [{ title: 'Fuente del texto. Algo raro', status: 'verified' as const }],
    };
    const draft = draftFromVersion(spanish, options);
    expect(draft).not.toHaveProperty('language');
    expect(draft).not.toHaveProperty('passage');
    expect(draft.gpcRefs).toEqual([{ title: 'Fuente del texto. Algo raro', status: 'verified' }]);
    expect(passageIssue(draft)).toBeNull();
    expect(draftForSave(draft)).toEqual(draft);
  });

  it('el idioma de la versión manda sobre la rama cuando la versión lo trae', () => {
    const { question, options } = englishSample();
    const forced = draftFromVersion({ ...question, language: 'es' }, options);
    expect(forced).not.toHaveProperty('language');
    expect(forced.gpcRefs).toHaveLength(2);
  });
});

describe('guardar la fuente del texto', () => {
  it('la fuente vuelve a ser la primera referencia, con el pasaje fuera del borrador', () => {
    const { draft } = englishSample();
    const saved = draftForSave(draft);
    expect(saved).not.toHaveProperty('passage');
    expect(saved.language).toBe('en');
    expect(saved.gpcRefs).toEqual([
      { title: SOURCE, status: 'verified' },
      { title: '[Prueba] Guía de práctica clínica simulada', status: 'to_verify' },
    ]);
    // La lectura de la base de lo que se guarda da una fuente válida
    expect(parsePassageSource(saved.gpcRefs)).toMatchObject({
      ok: true,
      source: { license: 'cc_by', url: 'https://example.org/articulo' },
    });
  });

  it('es idempotente, un borrador que ya se armó no duplica la fuente', () => {
    const once = draftForSave(englishSample().draft);
    expect(draftForSave(once)).toEqual(once);
  });

  it('una fuente a medias se guarda como lo que hay y la base la marca como pendiente', () => {
    const { draft } = englishSample([]);
    const typed = { ...draft, passage: { title: '[Prueba] Solo el título', license: '', url: '' } };
    const saved = draftForSave(typed);
    expect(saved.gpcRefs).toEqual([
      { title: 'Fuente del texto. [Prueba] Solo el título.', status: 'verified' },
    ]);
    expect(passageIssue(typed)).toBe('passage_source_missing');
  });

  it('sin nada escrito no arma ninguna referencia', () => {
    const { draft } = englishSample([]);
    expect(draftForSave(draft).gpcRefs).toEqual([]);
  });

  it('una pregunta que pasa a una rama en español no se lleva la fuente', () => {
    const { draft } = englishSample();
    const moved = { ...draft, branch: 'internal_medicine', language: undefined };
    expect(draftForSave(moved).gpcRefs).toEqual(draft.gpcRefs);
  });

  it('guardar y volver a abrir deja la misma fuente', () => {
    const { question, options, draft } = englishSample();
    const next = buildNextVersion({
      current: question,
      draft,
      newId,
      now: new Date('2026-10-15T12:00:00.000Z'),
    });
    expect(next.question.language).toBe('en');
    expect(next.question.gpcRefs[0]).toEqual({ title: SOURCE, status: 'verified' });
    expect(QuestionSchema.safeParse(next.question).success).toBe(true);
    const reopened = draftFromVersion(next.question, next.options);
    expect(reopened.passage).toEqual(draft.passage);
    expect(reopened.gpcRefs).toEqual(draft.gpcRefs);
    expect(options).toHaveLength(next.options.length);
  });

  it('una pregunta en español no lleva el campo language en la versión nueva', () => {
    const { question, options } = makeQuestionWithOptions();
    const next = buildNextVersion({
      current: question,
      draft: draftFromVersion(question, options),
      newId,
      now: new Date('2026-10-15T12:00:00.000Z'),
    });
    expect(next.question).not.toHaveProperty('language');
  });
});

describe('qué le falta a la fuente', () => {
  const issue = (refs: string[]) => passageIssue(englishSample(refs).draft);

  it('sin fuente, sin licencia o sin enlace es passage_source_missing', () => {
    expect(issue([])).toBe('passage_source_missing');
    expect(issue(['Fuente del texto. [Prueba] Título.'])).toBe('passage_source_missing');
    expect(issue(['Fuente del texto. [Prueba] Título. CC BY.'])).toBe('passage_source_missing');
    expect(issue(['Fuente del texto. [Prueba] Título. CC BY. http://example.org/a'])).toBe(
      'passage_source_missing',
    );
  });

  it('una licencia fuera de la lista es license_not_allowed', () => {
    expect(issue(['Fuente del texto. [Prueba] Título. CC BY-NC. https://example.org/a'])).toBe(
      'license_not_allowed',
    );
    expect(issue(['Fuente del texto. [Prueba] Título. CC BY-ND. https://example.org/a'])).toBe(
      'license_not_allowed',
    );
  });

  it('una fuente completa, de cualquier licencia aceptada, no tiene pendientes', () => {
    for (const license of ['Dominio público', 'CC0', 'CC BY', 'CC BY-SA']) {
      expect(
        issue([`Fuente del texto. [Prueba] Título. ${license}. https://example.org/a`]),
      ).toBeNull();
    }
    expect(issue(['Fuente del texto. Texto propio del equipo Studiare.'])).toBeNull();
  });

  it('cada campo dice lo suyo', () => {
    expect(passageProblems({ title: '', license: '', url: '' })).toEqual({ license: 'missing' });
    expect(passageProblems({ title: 'T', license: 'CC BY-NC', url: 'https://x.org' })).toEqual({
      license: 'not_allowed',
    });
    expect(passageProblems({ title: '', license: 'CC BY', url: '' })).toEqual({
      title: 'missing',
      url: 'missing',
    });
    expect(passageProblems({ title: 'T', license: 'CC BY', url: 'medlineplus.gov/a' })).toEqual({
      url: 'invalid',
    });
    expect(
      passageProblems({ title: 'T', license: 'dominio publico', url: 'https://x.org' }),
    ).toEqual({});
    // El texto propio no pide título ni enlace
    expect(
      passageProblems({ title: '', license: 'Texto propio del equipo Studiare', url: '' }),
    ).toEqual({});
  });

  it('coincide con la lectura de la base en todos los casos de la fuente compartida', () => {
    for (const item of passageCases.cases) {
      const base = englishSample(item.refs);
      // Lo que ve el editor es lo que dirá la base, aunque la fuente pase por los tres campos
      expect(passageIssue(base.draft), item.name).toBe(item.issue);
      const saved = draftForSave(base.draft);
      const read = parsePassageSource(saved.gpcRefs);
      expect(read.ok ? null : read.issue, item.name).toBe(item.issue);
    }
  });
});

describe('reglas del borrador en inglés', () => {
  it('una pregunta en inglés completa no tiene problemas, y sin fuente tampoco impide guardar', () => {
    const { draft } = englishSample();
    expect(codes(draft)).toEqual([]);
    const without = englishSample([]).draft;
    expect(codes(without)).toEqual([]);
    expect(passageIssue(without)).toBe('passage_source_missing');
  });

  it('el idioma tiene que ir con la rama', () => {
    const { draft } = englishSample();
    expect(codes({ ...draft, language: undefined })).toContain('language_branch_mismatch');
    const { question, options } = makeQuestionWithOptions();
    const spanish = draftFromVersion(question, options);
    expect(codes({ ...spanish, language: 'en' })).toContain('language_branch_mismatch');
    expect(codes(spanish)).toEqual([]);
  });

  it('una fuente que no cabe en 300 caracteres impide guardar', () => {
    const { draft } = englishSample();
    const long = {
      ...draft,
      passage: { title: '', license: 'CC BY', url: `https://example.org/${'a'.repeat(300)}` },
    };
    expect(codes(long)).toContain('passage_long');
    // Un título largo se recorta solo
    const longTitle = {
      ...draft,
      passage: {
        ...EMPTY_PASSAGE,
        license: 'CC BY',
        url: 'https://example.org/a',
        title: 'T'.repeat(500),
      },
    };
    expect(codes(longTitle)).not.toContain('passage_long');
  });

  it('el historial dice cuando cambió la fuente del texto', () => {
    const { draft } = englishSample();
    const changed = {
      ...draft,
      passage: { ...(draft.passage ?? EMPTY_PASSAGE), url: 'https://example.org/otro' },
    };
    expect(changedParts(draft, changed)).toEqual(['source']);
    expect(changedParts(draft, draft)).toEqual([]);
    expect(changedParts(draft, { ...changed, vignette: 'Otro texto' })).toEqual([
      'vignette',
      'source',
    ]);
  });
});
