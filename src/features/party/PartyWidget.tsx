// Widget de Party para Inicio (9.1). Tu lugar en la tabla de tu primer grupo y su reto activo.
import { Link } from 'react-router';
import { screenPath } from '@/app/screens';
import { useDataApi } from '@/data/context';
import { useLiveData } from '@/data/hooks';
import { collectiveProgress, weeklyLeaderboard } from '@/engines/party';
import { studyDayOf } from '@/engines/studyDay';
import { t } from '@/i18n/es-MX';
import { Button } from '@/ui/components/button';
import { SimulatedDataLabel } from '@/ui/components/labels';
import type { Snapshot } from '../home/snapshot';
import type { ReadySession } from '../shared/RequireSession';
import { challengeContributions, memberStats } from './stats';

export function PartyWidget({ session, snapshot }: { session: ReadySession; snapshot: Snapshot }) {
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
    return { mine, group, members, challenge: challenges.at(-1) ?? null };
  }, [api.repos, user.id]);

  if (data === undefined) return null;
  if (data === null) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-sm text-fg-muted">{t.widgets.party.empty}</p>
        <Button asChild size="sm" variant="secondary" className="self-start">
          <Link to={screenPath('party')}>{t.widgets.party.go}</Link>
        </Button>
      </div>
    );
  }
  const rows = weeklyLeaderboard(memberStats(data.members, { userId: user.id, snapshot }));
  const me = rows.find((row) => row.memberId === data.mine.id);
  const challenge = data.challenge;
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
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{data.group.name}</span>
        {data.group.isSimulated ? <SimulatedDataLabel /> : null}
      </div>
      {me ? (
        <p className="text-2xl font-semibold">{t.widgets.party.rank(me.rank, rows.length)}</p>
      ) : null}
      {challenge && progress ? (
        <p className="text-sm text-fg-muted">
          {challenge.title} · {Math.round(progress.fraction * 100)}%
        </p>
      ) : null}
      <Link className="text-sm underline" to={screenPath('party')}>
        {t.widgets.party.go}
      </Link>
    </div>
  );
}
