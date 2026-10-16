import { describe, expect, it } from 'vitest';
import { difficultyGroupOf } from '../shared/difficulty';
import { difficultyRows, groupOfLogit } from './difficultyView';

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

describe('dificultad medida con alumnos (B14, 4.4)', () => {
  const measured = (logit: number, state: 'provisional' | 'calibrated') => ({ logit, state });

  it('los cortes en logits dan los mismos grupos que el nivel del médico', () => {
    // El nivel del médico en logits es 1 → −2, 2 → −1, 3 → 0, 4 → 1 y 5 → 2
    expect([-2, -1, 0, 1, 2].map(groupOfLogit)).toEqual(['easy', 'easy', 'medium', 'hard', 'hard']);
    expect([1, 2, 3, 4, 5].map((level) => groupOfLogit(level - 3))).toEqual(
      [1, 2, 3, 4, 5].map(difficultyGroupOf),
    );
    // Los bordes de la media
    expect(groupOfLogit(-0.5)).toBe('medium');
    expect(groupOfLogit(0.5)).toBe('medium');
    expect(groupOfLogit(-0.51)).toBe('easy');
    expect(groupOfLogit(0.51)).toBe('hard');
  });

  it('una respuesta con dificultad medida va al grupo de su dificultad medida y no al del médico', () => {
    const rows = difficultyRows({
      responses: [
        // El médico dijo difícil (5) pero con alumnos salió fácil
        { level: 5, correct: true, measured: measured(-1.4, 'calibrated') },
        // El médico dijo fácil (1) y con alumnos salió difícil
        { level: 1, correct: false, measured: measured(1.2, 'provisional') },
      ],
      minResponses: 1,
    });
    expect(rows.map((row) => [row.group, row.total, row.correct])).toEqual([
      ['easy', 1, 1],
      ['medium', 0, 0],
      ['hard', 1, 0],
    ]);
  });

  it('cada grupo dice de dónde salió la dificultad de sus respuestas', () => {
    const rows = difficultyRows({
      responses: [
        { level: 1, correct: true },
        { level: 2, correct: true },
        { level: 2, correct: false, measured: measured(-1.1, 'provisional') },
        { level: 1, correct: true, measured: measured(-1.8, 'calibrated') },
        { level: 3, correct: true },
      ],
      minResponses: 20,
    });
    expect(rows.map((row) => row.sources)).toEqual([
      { physician: 2, provisional: 1, calibrated: 1 },
      { physician: 1, provisional: 0, calibrated: 0 },
      { physician: 0, provisional: 0, calibrated: 0 },
    ]);
  });

  it('una respuesta con nivel inválido no cuenta aunque traiga dificultad medida', () => {
    const rows = difficultyRows({
      responses: [{ level: 9, correct: true, measured: measured(0, 'calibrated') }],
      minResponses: 1,
    });
    expect(rows.every((row) => row.total === 0)).toBe(true);
  });
});
