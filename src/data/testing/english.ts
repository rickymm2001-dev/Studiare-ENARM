// Casos de lectura en inglés armados a mano para las pruebas de la app (B13). Solo los usan las pruebas.
// Todo el texto lleva [Prueba] y es simulado, nunca contenido médico.
import { formatPassageSource } from '../content/passageSource';
import type { ClinicalCase, Option, Question } from '../schemas/bank';
import { makeQuestionWithOptions, newId } from './fixtures';

/** La fuente de los textos de prueba, con la forma fija de passageSource.ts */
export const TEST_ENGLISH_SOURCE = formatPassageSource({
  title: '[Prueba] Texto simulado',
  license: 'team',
  url: null,
});

export interface EnglishCaseFixture {
  clinicalCase: ClinicalCase;
  /** Las preguntas del caso, en su orden, cada una con sus opciones */
  bundles: { question: Question; options: Option[] }[];
}

/**
 * Un caso de lectura con tantas preguntas como se pidan. El texto es la viñeta del caso, la pregunta y las
 * opciones van en inglés y la fuente es la primera referencia. Con items en 1 es una pregunta suelta,
 * sin caso, y su viñeta propia es el texto
 */
export function makeEnglishCase(
  items = 2,
  overrides: Partial<Question> = {},
  index = 1,
): EnglishCaseFixture {
  const caseId = newId();
  const text = `[Prueba] Simulated reading passage ${index}. This text is invented for tests.`;
  const clinicalCase: ClinicalCase = {
    id: caseId,
    vignette: text,
    isDemo: false,
    createdAt: '2026-10-01T15:00:00.000Z',
  };
  const bundles = Array.from({ length: items }, (_, position) => {
    const { question, options } = makeQuestionWithOptions();
    const standalone = items === 1;
    return {
      question: {
        ...question,
        caseId: standalone ? null : caseId,
        caseOrder: standalone ? null : position + 1,
        vignette: standalone ? text : '',
        prompt: `[Prueba] Which statement is correct? (item ${position + 1})`,
        branch: 'medical_english',
        topic: 'reading_comprehension',
        subtopic: 'english_pediatrics',
        structure: {
          polarity: 'affirmative' as const,
          task: 'data_interpretation' as const,
          format: standalone ? ('clinical_case' as const) : ('serial_case' as const),
          source: 'auto' as const,
        },
        explanation: `[Prueba] Explicación simulada ${position + 1}`,
        gpcRefs: [{ title: TEST_ENGLISH_SOURCE, status: 'to_verify' as const }],
        language: 'en' as const,
        editorialStatus: 'approved' as const,
        isDemo: false,
        ...overrides,
      } satisfies Question,
      options: options.map((option, number) => ({
        ...option,
        text: `[Prueba] English option ${number + 1} of item ${position + 1}`,
      })),
    };
  });
  return { clinicalCase, bundles };
}
