import { describe, expect, it } from 'vitest';
import { makeQuestionWithOptions, newId } from '@/data/testing/fixtures';
import { QuestionSchema, OptionSchema } from '@/data/schemas/bank';
import { biasTaxonomy, topicTaxonomy } from '@/demo/content';
import {
  buildNextVersion,
  canMoveTo,
  changedParts,
  draftFromVersion,
  isBlindLocked,
  taxonomyViewFrom,
  validateDraft,
  type DraftOption,
  type QuestionDraft,
} from './editorDraft';

const taxonomy = taxonomyViewFrom({
  branches: topicTaxonomy.branches,
  taggable: biasTaxonomy.biases.filter((bias) => bias.taggable).map((bias) => bias.key),
});

function sample() {
  const { question, options } = makeQuestionWithOptions();
  const draft = draftFromVersion(question, options);
  return { question, options, draft };
}

const codes = (draft: QuestionDraft) => validateDraft(draft, taxonomy).map((issue) => issue.code);

describe('borrador del editor', () => {
  it('una versión del banco tal cual no tiene problemas', () => {
    expect(codes(sample().draft)).toEqual([]);
  });

  it('respeta el orden del set canónico y pone al final lo que no es canónico', () => {
    const { question, options } = makeQuestionWithOptions();
    const reordered = {
      ...question,
      canonicalOptionIds: [options[2]?.id ?? '', options[0]?.id ?? ''],
    };
    const draft = draftFromVersion(reordered, options);
    expect(draft.options.map((option) => option.text)).toEqual([
      'Opción 3',
      'Opción 1',
      'Opción 2',
      'Opción 4',
    ]);
    expect(draft.options.map((option) => option.canonical)).toEqual([true, true, false, false]);
  });

  it('pide pregunta, una sola correcta y entre 4 y 10 opciones', () => {
    const { draft } = sample();
    expect(codes({ ...draft, prompt: '  ' })).toContain('prompt_empty');
    const two = draft.options.map((option, index) => ({
      ...option,
      isCorrect: index < 2,
      biasTag: index < 2 ? null : 'anchoring',
    }));
    expect(codes({ ...draft, options: two })).toContain('correct_count');
    expect(codes({ ...draft, options: draft.options.slice(0, 3) })).toContain('options_count');
    const many = Array.from({ length: 11 }, (_, index) => ({
      ...(draft.options[1] as DraftOption),
      optionId: newId(),
      text: `Distractor ${index}`,
    }));
    expect(codes({ ...draft, options: [...draft.options.slice(0, 1), ...many] })).toContain(
      'options_count',
    );
  });

  it('cada distractor lleva etiqueta de la lista y la correcta no', () => {
    const { draft } = sample();
    const withoutTag = draft.options.map((option, index) =>
      index === 1 ? { ...option, biasTag: null } : option,
    );
    expect(validateDraft({ ...draft, options: withoutTag }, taxonomy)).toContainEqual({
      code: 'option_tag_missing',
      option: 1,
    });
    const unknown = draft.options.map((option, index) =>
      index === 2 ? { ...option, biasTag: 'inventado' } : option,
    );
    expect(validateDraft({ ...draft, options: unknown }, taxonomy)).toContainEqual({
      code: 'option_tag_unknown',
      option: 2,
    });
    // La etiqueta que no se puede poner a un distractor tampoco vale
    const notTaggable = biasTaxonomy.biases.find((bias) => !bias.taggable)?.key ?? '';
    const blocked = draft.options.map((option, index) =>
      index === 3 ? { ...option, biasTag: notTaggable } : option,
    );
    expect(codes({ ...draft, options: blocked })).toContain('option_tag_unknown');
  });

  it('la etiqueta primaria no se repite como secundaria', () => {
    const { draft } = sample();
    const repeated = draft.options.map((option, index) =>
      index === 1 ? { ...option, secondaryBiasTags: ['anchoring'] } : option,
    );
    expect(codes({ ...draft, options: repeated })).toContain('option_secondary_repeats');
  });

  it('rechaza opciones repetidas aunque cambien acentos o mayúsculas', () => {
    const { draft } = sample();
    const repeated = draft.options.map((option, index) =>
      index === 1 ? { ...option, text: 'OPCIÓN 3' } : option,
    );
    expect(validateDraft({ ...draft, options: repeated }, taxonomy)).toContainEqual({
      code: 'option_text_repeated',
      option: 2,
    });
  });

  it('el set canónico lleva la correcta, al menos un distractor y dos o más opciones', () => {
    const { draft } = sample();
    const only = (keep: (index: number) => boolean) =>
      draft.options.map((option, index) => ({ ...option, canonical: keep(index) }));
    expect(codes({ ...draft, options: only((index) => index !== 0) })).toContain(
      'canonical_without_correct',
    );
    expect(codes({ ...draft, options: only((index) => index === 0) })).toEqual(
      expect.arrayContaining(['canonical_count', 'canonical_without_distractor']),
    );
  });

  it('la subespecialidad y el subtema tienen que ser de la rama y del tema', () => {
    const { draft } = sample();
    expect(codes({ ...draft, topic: 'pediatric_surgery_x' })).toContain('topic_mismatch');
    expect(codes({ ...draft, subtopic: 'no_existe' })).toContain('subtopic_mismatch');
    expect(codes({ ...draft, physicianDifficulty: 6 })).toContain('difficulty_range');
  });
});

describe('versión siguiente', () => {
  it('es una versión nueva en borrador que pasa el esquema y conserva los IDs estables', () => {
    const { question, options, draft } = sample();
    const approved = { ...question, editorialStatus: 'approved' as const };
    const edited: QuestionDraft = {
      ...draft,
      explanation: 'Explicación corregida',
      physicianDifficulty: 4,
    };
    const next = buildNextVersion({
      current: approved,
      draft: edited,
      newId,
      now: new Date('2026-10-09T12:00:00.000Z'),
    });
    expect(() => QuestionSchema.parse(next.question)).not.toThrow();
    for (const option of next.options) expect(() => OptionSchema.parse(option)).not.toThrow();
    expect(next.question).toMatchObject({
      questionId: question.questionId,
      version: 2,
      editorialStatus: 'draft',
      explanation: 'Explicación corregida',
      physicianDifficulty: 4,
      createdAt: '2026-10-09T12:00:00.000Z',
    });
    expect(next.question.id).not.toBe(question.id);
    // Las opciones conservan su ID estable y estrenan ID de versión
    expect(next.options.map((option) => option.optionId)).toEqual(
      draft.options.map((option) => option.optionId),
    );
    for (const option of next.options) {
      expect(options.some((old) => old.id === option.id)).toBe(false);
      expect(option.questionVersionId).toBe(next.question.id);
    }
    expect(
      next.question.canonicalOptionIds.every((id) => next.options.some((o) => o.id === id)),
    ).toBe(true);
  });

  it('la estructura del médico gana, y si no la tocó sigue siendo automática', () => {
    const { question, draft } = sample();
    const untouched = buildNextVersion({ current: question, draft, newId, now: new Date() });
    expect(untouched.question.structure.source).toBe('auto');
    const changed = buildNextVersion({
      current: question,
      draft: { ...draft, structure: { ...draft.structure, polarity: 'negative' } },
      newId,
      now: new Date(),
    });
    expect(changed.question.structure).toMatchObject({ polarity: 'negative', source: 'physician' });
    // Una vez que es del médico ya no vuelve a ser automática
    const again = buildNextVersion({
      current: changed.question,
      draft: draftFromVersion(changed.question, changed.options),
      newId,
      now: new Date(),
    });
    expect(again.question.structure.source).toBe('physician');
  });

  it('la viñeta de un caso seriado se queda en el caso', () => {
    const { question, draft } = sample();
    const serial = { ...question, caseId: newId(), caseOrder: 1, vignette: '' };
    const next = buildNextVersion({
      current: serial,
      draft: { ...draft, vignette: 'Texto que no debería guardarse' },
      newId,
      now: new Date(),
    });
    expect(next.question.vignette).toBe('');
    expect(next.question.caseId).toBe(serial.caseId);
  });

  it('una opción nueva entra con su propio ID y quitar una la saca de la versión', () => {
    const { question, draft } = sample();
    const extra = {
      optionId: newId(),
      text: 'Opción extra',
      isCorrect: false,
      biasTag: 'anchoring',
      secondaryBiasTags: [],
      rationale: 'Atrae por anclaje',
      canonical: false,
    };
    const added = buildNextVersion({
      current: question,
      draft: { ...draft, options: [...draft.options, extra] },
      newId,
      now: new Date(),
    });
    expect(added.options).toHaveLength(5);
    // Fuera del set canónico, así que el alumno no la ve por defecto
    expect(added.question.canonicalOptionIds).toHaveLength(4);
    const removed = buildNextVersion({
      current: question,
      draft: { ...draft, options: draft.options.slice(0, 4) },
      newId,
      now: new Date(),
    });
    expect(removed.options).toHaveLength(4);
  });
});

describe('historial', () => {
  it('lista solo lo que cambió, sin contar los IDs nuevos de cada versión', () => {
    const { question, options, draft } = sample();
    const next = buildNextVersion({
      current: question,
      draft: { ...draft, prompt: '¿Cuál es el tratamiento?', physicianDifficulty: 5 },
      newId,
      now: new Date(),
    });
    const after = draftFromVersion(next.question, next.options);
    expect(changedParts(draft, after)).toEqual(['prompt', 'difficulty']);
    expect(changedParts(draft, draftFromVersion(question, options))).toEqual([]);
  });

  it('distingue cambios en el texto de las opciones, en las etiquetas y en el set canónico', () => {
    const { draft } = sample();
    const edit = (
      change: (option: QuestionDraft['options'][number]) => QuestionDraft['options'][number],
      at = 1,
    ) => ({
      ...draft,
      options: draft.options.map((option, index) => (index === at ? change(option) : option)),
    });
    expect(
      changedParts(
        draft,
        edit((option) => ({ ...option, text: 'Otro texto' })),
      ),
    ).toEqual(['options']);
    expect(
      changedParts(
        draft,
        edit((option) => ({ ...option, biasTag: 'framing_effect' })),
      ),
    ).toEqual(['tags']);
    expect(
      changedParts(
        draft,
        edit((option) => ({ ...option, canonical: false })),
      ),
    ).toEqual(['canonical']);
  });
});

describe('estados', () => {
  it('sigue el flujo borrador, revisión y decisión', () => {
    expect(canMoveTo('draft', 'in_review')).toBe(true);
    expect(canMoveTo('draft', 'approved')).toBe(false);
    expect(canMoveTo('in_review', 'approved')).toBe(true);
    expect(canMoveTo('in_review', 'rejected')).toBe(true);
    expect(canMoveTo('rejected', 'draft')).toBe(true);
    expect(canMoveTo('rejected', 'approved')).toBe(false);
    expect(canMoveTo('approved', 'in_review')).toBe(true);
  });
});

describe('ceguera del doble etiquetado', () => {
  const base = {
    role: 'physician' as const,
    inSample: true,
    distractorOptionIds: ['a', 'b'],
  };
  it('bloquea al médico mientras le falte un distractor de la muestra', () => {
    expect(isBlindLocked({ ...base, labeledByMe: new Set(['a']) })).toBe(true);
    expect(isBlindLocked({ ...base, labeledByMe: new Set(['a', 'b']) })).toBe(false);
  });
  it('no bloquea fuera de la muestra ni al admin', () => {
    expect(isBlindLocked({ ...base, inSample: false, labeledByMe: new Set() })).toBe(false);
    expect(isBlindLocked({ ...base, role: 'admin', labeledByMe: new Set() })).toBe(false);
  });
});
