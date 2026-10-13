// Un reto colectivo en la lista de retos de un grupo (9.6). La barra suma lo de todos los miembros. En
// la demostración entran los compañeros simulados, marcados, y en la nube (B7) lo que publicó cada
// miembro. El premio de 100 XP exige aporte propio y se da uno por día, porque los compañeros pueden
// cumplir la meta por sí solos (claims.ts). El premio queda en la bitácora del alumno.
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
import { ProgressBar } from '@/ui/components/progress-bar';
import type { Snapshot } from '../home/snapshot';
import type { ReadySession } from '../shared/RequireSession';
import { claimedOn, claimStatus, wasClaimed } from './claims';
import { challengeContributions } from './stats';

export function ChallengeRow({
  title,
  metric,
  total,
  target,
  selfContribution,
  simulated,
  ended = false,
  claimIds,
  events,
  session,
  snapshot,
  onClaimed,
}: {
  title: string;
  metric: Challenge['metric'];
  /** Lo que lleva el grupo */
  total: number;
  target: number;
  /** Lo que aportó el propio alumno desde que empezó el reto */
  selfContribution: number;
  /** El grupo tiene compañeros simulados, como en la demostración */
  simulated: boolean;
  /** El reto ya terminó. Si se cumplió, el premio se puede reclamar todavía */
  ended?: boolean;
  /** Los ids del reto y de su grupo en la bitácora, para el evento del premio */
  claimIds: { challengeId: string; groupId: string };
  events: readonly AppEvent[];
  session: ReadySession;
  snapshot: Snapshot;
  /** Avisa que se reclamó el premio, para que la nube publique el XP nuevo */
  onClaimed?: () => void;
}) {
  const api = useDataApi();
  const { user } = session;
  const [busy, setBusy] = useState(false);
  const claiming = useRef(false);
  const progress = collectiveProgress([total], target);
  const status = claimStatus({
    completed: progress.completed,
    claimed: wasClaimed(events, claimIds.challengeId),
    selfContribution,
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
      if (wasClaimed(stored, claimIds.challengeId) || claimedOn(stored, snapshot.today)) return;
      const ctx = { userId: user.id, tz: user.timeZone };
      const completed = await api.recordEvent(createEvent('challenge_completed', claimIds, ctx));
      for (const award of awardXp({
        activity: { kind: 'challenge', eventId: completed.id },
        streakDays: snapshot.streak.current,
        volumeXpToday: 0,
      })) {
        await api.recordEvent(createEvent('xp_awarded', award, ctx));
      }
      celebrate('challenge');
      onClaimed?.();
    } finally {
      claiming.current = false;
      setBusy(false);
    }
  };

  return (
    <li className="rounded-md bg-muted p-3">
      <p className="flex items-center gap-2 font-medium">
        <Trophy aria-hidden className="size-4" />
        {title}
      </p>
      <ProgressBar className="mt-2 bg-surface" value={total} max={target} label={title} />
      <p className="mt-1 text-sm text-fg-muted">
        {t.party.progress(progress.total, progress.target, t.party.metrics[metric])}
      </p>
      {ended && !progress.completed ? (
        <p className="text-sm text-fg-muted">{t.partyCloud.challengeEnded}</p>
      ) : null}
      {status === 'claimed' ? <p className="text-sm text-success">{t.party.claimed}</p> : null}
      {status === 'needs_own_contribution' ? (
        <p role="status" className="mt-1 text-sm">
          {simulated ? t.party.needOwnContribution : t.partyCloud.needOwnContribution}
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

/** Un reto de la demostración. Suma lo del alumno y lo de los compañeros simulados del grupo */
export function DemoChallengeRow({
  challenge,
  members,
  snapshot,
  events,
  session,
}: {
  challenge: Challenge;
  members: Membership[];
  snapshot: Snapshot;
  events: readonly AppEvent[];
  session: ReadySession;
}) {
  const { user } = session;
  const contributions = challengeContributions(challenge, members, {
    userId: user.id,
    snapshot,
    startDay: studyDayOf(new Date(challenge.startsAt), user.timeZone),
  });
  const selfIndex = members.findIndex((member) => member.userId === user.id);
  return (
    <ChallengeRow
      title={challenge.title}
      metric={challenge.metric}
      total={contributions.reduce((sum, value) => sum + Math.max(0, value), 0)}
      target={challenge.target}
      selfContribution={contributions[selfIndex] ?? 0}
      simulated={challenge.isSimulated}
      claimIds={{ challengeId: challenge.id, groupId: challenge.groupId }}
      events={events}
      session={session}
      snapshot={snapshot}
    />
  );
}
