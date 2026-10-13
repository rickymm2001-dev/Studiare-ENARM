// Party en la nube (B7 del plan del cambio, respuestas 69 y 77). Lo que hace el alumno con sus grupos
// reales, sobre las llamadas de src/data/cloud/party.ts. Crear, entrar y salir quedan también en su
// bitácora, como en la Party de la demostración. Las cifras que publica salen de su bitácora, que el
// grupo nunca ve, y solo se mandan cuando cambian.
import type { SupabaseClient } from '@supabase/supabase-js';
import { isValidInviteCode } from '@/engines/party';
import { uuidToUlid } from '../cloud/cloudIds';
import {
  createPartyGroup,
  joinPartyGroup,
  leaveAllPartyGroups,
  leavePartyGroup,
  normalizeInviteCode,
  publishPartyNumbers,
  submitPartyDuelResult,
  type CreateGroupOutcome,
  type JoinGroupOutcome,
  type PartyNumbers,
  type PartyOverview,
  type PartyReply,
} from '../cloud/party';
import type { DataApi } from '../context';
import { createEvent } from '../events/createEvent';
import type { User } from '../schemas/people';

type Api = Pick<DataApi, 'recordEvent'>;
type Rpc = Pick<SupabaseClient, 'rpc'>;

/**
 * Deja en la bitácora que entró o salió de un grupo. La nube usa uuid y la bitácora ULID, que son el
 * mismo número de 128 bits, así que el id se convierte sin perder nada (cloudIds.ts)
 */
async function recordMembership(
  api: Api,
  user: Pick<User, 'id' | 'timeZone'>,
  type: 'party_joined' | 'party_left',
  cloudGroupId: string,
) {
  const groupId = uuidToUlid(cloudGroupId);
  if (!groupId) return;
  await api.recordEvent(createEvent(type, { groupId }, { userId: user.id, tz: user.timeZone }));
}

export async function createCloudGroup(
  api: Api,
  cloud: Rpc,
  user: Pick<User, 'id' | 'timeZone'>,
  name: string,
): Promise<PartyReply<CreateGroupOutcome>> {
  const reply = await createPartyGroup(cloud, name.trim());
  if (reply.ok && reply.value.status === 'created') {
    await recordMembership(api, user, 'party_joined', reply.value.groupId);
  }
  return reply;
}

/**
 * Entra con el código de un grupo. Un código con forma inválida ni se manda, para no gastar los intentos
 * por hora del servidor en un error de dedo
 */
export async function joinCloudGroup(
  api: Api,
  cloud: Rpc,
  user: Pick<User, 'id' | 'timeZone'>,
  rawCode: string,
): Promise<PartyReply<JoinGroupOutcome>> {
  const code = normalizeInviteCode(rawCode);
  if (!isValidInviteCode(code)) return { ok: true, value: { status: 'invalid' } };
  const reply = await joinPartyGroup(cloud, code);
  if (reply.ok && reply.value.status === 'joined') {
    await recordMembership(api, user, 'party_joined', reply.value.groupId);
  }
  return reply;
}

export async function leaveCloudGroup(
  api: Api,
  cloud: Rpc,
  user: Pick<User, 'id' | 'timeZone'>,
  groupId: string,
): Promise<PartyReply<boolean>> {
  const reply = await leavePartyGroup(cloud, groupId);
  if (reply.ok && reply.value) await recordMembership(api, user, 'party_left', groupId);
  return reply;
}

/**
 * Deja de compartir. Es lo que pasa al retirar el permiso de Party, que es el que deja compartir el
 * alias y el XP con los grupos. Sale de todos sus grupos en la nube
 */
export function stopSharingParty(cloud: Rpc): Promise<PartyReply<number>> {
  return leaveAllPartyGroups(cloud);
}

/** Lo que el alumno calculó de sí mismo con su bitácora */
export interface MyPartyNumbers {
  weeklyXp: number;
  /** Aporte a cada reto abierto, por id del reto en la nube */
  contributions: ReadonlyMap<string, number>;
}

/** Lo que falta publicar para que el grupo vea las cifras al día. null si ya está todo */
export function pendingNumbers(overview: PartyOverview, mine: MyPartyNumbers): PartyNumbers | null {
  if (overview.groups.length === 0) return null;
  const xpChanged = overview.groups.some((group) =>
    group.members.some((member) => member.isSelf && member.weeklyXp !== mine.weeklyXp),
  );
  const challenges = new Map(
    overview.groups.flatMap((group) => group.challenges.map((item) => [item.id, item] as const)),
  );
  const contributions = [...mine.contributions]
    .filter(([challengeId, amount]) => {
      const challenge = challenges.get(challengeId);
      return challenge !== undefined && challenge.mine !== amount;
    })
    .map(([challengeId, amount]) => ({ challengeId, amount }));
  if (!xpChanged && contributions.length === 0) return null;
  return { weekStart: overview.weekStart, weeklyXp: mine.weeklyXp, contributions };
}

/** El resumen con las cifras propias ya publicadas, sin volver a pedirlo al servidor */
export function withPublishedNumbers(
  overview: PartyOverview,
  numbers: PartyNumbers,
): PartyOverview {
  const amounts = new Map(numbers.contributions.map((item) => [item.challengeId, item.amount]));
  return {
    ...overview,
    groups: overview.groups.map((group) => ({
      ...group,
      members: group.members.map((member) =>
        member.isSelf ? { ...member, weeklyXp: numbers.weeklyXp } : member,
      ),
      challenges: group.challenges.map((challenge) => {
        const amount = amounts.get(challenge.id);
        if (amount === undefined) return challenge;
        return {
          ...challenge,
          total: Math.max(0, challenge.total - (challenge.mine ?? 0) + amount),
          mine: amount,
        };
      }),
    })),
  };
}

/** Publica lo que cambió y devuelve el resumen al día. Si no cambió nada, no llama al servidor */
export async function publishMyNumbers(
  cloud: Rpc,
  overview: PartyOverview,
  mine: MyPartyNumbers,
): Promise<PartyReply<PartyOverview>> {
  const pending = pendingNumbers(overview, mine);
  if (!pending) return { ok: true, value: overview };
  const reply = await publishPartyNumbers(cloud, pending);
  return reply.ok ? { ok: true, value: withPublishedNumbers(overview, pending) } : reply;
}

/** Un duelo que el alumno ya jugó en este dispositivo y el servidor todavía no tiene */
export interface PlayedDuel {
  duelId: string;
  correct: number;
  totalMs: number;
}

/**
 * Manda los resultados de los duelos ya jugados, cada uno una sola vez, porque el servidor no deja
 * cambiar el primero. Devuelve cuántos guardó el servidor en esta llamada. Uno que falla se intenta
 * de nuevo la próxima vez que se abra Party
 */
export async function submitPlayedDuels(
  cloud: Rpc,
  played: readonly PlayedDuel[],
): Promise<number> {
  let saved = 0;
  for (const duel of played) {
    const reply = await submitPartyDuelResult(cloud, duel);
    if (reply.ok && reply.value === 'saved') saved += 1;
  }
  return saved;
}
