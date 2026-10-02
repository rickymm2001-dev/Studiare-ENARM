// Números de la Party. Los del alumno salen de su bitácora. Los de los compañeros simulados salen
// de una semilla por miembro y semana, crecen con los días de la semana y van marcados (11.3).
import type { Challenge, Membership } from '@/data/schemas/activity';
import { addDays, weekStartOf } from '@/engines/studyDay';
import { createRng } from '@/engines/random';
import type { SharedMemberStats } from '@/engines/party';
import type { Snapshot } from '../home/snapshot';

export type ChallengeMetric = Challenge['metric'];

interface WeekTotals {
  cards: number;
  questions: number;
  xp: number;
}

/** Suma de actividad entre dos días de estudio, ambos incluidos */
export function totalsBetween(snapshot: Snapshot, from: string, to: string): WeekTotals {
  const totals: WeekTotals = { cards: 0, questions: 0, xp: 0 };
  for (const [day, summary] of Object.entries(snapshot.activity)) {
    if (day < from || day > to) continue;
    totals.cards += summary.cards;
    totals.questions += summary.questions;
    totals.xp += summary.xp;
  }
  return totals;
}

/** Actividad simulada de un compañero en un día. Semilla por miembro y día */
function simulatedDay(membership: Membership, day: string): WeekTotals {
  const pace = 0.4 + createRng(`party-pace|${membership.id}`).next() * 1.2;
  const rng = createRng(`party|${membership.id}|${day}`);
  // Algunos días no estudia
  if (rng.next() < 0.15) return { cards: 0, questions: 0, xp: 0 };
  const cards = Math.round(60 * pace * (0.6 + rng.next() * 0.8));
  const questions = Math.round(18 * pace * (0.6 + rng.next() * 0.8));
  return { cards, questions, xp: cards * 3 + questions * 12 };
}

/** Totales simulados de un compañero entre dos días, ambos incluidos */
export function simulatedBetween(membership: Membership, from: string, to: string): WeekTotals {
  const totals: WeekTotals = { cards: 0, questions: 0, xp: 0 };
  for (let day = from; day <= to; day = addDays(day, 1)) {
    const value = simulatedDay(membership, day);
    totals.cards += value.cards;
    totals.questions += value.questions;
    totals.xp += value.xp;
  }
  return totals;
}

/** Semana simulada de un compañero hasta hoy, con nivel y racha estables */
export function simulatedWeek(
  membership: Membership,
  today: string,
): WeekTotals & { level: number; streak: number } {
  const profile = createRng(`party-profile|${membership.id}`);
  return {
    ...simulatedBetween(membership, weekStartOf(today), today),
    level: 3 + profile.int(0, 12),
    streak: profile.int(0, 40),
  };
}

export function memberStats(
  members: readonly Membership[],
  self: { userId: string; snapshot: Snapshot },
): SharedMemberStats[] {
  const { snapshot } = self;
  return members.map((member) => {
    if (member.userId === self.userId) {
      return {
        memberId: member.id,
        alias: member.alias,
        weeklyXp: snapshot.weeklyXp,
        level: snapshot.level.level,
        streak: snapshot.streak.current,
        isSimulated: false,
      };
    }
    if (member.isSimulated) {
      const week = simulatedWeek(member, snapshot.today);
      return {
        memberId: member.id,
        alias: member.alias,
        weeklyXp: week.xp,
        level: week.level,
        streak: week.streak,
        isSimulated: true,
      };
    }
    // Otro alumno real en este dispositivo. Sin servidor no hay sus datos aquí
    return {
      memberId: member.id,
      alias: member.alias,
      weeklyXp: 0,
      level: 1,
      streak: 0,
      isSimulated: false,
    };
  });
}

/** Aportes de cada miembro a un reto colectivo */
export function challengeContributions(
  challenge: Challenge,
  members: readonly Membership[],
  self: { userId: string; snapshot: Snapshot; startDay: string },
): number[] {
  const metric = challenge.metric === 'accuracy' ? 'questions' : challenge.metric;
  return members.map((member) => {
    if (member.userId === self.userId) {
      return totalsBetween(self.snapshot, self.startDay, self.snapshot.today)[metric];
    }
    return member.isSimulated
      ? simulatedBetween(member, self.startDay, self.snapshot.today)[metric]
      : 0;
  });
}
