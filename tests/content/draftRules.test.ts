// Reglas del borrador de preguntas demo (D-080). Un reactivo estándar sigue con sus reglas de forma
// y uno de cualquier tipo raro no se rechaza por ser imperfecto. Un caso por cada tipo
import { describe, expect, it } from 'vitest';
import { DemoQuestionSchema } from '@/data/schemas/content';
import { ItemKindSchema } from '@/data/schemas/common';
import {
  checkQuestions,
  OPTION_KEYS,
  type DraftContext,
  type DraftQuestion,
} from '../../scripts/content/draftRules';

const context: DraftContext = {
  taggable: new Set(['anchoring', 'premature_closure']),
  allBiases: new Set(['anchoring', 'premature_closure', 'framing']),
  topics: new Map([['cardiology', { branch: 'internal_medicine', subtopics: new Set(['acs']) }]]),
  // Un motor de estructura que siempre dice afirmativa y tarea diagnóstico
  analyze: () => ({ polarity: 'affirmative', task: 'diagnosis' }),
};

const words = (count: number) => Array.from({ length: count }, () => 'palabra').join(' ');

function question(options: number, overrides: Partial<DraftQuestion> = {}): DraftQuestion {
  const keys = OPTION_KEYS.slice(0, options);
  return {
    key: 'b1-q01',
    caseKey: null,
    branch: 'internal_medicine',
    topic: 'cardiology',
    subtopic: 'acs',
    vignette: 'Hombre de 58 años con dolor torácico opresivo.',
    prompt: '¿Cuál es el diagnóstico más probable?',
    polarity: 'affirmative',
    task: 'diagnosis',
    options: keys.map((key, index) => ({
      key,
      text: `Opción ${key}`,
      correct: index === 0,
      ...(index === 0 ? {} : { bias: index % 2 === 0 ? 'anchoring' : 'premature_closure' }),
      rationale: 'Porque sí',
    })),
    canonical: keys.slice(0, 4),
    explanation: words(100),
    gpcRefs: ['Guía de práctica clínica del síndrome coronario agudo'],
    ...overrides,
  };
}

const check = (questions: DraftQuestion[]) => checkQuestions(questions, context);

describe('un reactivo estándar', () => {
  it('con 10 opciones y explicación de 100 palabras no tiene problemas', () => {
    expect(check([question(10)])).toMatchObject({ problems: [], notes: [] });
  });

  it('sigue exigiendo 10 opciones, explicación de 80 a 150 palabras y la polaridad del motor', () => {
    const report = check([
      question(8),
      question(10, { key: 'b1-q02', explanation: words(22) }),
      question(10, { key: 'b1-q03', polarity: 'negative' }),
    ]);
    expect(report.problems).toEqual(
      expect.arrayContaining([
        'b1-q01 las opciones deben ser a-j en orden',
        'b1-q02 explicación de 22 palabras',
        'b1-q03 polaridad negative, el motor dice affirmative',
      ]),
    );
    expect(report.notes).toEqual([]);
  });

  it('rechaza lo que sí es un error sin importar el tipo, como dos correctas o un sesgo inventado', () => {
    const bad = question(10, { kinds: ['control'] });
    bad.options = bad.options.map((option, index) =>
      index === 1
        ? { ...option, correct: true }
        : index === 2
          ? { ...option, bias: 'inventado' }
          : option,
    );
    const report = check([bad]);
    expect(report.problems).toEqual(
      expect.arrayContaining([
        'b1-q01 tiene 2 opciones correctas',
        'b1-q01c sesgo no válido inventado',
      ]),
    );
  });
});

describe('un reactivo de tipo raro no se rechaza por ser imperfecto', () => {
  const cases: Record<(typeof ItemKindSchema.options)[number], Partial<DraftQuestion>> = {
    // Casos casi idénticos que se separan por el tratamiento, con explicación breve
    inverse_resolution: { explanation: words(40) },
    // Con incoherencias intencionales, y la polaridad la puso el médico
    incoherent: { polarity: 'negative' },
    // De control para medir la atención, con la polaridad que el médico decidió
    control: { polarity: 'negative', task: 'treatment' },
    // Con datos oscuros y una explicación de 22 palabras
    obscure_detail: { explanation: words(22) },
    // Desde la perspectiva del paciente
    patient_perspective: { prompt: '¿Qué le dirías a este paciente que te cuenta lo que siente?' },
  };

  for (const kind of ItemKindSchema.options) {
    it(kind, () => {
      const report = check([question(8, { kinds: [kind], ...cases[kind] })]);
      expect(report.problems).toEqual([]);
    });
  }

  it('lo que se aparta del motor queda como aviso y no como problema', () => {
    const report = check([question(10, { kinds: ['control'], polarity: 'negative' })]);
    expect(report.problems).toEqual([]);
    expect(report.notes).toEqual(['b1-q01 polaridad negative, el motor dice affirmative']);
  });

  it('acepta de 4 a 10 opciones y rechaza menos de 4 o un set canónico que no existe', () => {
    expect(check([question(4, { kinds: ['control'] })]).problems).toEqual([]);
    expect(
      check([question(3, { kinds: ['control'], canonical: ['a', 'b', 'c', 'd'] })]).problems,
    ).not.toEqual([]);
    const missing = check([question(6, { kinds: ['control'], canonical: ['a', 'b', 'c', 'j'] })]);
    expect(missing.problems.join()).toContain('set canónico');
  });

  it('una explicación vacía sí es un problema', () => {
    expect(check([question(8, { kinds: ['control'], explanation: '  ' })]).problems).toContain(
      'b1-q01 sin explicación',
    );
  });
});

describe('el esquema del lote de contenido demo', () => {
  const { options, canonical, ...rest } = {
    ...question(10),
    caseOrder: null,
    difficulty: 3,
  };
  const draft = (count: number, kinds?: string[]) => ({
    ...rest,
    options: options.slice(0, count),
    canonical: canonical.slice(0, 4),
    ...(kinds ? { kinds } : {}),
  });

  it('acepta un reactivo raro con menos de 10 opciones y exige 10 al estándar', () => {
    expect(DemoQuestionSchema.safeParse(draft(10)).success).toBe(true);
    expect(DemoQuestionSchema.safeParse(draft(8)).success).toBe(false);
    expect(DemoQuestionSchema.safeParse(draft(8, ['obscure_detail'])).success).toBe(true);
    expect(DemoQuestionSchema.safeParse(draft(3, ['obscure_detail'])).success).toBe(false);
  });
});
