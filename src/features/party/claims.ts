// Premio de un reto colectivo (9.5, 9.6). Los compañeros simulados pueden cumplir una meta por sí
// solos, así que el premio de 100 XP exige que el propio alumno haya aportado algo al reto y se da uno
// por día. Sin esto, crear retos de meta 1 y reclamarlos inflaba el XP real con datos simulados. Sin
// React ni Dexie.
import type { AppEvent } from '@/data/schemas/events';
import { studyDayOf } from '@/engines/studyDay';

export type ClaimStatus =
  'in_progress' | 'claimed' | 'needs_own_contribution' | 'already_claimed_today' | 'available';

export function claimStatus(input: {
  /** El grupo ya llegó a la meta */
  completed: boolean;
  /** Este reto ya se reclamó */
  claimed: boolean;
  /** Lo que aportó el propio alumno a la meta desde que empezó el reto */
  selfContribution: number;
  /** Ya reclamó el premio de otro reto en este día de estudio */
  claimedToday: boolean;
}): ClaimStatus {
  if (!input.completed) return 'in_progress';
  if (input.claimed) return 'claimed';
  if (!(input.selfContribution > 0)) return 'needs_own_contribution';
  if (input.claimedToday) return 'already_claimed_today';
  return 'available';
}

/** El reto ya se reclamó */
export const wasClaimed = (events: readonly AppEvent[], challengeId: string) =>
  events.some(
    (event) => event.type === 'challenge_completed' && event.payload.challengeId === challengeId,
  );

/** Algún premio de reto se reclamó en ese día de estudio */
export const claimedOn = (events: readonly AppEvent[], day: string) =>
  events.some(
    (event) =>
      event.type === 'challenge_completed' && studyDayOf(new Date(event.at), event.tz) === day,
  );
