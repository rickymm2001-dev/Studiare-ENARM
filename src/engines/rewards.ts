/**
 * Misiones, insignias y ligas (Fase P bloque 6).
 *
 * Qué hace. Convierte la bitácora del alumno en tres cosas que motivan sin inventar datos. Las
 * misiones del día y de la semana con su avance, las insignias con su nivel y el avance al
 * siguiente, y la liga de la semana según el XP ganado.
 * Entradas. Los eventos del alumno, el momento actual, la mejor racha y el XP total.
 * Salidas. Un estado con claves, sin texto. La interfaz pone el idioma. No guarda nada, todo se
 * reconstruye de la bitácora, así nada se puede falsificar ni desfasar.
 * Método. Se resume la bitácora por día de estudio, que corta a las 4 a. m. en la zona del alumno.
 * Cada insignia es un contador acumulado y su fecha es el primer día en que lo cruzó. Las misiones
 * miran el día y la semana en curso. La liga es la más alta cuyo XP semanal ya se alcanzó, y se
 * compara con la semana anterior para saber si se subió o se bajó. La mejor liga recorre todas las
 * semanas con actividad. La mision de aciertos de la semana muestra calibrando hasta tener 30
 * preguntas, porque un porcentaje con pocas preguntas no dice nada.
 * Umbrales. Todos en src/config/rewards.ts y provisionales.
 */
import {
  BADGE_FAMILIES,
  BADGE_FAMILY_KEYS,
  LEAGUES,
  MISSION_TARGETS,
  STUDY_DAY_MIN,
  type BadgeFamily,
  type LeagueKey,
} from '@/config/rewards';
import type { AppEvent } from '@/data/schemas/events';
import { addDays, studyDayOf, weekStartOf } from './studyDay';
import { levelFor } from './xp';

export interface DayTotals {
  cards: number;
  questions: number;
  correct: number;
  minutes: number;
  xp: number;
  exams: number;
  duels: number;
  imports: number;
  verifications: number;
  aiCards: number;
}

const emptyTotals = (): DayTotals => ({
  cards: 0,
  questions: 0,
  correct: 0,
  minutes: 0,
  xp: 0,
  exams: 0,
  duels: 0,
  imports: 0,
  verifications: 0,
  aiCards: 0,
});

/** La bitácora resumida por día de estudio. Los minutos son el mayor entre sesiones y Pomodoro */
export function dayTotals(events: readonly AppEvent[]): Map<string, DayTotals> {
  const totals = new Map<string, DayTotals>();
  const sessions = new Map<string, number>();
  const pomodoro = new Map<string, number>();
  const at = (day: string) => {
    let entry = totals.get(day);
    if (!entry) {
      entry = emptyTotals();
      totals.set(day, entry);
    }
    return entry;
  };
  for (const event of events) {
    const day = studyDayOf(new Date(event.at), event.tz);
    switch (event.type) {
      case 'card_reviewed':
        at(day).cards += 1;
        break;
      case 'question_answered': {
        const entry = at(day);
        entry.questions += 1;
        if (event.payload.correct) entry.correct += 1;
        break;
      }
      case 'xp_awarded':
        at(day).xp += event.payload.amount;
        break;
      case 'session_ended':
        sessions.set(day, (sessions.get(day) ?? 0) + event.payload.durationMs / 60000);
        if (event.payload.reason === 'completed') {
          if (event.payload.kind === 'exam') at(day).exams += 1;
          if (event.payload.kind === 'challenge') at(day).duels += 1;
        }
        break;
      case 'pomodoro_completed':
        if (event.payload.phase === 'focus') {
          pomodoro.set(day, (pomodoro.get(day) ?? 0) + event.payload.actualMinutes);
        }
        break;
      case 'deck_imported':
        at(day).imports += 1;
        break;
      case 'card_controversy_resolved':
        at(day).verifications += 1;
        break;
      case 'ai_artifact_approved':
        if (event.payload.kind === 'flashcard') at(day).aiCards += 1;
        break;
      default:
        break;
    }
  }
  for (const day of new Set([...sessions.keys(), ...pomodoro.keys()])) {
    at(day).minutes = Math.round(Math.max(sessions.get(day) ?? 0, pomodoro.get(day) ?? 0));
  }
  return totals;
}

// ---------------------------------------------------------------------------------------------
// Misiones

export type MissionKey =
  'dailyCards' | 'dailyQuestions' | 'dailyMinutes' | 'weeklyDays' | 'weeklyXp' | 'weeklyAccuracy';

export interface Mission {
  key: MissionKey;
  scope: 'daily' | 'weekly';
  current: number;
  target: number;
  done: boolean;
  /** Sin suficientes datos para medirla. Faltan `need - have` preguntas */
  calibrating: { have: number; need: number } | null;
}

const missionOf = (
  key: MissionKey,
  scope: Mission['scope'],
  current: number,
  target: number,
): Mission => ({ key, scope, current, target, done: current >= target, calibrating: null });

export function isStudyDay(totals: DayTotals | undefined): boolean {
  return (
    totals !== undefined &&
    (totals.cards >= STUDY_DAY_MIN.cards ||
      totals.questions >= STUDY_DAY_MIN.questions ||
      totals.minutes >= STUDY_DAY_MIN.minutes)
  );
}

export function missionsFor(
  totals: ReadonlyMap<string, DayTotals>,
  today: string,
): { daily: Mission[]; weekly: Mission[] } {
  const now = totals.get(today) ?? emptyTotals();
  const monday = weekStartOf(today);
  let days = 0;
  let xp = 0;
  let questions = 0;
  let correct = 0;
  for (let day = monday; day <= today; day = addDays(day, 1)) {
    const entry = totals.get(day);
    if (!entry) continue;
    if (isStudyDay(entry)) days += 1;
    xp += entry.xp;
    questions += entry.questions;
    correct += entry.correct;
  }
  const need = MISSION_TARGETS.weeklyAccuracyMinQuestions;
  const percent = questions === 0 ? 0 : Math.round((100 * correct) / questions);
  const accuracy = missionOf(
    'weeklyAccuracy',
    'weekly',
    percent,
    MISSION_TARGETS.weeklyAccuracyPercent,
  );
  const measured = questions >= need;
  return {
    daily: [
      missionOf('dailyCards', 'daily', now.cards, MISSION_TARGETS.dailyCards),
      missionOf('dailyQuestions', 'daily', now.questions, MISSION_TARGETS.dailyQuestions),
      missionOf('dailyMinutes', 'daily', now.minutes, MISSION_TARGETS.dailyMinutes),
    ],
    weekly: [
      missionOf('weeklyDays', 'weekly', days, MISSION_TARGETS.weeklyDays),
      missionOf('weeklyXp', 'weekly', xp, MISSION_TARGETS.weeklyXp),
      // Con pocas preguntas el porcentaje no es de fiar y la misión ni se da por hecha ni por perdida
      measured
        ? accuracy
        : { ...accuracy, current: percent, done: false, calibrating: { have: questions, need } },
    ],
  };
}

// ---------------------------------------------------------------------------------------------
// Insignias

export interface BadgeTier {
  /** Número de nivel, desde 1 */
  tier: number;
  threshold: number;
  /** Primer día en que se alcanzó. null si todavía no, o si no se sabe el día (la racha) */
  earnedOn: string | null;
  earned: boolean;
}

export interface BadgeStatus {
  family: BadgeFamily;
  /** Valor actual del contador de la familia */
  current: number;
  tiers: BadgeTier[];
  /** Niveles ganados */
  level: number;
  /** El siguiente nivel por ganar, o null si ya los ganó todos */
  next: BadgeTier | null;
}

function counterByDay(
  totals: ReadonlyMap<string, DayTotals>,
  family: BadgeFamily,
): { days: [string, number][]; total: number } {
  const field = {
    reviews: 'cards',
    answers: 'questions',
    focus: 'minutes',
    exams: 'exams',
    duels: 'duels',
    imports: 'imports',
    verifications: 'verifications',
    aiCards: 'aiCards',
  } as const;
  const days: [string, number][] = [];
  let total = 0;
  for (const day of [...totals.keys()].sort()) {
    const entry = totals.get(day);
    if (!entry) continue;
    if (family === 'level') {
      total += entry.xp;
    } else if (family !== 'streak') {
      total += entry[field[family]];
    }
    days.push([day, total]);
  }
  return { days, total };
}

export function badgesFor(
  totals: ReadonlyMap<string, DayTotals>,
  streakBest: number,
): BadgeStatus[] {
  return BADGE_FAMILY_KEYS.map((family) => {
    const thresholds: readonly number[] = BADGE_FAMILIES[family].tiers;
    const { days, total } = counterByDay(totals, family);
    // El contador del nivel es el nivel que da el XP acumulado. El de la racha, su mejor valor
    const valueOf = (cumulative: number) =>
      family === 'level' ? levelFor(cumulative).level : cumulative;
    const current = family === 'streak' ? streakBest : valueOf(total);
    const tiers = thresholds.map((threshold, index): BadgeTier => {
      const earned = current >= threshold;
      const first = days.find(([, cumulative]) => valueOf(cumulative) >= threshold);
      return {
        tier: index + 1,
        threshold,
        earned,
        earnedOn: earned && family !== 'streak' ? (first?.[0] ?? null) : null,
      };
    });
    return {
      family,
      current,
      tiers,
      level: tiers.filter((tier) => tier.earned).length,
      next: tiers.find((tier) => !tier.earned) ?? null,
    };
  });
}

// ---------------------------------------------------------------------------------------------
// Liga

export interface LeagueStatus {
  /** Liga de la semana en curso según el XP de hoy */
  current: LeagueKey;
  weeklyXp: number;
  /** La siguiente liga y el XP que falta, o null si ya está en la más alta */
  next: { key: LeagueKey; missingXp: number } | null;
  /** Liga de la semana anterior, o null si esa semana no hubo actividad */
  previous: LeagueKey | null;
  /** Subió, bajó o sigue igual frente a la semana anterior. null sin semana anterior */
  movement: 'up' | 'down' | 'same' | null;
  /** La liga más alta que alcanzó en cualquier semana */
  best: LeagueKey;
}

export function leagueOfXp(xp: number): LeagueKey {
  let current: LeagueKey = LEAGUES[0].key;
  for (const league of LEAGUES) if (xp >= league.fromXp) current = league.key;
  return current;
}

const leagueIndex = (key: LeagueKey) => LEAGUES.findIndex((league) => league.key === key);

export function leagueFor(totals: ReadonlyMap<string, DayTotals>, today: string): LeagueStatus {
  const weekly = new Map<string, number>();
  for (const [day, entry] of totals) {
    const week = weekStartOf(day);
    weekly.set(week, (weekly.get(week) ?? 0) + entry.xp);
  }
  const thisWeek = weekStartOf(today);
  const lastWeek = addDays(thisWeek, -7);
  const weeklyXp = weekly.get(thisWeek) ?? 0;
  const current = leagueOfXp(weeklyXp);
  const index = leagueIndex(current);
  const upcoming = LEAGUES[index + 1];
  const previousXp = weekly.get(lastWeek);
  const previous = previousXp === undefined ? null : leagueOfXp(previousXp);
  let best: LeagueKey = current;
  for (const xp of weekly.values()) {
    const key = leagueOfXp(xp);
    if (leagueIndex(key) > leagueIndex(best)) best = key;
  }
  return {
    current,
    weeklyXp,
    next: upcoming ? { key: upcoming.key, missingXp: upcoming.fromXp - weeklyXp } : null,
    previous,
    movement:
      previous === null
        ? null
        : index > leagueIndex(previous)
          ? 'up'
          : index < leagueIndex(previous)
            ? 'down'
            : 'same',
    best,
  };
}

// ---------------------------------------------------------------------------------------------

export interface Rewards {
  missions: { daily: Mission[]; weekly: Mission[] };
  badges: BadgeStatus[];
  league: LeagueStatus;
  /** Insignias con al menos un nivel ganado, de la ganada más recientemente a la más antigua */
  recentBadges: { family: BadgeFamily; tier: number; earnedOn: string }[];
}

export function buildRewards(input: {
  events: readonly AppEvent[];
  now: Date;
  timeZone: string;
  streakBest: number;
}): Rewards {
  const totals = dayTotals(input.events);
  const today = studyDayOf(input.now, input.timeZone);
  const badges = badgesFor(totals, input.streakBest);
  const recentBadges: Rewards['recentBadges'] = [];
  for (const badge of badges) {
    for (const tier of badge.tiers) {
      if (tier.earnedOn !== null) {
        recentBadges.push({ family: badge.family, tier: tier.tier, earnedOn: tier.earnedOn });
      }
    }
  }
  recentBadges.sort((a, b) => (a.earnedOn < b.earnedOn ? 1 : a.earnedOn > b.earnedOn ? -1 : 0));
  return {
    missions: missionsFor(totals, today),
    badges,
    league: leagueFor(totals, today),
    recentBadges,
  };
}
