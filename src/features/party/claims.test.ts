import { describe, expect, it } from 'vitest';
import { newId } from '@/data/testing/fixtures';
import { event, minute } from '../tutor/testing/fixtures';
import { claimedOn, claimStatus, wasClaimed } from './claims';

const base = { completed: true, claimed: false, selfContribution: 5, claimedToday: false };

describe('premio de un reto colectivo', () => {
  it('mientras la meta no se cumple no hay nada que reclamar', () => {
    expect(claimStatus({ ...base, completed: false })).toBe('in_progress');
    // Aunque el alumno haya aportado mucho
    expect(claimStatus({ ...base, completed: false, selfContribution: 500 })).toBe('in_progress');
  });

  it('con la meta cumplida y aporte propio se puede reclamar', () => {
    expect(claimStatus(base)).toBe('available');
  });

  it('si los compañeros simulados cumplieron solos, sin aporte propio no hay premio', () => {
    expect(claimStatus({ ...base, selfContribution: 0 })).toBe('needs_own_contribution');
    expect(claimStatus({ ...base, selfContribution: -3 })).toBe('needs_own_contribution');
  });

  it('un premio por día de estudio', () => {
    expect(claimStatus({ ...base, claimedToday: true })).toBe('already_claimed_today');
  });

  it('un reto ya reclamado queda como reclamado y no vuelve a ofrecerse', () => {
    expect(claimStatus({ ...base, claimed: true })).toBe('claimed');
    expect(claimStatus({ ...base, claimed: true, claimedToday: true })).toBe('claimed');
  });

  it('lee de la bitácora qué reto se reclamó y en qué día', () => {
    const challengeId = newId();
    const claim = event('challenge_completed', { challengeId, groupId: newId() }, minute(0));
    const day = claim.at.slice(0, 10);
    expect(wasClaimed([claim], challengeId)).toBe(true);
    expect(wasClaimed([claim], newId())).toBe(false);
    expect(wasClaimed([], challengeId)).toBe(false);
    expect(claimedOn([claim], '2026-10-01')).toBe(true);
    expect(claimedOn([claim], '2026-09-30')).toBe(false);
    expect(claimedOn([], '2026-10-01')).toBe(false);
    expect(day).toBe('2026-10-01');
  });
});
