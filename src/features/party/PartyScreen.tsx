// Party (pantalla 14). Grupos con código de invitación, tabla semanal por XP desde el lunes a las
// 4 a. m., retos colectivos y duelos con las mismas preguntas. Se comparte alias, XP, nivel y racha, y
// en un duelo cuántas acertaste y cuánto tardaste en esas preguntas (9.6). Sin servidor, todo vive en
// este navegador y los compañeros simulados van marcados.
import { Copy, LogOut, Plus, Users } from 'lucide-react';
import { useState, type SyntheticEvent } from 'react';
import { ScreenHeader } from '@/app/layout/ScreenHeader';
import { useDataApi } from '@/data/context';
import { useLiveData } from '@/data/hooks';
import type { Challenge, Group, Membership } from '@/data/schemas/activity';
import type { AppEvent } from '@/data/schemas/events';
import {
  createChallenge,
  createGroup,
  joinGroupByCode,
  leaveGroup,
  type JoinResult,
} from '@/data/usecases/party';
import { weeklyLeaderboard } from '@/engines/party';
import { t } from '@/i18n/es-MX';
import { Button } from '@/ui/components/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/ui/components/card';
import { CheckboxField, SelectField, TextField } from '@/ui/components/field';
import { SimulatedDataLabel } from '@/ui/components/labels';
import { LoadingState } from '@/ui/states/states';
import { buildSnapshot, type Snapshot } from '../home/snapshot';
import { reservedByStoredExam } from '../exam/examStorage';
import { dailyQuestions } from '../shared/dailyLimit';
import { RequireSession, type ReadySession } from '../shared/RequireSession';
import { useUserEvents } from '../shared/useUserEvents';
import { ReferralCard } from './ReferralCard';
import { AchievementShare } from './AchievementShare';
import { ChallengeRow } from './ChallengeRow';
import { DuelRow } from './DuelRow';
import { NewDuelForm } from './NewDuelForm';
import { memberStats, type ChallengeMetric } from './stats';

export function PartyScreen() {
  return <RequireSession screen="party">{(session) => <Party session={session} />}</RequireSession>;
}

function Party({ session }: { session: ReadySession }) {
  const api = useDataApi();
  const { user, settings } = session;
  const events = useUserEvents(user.id);
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

  const header = (
    <ScreenHeader title={t.screens.party.title} description={t.screens.party.description} />
  );
  if (events === undefined || data === undefined || subscription === undefined) {
    return (
      <>
        {header}
        <LoadingState />
      </>
    );
  }
  const now = new Date();
  const snapshot = buildSnapshot({ events, user, settings, now });
  const { left: questionsLeft } = dailyQuestions({
    events,
    subscription,
    timeZone: user.timeZone,
    now,
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
      {header}
      <p className="text-sm text-fg-muted">{t.party.privacy}</p>
      <AchievementShare snapshot={snapshot} alias={user.alias} simulated={session.isDemo} />
      {myGroups.map(({ group, membership }) => (
        <GroupCard
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
        />
      ))}
      <div className="grid gap-4 md:grid-cols-2">
        <CreateGroupCard session={session} first={myGroups.length === 0} />
        <JoinGroupCard session={session} />
      </div>
      <ReferralCard />
    </>
  );
}

function CreateGroupCard({ session, first }: { session: ReadySession; first: boolean }) {
  const api = useDataApi();
  const [name, setName] = useState('');
  const [withFriends, setWithFriends] = useState(true);
  const submit = async (event: SyntheticEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    await createGroup(api, session.user, { name, withSimulatedFriends: withFriends });
    setName('');
  };
  return (
    <Card aria-labelledby="crear-grupo">
      <CardHeader>
        <CardTitle id="crear-grupo">{t.party.createTitle}</CardTitle>
        {first ? <CardDescription>{t.party.createHint}</CardDescription> : null}
      </CardHeader>
      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          void submit(event);
        }}
      >
        <TextField
          label={t.party.groupName}
          value={name}
          maxLength={60}
          required
          onChange={(event) => {
            setName(event.target.value);
          }}
        />
        <CheckboxField
          label={t.party.withFriends}
          checked={withFriends}
          onChange={(event) => {
            setWithFriends(event.target.checked);
          }}
        />
        <Button type="submit" className="self-start">
          <Plus aria-hidden />
          {t.party.create}
        </Button>
      </form>
    </Card>
  );
}

function JoinGroupCard({ session }: { session: ReadySession }) {
  const api = useDataApi();
  const [code, setCode] = useState('');
  const [result, setResult] = useState<JoinResult | null>(null);
  const submit = async (event: SyntheticEvent) => {
    event.preventDefault();
    setResult(await joinGroupByCode(api, session.user, code));
  };
  return (
    <Card aria-labelledby="unirse-grupo">
      <CardHeader>
        <CardTitle id="unirse-grupo">{t.party.joinTitle}</CardTitle>
        <CardDescription>{t.party.joinHint}</CardDescription>
      </CardHeader>
      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          void submit(event);
        }}
      >
        <TextField
          label={t.party.code}
          value={code}
          maxLength={6}
          autoCapitalize="characters"
          spellCheck={false}
          onChange={(event) => {
            setCode(event.target.value.toUpperCase());
            setResult(null);
          }}
        />
        <Button type="submit" variant="secondary" className="self-start">
          <Users aria-hidden />
          {t.party.join}
        </Button>
        {result ? (
          <p role="status" className="text-sm">
            {t.party.joinResults[result]}
          </p>
        ) : null}
      </form>
    </Card>
  );
}

function GroupCard({
  group,
  membership,
  members,
  challenges,
  snapshot,
  events,
  session,
  questionsLeft,
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
}) {
  const api = useDataApi();
  const { user } = session;
  const [copied, setCopied] = useState(false);
  const rows = weeklyLeaderboard(memberStats(members, { userId: user.id, snapshot }));

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
            <strong className="font-mono tracking-widest">{group.inviteCode}</strong>
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

      <h3 className="font-medium">{t.party.leaderboard}</h3>
      <p className="mb-2 text-sm text-fg-muted">{t.party.weekNote}</p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-fg-muted">
              <th scope="col" className="py-1 pr-2">
                #
              </th>
              <th scope="col" className="py-1 pr-2">
                {t.party.alias}
              </th>
              <th scope="col" className="py-1 pr-2 text-right">
                {t.party.level}
              </th>
              <th scope="col" className="py-1 pr-2 text-right">
                {t.party.streak}
              </th>
              <th scope="col" className="py-1 text-right">
                {t.party.weeklyXp}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.memberId}
                className={row.memberId === membership.id ? 'bg-primary-soft font-semibold' : ''}
              >
                <td className="py-1 pr-2">{row.rank}</td>
                <td className="py-1 pr-2">
                  {row.alias}
                  {row.memberId === membership.id ? ` (${t.party.you})` : ''}
                  {row.isSimulated ? (
                    <span className="ml-1 text-xs text-fg-muted">· {t.party.simulated}</span>
                  ) : null}
                </td>
                <td className="py-1 pr-2 text-right">{row.level}</td>
                <td className="py-1 pr-2 text-right">{row.streak}</td>
                <td className="py-1 text-right">{row.weeklyXp.toLocaleString('es-MX')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 className="mt-4 font-medium">{t.party.challenges}</h3>
      {challenges.length === 0 ? (
        <p className="text-sm text-fg-muted">{t.party.noChallenges}</p>
      ) : null}
      <ul className="flex flex-col gap-3">
        {challenges.map((challenge) =>
          challenge.kind === 'duel' ? (
            <DuelRow
              key={challenge.id}
              challenge={challenge}
              rival={members.find((member) => member.id === challenge.opponentId)}
              self={membership}
              events={events}
              session={session}
              questionsLeft={questionsLeft}
            />
          ) : (
            <ChallengeRow
              key={challenge.id}
              challenge={challenge}
              members={members}
              snapshot={snapshot}
              events={events}
              session={session}
            />
          ),
        )}
      </ul>
      <NewChallengeForm group={group} />
      <NewDuelForm group={group} members={members} selfId={membership.id} />

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

function NewChallengeForm({ group }: { group: Group }) {
  const api = useDataApi();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [metric, setMetric] = useState<ChallengeMetric>('cards');
  const [target, setTarget] = useState('500');
  if (!open) {
    return (
      <Button
        variant="secondary"
        size="sm"
        className="mt-3 self-start"
        onClick={() => {
          setOpen(true);
        }}
      >
        <Plus aria-hidden />
        {t.party.newChallenge}
      </Button>
    );
  }
  const submit = async (event: SyntheticEvent) => {
    event.preventDefault();
    const value = Number(target);
    if (!title.trim() || !(value > 0)) return;
    await createChallenge(api, group, { title, metric, target: value });
    setOpen(false);
    setTitle('');
  };
  return (
    <form
      className="mt-3 grid gap-3 rounded-md border border-line p-3 sm:grid-cols-3"
      onSubmit={(event) => {
        void submit(event);
      }}
    >
      <TextField
        label={t.party.challengeTitle}
        value={title}
        maxLength={80}
        required
        onChange={(event) => {
          setTitle(event.target.value);
        }}
      />
      <SelectField
        label={t.party.metric}
        value={metric}
        options={(['cards', 'questions', 'xp'] as const).map((value) => ({
          value,
          label: t.party.metrics[value],
        }))}
        onChange={(event) => {
          setMetric(event.target.value as ChallengeMetric);
        }}
      />
      <TextField
        label={t.party.target}
        type="number"
        min={1}
        value={target}
        onChange={(event) => {
          setTarget(event.target.value);
        }}
      />
      <div className="flex gap-2 sm:col-span-3">
        <Button type="submit" size="sm">
          {t.party.createChallenge}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            setOpen(false);
          }}
        >
          {t.party.cancel}
        </Button>
      </div>
    </form>
  );
}
