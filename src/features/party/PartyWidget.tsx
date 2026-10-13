// Widget de Party para Inicio (9.1). Tu lugar en la tabla de tu primer grupo, su reto colectivo más
// reciente y los duelos que esperan tu turno. En la demostración sale de los grupos simulados de este
// navegador y con la nube de tus grupos reales, que de paso publica tus cifras al día (B7). Con el modo
// enfoque no muestra el lugar ni el reto (respuesta 82). Sin nube dice que Party la necesita.
import { Link } from 'react-router';
import { useCloud } from '@/app/cloudState';
import { screenPath } from '@/app/screens';
import { useDataApi } from '@/data/context';
import { useLiveData } from '@/data/hooks';
import type { AppEvent } from '@/data/schemas/events';
import { currentConsents } from '@/data/usecases/profile';
import { collectiveProgress, weeklyLeaderboard } from '@/engines/party';
import { studyDayOf } from '@/engines/studyDay';
import { t } from '@/i18n/es-MX';
import { Button } from '@/ui/components/button';
import { SimulatedDataLabel } from '@/ui/components/labels';
import { SkeletonRows } from '@/ui/components/skeleton';
import type { Snapshot } from '../home/snapshot';
import type { ReadySession } from '../shared/RequireSession';
import { contributionTo, localDuelResult } from './cloudNumbers';
import { duelView } from './duels';
import { partyModeOf } from './partyMode';
import { challengeContributions, memberStats } from './stats';
import { useCloudParty } from './useCloudParty';

interface WidgetProps {
  session: ReadySession;
  snapshot: Snapshot;
  events: readonly AppEvent[];
}

export function PartyWidget(props: WidgetProps) {
  const cloudStatus = useCloud((store) => store.state.status);
  const mode = partyModeOf(props.session.isDemo, cloudStatus);
  if (mode === 'demo') return <DemoPartyWidget {...props} />;
  if (mode === 'cloud') return <CloudPartyWidget {...props} />;
  if (mode === 'checking') return <SkeletonRows label={t.partyCloud.loading} rows={2} />;
  // Sin nube no hay grupos. En Party se explica qué hace falta
  if (mode === 'local_only') return <WidgetNote note={t.widgets.party.empty} />;
  return (
    <WidgetNote
      note={mode === 'cloud_error' ? t.partyCloud.widget.failed : t.partyCloud.widget.needsCloud}
    />
  );
}

/** Una frase y el enlace a Party */
function WidgetNote({ note }: { note: string }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-fg-muted">{note}</p>
      <Button asChild size="sm" variant="secondary" className="self-start">
        <Link to={screenPath('party')}>{t.widgets.party.go}</Link>
      </Button>
    </div>
  );
}

/** Lo que muestra el widget de un grupo, igual en la demostración y en la nube */
function WidgetBody({
  name,
  simulated,
  rank,
  challenge,
  pendingDuels,
}: {
  name: string;
  simulated: boolean;
  /** El lugar en la tabla. null con el modo enfoque */
  rank: { rank: number; of: number } | null;
  /** El reto más reciente con su avance. null si no hay o con el modo enfoque */
  challenge: { title: string; percent: number } | null;
  pendingDuels: number;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{name}</span>
        {simulated ? <SimulatedDataLabel /> : null}
      </div>
      {rank ? (
        <p className="text-2xl font-semibold">{t.widgets.party.rank(rank.rank, rank.of)}</p>
      ) : null}
      {challenge ? (
        <p className="text-sm text-fg-muted">
          {challenge.title} · {challenge.percent}%
        </p>
      ) : null}
      {pendingDuels > 0 ? (
        <p className="text-sm font-medium">{t.widgets.party.duelsPending(pendingDuels)}</p>
      ) : null}
      <Link className="text-sm underline" to={screenPath('party')}>
        {t.widgets.party.go}
      </Link>
    </div>
  );
}

function DemoPartyWidget({ session, snapshot, events }: WidgetProps) {
  const api = useDataApi();
  const { user } = session;
  const data = useLiveData(async () => {
    const memberships = await api.repos.memberships.list();
    const mine = memberships.find((item) => item.userId === user.id && item.leftAt === null);
    if (!mine) return null;
    const group = await api.repos.groups.get(mine.groupId);
    if (!group) return null;
    const challenges = (await api.repos.challenges.list()).filter(
      (item) => item.groupId === group.id,
    );
    const members = memberships.filter((item) => item.groupId === group.id && item.leftAt === null);
    return { mine, group, members, challenges };
  }, [api.repos, user.id]);

  if (data === undefined) return null;
  if (data === null) return <WidgetNote note={t.widgets.party.empty} />;
  const rows = weeklyLeaderboard(memberStats(data.members, { userId: user.id, snapshot }));
  const me = rows.find((row) => row.memberId === data.mine.id);
  // El widget muestra el reto colectivo más reciente. Los duelos se cuentan aparte
  const challenge = data.challenges.filter((item) => item.kind === 'collective').at(-1) ?? null;
  const pendingDuels = data.challenges.filter(
    (item) =>
      item.kind === 'duel' &&
      duelView({
        events,
        challenge: item,
        selfId: data.mine.id,
        opponent: { id: item.opponentId ?? '' },
      }).status === 'pending',
  ).length;
  const progress = challenge
    ? collectiveProgress(
        challengeContributions(challenge, data.members, {
          userId: user.id,
          snapshot,
          startDay: studyDayOf(new Date(challenge.startsAt), user.timeZone),
        }),
        challenge.target,
      )
    : null;
  return (
    <WidgetBody
      name={data.group.name}
      simulated={data.group.isSimulated}
      rank={me ? { rank: me.rank, of: rows.length } : null}
      challenge={
        challenge && progress
          ? { title: challenge.title, percent: Math.round(progress.fraction * 100) }
          : null
      }
      pendingDuels={pendingDuels}
    />
  );
}

function CloudPartyWidget(props: WidgetProps) {
  const api = useDataApi();
  const { user } = props.session;
  const consents = useLiveData(() => currentConsents(api, user.id), [api.repos, user.id]);
  if (consents === undefined) return <SkeletonRows label={t.partyCloud.loading} rows={2} />;
  if (!consents.party) return <WidgetNote note={t.partyCloud.widget.consent} />;
  return <CloudGroupWidget {...props} />;
}

function CloudGroupWidget({ session, snapshot, events }: WidgetProps) {
  const { user } = session;
  const { state } = useCloudParty({ enabled: true, snapshot, events, timeZone: user.timeZone });
  if (state.status === 'loading') return <SkeletonRows label={t.partyCloud.loading} rows={2} />;
  if (state.status === 'failed') return <WidgetNote note={t.partyCloud.widget.failed} />;
  const group = state.overview.groups[0];
  if (!group) return <WidgetNote note={t.widgets.party.empty} />;
  const rows = weeklyLeaderboard(
    group.members.map((member) => ({
      ...member,
      weeklyXp: member.isSelf ? snapshot.weeklyXp : member.weeklyXp,
    })),
  );
  const me = rows.find((row) => row.isSelf);
  const challenge = group.challenges[0] ?? null;
  const progress = challenge
    ? collectiveProgress(
        [
          Math.max(
            0,
            challenge.total -
              (challenge.mine ?? 0) +
              contributionTo(challenge, snapshot, user.timeZone),
          ),
        ],
        challenge.target,
      )
    : null;
  const pendingDuels = group.duels.filter(
    (duel) => duel.mine === null && localDuelResult(events, duel) === null,
  ).length;
  return (
    <WidgetBody
      name={group.name}
      simulated={false}
      rank={me ? { rank: me.rank, of: rows.length } : null}
      challenge={
        challenge && progress
          ? { title: challenge.title, percent: Math.round(progress.fraction * 100) }
          : null
      }
      pendingDuels={pendingDuels}
    />
  );
}
