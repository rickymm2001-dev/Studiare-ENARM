import { describe, expect, it } from 'vitest';
import { OptionSchema, QuestionSchema } from '@/data/schemas/bank';
import { makeQuestionWithOptions } from '@/data/testing/fixtures';
import { ENGINE_CONTRACTS } from '@/engines/aiContracts';
import { guardRestructure } from '@/engines/aiGuards';
import { mockRestructure } from '@/engines/aiMock';
import { biasTaxonomy, topicTaxonomy } from '@/demo/content';
import { draftFromVersion, taxonomyViewFrom, validateDraft } from './editorDraft';
import {
  buildRestructureInput,
  buildVariant,
  contentFor,
  draftFromProposal,
  RestructureContentSchema,
  splitProposedStem,
  stemOf,
} from './restructure';

const taxonomy = taxonomyViewFrom({
  branches: topicTaxonomy.branches,
  taggable: biasTaxonomy.biases.filter((bias) => bias.taggable).map((bias) => bias.key),
});

function setup() {
  const { question, options } = makeQuestionWithOptions();
  const q = {
    ...question,
    vignette: 'Mujer de 54 años con disnea de esfuerzo y edema de miembros inferiores.',
    explanation:
      'La insuficiencia cardiaca explica la disnea de esfuerzo y el edema. Las demás opciones no explican ambos datos.',
  };
  return { question: q, options };
}

describe('entrada del motor', () => {
  it('manda la viñeta y la frase juntas, las opciones del set canónico con letra y la clave', () => {
    const { question, options } = setup();
    const result = buildRestructureInput(question, options, 'to_except');
    if (!result.ok) throw new Error('Debía armarse');
    expect(result.input.stem).toBe(stemOf(question));
    expect(result.input.options.map((option) => option.label)).toEqual(['A', 'B', 'C', 'D']);
    expect(result.input.options.filter((option) => option.isKey)).toHaveLength(1);
    expect(() => ENGINE_CONTRACTS.restructure.input.parse(result.input)).not.toThrow();
  });

  it('no reestructura casos seriados, variantes ni preguntas con una sola opción canónica', () => {
    const { question, options } = setup();
    expect(
      buildRestructureInput({ ...question, caseId: 'x', caseOrder: 1 }, options, 'to_except'),
    ).toEqual({
      ok: false,
      reason: 'serial_case',
    });
    expect(buildRestructureInput({ ...question, variantOf: 'y' }, options, 'to_except')).toEqual({
      ok: false,
      reason: 'variant',
    });
    expect(
      buildRestructureInput(
        { ...question, canonicalOptionIds: [options[0]?.id ?? ''] },
        options,
        'to_except',
      ),
    ).toEqual({ ok: false, reason: 'few_options' });
  });
});

describe('enunciado propuesto', () => {
  it('conserva la viñeta cuando el motor solo agrega a la frase', () => {
    expect(splitProposedStem('Caso largo. ¿Cuál es? Elige la que no.', 'Caso largo.')).toEqual({
      vignette: 'Caso largo.',
      prompt: '¿Cuál es? Elige la que no.',
    });
  });
  it('sin viñeta todo es la frase, y si el motor tocó la viñeta corta en la última pregunta', () => {
    expect(splitProposedStem('¿Cuál es?', '')).toEqual({ vignette: '', prompt: '¿Cuál es?' });
    expect(splitProposedStem('Caso cambiado. ¿Cuál sigue?', 'Caso original.')).toEqual({
      vignette: 'Caso cambiado.',
      prompt: '¿Cuál sigue?',
    });
  });
});

describe('borrador a partir de la propuesta', () => {
  it('a excepto cambia la clave. La anterior sale sin etiqueta ni razón para que el médico las ponga', () => {
    const { question, options } = setup();
    const result = buildRestructureInput(question, options, 'to_except');
    if (!result.ok) throw new Error('Debía armarse');
    const proposal = mockRestructure(result.input);
    expect(() => ENGINE_CONTRACTS.restructure.output.parse(proposal)).not.toThrow();
    expect(guardRestructure(proposal, result.input).passed).toBe(true);

    const original = draftFromVersion(question, options);
    const draft = draftFromProposal({ original, proposal });
    expect(draft.prompt).toContain('Elige la opción que no corresponde');
    expect(draft.vignette).toBe(question.vignette);
    // Opciones nuevas, todas del set canónico y con IDs distintos a los originales
    expect(draft.options.every((option) => option.canonical)).toBe(true);
    const oldIds = new Set(original.options.map((option) => option.optionId));
    expect(draft.options.some((option) => oldIds.has(option.optionId))).toBe(false);

    const oldKey = original.options.find((option) => option.isCorrect);
    const nowDistractor = draft.options.find((option) => option.text === oldKey?.text);
    expect(nowDistractor).toMatchObject({ isCorrect: false, biasTag: null, rationale: '' });
    const newKey = draft.options.find((option) => option.isCorrect);
    expect(newKey).toMatchObject({ biasTag: null, rationale: '' });
    // Los distractores que siguen igual conservan su etiqueta
    const kept = draft.options.filter((option) => !option.isCorrect && option.biasTag);
    expect(kept.length).toBe(2);

    // Mientras falten etiquetas y razones no se puede aprobar
    const codes = validateDraft(draft, taxonomy).map((issue) => issue.code);
    expect(codes).toEqual(expect.arrayContaining(['option_tag_missing', 'option_rationale_empty']));
  });

  it('con el médico completando lo que falta, la variante pasa los esquemas y apunta a la original', () => {
    const { question, options } = setup();
    const result = buildRestructureInput(question, options, 'to_except');
    if (!result.ok) throw new Error('Debía armarse');
    const proposal = mockRestructure(result.input);
    const draft = draftFromProposal({ original: draftFromVersion(question, options), proposal });
    const completed = {
      ...draft,
      options: draft.options.map((option) => ({
        ...option,
        biasTag: option.isCorrect ? null : (option.biasTag ?? 'anchoring'),
        rationale: option.rationale || 'Justificación del médico',
      })),
    };
    expect(validateDraft(completed, taxonomy)).toEqual([]);

    const variant = buildVariant({
      original: question,
      draft: completed,
      now: new Date('2026-10-09T12:00:00.000Z'),
    });
    expect(() => QuestionSchema.parse(variant.question)).not.toThrow();
    for (const option of variant.options) expect(() => OptionSchema.parse(option)).not.toThrow();
    expect(variant.question).toMatchObject({
      version: 1,
      variantOf: question.questionId,
      editorialStatus: 'approved',
      caseId: null,
      isDemo: question.isDemo,
    });
    expect(variant.question.questionId).not.toBe(question.questionId);
    expect(variant.question.id).not.toBe(question.id);
    expect(variant.question.structure.source).toBe('auto');
  });
});

describe('contenido del artefacto', () => {
  it('guarda el original junto a la propuesta y se vuelve a leer con el esquema', () => {
    const { question, options } = setup();
    const result = buildRestructureInput(question, options, 'next_step');
    if (!result.ok) throw new Error('Debía armarse');
    const content = contentFor(question, result.input, mockRestructure(result.input));
    expect(RestructureContentSchema.parse(content)).toMatchObject({
      questionId: question.questionId,
      transform: 'next_step',
    });
    expect(RestructureContentSchema.safeParse({ ...content, transform: 'otra' }).success).toBe(
      false,
    );
  });
});
