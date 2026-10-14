// Party de la demostración (9.6, B7 del plan del cambio). Grupos con código de invitación, tabla de la
// semana, retos colectivos y duelos contra compañeros simulados, todo en la base de demostración de
// este navegador y marcado como simulado (D-028, 4.1). Con el modo enfoque se ocultan la tabla, el XP
// y los retos y se quedan los grupos, las invitaciones y los duelos (respuesta 82).
import { Copy, LogOut } from 'lucide-react';
import { useState } from 'react';
import { useDataApi } from '@/data/context';
import { useLiveData } from '@/data/hooks';
import type { Challenge, Group, Membership } from '@/data/schemas/activity';
import type { AppEvent } from '@/data/schemas/events';
import { createChallenge, createGroup, joinGroupByCode, leaveGroup } from '@/data/usecases/party';
import { weeklyLeaderboard } from '@/engines/party';
import { t } from '@/i18n/es-MX';
import { Button } from '@/ui/components/button';
import { Card, CardHeader, CardTitle } from '@/ui/components/card';
import { SimulatedDataLabel } from '@/ui/components/labels';
import { LoadingState } from '@/ui/states/states';
import type { Snapshot } from '../home/snapshot';
import { reservedByStoredExam } from '../exam/examStorage';
import { dailyQuestions } from '../shared/dailyLimit';
import type { ReadySession } from '../shared/RequireSession';
import { DemoChallengeRow } from './ChallengeRow';
import { challengeToDuel } from './duelActions';
import { DuelRow } from './DuelRow';
import {
  CreateGroupCard,
  JoinGroupCard,
  LeaderboardTable,
  MemberList,
  NewChallengeForm,
} from './GroupParts';
import { NewDuelForm } from './NewDuelForm';
import { memberStats } from './stats';

export function DemoParty({
  session,
  events,
  snapshot,
  focus,
  inviteCode,
}: {
  session: ReadySession;
  events: AppEvent[];
  snapshot: Snapshot;
  focus: boolean;
  inviteCode: string | null;
}) {
  const api = useDataApi();
  const { user } = session;
  const data = useLiveData(async () => {
    const [groups, memberships, challenges] = await Promise.all([
      api.repos.groups.list(),
      api.repos.memberships.list(),
      api.repos.challenges.list(),
    ]);
    return { groups, memberships, challenges };
  }, [api.repos]);
  const subscription = useLiveData(
    () => api.repos.subscriptions.get(user.id).then((value) => value ?? null),
    [api.repos, user.id],
  );

  if (data === undefined || subscription === undefined) return <LoadingState />;
  const { left: questionsLeft } = dailyQuestions({
    events,
    subscription,
    timeZone: user.timeZone,
    now: new Date(),
    reserved: reservedByStoredExam(user.id),
  });
  const mine = data.memberships.filter((item) => item.userId === user.id && item.leftAt === null);
  const myGroups = mine
    .map((membership) => ({
      membership,
      group: data.groups.find((group) => group.id === membership.groupId),
    }))
    .filter((entry): entry is { membership: Membership; group: Group } => Boolean(entry.group));

  return (
    <>
      {myGroups.map(({ group, membership }) => (
        <DemoGroupCard
          key={group.id}
          group={group}
          membership={membership}
          members={data.memberships.filter(
            (item) => item.groupId === group.id && item.leftAt === null,
          )}
          challenges={data.challenges.filter((item) => item.groupId === group.id)}
          snapshot={snapshot}
          events={events}
          session={session}
          questionsLeft={questionsLeft}
          focus={focus}
        />
      ))}
      <div className="grid gap-4 md:grid-cols-2">
        <CreateGroupCard
          hint={myGroups.length === 0 ? t.party.createHint : null}
          simulatedOption
          onCreate={async (name, withSimulatedFriends) => {
            await createGroup(api, user, { name, withSimulatedFriends });
            return null;
          }}
        />
        <JoinGroupCard
          hint={t.party.joinHint}
          initialCode={inviteCode}
          onJoin={async (code) => t.party.joinResults[await joinGroupByCode(api, user, code)]}
        />
      </div>
    </>
  );
}

function DemoGroupCard({
  group,
  membership,
  members,
  challenges,
  snapshot,
  events,
  session,
  questionsLeft,
  focus,
}: {
  group: Group;
  membership: Membership;
  members: Membership[];
  challenges: Challenge[];
  snapshot: Snapshot;
  events: AppEvent[];
  session: ReadySession;
  /** Preguntas que le quedan hoy según su plan. null es sin límite */
  questionsLeft: number | null;
  focus: boolean;
}) {
  const api = useDataApi();
  const { user } = session;
  const [copied, setCopied] = useState(false);
  const entries = memberStats(members, { userId: user.id, snapshot }).map((stats) => ({
    key: stats.memberId,
    alias: stats.alias,
    isSelf: stats.memberId === membership.id,
    isSimulated: stats.isSimulated,
    weeklyXp: stats.weeklyXp,
  }));
  const collective = challenges.filter((item) => item.kind === 'collective');
  const duels = challenges.filter((item) => item.kind === 'duel');
  const rivals = members.filter((member) => member.isSimulated && member.id !== membership.id);

  return (
    <Card aria-labelledby={`grupo-${group.id}`}>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle id={`grupo-${group.id}`}>{group.name}</CardTitle>
          {group.isSimulated ? <SimulatedDataLabel /> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span>
            {t.party.inviteCode}{' '}
            <strong className="font-mono tracking-widest" data-testid="party-invite-code">
              {group.inviteCode}
            </strong>
          </span>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              void navigator.clipboard.writeText(group.inviteCode).then(() => {
                setCopied(true);
              });
            }}
          >
            <Copy aria-hidden />
            {copied ? t.party.copied : t.party.copy}
          </Button>
        </div>
      </CardHeader>

      {focus ? (
        <>
          <h3 className="font-medium">{t.partyCloud.membersTitle}</h3>
          <MemberList members={entries} />
        </>
      ) : (
        <>
          <h3 className="font-medium">{t.party.leaderboard}</h3>
          <p className="mb-2 text-sm text-fg-muted">{t.party.weekNote}</p>
          <LeaderboardTable rows={weeklyLeaderboard(entries)} />

          <h3 className="mt-4 font-medium">{t.party.challenges}</h3>
          {collective.length === 0 ? (
            <p className="text-sm text-fg-muted">{t.party.noChallenges}</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {collective.map((challenge) => (
                <DemoChallengeRow
                  key={challenge.id}
                  challenge={challenge}
                  members={members}
                  snapshot={snapshot}
                  events={events}
                  session={session}
                />
              ))}
            </ul>
          )}
          <NewChallengeForm
            onCreate={async (input) => {
              await createChallenge(api, group, input);
              return null;
            }}
          />
        </>
      )}

      <h3 className="mt-4 font-medium">{t.partyCloud.duels.title}</h3>
      {duels.length === 0 ? (
        <p className="text-sm text-fg-muted">{t.partyCloud.duels.empty}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {duels.map((challenge) => (
            <DuelRow
              key={challenge.id}
              challenge={challenge}
              rival={members.find((member) => member.id === challenge.opponentId)}
              self={membership}
              events={events}
              session={session}
              questionsLeft={questionsLeft}
            />
          ))}
        </ul>
      )}
      <NewDuelForm
        rivals={rivals}
        emptyText={t.partyCloud.duels.demoNoRivals}
        onCreate={async (rivalId) => {
          const rival = rivals.find((member) => member.id === rivalId);
          if (!rival) return t.party.duel.createFailed;
          const duel = await challengeToDuel(api, group, rival);
          return duel ? null : t.party.duel.noQuestions;
        }}
      />

      <Button
        variant="ghost"
        size="sm"
        className="mt-4 self-start"
        onClick={() => {
          void leaveGroup(api, user, membership);
        }}
      >
        <LogOut aria-hidden />
        {t.party.leave}
      </Button>
    </Card>
  );
}
