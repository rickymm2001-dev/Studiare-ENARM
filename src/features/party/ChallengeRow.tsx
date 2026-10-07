// Un reto colectivo en la lista de retos de un grupo (9.6). La barra suma lo de todos los miembros, los
// simulados incluidos y marcados. El premio de 100 XP exige aporte propio y se da uno por día, porque
// los compañeros simulados pueden cumplir la meta por sí solos (claims.ts).
import { Trophy } from 'lucide-react';
import { useRef, useState } from 'react';
import { useDataApi } from '@/data/context';
import { createEvent } from '@/data/events/createEvent';
import type { Challenge, Membership } from '@/data/schemas/activity';
import type { AppEvent } from '@/data/schemas/events';
import { collectiveProgress } from '@/engines/party';
import { studyDayOf } from '@/engines/studyDay';
import { awardXp } from '@/engines/xp';
import { t } from '@/i18n/es-MX';
import { celebrate } from '@/ui/celebrate';
import { Button } from '@/ui/components/button';
import type { Snapshot } from '../home/snapshot';
import type { ReadySession } from '../shared/RequireSession';
import { claimedOn, claimStatus, wasClaimed } from './claims';
import { challengeContributions } from './stats';

export function ChallengeRow({
  challenge,
  members,
  snapshot,
  events,
  session,
}: {
  challenge: Challenge;
  members: Membership[];
  snapshot: Snapshot;
  events: AppEvent[];
  session: ReadySession;
}) {
  const api = useDataApi();
  const { user } = session;
  const [busy, setBusy] = useState(false);
  const claiming = useRef(false);
  const startDay = studyDayOf(new Date(challenge.startsAt), user.timeZone);
  const contributions = challengeContributions(challenge, members, {
    userId: user.id,
    snapshot,
    startDay,
  });
  const progress = collectiveProgress(contributions, challenge.target);
  const selfIndex = members.findIndex((member) => member.userId === user.id);
  const status = claimStatus({
    completed: progress.completed,
    claimed: wasClaimed(events, challenge.id),
    selfContribution: contributions[selfIndex] ?? 0,
    claimedToday: claimedOn(events, snapshot.today),
  });

  const claim = async () => {
    // Dos toques seguidos no pagan dos veces
    if (claiming.current) return;
    claiming.current = true;
    setBusy(true);
    try {
      // La lista de la pantalla puede ir un paso atrás. Antes de pagar se revisa la bitácora guardada
      const stored = await api.repos.events.query({ userId: user.id });
      if (wasClaimed(stored, challenge.id) || claimedOn(stored, snapshot.today)) return;
      const ctx = { userId: user.id, tz: user.timeZone };
      const completed = await api.recordEvent(
        createEvent(
          'challenge_completed',
          { challengeId: challenge.id, groupId: challenge.groupId },
          ctx,
        ),
      );
      for (const award of awardXp({
        activity: { kind: 'challenge', eventId: completed.id },
        streakDays: snapshot.streak.current,
        volumeXpToday: 0,
      })) {
        await api.recordEvent(createEvent('xp_awarded', award, ctx));
      }
      celebrate('badge');
    } finally {
      claiming.current = false;
      setBusy(false);
    }
  };

  const percent = Math.round(progress.fraction * 100);
  return (
    <li className="rounded-md bg-muted p-3">
      <p className="flex items-center gap-2 font-medium">
        <Trophy aria-hidden className="size-4" />
        {challenge.title}
      </p>
      <div
        className="mt-2 h-2 w-full overflow-hidden rounded-full bg-surface"
        role="progressbar"
        aria-label={challenge.title}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
      >
        <div className="h-full bg-primary" style={{ width: `${percent}%` }} />
      </div>
      <p className="mt-1 text-sm text-fg-muted">
        {t.party.progress(progress.total, progress.target, t.party.metrics[challenge.metric])}
      </p>
      {status === 'claimed' ? <p className="text-sm text-success">{t.party.claimed}</p> : null}
      {status === 'needs_own_contribution' ? (
        <p role="status" className="mt-1 text-sm">
          {t.party.needOwnContribution}
        </p>
      ) : null}
      {status === 'already_claimed_today' ? (
        <p role="status" className="mt-1 text-sm">
          {t.party.oneClaimPerDay}
        </p>
      ) : null}
      {status === 'available' ? (
        <Button
          size="sm"
          className="mt-2"
          disabled={busy}
          onClick={() => {
            void claim();
          }}
        >
          {t.party.claim}
        </Button>
      ) : null}
    </li>
  );
}
