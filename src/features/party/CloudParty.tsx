// Party en la nube (B7 del plan del cambio, respuestas 69 y 77). Grupos reales que se abren con un
// código o un enlace, la tabla de la semana con el alias y el XP de cada miembro, retos del grupo y
// duelos entre dos alumnos que contestan las mismas preguntas cuando cada uno puede. Antes de compartir
// nada pide el permiso de Party (4.27). Con el modo enfoque se ocultan la tabla, el XP y los retos y
// se quedan los grupos, las invitaciones y los duelos, que son un compromiso de uno a uno que el alumno
// eligió (respuesta 82). Quien administra el grupo cambia el código, quita miembros y borra retos, y
// quien creó un reto también lo borra, siempre con confirmación.
import { Copy, KeyRound, Link2, LogOut, UserMinus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { getCloud } from '@/data/cloud/client';
import { uuidToUlid } from '@/data/cloud/cloudIds';
import {
  createPartyChallenge,
  createPartyDuel,
  deletePartyChallenge,
  fetchPartyOverview,
  removePartyMember,
  rotatePartyCode,
  type PartyChallenge,
  type PartyGroup,
} from '@/data/cloud/party';
import { useDataApi } from '@/data/context';
import { useLiveData } from '@/data/hooks';
import { newId } from '@/data/ids';
import type { AppEvent } from '@/data/schemas/events';
import {
  createCloudGroup,
  joinCloudGroup,
  leaveCloudGroup,
  stopSharingParty,
} from '@/data/usecases/partyCloud';
import { changeConsent } from '@/data/usecases/privacy';
import { currentConsents } from '@/data/usecases/profile';
import { weeklyLeaderboard } from '@/engines/party';
import { studyDayOf, weekStartOf } from '@/engines/studyDay';
import { t } from '@/i18n/es-MX';
import { Button } from '@/ui/components/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/ui/components/card';
import { Disclosure } from '@/ui/components/disclosure';
import { SkeletonRows } from '@/ui/components/skeleton';
import { ErrorState } from '@/ui/states/states';
import type { Snapshot } from '../home/snapshot';
import { reservedByStoredExam } from '../exam/examStorage';
import { dailyQuestions } from '../shared/dailyLimit';
import type { ReadySession } from '../shared/RequireSession';
import { ChallengeRow } from './ChallengeRow';
import { CloudDuelRow } from './CloudDuelRow';
import { contributionTo } from './cloudNumbers';
import { pickDuelQuestionIds } from './duelActions';
import {
  ConfirmAction,
  CreateGroupCard,
  JoinGroupCard,
  LeaderboardTable,
  MemberList,
  NewChallengeForm,
} from './GroupParts';
import { forgetInviteCode, inviteLink, inviteStore } from './inviteLink';
import { NewDuelForm } from './NewDuelForm';
import { useCloudParty } from './useCloudParty';

const text = t.partyCloud;

interface CloudPartyProps {
  session: ReadySession;
  events: AppEvent[];
  snapshot: Snapshot;
  /** Modo enfoque. Oculta la tabla, el XP y los retos */
  focus: boolean;
  /** El código del enlace de invitación con que se abrió la pantalla */
  inviteCode: string | null;
}

export function CloudParty(props: CloudPartyProps) {
  const api = useDataApi();
  const { user } = props.session;
  const consents = useLiveData(() => currentConsents(api, user.id), [api.repos, user.id]);
  if (consents === undefined) return <SkeletonRows label={text.loading} />;
  if (!consents.party)
    return <PartyConsentCard session={props.session} snapshot={props.snapshot} />;
  return <CloudGroups {...props} />;
}

/**
 * Sin el permiso de Party no se comparte nada. Si la cuenta sigue en grupos, por ejemplo porque dio el
 * permiso en otro dispositivo, lo dice y deja salir de todos con un toque
 */
function PartyConsentCard({ session, snapshot }: { session: ReadySession; snapshot: Snapshot }) {
  const api = useDataApi();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [stillIn, setStillIn] = useState(0);
  const weekStart = weekStartOf(snapshot.today);

  useEffect(() => {
    const cloud = getCloud();
    if (!cloud) return;
    let stopped = false;
    void fetchPartyOverview(cloud, weekStart).then((reply) => {
      if (!stopped && reply.ok) setStillIn(reply.value.groups.length);
    });
    return () => {
      stopped = true;
    };
  }, [weekStart]);

  const allow = async () => {
    setBusy(true);
    setMessage('');
    try {
      await changeConsent(api, session.user, 'party', true);
    } catch {
      setMessage(text.consent.failed);
    } finally {
      setBusy(false);
    }
  };
  const leaveAll = async () => {
    const cloud = getCloud();
    if (!cloud) return;
    setBusy(true);
    const reply = await stopSharingParty(cloud);
    setBusy(false);
    if (reply.ok) {
      setStillIn(0);
      setMessage(text.consent.leftAll);
    } else {
      setMessage(text.failures[reply.reason]);
    }
  };

  return (
    <Card aria-labelledby="permiso-party">
      <CardHeader>
        <CardTitle id="permiso-party">{text.consent.title}</CardTitle>
        <CardDescription>{text.consent.body}</CardDescription>
      </CardHeader>
      <p className="mb-3 text-sm text-fg-muted">{text.consent.hint}</p>
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={busy}
          onClick={() => {
            void allow();
          }}
        >
          {text.consent.allow}
        </Button>
        {stillIn > 0 ? (
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => {
              void leaveAll();
            }}
          >
            <LogOut aria-hidden />
            {text.consent.leaveAll}
          </Button>
        ) : null}
      </div>
      {stillIn > 0 ? <p className="mt-2 text-sm">{text.consent.stillIn(stillIn)}</p> : null}
      <p role="status" className="mt-2 min-h-5 text-sm">
        {message}
      </p>
    </Card>
  );
}

function CloudGroups({ session, events, snapshot, focus, inviteCode }: CloudPartyProps) {
  const api = useDataApi();
  const { user } = session;
  const { state, reload } = useCloudParty({
    enabled: true,
    userId: user.id,
    snapshot,
    events,
    timeZone: user.timeZone,
  });
  const subscription = useLiveData(
    () => api.repos.subscriptions.get(user.id).then((value) => value ?? null),
    [api.repos, user.id],
  );

  if (state.status === 'loading' || subscription === undefined) {
    return (
      <Card>
        <SkeletonRows label={text.loading} rows={4} />
      </Card>
    );
  }
  if (state.status === 'failed') {
    return (
      <Card>
        <ErrorState description={text.failures[state.reason]} onRetry={reload} />
      </Card>
    );
  }
  const { left: questionsLeft } = dailyQuestions({
    events,
    subscription,
    timeZone: user.timeZone,
    now: new Date(),
    reserved: reservedByStoredExam(user.id),
  });
  const { groups } = state.overview;

  const create = async (name: string) => {
    const cloud = getCloud();
    if (!cloud) return text.failures.network;
    const reply = await createCloudGroup(api, cloud, user, name);
    if (!reply.ok) return text.failures[reply.reason];
    if (reply.value.status !== 'created') return text.createResults[reply.value.status];
    reload();
    return null;
  };
  const join = async (code: string) => {
    const cloud = getCloud();
    if (!cloud) return text.failures.network;
    const reply = await joinCloudGroup(api, cloud, user, code);
    if (!reply.ok) return text.failures[reply.reason];
    if (reply.value.status === 'joined' || reply.value.status === 'already') {
      forgetInviteCode(inviteStore());
      reload();
    }
    return text.joinResults[reply.value.status];
  };

  return (
    <>
      {groups.map((group) => (
        <CloudGroupCard
          key={group.id}
          group={group}
          session={session}
          events={events}
          snapshot={snapshot}
          focus={focus}
          questionsLeft={questionsLeft}
          onChanged={reload}
        />
      ))}
      <div className="grid gap-4 md:grid-cols-2">
        <CreateGroupCard
          hint={groups.length === 0 ? text.createHint : null}
          simulatedOption={false}
          onCreate={create}
        />
        <JoinGroupCard hint={text.joinHint} initialCode={inviteCode} onJoin={join} />
      </div>
    </>
  );
}

export function CloudGroupCard({
  group,
  session,
  events,
  snapshot,
  focus,
  questionsLeft,
  onChanged,
}: {
  group: PartyGroup;
  session: ReadySession;
  events: AppEvent[];
  snapshot: Snapshot;
  focus: boolean;
  /** Preguntas que le quedan hoy según su plan. null es sin límite */
  questionsLeft: number | null;
  /** Algo cambió en el servidor y hay que volver a pedir el resumen */
  onChanged: () => void;
}) {
  const api = useDataApi();
  const { user } = session;
  const [copied, setCopied] = useState('');
  const [message, setMessage] = useState('');
  const [notice, setNotice] = useState('');
  const headingId = `grupo-${group.id}`;
  const members = group.members.map((member) => ({
    key: member.userId,
    alias: member.alias,
    isSelf: member.isSelf,
    isSimulated: false,
    // El XP propio va al día con la bitácora, aunque el servidor tenga el de la última publicación
    weeklyXp: member.isSelf ? snapshot.weeklyXp : member.weeklyXp,
  }));
  const rivals = group.members
    .filter((member) => !member.isSelf)
    .map((member) => ({ id: member.userId, alias: member.alias }));
  const admin = text.admin;

  const copy = async (value: string, done: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(done);
    } catch {
      setCopied(text.invite.copyFailed);
    }
  };
  const leave = async () => {
    const cloud = getCloud();
    if (!cloud) {
      setMessage(text.failures.network);
      return;
    }
    const reply = await leaveCloudGroup(api, cloud, user, group.id);
    if (reply.ok) onChanged();
    else setMessage(text.failures[reply.reason]);
  };
  const newChallenge = async (input: {
    title: string;
    metric: 'cards' | 'questions' | 'xp';
    target: number;
  }) => {
    const cloud = getCloud();
    if (!cloud) return text.failures.network;
    const reply = await createPartyChallenge(cloud, { groupId: group.id, ...input });
    if (!reply.ok) return text.failures[reply.reason];
    if (reply.value.status === 'limit') return text.challengeLimit;
    onChanged();
    return null;
  };
  // Lo que solo hace quien administra el grupo. Cada una devuelve null si salió bien o el mensaje
  const rotateCode = async () => {
    const cloud = getCloud();
    if (!cloud) return text.failures.network;
    const reply = await rotatePartyCode(cloud, group.id);
    if (!reply.ok) return text.failures[reply.reason];
    setNotice(admin.rotated);
    onChanged();
    return null;
  };
  const removeMember = async (memberId: string, alias: string) => {
    const cloud = getCloud();
    if (!cloud) return text.failures.network;
    const reply = await removePartyMember(cloud, { groupId: group.id, memberId });
    if (!reply.ok) return text.failures[reply.reason];
    setNotice(admin.removed(alias));
    onChanged();
    return null;
  };
  const deleteChallenge = async (challengeId: string) => {
    const cloud = getCloud();
    if (!cloud) return text.failures.network;
    const reply = await deletePartyChallenge(cloud, challengeId);
    if (!reply.ok) return text.failures[reply.reason];
    onChanged();
    return null;
  };
  const newDuel = async (rivalId: string) => {
    const cloud = getCloud();
    if (!cloud) return text.failures.network;
    // Una semilla nueva por duelo. Las preguntas quedan fijas en el servidor y los dos juegan esas
    const questionIds = await pickDuelQuestionIds(api, `duel|${newId()}`);
    if (questionIds.length === 0) return t.party.duel.noQuestions;
    const reply = await createPartyDuel(cloud, {
      groupId: group.id,
      opponentId: rivalId,
      questionIds,
    });
    if (!reply.ok) return text.failures[reply.reason];
    if (reply.value.status !== 'created') return text.duels.results[reply.value.status];
    onChanged();
    return null;
  };

  return (
    <Card aria-labelledby={headingId}>
      <CardHeader>
        <CardTitle id={headingId}>{group.name}</CardTitle>
        <CardDescription>{text.members(group.members.length)}</CardDescription>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
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
              void copy(group.inviteCode, text.invite.codeCopied);
            }}
          >
            <Copy aria-hidden />
            {text.invite.copyCode}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              void copy(
                inviteLink(group.inviteCode, window.location.origin, import.meta.env.BASE_URL),
                text.invite.linkCopied,
              );
            }}
          >
            <Link2 aria-hidden />
            {text.invite.copyLink}
          </Button>
          <span role="status" className="text-fg-muted">
            {copied}
          </span>
        </div>
        {group.isOwner ? (
          <div className="mt-2 flex flex-col gap-2 text-sm">
            <p className="text-fg-muted">{admin.youAdminister}</p>
            <ConfirmAction
              label={admin.rotateCode}
              icon={<KeyRound aria-hidden />}
              confirmText={admin.rotateConfirm}
              confirmLabel={admin.rotateYes}
              onConfirm={rotateCode}
            />
          </div>
        ) : null}
      </CardHeader>

      {focus ? (
        <>
          <h3 className="font-medium">{text.membersTitle}</h3>
          <MemberList members={members} />
        </>
      ) : (
        <>
          <h3 className="font-medium">{t.party.leaderboard}</h3>
          <p className="mb-2 text-sm text-fg-muted">{text.weekNote}</p>
          <LeaderboardTable rows={weeklyLeaderboard(members)} />

          <h3 className="mt-4 font-medium">{t.party.challenges}</h3>
          {group.challenges.length === 0 ? (
            <p className="text-sm text-fg-muted">{t.party.noChallenges}</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {group.challenges.map((challenge) => (
                <CloudChallengeRow
                  key={challenge.id}
                  challenge={challenge}
                  groupId={group.id}
                  session={session}
                  events={events}
                  snapshot={snapshot}
                  onClaimed={onChanged}
                  onDelete={
                    group.isOwner || challenge.createdBySelf
                      ? () => deleteChallenge(challenge.id)
                      : undefined
                  }
                />
              ))}
            </ul>
          )}
          <NewChallengeForm onCreate={newChallenge} />
        </>
      )}

      <h3 className="mt-4 font-medium">{text.duels.title}</h3>
      {group.duels.length === 0 ? (
        <p className="text-sm text-fg-muted">{text.duels.empty}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {group.duels.map((duel) => (
            <CloudDuelRow
              key={duel.id}
              duel={duel}
              members={group.members}
              session={session}
              events={events}
              questionsLeft={questionsLeft}
            />
          ))}
        </ul>
      )}
      <NewDuelForm rivals={rivals} onCreate={newDuel} emptyText={text.duels.noRivals} />

      {group.isOwner && rivals.length > 0 ? (
        <Disclosure title={admin.membersTitle} className="mt-4">
          <ul className="flex flex-col gap-3">
            {rivals.map((member) => (
              <li key={member.id} className="flex flex-col gap-1">
                <span className="text-sm font-medium">{member.alias}</span>
                <ConfirmAction
                  label={admin.remove(member.alias)}
                  icon={<UserMinus aria-hidden />}
                  confirmText={admin.removeConfirm(member.alias)}
                  confirmLabel={admin.removeYes}
                  onConfirm={() => removeMember(member.id, member.alias)}
                />
              </li>
            ))}
          </ul>
        </Disclosure>
      ) : null}

      <Button
        variant="ghost"
        size="sm"
        className="mt-4 self-start"
        onClick={() => {
          void leave();
        }}
      >
        <LogOut aria-hidden />
        {t.party.leave}
      </Button>
      {message ? (
        <p role="alert" className="text-sm text-danger">
          {message}
        </p>
      ) : null}
      {notice ? (
        <p role="status" className="text-sm">
          {notice}
        </p>
      ) : null}
    </Card>
  );
}

/**
 * Un reto del grupo en la nube. El total es lo que publicó cada miembro, con el aporte propio al día
 * según la bitácora. El premio queda en la bitácora con los ids del reto y del grupo como ULID
 */
function CloudChallengeRow({
  challenge,
  groupId,
  session,
  events,
  snapshot,
  onClaimed,
  onDelete,
}: {
  challenge: PartyChallenge;
  groupId: string;
  session: ReadySession;
  events: AppEvent[];
  snapshot: Snapshot;
  onClaimed: () => void;
  /** Solo para quien administra el grupo o quien creó el reto */
  onDelete?: () => Promise<string | null>;
}) {
  const own = contributionTo(challenge, snapshot, session.user.timeZone);
  const challengeId = uuidToUlid(challenge.id);
  const groupRef = uuidToUlid(groupId);
  if (!challengeId || !groupRef) return null;
  return (
    <ChallengeRow
      title={challenge.title}
      metric={challenge.metric}
      total={Math.max(0, challenge.total - (challenge.mine ?? 0) + own)}
      target={challenge.target}
      selfContribution={own}
      simulated={false}
      ended={studyDayOf(new Date(challenge.endsAt), session.user.timeZone) < snapshot.today}
      claimIds={{ challengeId, groupId: groupRef }}
      events={events}
      session={session}
      snapshot={snapshot}
      onClaimed={onClaimed}
      onDelete={onDelete}
    />
  );
}
