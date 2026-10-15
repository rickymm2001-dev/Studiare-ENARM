import { describe, expect, it } from 'vitest';
import { FIELD_MAX } from '@/data/usecases/manualDecks';
import { makeEnglishCase, TEST_ENGLISH_SOURCE } from '@/data/testing/english';
import { makeQuestionWithOptions } from '@/data/testing/fixtures';
import { t } from '@/i18n/es-MX';
import { CASE_SHORT_MAX, questionCardDraft, shortenCase } from './questionCardDraft';

const LONG_CASE =
  'Mujer de 54 años con disnea de esfuerzo de 3 meses de evolución. Refiere ortopnea de dos almohadas y edema de miembros inferiores. Tiene hipertensión arterial de 10 años con mal apego al tratamiento. A la exploración hay ingurgitación yugular, estertores crepitantes basales y un tercer ruido. La radiografía muestra cardiomegalia y redistribución de flujo.';

function bundle(overrides: { vignette?: string; explanation?: string; refs?: string[] } = {}) {
  const { question, options } = makeQuestionWithOptions();
  return {
    question: {
      ...question,
      explanation: overrides.explanation ?? question.explanation,
      gpcRefs: (overrides.refs ?? ['GPC de prueba']).map((title) => ({
        title,
        status: 'to_verify' as const,
      })),
    },
    options,
    vignette: overrides.vignette ?? LONG_CASE,
  };
}

describe('el caso en corto', () => {
  it('toma las primeras oraciones completas que caben y avisa que hay más', () => {
    const short = shortenCase(LONG_CASE);
    expect(short.length).toBeLessThanOrEqual(CASE_SHORT_MAX);
    expect(
      short.startsWith('Mujer de 54 años con disnea de esfuerzo de 3 meses de evolución.'),
    ).toBe(true);
    expect(short.endsWith(' …')).toBe(true);
    // No corta una oración a la mitad
    expect(short.slice(0, -2).trimEnd().endsWith('.')).toBe(true);
  });

  it('un caso que cabe queda igual y una sola oración larga se corta en una palabra', () => {
    expect(shortenCase('Hombre de 30 años con fiebre.')).toBe('Hombre de 30 años con fiebre.');
    const run = Array.from({ length: 80 }, (_, index) => `palabra${index}`).join(' ');
    const cut = shortenCase(run, 100);
    expect(cut.length).toBeLessThanOrEqual(100);
    expect(cut.endsWith('…')).toBe(true);
    expect(run.startsWith(cut.slice(0, -1))).toBe(true);
  });
});

describe('la tarjeta de una pregunta con el texto del banco, sin IA', () => {
  it('al frente el caso en corto y la pregunta, atrás la respuesta, la explicación y la referencia', () => {
    const source = bundle({ explanation: 'La disnea con ortopnea orienta a falla cardiaca.' });
    const draft = questionCardDraft(source);
    const correct = source.options.find((option) => option.isCorrect);
    expect(draft).toEqual({
      kind: 'basic',
      front: `${shortenCase(LONG_CASE)}\n\n${source.question.prompt}`,
      back: [
        `${t.examReview.createCard.correctAnswer}. ${correct?.text ?? ''}`,
        'La disnea con ortopnea orienta a falla cardiaca.',
        `${t.examReview.createCard.references}. GPC de prueba`,
      ].join('\n\n'),
    });
  });

  it('sin viñeta el frente es la pregunta, sin explicación usa el porqué de la clave y sin referencia no la pone', () => {
    const source = bundle({ vignette: '', explanation: '', refs: [] });
    const draft = questionCardDraft(source);
    const correct = source.options.find((option) => option.isCorrect);
    expect(draft?.front).toBe(source.question.prompt);
    expect(draft?.back).toBe(
      `${t.examReview.createCard.correctAnswer}. ${correct?.text ?? ''}\n\n${correct?.rationale ?? ''}`,
    );
  });

  it('una explicación larga se recorta para que el reverso quepa en la tarjeta', () => {
    const long = Array.from({ length: 400 }, () => 'La explicación sigue con detalle.').join(' ');
    const draft = questionCardDraft(bundle({ explanation: long, refs: ['GPC uno', 'GPC dos'] }));
    expect(draft?.back.length).toBeLessThanOrEqual(FIELD_MAX);
    // La respuesta y la referencia se conservan completas
    expect(draft?.back.startsWith(t.examReview.createCard.correctAnswer)).toBe(true);
    expect(draft?.back.endsWith(`${t.examReview.createCard.references}. GPC uno; GPC dos`)).toBe(
      true,
    );
  });

  it('con un texto de lectura en inglés pone al frente el fragmento que cabe con la pregunta y atrás la fuente (B13, 2.5)', () => {
    const passage = Array.from(
      { length: 60 },
      (_, index) => `[Prueba] Sentence ${index + 1} of the invented passage.`,
    ).join(' ');
    const { bundles } = makeEnglishCase(2, { explanation: '[Prueba] Explicación simulada.' });
    const first = bundles[0];
    if (!first) throw new Error('Sin pregunta de prueba');
    const draft = questionCardDraft({ ...first, vignette: passage });
    const correct = first.options.find((option) => option.isCorrect);
    // Del texto largo solo cabe el principio, con sus oraciones completas, y la pregunta sigue a continuación
    const [text = '', prompt = ''] = (draft?.front ?? '').split('\n\n');
    expect(text.length).toBeLessThanOrEqual(CASE_SHORT_MAX);
    expect(text.startsWith('[Prueba] Sentence 1 of the invented passage.')).toBe(true);
    expect(text.endsWith(' …')).toBe(true);
    expect(prompt).toBe(first.question.prompt);
    expect(draft?.front.length).toBeLessThanOrEqual(FIELD_MAX);
    // Atrás van la respuesta, la explicación en español y la fuente del texto, con su licencia
    expect(draft?.back).toBe(
      [
        `${t.examReview.createCard.correctAnswer}. ${correct?.text ?? ''}`,
        '[Prueba] Explicación simulada.',
        `${t.examReview.createCard.references}. ${TEST_ENGLISH_SOURCE}`,
      ].join('\n\n'),
    );
  });

  it('sin clave no arma nada', () => {
    const source = bundle();
    expect(
      questionCardDraft({
        ...source,
        options: source.options.map((option) => ({ ...option, isCorrect: false })),
      }),
    ).toBeNull();
  });
});
