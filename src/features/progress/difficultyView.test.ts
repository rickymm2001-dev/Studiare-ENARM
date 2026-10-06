import { describe, expect, it } from 'vitest';
import { difficultyRows } from './difficultyView';

const answers = (level: number, correct: number, wrong: number) => [
  ...Array.from({ length: correct }, () => ({ level, correct: true })),
  ...Array.from({ length: wrong }, () => ({ level, correct: false })),
];

describe('dificultad en Progreso (7.7)', () => {
  it('agrupa la dificultad del médico como el filtro de Simular, fácil 1 a 2, media 3 y difícil 4 a 5', () => {
    const rows = difficultyRows({
      responses: [
        ...answers(1, 1, 0),
        ...answers(2, 1, 0),
        ...answers(3, 1, 0),
        ...answers(4, 1, 0),
        ...answers(5, 1, 0),
      ],
      minResponses: 20,
    });
    expect(rows.map((row) => [row.group, row.total])).toEqual([
      ['easy', 2],
      ['medium', 1],
      ['hard', 2],
    ]);
  });

  it('muestra la exactitud solo con las respuestas mínimas y antes dice cuántas faltan', () => {
    const [easy, medium, hard] = difficultyRows({
      responses: [...answers(1, 16, 4), ...answers(3, 5, 5)],
      minResponses: 20,
    });
    expect(easy).toMatchObject({ total: 20, correct: 16, accuracy: 0.8, responsesNeeded: 0 });
    expect(medium).toMatchObject({ total: 10, accuracy: null, responsesNeeded: 10 });
    // Una banda sin respuestas pide todas
    expect(hard).toMatchObject({ total: 0, accuracy: null, responsesNeeded: 20 });
  });

  it('ignora niveles fuera de 1 a 5 y no divide entre cero con mínimo 0', () => {
    const rows = difficultyRows({
      responses: [
        { level: 0, correct: true },
        { level: 6, correct: true },
        { level: 2.5, correct: true },
      ],
      minResponses: 0,
    });
    expect(rows).toHaveLength(3);
    expect(rows.every((row) => row.total === 0)).toBe(true);
    expect(rows.every((row) => row.accuracy === null && row.responsesNeeded === 1)).toBe(true);
  });
});
