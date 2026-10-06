/**
 * Puntaje semanal y Party (9.6).
 *
 * Qué hace. Arma la tabla semanal de un grupo, el progreso de un reto colectivo, el ganador de un
 * duelo y los códigos de invitación. Solo usa alias, XP, nivel y racha, que es lo que se comparte
 * por defecto. Exactitud por tema, sesgos y conducta nunca entran aquí.
 * Entradas. Miembros con su alias, XP de la semana, nivel y racha. Contribuciones a un reto. Los
 * resultados de los dos participantes de un duelo.
 * Salidas. Tabla ordenada con posición, progreso del reto y resultado del duelo.
 * Método
 *   - Puntaje semanal = XP de la semana. La semana empieza el lunes a las 4 a. m. (motor studyDay)
 *   - Empates en la tabla. Mismo lugar para el mismo XP, y el orden por alias
 *   - Duelo. Gana más exactitud y desempata el menor tiempo total. Si todo empata, es empate
 *   - Códigos de 6 caracteres sin letras ni números que se confundan (sin 0, O, 1, I ni L)
 * Umbrales. Grupos de hasta 50 miembros, códigos de 6 caracteres y duelos de 20 preguntas (J).
 */
import type { Rng } from './random';

export const MAX_GROUP_MEMBERS = 50;
export const INVITE_CODE_LENGTH = 6;
/** Preguntas de un duelo, las mismas para los dos jugadores (9.6) */
export const DUEL_QUESTIONS = 20;
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function generateInviteCode(rng: Rng): string {
  return Array.from({ length: INVITE_CODE_LENGTH }, () =>
    CODE_ALPHABET.charAt(rng.int(0, CODE_ALPHABET.length - 1)),
  ).join('');
}

export function isValidInviteCode(code: string): boolean {
  return /^[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{6}$/.test(code);
}

/** Lo único que se comparte de un miembro por defecto (9.6) */
export interface SharedMemberStats {
  memberId: string;
  alias: string;
  weeklyXp: number;
  level: number;
  streak: number;
  isSimulated: boolean;
}

export interface LeaderboardRow extends SharedMemberStats {
  rank: number;
}

export function weeklyLeaderboard(members: readonly SharedMemberStats[]): LeaderboardRow[] {
  const sorted = [...members].sort(
    (a, b) => b.weeklyXp - a.weeklyXp || a.alias.localeCompare(b.alias, 'es'),
  );
  let rank = 0;
  let previousXp: number | null = null;
  return sorted.map((member, index) => {
    if (member.weeklyXp !== previousXp) rank = index + 1;
    previousXp = member.weeklyXp;
    return { ...member, rank };
  });
}

export function canJoinGroup(currentMembers: number): boolean {
  return currentMembers < MAX_GROUP_MEMBERS;
}

export interface ChallengeProgress {
  total: number;
  target: number;
  /** Entre 0 y 1 */
  fraction: number;
  completed: boolean;
}

export function collectiveProgress(
  contributions: readonly number[],
  target: number,
): ChallengeProgress {
  if (!(target > 0)) throw new RangeError(`La meta del reto debe ser positiva. Llegó ${target}`);
  const total = contributions.reduce((sum, value) => sum + Math.max(0, value), 0);
  return { total, target, fraction: Math.min(1, total / target), completed: total >= target };
}

export interface DuelResult {
  memberId: string;
  correct: number;
  answered: number;
  totalMs: number;
}

export type DuelOutcome =
  { kind: 'winner'; memberId: string; by: 'accuracy' | 'time' } | { kind: 'draw' };

/** Duelo asíncrono con el mismo simulador de 20 preguntas (9.6) */
export function decideDuel(a: DuelResult, b: DuelResult): DuelOutcome {
  const accuracy = (result: DuelResult) =>
    result.answered === 0 ? 0 : result.correct / result.answered;
  const difference = accuracy(a) - accuracy(b);
  if (Math.abs(difference) > 1e-12)
    return { kind: 'winner', memberId: difference > 0 ? a.memberId : b.memberId, by: 'accuracy' };
  if (a.totalMs !== b.totalMs)
    return {
      kind: 'winner',
      memberId: a.totalMs < b.totalMs ? a.memberId : b.memberId,
      by: 'time',
    };
  return { kind: 'draw' };
}
