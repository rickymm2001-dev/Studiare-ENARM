// Party simulada en el navegador (9.6, 3.2). Sin servidor, los grupos viven en esta base. Crear un
// grupo puede sumar compañeros simulados, marcados como tales, para ver la tabla y los retos.
import { createEvent } from '@/data/events/createEvent';
import { newId } from '@/data/ids';
import { generateInviteCode, isValidInviteCode, MAX_GROUP_MEMBERS } from '@/engines/party';
import { createRng } from '@/engines/random';
import type { DataApi } from '../context';
import type { Challenge, Group, Membership } from '../schemas/activity';
import type { User } from '../schemas/people';

type Api = Pick<DataApi, 'repos' | 'recordEvent'>;

/** Alias de los compañeros simulados. Ficticios */
const SIMULATED_ALIASES = ['Ana R.', 'Diego M.', 'Sofía L.', 'Luis P.', 'Valeria C.', 'Emilio G.'];

const ctxOf = (user: User) => ({ userId: user.id, tz: user.timeZone });

async function joinAs(api: Api, user: User, group: Group): Promise<Membership> {
  const membership = await api.repos.memberships.put({
    id: newId(),
    groupId: group.id,
    userId: user.id,
    alias: user.alias,
    isSimulated: false,
    joinedAt: new Date().toISOString(),
    leftAt: null,
  });
  await api.recordEvent(createEvent('party_joined', { groupId: group.id }, ctxOf(user)));
  return membership;
}

export async function createGroup(
  api: Api,
  user: User,
  input: { name: string; withSimulatedFriends: boolean },
): Promise<Group> {
  const id = newId();
  const now = new Date().toISOString();
  const group = await api.repos.groups.put({
    id,
    name: input.name.trim(),
    inviteCode: generateInviteCode(createRng(`invite|${id}`)),
    ownerId: user.id,
    isSimulated: input.withSimulatedFriends,
    createdAt: now,
  });
  await joinAs(api, user, group);
  if (input.withSimulatedFriends) {
    await api.repos.memberships.putMany(
      SIMULATED_ALIASES.map((alias) => ({
        id: newId(),
        groupId: id,
        userId: newId(),
        alias,
        isSimulated: true,
        joinedAt: now,
        leftAt: null,
      })),
    );
    const startsAt = new Date();
    await api.repos.challenges.put({
      id: newId(),
      groupId: id,
      kind: 'collective',
      title: 'Repasen 1,000 tarjetas esta semana',
      metric: 'cards',
      target: 1000,
      isSimulated: true,
      startsAt: startsAt.toISOString(),
      endsAt: new Date(startsAt.getTime() + 7 * 86_400_000).toISOString(),
    });
  }
  return group;
}

export type JoinResult = 'joined' | 'already' | 'not_found' | 'invalid' | 'full';

export async function joinGroupByCode(api: Api, user: User, rawCode: string): Promise<JoinResult> {
  const code = rawCode.trim().toUpperCase();
  if (!isValidInviteCode(code)) return 'invalid';
  const group = (await api.repos.groups.list()).find((item) => item.inviteCode === code);
  if (!group) return 'not_found';
  const members = (await api.repos.memberships.list()).filter(
    (item) => item.groupId === group.id && item.leftAt === null,
  );
  if (members.some((item) => item.userId === user.id)) return 'already';
  if (members.length >= MAX_GROUP_MEMBERS) return 'full';
  await joinAs(api, user, group);
  return 'joined';
}

export async function leaveGroup(api: Api, user: User, membership: Membership): Promise<void> {
  await api.repos.memberships.put({ ...membership, leftAt: new Date().toISOString() });
  await api.recordEvent(createEvent('party_left', { groupId: membership.groupId }, ctxOf(user)));
}

export async function createChallenge(
  api: Api,
  group: Group,
  input: Pick<Challenge, 'title' | 'metric' | 'target'>,
): Promise<Challenge> {
  const startsAt = new Date();
  return api.repos.challenges.put({
    id: newId(),
    groupId: group.id,
    kind: 'collective',
    title: input.title.trim(),
    metric: input.metric,
    target: input.target,
    isSimulated: group.isSimulated,
    startsAt: startsAt.toISOString(),
    endsAt: new Date(startsAt.getTime() + 7 * 86_400_000).toISOString(),
  });
}

/**
 * Reta a un compañero a un duelo con las mismas preguntas para los dos (9.6). Las preguntas se fijan
 * al crearlo, así un banco que cambia después no cambia el duelo. Quien llama las elige con una
 * semilla que sale del id del duelo
 */
export async function createDuel(
  api: Pick<DataApi, 'repos'>,
  group: Group,
  input: {
    id: string;
    title: string;
    opponent: Pick<Membership, 'id'>;
    questionIds: readonly string[];
  },
): Promise<Challenge> {
  if (input.questionIds.length === 0) throw new RangeError('Un duelo necesita preguntas');
  const startsAt = new Date();
  return api.repos.challenges.put({
    id: input.id,
    groupId: group.id,
    kind: 'duel',
    title: input.title.trim(),
    metric: 'accuracy',
    target: input.questionIds.length,
    isSimulated: group.isSimulated,
    startsAt: startsAt.toISOString(),
    endsAt: new Date(startsAt.getTime() + 7 * 86_400_000).toISOString(),
    opponentId: input.opponent.id,
    questionIds: [...input.questionIds],
  });
}
