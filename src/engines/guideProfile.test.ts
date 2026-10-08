import { describe, expect, it } from 'vitest';
import { guideProfile, guideProfileChanges, type GuideProfile } from './guideProfile';

const TODAY = '2026-10-08';
const ONE_TOUCH: GuideProfile = {
  desiredRetention: 0.9,
  maxIntervalDays: 300,
  spacing: { hard: 1, good: 1, easy: 1 },
};

describe('perfil guía de un toque (D-085, fila 6)', () => {
  it('con el examen lejano el tope son los días que faltan', () => {
    // De 2026-10-08 a 2027-06-15 hay 250 días
    expect(guideProfile({ today: TODAY, examDate: '2027-06-15' })).toEqual({
      desiredRetention: 0.9,
      maxIntervalDays: 250,
      spacing: { hard: 1, good: 1, easy: 1 },
    });
  });

  it('con el examen cercano el tope baja con él y nunca es menor a 1', () => {
    expect(guideProfile({ today: TODAY, examDate: '2026-11-07' }).maxIntervalDays).toBe(30);
    expect(guideProfile({ today: TODAY, examDate: '2026-10-09' }).maxIntervalDays).toBe(1);
    // El día del examen mismo ya no tiene días por delante, pero el mínimo es 1
    expect(guideProfile({ today: TODAY, examDate: TODAY }).maxIntervalDays).toBe(1);
  });

  it('con el examen pasado o sin fecha usa 365 días, el tope de la guía de Anki', () => {
    expect(guideProfile({ today: TODAY, examDate: '2026-10-07' }).maxIntervalDays).toBe(365);
    expect(guideProfile({ today: TODAY, examDate: '2020-01-01' }).maxIntervalDays).toBe(365);
    expect(guideProfile({ today: TODAY, examDate: null }).maxIntervalDays).toBe(365);
  });

  it('el tope no pasa de 3650 días, el máximo del esquema de ajustes', () => {
    expect(guideProfile({ today: TODAY, examDate: '2036-10-05' }).maxIntervalDays).toBe(3650);
    expect(guideProfile({ today: TODAY, examDate: '2046-01-01' }).maxIntervalDays).toBe(3650);
    expect(guideProfile({ today: TODAY, examDate: '2036-10-04' }).maxIntervalDays).toBe(3649);
  });

  it('la retención y la separación no dependen de la fecha', () => {
    for (const examDate of [null, '2026-10-01', '2026-10-20', '2028-01-01']) {
      const profile = guideProfile({ today: TODAY, examDate });
      expect(profile.desiredRetention).toBe(0.9);
      expect(profile.spacing).toEqual({ hard: 1, good: 1, easy: 1 });
    }
  });

  it('una fecha mal escrita lanza un error claro en lugar de inventar un tope', () => {
    expect(() => guideProfile({ today: TODAY, examDate: '15/06/2027' })).toThrow(RangeError);
  });
});

describe('cambios que haría el perfil guía', () => {
  it('lista solo lo que cambia y lo escribe listo para mostrar', () => {
    const changes = guideProfileChanges(
      { desiredRetention: 0.85, maxIntervalDays: 21, spacing: { hard: 0.8, good: 1, easy: 1.5 } },
      ONE_TOUCH,
    );
    expect(changes).toEqual([
      { field: 'desiredRetention', from: '85%', to: '90%' },
      { field: 'maxIntervalDays', from: '21 días', to: '300 días' },
      {
        field: 'spacing',
        from: 'Difícil 0.8, Bien 1, Fácil 1.5',
        to: 'Difícil 1, Bien 1, Fácil 1',
      },
    ]);
  });

  it('un valor sin tope se muestra como Sin tope', () => {
    const changes = guideProfileChanges(
      { desiredRetention: 0.9, maxIntervalDays: null, spacing: { hard: 1, good: 1, easy: 1 } },
      ONE_TOUCH,
    );
    expect(changes).toEqual([{ field: 'maxIntervalDays', from: 'Sin tope', to: '300 días' }]);
  });

  it('si solo cambia un campo, solo sale ese', () => {
    const base = { desiredRetention: 0.9, maxIntervalDays: 300, spacing: ONE_TOUCH.spacing };
    expect(guideProfileChanges({ ...base, desiredRetention: 0.95 }, ONE_TOUCH)).toEqual([
      { field: 'desiredRetention', from: '95%', to: '90%' },
    ]);
    expect(
      guideProfileChanges({ ...base, spacing: { hard: 1, good: 1, easy: 1.2 } }, ONE_TOUCH),
    ).toEqual([
      {
        field: 'spacing',
        from: 'Difícil 1, Bien 1, Fácil 1.2',
        to: 'Difícil 1, Bien 1, Fácil 1',
      },
    ]);
    expect(
      guideProfileChanges({ ...base, maxIntervalDays: 1 }, { ...ONE_TOUCH, maxIntervalDays: 2 }),
    ).toEqual([{ field: 'maxIntervalDays', from: '1 día', to: '2 días' }]);
  });

  it('cada botón de la separación cuenta por separado', () => {
    for (const key of ['hard', 'good', 'easy'] as const) {
      const spacing = { hard: 1, good: 1, easy: 1, [key]: 0.5 };
      const changes = guideProfileChanges(
        { desiredRetention: 0.9, maxIntervalDays: 300, spacing },
        ONE_TOUCH,
      );
      expect(changes.map((change) => change.field)).toEqual(['spacing']);
    }
  });

  it('sin cambios devuelve una lista vacía', () => {
    expect(
      guideProfileChanges(
        { desiredRetention: 0.9, maxIntervalDays: 300, spacing: { hard: 1, good: 1, easy: 1 } },
        ONE_TOUCH,
      ),
    ).toEqual([]);
    // El perfil que sale del propio motor siempre coincide consigo mismo
    const profile = guideProfile({ today: TODAY, examDate: '2027-03-01' });
    expect(guideProfileChanges(profile, profile)).toEqual([]);
  });

  it('no inventa cambios por ruido de punto flotante ni muestra decimales de sobra', () => {
    expect(
      guideProfileChanges(
        { desiredRetention: 0.9 + 1e-12, maxIntervalDays: 300, spacing: ONE_TOUCH.spacing },
        ONE_TOUCH,
      ),
    ).toEqual([]);
    const [change] = guideProfileChanges(
      { desiredRetention: 0.925, maxIntervalDays: 300, spacing: ONE_TOUCH.spacing },
      ONE_TOUCH,
    );
    expect(change).toEqual({ field: 'desiredRetention', from: '92.5%', to: '90%' });
    const [spacing] = guideProfileChanges(
      {
        desiredRetention: 0.9,
        maxIntervalDays: 300,
        spacing: { hard: 0.1 + 0.2, good: 1, easy: 1 },
      },
      ONE_TOUCH,
    );
    expect(spacing?.from).toBe('Difícil 0.3, Bien 1, Fácil 1');
  });
});
