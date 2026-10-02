import { describe, expect, it } from 'vitest';
import type { Membership } from '@/data/schemas/activity';
import { simulatedBetween, simulatedWeek } from './stats';

const member: Membership = {
  id: '01JZZZZZZZZZZZZZZZZZZZZZZZ',
  groupId: '01JZZZZZZZZZZZZZZZZZZZZZZY',
  userId: '01JZZZZZZZZZZZZZZZZZZZZZZX',
  alias: 'Ana R.',
  isSimulated: true,
  joinedAt: '2026-09-28T10:00:00.000Z',
  leftAt: null,
};

describe('números simulados de la Party', () => {
  it('son deterministas y crecen con los días', () => {
    const oneDay = simulatedBetween(member, '2026-10-02', '2026-10-02');
    const week = simulatedBetween(member, '2026-09-28', '2026-10-02');
    expect(simulatedBetween(member, '2026-10-02', '2026-10-02')).toEqual(oneDay);
    expect(week.cards).toBeGreaterThanOrEqual(oneDay.cards);
    expect(week.xp).toBe(week.cards * 3 + week.questions * 12);
  });

  it('un reto nuevo solo cuenta desde su primer día, no toda la semana', () => {
    const today = simulatedBetween(member, '2026-10-02', '2026-10-02');
    expect(today.cards).toBeLessThan(200);
  });

  it('la semana empieza el lunes', () => {
    const friday = simulatedWeek(member, '2026-10-02');
    expect(friday.xp).toBe(simulatedBetween(member, '2026-09-28', '2026-10-02').xp);
    expect(friday.level).toBe(simulatedWeek(member, '2026-10-05').level);
  });
});
