import { describe, expect, it } from 'vitest';
import { biasTipInput, flashcardsInput, hypothesisInput } from '@/ai/testing/aiSamples';
import { mockOutput } from '@/engines/aiMock';
import type { AiGateReview } from '@/engines/aiContracts';
import type { MyItem } from '@/data/cloud/aiGate';
import {
  CSV_HEADER,
  EMPTY_DRAFT,
  answersFrom,
  draftOf,
  missingFields,
  nextPending,
  parseReviewsCsv,
  progressOf,
  reviewOf,
  reviewsToCsv,
  sameReview,
  visibleIndexes,
} from './aiAuditView';

const id = (n: number) => `00000000-0000-4000-8000-00000000000${n}`;
const REVIEW: AiGateReview = {
  accuracy: 'correct',
  grounded: true,
  safetyIssue: false,
  usefulness: 4,
  clarity: 3,
  verdict: 'approved',
  comment: null,
};

const item = (n: number, review: AiGateReview | null = null): MyItem =>
  n % 2 === 0
    ? {
        id: id(n),
        engine: 'bias_tips',
        sourceKind: 'bank',
        input: biasTipInput(),
        output: mockOutput('bias_tips', biasTipInput()),
        review,
      }
    : {
        id: id(n),
        engine: 'forgetting',
        sourceKind: 'demo',
        input: hypothesisInput(),
        output: mockOutput('forgetting', hypothesisInput()),
        review,
      };

describe('la rúbrica a medio llenar', () => {
  it('sin elegir nada falta todo menos el comentario, y no se puede guardar', () => {
    expect(missingFields(EMPTY_DRAFT)).toEqual([
      'accuracy',
      'grounded',
      'safetyIssue',
      'usefulness',
      'clarity',
      'verdict',
    ]);
    expect(reviewOf(EMPTY_DRAFT)).toBeNull();
  });

  it('completa se vuelve la rúbrica del contrato, con el comentario recortado o nulo', () => {
    const draft = draftOf(REVIEW);
    expect(draft).toMatchObject({ accuracy: 'correct', grounded: 'yes', usefulness: '4' });
    expect(reviewOf(draft)).toEqual(REVIEW);
    expect(reviewOf({ ...draft, comment: '  Bien redactado  ' })?.comment).toBe('Bien redactado');
    expect(reviewOf({ ...draft, comment: '   ' })?.comment).toBeNull();
  });

  it('un comentario de más de 500 caracteres no se guarda', () => {
    expect(reviewOf({ ...draftOf(REVIEW), comment: 'a'.repeat(501) })).toBeNull();
    expect(reviewOf({ ...draftOf(REVIEW), comment: 'a'.repeat(500) })).not.toBeNull();
  });

  it('draftOf y reviewOf son inversas, también con "sí hay problema" y con un error grave', () => {
    const severe: AiGateReview = {
      accuracy: 'severe',
      grounded: false,
      safetyIssue: true,
      usefulness: 1,
      clarity: 2,
      verdict: 'rejected',
      comment: 'Inventa una dosis',
    };
    expect(reviewOf(draftOf(severe))).toEqual(severe);
    expect(draftOf(null)).toEqual(EMPTY_DRAFT);
  });

  it('sameReview distingue una rúbrica que cambió de la que no', () => {
    expect(sameReview(REVIEW, { ...REVIEW })).toBe(true);
    expect(sameReview(REVIEW, { ...REVIEW, clarity: 4 })).toBe(false);
    expect(sameReview(null, REVIEW)).toBe(false);
  });
});

describe('avance del médico', () => {
  const items = [item(1, REVIEW), item(2), item(3), item(4, { ...REVIEW, accuracy: 'severe' })];
  const answers = answersFrom(items);

  it('cuenta lo calificado, lo pendiente, los errores graves y el avance por motor', () => {
    expect(progressOf(items, answers)).toEqual({
      total: 4,
      reviewed: 2,
      pending: 2,
      share: 0.5,
      severe: 1,
      byEngine: { forgetting: { total: 2, reviewed: 1 }, bias_tips: { total: 2, reviewed: 1 } },
    });
    expect(progressOf([], new Map()).share).toBe(0);
  });

  it('el filtro de pendientes deja los que no tienen rúbrica', () => {
    expect(visibleIndexes(items, answers, 'all')).toEqual([0, 1, 2, 3]);
    expect(visibleIndexes(items, answers, 'pending')).toEqual([1, 2]);
  });

  it('el siguiente pendiente da la vuelta y es null si no queda ninguno', () => {
    expect(nextPending(items, answers, 0)).toBe(1);
    expect(nextPending(items, answers, 1)).toBe(2);
    expect(nextPending(items, answers, 2)).toBe(1);
    expect(nextPending(items, answers, 3)).toBe(1);
    const done = answersFrom(items.map((entry) => item(Number(entry.id.at(-1)), REVIEW)));
    expect(nextPending(items, done, 0)).toBeNull();
    expect(nextPending([], new Map(), 0)).toBeNull();
  });
});

describe('respaldo en CSV', () => {
  const items = [
    item(1, REVIEW),
    item(2),
    item(3, { ...REVIEW, comment: '=SUMA(1)', usefulness: 2 }),
  ];
  const answers = answersFrom(items);

  it('baja una fila por texto con las columnas de la rúbrica, en español', () => {
    const csv = reviewsToCsv(items, answers);
    const lines = csv.split('\r\n');
    expect(lines[0]).toBe(CSV_HEADER.join(','));
    expect(lines).toHaveLength(4);
    expect(lines[1]).toBe(
      `"${id(1)}","correcto","sí","no","4","3","aprobado",""`.replace(/"(\d)"/g, '"$1"'),
    );
    // El texto que parece una fórmula lleva apóstrofo, que al subirlo se quita
    expect(lines[3]).toContain(`"'=SUMA(1)"`);
    // Lo que falta va con las celdas vacías
    expect(lines[2]).toBe(`"${id(2)}","","","","","","",""`);
  });

  it('lo que se baja se vuelve a leer igual', () => {
    const result = parseReviewsCsv(reviewsToCsv(items, answers), items);
    expect(result).toMatchObject({ ok: true, skipped: 1 });
    expect(result.ok && result.rows.map((row) => [row.id, row.review])).toEqual([
      [id(1), REVIEW],
      [id(3), { ...REVIEW, comment: '=SUMA(1)', usefulness: 2 }],
    ]);
  });

  it('acepta una hoja con punto y coma, sin tildes en "sí" y con las celdas sin comillas', () => {
    const csv = [
      CSV_HEADER.join(';'),
      `${id(2)};menor;si;no;3;4;cambios_menores;Falta un dato`,
    ].join('\n');
    const result = parseReviewsCsv(csv, items);
    expect(result.ok && result.rows[0]?.review).toEqual({
      accuracy: 'minor',
      grounded: true,
      safetyIssue: false,
      usefulness: 3,
      clarity: 4,
      verdict: 'minor_changes',
      comment: 'Falta un dato',
    });
  });

  it('con un problema no se guarda nada y dice en qué fila', () => {
    const csv = [
      CSV_HEADER.join(','),
      `${id(1)},correcto,sí,no,4,3,aprobado,`,
      `${id(2)},rarísimo,sí,no,4,3,aprobado,`,
      `${id(9)},correcto,sí,no,4,3,aprobado,`,
      `${id(1)},correcto,sí,no,4,3,aprobado,`,
      `${id(3)},correcto,sí,no,5,3,aprobado,`,
    ].join('\n');
    expect(parseReviewsCsv(csv, items)).toEqual({
      ok: false,
      problems: [
        { line: 3, problem: 'value' },
        { line: 4, problem: 'unknown_id' },
        { line: 5, problem: 'duplicate' },
        { line: 6, problem: 'value' },
      ],
    });
  });

  it('un comentario de más de 500 caracteres es un problema de esa fila', () => {
    const csv = [
      CSV_HEADER.join(','),
      `${id(1)},correcto,sí,no,4,3,aprobado,${'a'.repeat(501)}`,
    ].join('\n');
    expect(parseReviewsCsv(csv, items)).toEqual({
      ok: false,
      problems: [{ line: 2, problem: 'comment' }],
    });
  });

  it('un archivo sin las columnas, vacío o enorme se rechaza', () => {
    expect(parseReviewsCsv('id,otra\n1,2', items)).toEqual({
      ok: false,
      problems: [{ line: 1, problem: 'header' }],
    });
    expect(parseReviewsCsv('', items)).toEqual({
      ok: false,
      problems: [{ line: 1, problem: 'empty' }],
    });
    expect(parseReviewsCsv(CSV_HEADER.join(','), items)).toEqual({
      ok: false,
      problems: [{ line: 1, problem: 'empty' }],
    });
    expect(parseReviewsCsv('a'.repeat(400_001), items)).toEqual({
      ok: false,
      problems: [{ line: 1, problem: 'too_large' }],
    });
  });

  it('una fila con un valor en blanco entre las elegidas es un problema, no un texto sin calificar', () => {
    const csv = [CSV_HEADER.join(','), `${id(1)},correcto,sí,,4,3,aprobado,`].join('\n');
    expect(parseReviewsCsv(csv, items)).toMatchObject({
      ok: false,
      problems: [{ line: 2, problem: 'value' }],
    });
  });

  it('las tarjetas y los demás motores también se bajan', () => {
    const cards: MyItem[] = [
      {
        id: id(5),
        engine: 'flashcards',
        sourceKind: 'team',
        input: flashcardsInput(),
        output: mockOutput('flashcards', flashcardsInput()),
        review: null,
      },
    ];
    expect(reviewsToCsv(cards, new Map()).split('\r\n')).toHaveLength(2);
  });
});
