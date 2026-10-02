import { describe, expect, it } from 'vitest';
import { levelFor, nextTitle, TITLES, titleLadder, xpForLevel } from './xp';

describe('escalera de títulos', () => {
  it('cubre todos los niveles sin huecos y con el XP de la curva', () => {
    const ladder = titleLadder();
    expect(ladder).toHaveLength(TITLES.length);
    ladder.forEach((step, index) => {
      expect(step.xpFrom).toBe(xpForLevel(step.fromLevel));
      const next = ladder[index + 1];
      if (next) expect(step.toLevel).toBe(next.fromLevel - 1);
      else expect(step.toLevel).toBeNull();
    });
  });

  it('el siguiente título coincide con el nivel que da levelFor', () => {
    const next = nextTitle(0);
    expect(next?.step.title).toBe(TITLES[1]?.title);
    if (!next) throw new Error('falta siguiente título');
    expect(levelFor(next.step.xpFrom).title).toBe(next.step.title);
    expect(levelFor(next.step.xpFrom - 1).title).toBe(TITLES[0]?.title);
    expect(nextTitle(10_000_000)).toBeNull();
  });
});
