import { describe, expect, it } from 'vitest';
import { provisionalExamDate } from '@/demo/generator/seed';
import { simulateApi } from './simulateApi';

describe('API del worker de simulación', () => {
  it('arma registros sin los historiales completos y con fecha del ENARM provisional', async () => {
    const records = await simulateApi.buildSeed({
      endDay: '2026-10-01',
      cohortSize: 3,
      cohortDays: 10,
      demoDays: 5,
    });
    expect(records.users).toHaveLength(4);
    expect(records.simTruth).toHaveLength(4);
    expect(records.events.length).toBeGreaterThan(0);
    expect('cohort' in records).toBe(false);
    expect(records.options.examDate).toBe('2027-09-15');
    expect(records.users[0]?.examDate).toBe('2027-09-15');
    // Usa los mazos de Paco, no la baraja sintética (D-053)
    // Cuelgan de ENARM 2027 y cada uno trae sus materias como submazos (D-085)
    expect(records.decks.map((deck) => deck.name)).toEqual(
      expect.arrayContaining([
        'ENARM 2027',
        'Ginecología y obstetricia (Paco)',
        'Medicina interna (Paco)',
        'Urgencias (Paco)',
      ]),
    );
    expect(records.cards.length).toBeGreaterThan(3700);
  });

  it('la fecha provisional queda al menos a 90 días', () => {
    expect(provisionalExamDate('2026-03-01')).toBe('2026-09-15');
    expect(provisionalExamDate('2026-07-01')).toBe('2027-09-15');
  });
});
