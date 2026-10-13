// Party en la nube en memoria, para las pruebas (B7 del plan del cambio). Imita las funciones party_*
// de supabase/migrations/20261018000001_party_cloud.sql con sus mismas respuestas, sus topes y sus
// códigos de error, y deja ver lo mismo que sus políticas. Lo usan el doble de la nube de las pruebas
// unitarias (fakeCloud.ts) y el Supabase simulado de las e2e (tests/e2e/support/fakeSupabase.ts), así
// las dos imitan exactamente lo mismo. Las cuentas, el dispositivo activo y la sesión los revisa quien
// lo usa. Solo lo usan las pruebas.
import { addDays, studyDayOf, weekStartOf } from '@/engines/studyDay';

export type FakePartyResult = { data: unknown } | { error: { code: string; message: string } };

export interface FakePartyServer {
  /** Atiende una función party_* a nombre de userId. null si el nombre no es de Party */
  call(
    name: string,
    userId: string,
    args: Readonly<Record<string, unknown>>,
  ): FakePartyResult | null;
  /**
   * Lo que hace borrar mis datos. Borra las membresías de la cuenta y, como el on delete cascade de la
   * base, su XP publicado, sus aportes y sus duelos. Devuelve cuántas membresías borró
   */
  forgetMemberships(userId: string): number;
  /**
   * Lo que pasa al borrar la cuenta. Además de lo anterior, cada grupo que administraba pasa al miembro
   * activo más antiguo, y se borra solo si ya no queda nadie (supabase/manual/party-dueno-al-borrar-cuenta.sql)
   */
  forgetUser(userId: string): void;
  /** El código del grupo con ese nombre, como si alguien lo compartiera */
  codeOf(groupName: string): string | undefined;
  /** Los ids de los miembros activos del grupo con ese nombre */
  activeMembers(groupName: string): string[];
  /** Quién administra el grupo con ese nombre. null si nadie, undefined si no existe */
  ownerOf(groupName: string): string | null | undefined;
  /** El XP de la semana que publicó un alumno en ese grupo, o null si no ha publicado */
  publishedXp(groupName: string, userId: string): number | null;
  /** Los resultados que mandaron los participantes de los duelos de un alumno */
  duelResults(
    userId: string,
  ): { duelId: string; userId: string; correct: number; totalMs: number }[];
}

export interface FakePartyOptions {
  /** El alias del perfil de una cuenta. null si no tiene perfil */
  aliasOf: (userId: string) => string | null;
  now?: () => number;
  /**
   * Si Party está abierta para la cuenta, como party_open con el plan de pago (B8,
   * 20261021000001_free_plan_locks.sql). Sin ella siempre está abierta
   */
  isOpen?: (userId: string) => boolean;
}

/**
 * Las funciones que piden Party abierta, como party_caller() en la base. Con Party cerrada contestan
 * PT001 antes de tocar nada. Salir de un grupo o de todos y exportar lo propio no la piden
 */
const NEED_OPEN = new Set([
  'party_overview',
  'party_create_group',
  'party_join_group',
  'party_publish',
  'party_create_challenge',
  'party_create_duel',
  'party_start_duel',
  'party_submit_duel_result',
  'party_rotate_code',
  'party_remove_member',
  'party_delete_challenge',
]);

type Metric = 'cards' | 'questions' | 'xp';

interface Group {
  id: string;
  name: string;
  inviteCode: string;
  /** null si quien lo administraba borró su cuenta y no había a quién pasarlo */
  ownerId: string | null;
  createdAt: number;
}

interface Membership {
  groupId: string;
  userId: string;
  joinedAt: number;
  leftAt: number | null;
}

interface Challenge {
  id: string;
  groupId: string;
  title: string;
  metric: Metric;
  target: number;
  startsAt: number;
  endsAt: number;
  createdBy: string | null;
  /** Un reto borrado queda marcado y deja de verse */
  deletedAt: number | null;
}

interface Duel {
  id: string;
  groupId: string;
  challengerId: string;
  opponentId: string;
  questionIds: string[];
  createdAt: number;
}

interface Score {
  correct: number;
  answered: number;
  totalMs: number;
  finishedAt: number;
}

/** Los mismos topes que party_limit */
export const FAKE_PARTY_LIMITS = {
  membersPerGroup: 50,
  groupsPerMember: 10,
  groupsCreatedPerDay: 5,
  joinFailuresPerHour: 10,
  openChallengesPerGroup: 10,
  waitingDuelsPerMember: 10,
  weeklyXp: 50_000,
  duelMsPerCorrect: 3_000,
} as const;

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

const ok = (data: unknown): FakePartyResult => ({ data });
const fail = (code: string, message: string): FakePartyResult => ({ error: { code, message } });
const isUuid = (value: unknown): value is string => typeof value === 'string' && UUID.test(value);
const isInt = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value);
const iso = (ms: number) => new Date(ms).toISOString();

function isMonday(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.getUTCDay() === 1;
}

export function createFakePartyServer(options: FakePartyOptions): FakePartyServer {
  const now = options.now ?? (() => Date.now());
  const groups = new Map<string, Group>();
  const memberships: Membership[] = [];
  const challenges = new Map<string, Challenge>();
  const duels = new Map<string, Duel>();
  const results = new Map<string, Score>();
  /** Cuándo empezó cada participante su duelo, por duelo y alumno */
  const starts = new Map<string, number>();
  const weeklyXp = new Map<string, number>();
  const progress = new Map<string, { groupId: string; amount: number }>();
  const joinFailures: { userId: string; at: number }[] = [];

  const membership = (groupId: string, userId: string) =>
    memberships.find((item) => item.groupId === groupId && item.userId === userId);
  const isMember = (groupId: string, userId: string) =>
    membership(groupId, userId)?.leftAt === null;
  const activeOf = (userId: string) =>
    memberships.filter((item) => item.userId === userId && item.leftAt === null);
  const activeIn = (groupId: string) =>
    memberships.filter((item) => item.groupId === groupId && item.leftAt === null);
  const resultKey = (duelId: string, userId: string) => `${duelId}|${userId}`;
  const liveChallenges = () => [...challenges.values()].filter((item) => item.deletedAt === null);

  function newCode(): string {
    let code: string;
    do {
      code = Array.from({ length: 6 }, () =>
        CODE_ALPHABET.charAt(Math.floor(Math.random() * CODE_ALPHABET.length)),
      ).join('');
    } while ([...groups.values()].some((group) => group.inviteCode === code));
    return code;
  }

  function currentWeek(): string {
    return weekStartOf(studyDayOf(new Date(now()), 'America/Merida'));
  }

  // ------------------------------------------------------------------ lo que ve cada quien

  function scoreJson(score: Score | undefined) {
    return score
      ? {
          correct: score.correct,
          answered: score.answered,
          totalMs: score.totalMs,
          finishedAt: iso(score.finishedAt),
        }
      : null;
  }

  function overview(userId: string, weekStart: string) {
    const mine = activeOf(userId).sort((a, b) => a.joinedAt - b.joinedAt);
    return {
      weekStart,
      groups: mine.flatMap((own) => {
        const group = groups.get(own.groupId);
        if (!group) return [];
        const members = activeIn(group.id).sort(
          (a, b) => a.joinedAt - b.joinedAt || a.userId.localeCompare(b.userId),
        );
        const active = new Set(members.map((item) => item.userId));
        const groupChallenges = liveChallenges()
          .filter((item) => item.groupId === group.id && item.endsAt > now() - 7 * DAY_MS)
          .sort((a, b) => b.startsAt - a.startsAt)
          .slice(0, 20);
        const groupDuels = [...duels.values()]
          .filter(
            (item) =>
              item.groupId === group.id &&
              (item.challengerId === userId || item.opponentId === userId),
          )
          .sort((a, b) => b.createdAt - a.createdAt)
          .slice(0, 20);
        return [
          {
            id: group.id,
            name: group.name,
            inviteCode: group.inviteCode,
            isOwner: group.ownerId === userId,
            joinedAt: iso(own.joinedAt),
            members: members.map((item) => ({
              userId: item.userId,
              alias: options.aliasOf(item.userId) ?? 'Alumno',
              isSelf: item.userId === userId,
              weeklyXp: weeklyXp.get(`${group.id}|${item.userId}|${weekStart}`) ?? 0,
              joinedAt: iso(item.joinedAt),
            })),
            challenges: groupChallenges.map((item) => ({
              id: item.id,
              title: item.title,
              metric: item.metric,
              target: item.target,
              startsAt: iso(item.startsAt),
              endsAt: iso(item.endsAt),
              createdBySelf: item.createdBy === userId,
              total: [...progress.entries()]
                .filter(([key]) => key.startsWith(`${item.id}|`))
                .filter(([key]) => active.has(key.slice(item.id.length + 1)))
                .reduce((sum, [, value]) => sum + value.amount, 0),
              mine: progress.get(`${item.id}|${userId}`)?.amount ?? null,
            })),
            duels: groupDuels.map((item) => {
              const own = results.get(resultKey(item.id, userId));
              const rivalId = item.challengerId === userId ? item.opponentId : item.challengerId;
              const startedAt = starts.get(resultKey(item.id, userId));
              return {
                id: item.id,
                challengerId: item.challengerId,
                opponentId: item.opponentId,
                questionIds: [...item.questionIds],
                createdAt: iso(item.createdAt),
                // Como party_overview, solo el inicio propio
                startedAt: startedAt === undefined ? null : iso(startedAt),
                mine: scoreJson(own),
                // Como la política, el del rival solo después del propio
                rival: own ? scoreJson(results.get(resultKey(item.id, rivalId))) : null,
              };
            }),
          },
        ];
      }),
    };
  }

  // ------------------------------------------------------------------ escrituras

  function createGroup(userId: string, args: Readonly<Record<string, unknown>>): FakePartyResult {
    const name = typeof args.p_name === 'string' ? args.p_name.trim() : '';
    if (name.length < 1 || name.length > 60) {
      return fail('22023', 'El nombre del grupo debe tener entre 1 y 60 caracteres');
    }
    if (activeOf(userId).length >= FAKE_PARTY_LIMITS.groupsPerMember) {
      return ok({ status: 'too_many' });
    }
    const createdToday = [...groups.values()].filter(
      (group) => group.ownerId === userId && group.createdAt > now() - DAY_MS,
    ).length;
    if (createdToday >= FAKE_PARTY_LIMITS.groupsCreatedPerDay) return ok({ status: 'limit' });
    const group: Group = {
      id: crypto.randomUUID(),
      name,
      inviteCode: newCode(),
      ownerId: userId,
      createdAt: now(),
    };
    groups.set(group.id, group);
    memberships.push({ groupId: group.id, userId, joinedAt: now(), leftAt: null });
    return ok({ status: 'created', groupId: group.id, inviteCode: group.inviteCode });
  }

  function joinGroup(userId: string, args: Readonly<Record<string, unknown>>): FakePartyResult {
    const failures = joinFailures.filter(
      (item) => item.userId === userId && item.at > now() - HOUR_MS,
    ).length;
    if (failures >= FAKE_PARTY_LIMITS.joinFailuresPerHour) return ok({ status: 'rate_limited' });
    const code = typeof args.p_code === 'string' ? args.p_code.trim().toUpperCase() : '';
    if (!/^[A-Z0-9]{6}$/.test(code)) {
      joinFailures.push({ userId, at: now() });
      return ok({ status: 'invalid' });
    }
    const group = [...groups.values()].find((item) => item.inviteCode === code);
    if (!group) {
      joinFailures.push({ userId, at: now() });
      return ok({ status: 'not_found' });
    }
    const existing = membership(group.id, userId);
    if (existing?.leftAt === null) return ok({ status: 'already', groupId: group.id });
    if (activeOf(userId).length >= FAKE_PARTY_LIMITS.groupsPerMember) {
      return ok({ status: 'too_many' });
    }
    if (activeIn(group.id).length >= FAKE_PARTY_LIMITS.membersPerGroup) {
      return ok({ status: 'full' });
    }
    if (existing) {
      existing.leftAt = null;
      existing.joinedAt = now();
    } else {
      memberships.push({ groupId: group.id, userId, joinedAt: now(), leftAt: null });
    }
    return ok({ status: 'joined', groupId: group.id });
  }

  function leaveGroup(userId: string, groupId: unknown): FakePartyResult {
    const own = typeof groupId === 'string' ? membership(groupId, userId) : undefined;
    if (own?.leftAt !== null) return ok(false);
    own.leftAt = now();
    return ok(true);
  }

  function leaveAll(userId: string): FakePartyResult {
    const mine = activeOf(userId);
    for (const item of mine) item.leftAt = now();
    return ok(mine.length);
  }

  function publish(userId: string, args: Readonly<Record<string, unknown>>): FakePartyResult {
    const week = currentWeek();
    const weekStart = args.p_week_start;
    if (!isMonday(weekStart) || weekStart < addDays(week, -7) || weekStart > addDays(week, 7)) {
      return fail('22023', 'La semana no es válida');
    }
    const xp = args.p_xp;
    if (!isInt(xp) || xp < 0) return fail('22023', 'El XP no es válido');
    if (xp > FAKE_PARTY_LIMITS.weeklyXp) return fail('PT004', 'El XP de la semana pasa del tope');
    const items = args.p_progress ?? [];
    if (!Array.isArray(items) || items.length > 50) {
      return fail('22023', 'Se esperaba un arreglo de hasta 50 aportes');
    }
    // Como en la base, todo o nada. Se revisa todo antes de escribir
    const accepted: { challenge: Challenge; amount: number }[] = [];
    for (const item of items as unknown[]) {
      if (typeof item !== 'object' || item === null) return fail('22023', 'Aporte inválido');
      const { challengeId, amount } = item as Record<string, unknown>;
      if (!isUuid(challengeId) || !isInt(amount) || amount < 0 || amount > 1_000_000) {
        return fail('22023', 'Aporte inválido');
      }
      const challenge = challenges.get(challengeId);
      // Un reto que no existe, que se borró, que ya terminó o de un grupo ajeno se ignora
      if (
        challenge?.deletedAt !== null ||
        challenge.endsAt <= now() - DAY_MS ||
        !isMember(challenge.groupId, userId)
      ) {
        continue;
      }
      if (amount > challenge.target) return fail('PT004', 'El aporte pasa de la meta del reto');
      accepted.push({ challenge, amount });
    }
    let changed = 0;
    for (const own of activeOf(userId)) {
      const key = `${own.groupId}|${userId}|${weekStart}`;
      if (weeklyXp.get(key) === xp) continue;
      weeklyXp.set(key, xp);
      changed += 1;
    }
    for (const { challenge, amount } of accepted) {
      const key = `${challenge.id}|${userId}`;
      if (progress.get(key)?.amount === amount) continue;
      progress.set(key, { groupId: challenge.groupId, amount });
      changed += 1;
    }
    return ok(changed);
  }

  function createChallenge(
    userId: string,
    args: Readonly<Record<string, unknown>>,
  ): FakePartyResult {
    const groupId = args.p_group;
    if (!isUuid(groupId) || !isMember(groupId, userId)) {
      return fail('PT002', 'No eres miembro de ese grupo');
    }
    const title = typeof args.p_title === 'string' ? args.p_title.trim() : '';
    const metric = args.p_metric;
    const target = args.p_target;
    if (
      title.length < 1 ||
      title.length > 80 ||
      (metric !== 'cards' && metric !== 'questions' && metric !== 'xp') ||
      !isInt(target) ||
      target < 1 ||
      target > 1_000_000
    ) {
      return fail('22023', 'El reto no es válido');
    }
    const open = liveChallenges().filter(
      (item) => item.groupId === groupId && item.endsAt > now(),
    ).length;
    if (open >= FAKE_PARTY_LIMITS.openChallengesPerGroup) return ok({ status: 'limit' });
    const challenge: Challenge = {
      id: crypto.randomUUID(),
      groupId,
      title,
      metric,
      target,
      startsAt: now(),
      endsAt: now() + 7 * DAY_MS,
      createdBy: userId,
      deletedAt: null,
    };
    challenges.set(challenge.id, challenge);
    return ok({ status: 'created', challengeId: challenge.id });
  }

  function deleteChallenge(
    userId: string,
    args: Readonly<Record<string, unknown>>,
  ): FakePartyResult {
    const challenge = isUuid(args.p_challenge) ? challenges.get(args.p_challenge) : undefined;
    if (!challenge || !isMember(challenge.groupId, userId)) {
      return fail('PT002', 'No eres miembro de ese grupo');
    }
    if (challenge.createdBy !== userId && groups.get(challenge.groupId)?.ownerId !== userId) {
      return fail('PT005', 'Solo quien administra el grupo o quien creó el reto puede borrarlo');
    }
    if (challenge.deletedAt !== null) return ok(false);
    challenge.deletedAt = now();
    return ok(true);
  }

  // ------------------------------------------------------------------ moderación

  /** null si quien llama administra el grupo y sigue en él, o el error que daría la base */
  function ownerProblem(groupId: unknown, userId: string): FakePartyResult | null {
    if (!isUuid(groupId) || !isMember(groupId, userId)) {
      return fail('PT002', 'No eres miembro de ese grupo');
    }
    if (groups.get(groupId)?.ownerId !== userId) {
      return fail('PT005', 'Solo quien administra el grupo puede hacer esto');
    }
    return null;
  }

  function rotateCode(userId: string, args: Readonly<Record<string, unknown>>): FakePartyResult {
    const problem = ownerProblem(args.p_group, userId);
    if (problem) return problem;
    const group = groups.get(args.p_group as string) as Group;
    group.inviteCode = newCode();
    return ok({ status: 'rotated', inviteCode: group.inviteCode });
  }

  function removeMember(userId: string, args: Readonly<Record<string, unknown>>): FakePartyResult {
    const problem = ownerProblem(args.p_group, userId);
    if (problem) return problem;
    const memberId = args.p_member;
    if (!isUuid(memberId) || memberId === userId) {
      return fail('22023', 'Para irte del grupo usa salir del grupo');
    }
    const member = membership(args.p_group as string, memberId);
    if (member?.leftAt !== null) return ok(false);
    member.leftAt = now();
    return ok(true);
  }

  function createDuel(userId: string, args: Readonly<Record<string, unknown>>): FakePartyResult {
    const groupId = args.p_group;
    if (!isUuid(groupId) || !isMember(groupId, userId)) {
      return fail('PT002', 'No eres miembro de ese grupo');
    }
    const opponentId = args.p_opponent;
    if (!isUuid(opponentId) || opponentId === userId) {
      return fail('22023', 'Elige a otro miembro del grupo');
    }
    const ids = args.p_question_ids;
    if (
      !Array.isArray(ids) ||
      ids.length < 1 ||
      ids.length > 40 ||
      !ids.every((id) => typeof id === 'string' && /^[0-9A-Za-z-]{1,64}$/.test(id)) ||
      new Set(ids).size !== ids.length
    ) {
      return fail('22023', 'Las preguntas del duelo no son válidas');
    }
    if (!isMember(groupId, opponentId)) return ok({ status: 'rival_gone' });
    const waiting = [...duels.values()].filter(
      (item) =>
        item.challengerId === userId &&
        !results.has(resultKey(item.id, item.opponentId)) &&
        isMember(item.groupId, item.opponentId),
    ).length;
    if (waiting >= FAKE_PARTY_LIMITS.waitingDuelsPerMember) return ok({ status: 'limit' });
    const duel: Duel = {
      id: crypto.randomUUID(),
      groupId,
      challengerId: userId,
      opponentId,
      questionIds: ids as string[],
      createdAt: now(),
    };
    duels.set(duel.id, duel);
    return ok({ status: 'created', duelId: duel.id });
  }

  /** El duelo si quien llama participa y sigue en el grupo */
  function ownDuel(userId: string, duelId: unknown): Duel | null {
    const duel = isUuid(duelId) ? duels.get(duelId) : undefined;
    if (
      !duel ||
      (duel.challengerId !== userId && duel.opponentId !== userId) ||
      !isMember(duel.groupId, userId)
    ) {
      return null;
    }
    return duel;
  }

  function startDuel(userId: string, args: Readonly<Record<string, unknown>>): FakePartyResult {
    const duel = ownDuel(userId, args.p_duel);
    if (!duel) return fail('PT002', 'No participas en ese duelo');
    const key = resultKey(duel.id, userId);
    if (starts.has(key)) return ok('already');
    starts.set(key, now());
    return ok('started');
  }

  function submitResult(userId: string, args: Readonly<Record<string, unknown>>): FakePartyResult {
    const duel = ownDuel(userId, args.p_duel);
    if (!duel) return fail('PT002', 'No participas en ese duelo');
    const answered = duel.questionIds.length;
    const { p_correct: correct, p_total_ms: totalMs } = args;
    if (
      !isInt(correct) ||
      correct < 0 ||
      correct > answered ||
      !isInt(totalMs) ||
      totalMs < 0 ||
      totalMs > 86_400_000
    ) {
      return fail('22023', 'El resultado no es válido');
    }
    const key = resultKey(duel.id, userId);
    if (!starts.has(key)) return fail('PT003', 'Primero empieza el duelo');
    if (totalMs < correct * FAKE_PARTY_LIMITS.duelMsPerCorrect) {
      return fail('PT004', 'El tiempo no alcanza para tantos aciertos');
    }
    if (results.has(key)) return ok('already');
    results.set(key, { correct, answered, totalMs, finishedAt: now() });
    return ok('saved');
  }

  // ------------------------------------------------------------------ exportar mis datos

  function exportMine(userId: string): FakePartyResult {
    const mine = memberships
      .filter((item) => item.userId === userId)
      .sort((a, b) => a.joinedAt - b.joinedAt);
    return ok({
      memberships: mine.map((item) => {
        const group = groups.get(item.groupId);
        return {
          groupId: item.groupId,
          groupName: item.leftAt === null ? (group?.name ?? null) : null,
          isOwner: group?.ownerId === userId,
          joinedAt: iso(item.joinedAt),
          leftAt: item.leftAt === null ? null : iso(item.leftAt),
        };
      }),
      weeklyXp: [...weeklyXp.entries()]
        .map(([key, xp]) => ({ parts: key.split('|'), xp }))
        .filter(({ parts }) => parts[1] === userId)
        .map(({ parts, xp }) => ({
          groupId: parts[0],
          weekStart: parts[2],
          xp,
          updatedAt: iso(now()),
        })),
      challengeContributions: [...progress.entries()]
        .filter(([key]) => key.endsWith(`|${userId}`))
        .map(([key, value]) => ({
          challengeId: key.slice(0, key.indexOf('|')),
          groupId: value.groupId,
          amount: value.amount,
          updatedAt: iso(now()),
        })),
      challengesCreated: [...challenges.values()]
        .filter((item) => item.createdBy === userId)
        .map((item) => ({
          challengeId: item.id,
          groupId: item.groupId,
          title: item.title,
          metric: item.metric,
          target: item.target,
          startsAt: iso(item.startsAt),
          endsAt: iso(item.endsAt),
          deletedAt: item.deletedAt === null ? null : iso(item.deletedAt),
        })),
      duels: [...duels.values()]
        .filter((item) => item.challengerId === userId || item.opponentId === userId)
        .map((item) => {
          const key = resultKey(item.id, userId);
          const startedAt = starts.get(key);
          return {
            duelId: item.id,
            groupId: item.groupId,
            role: item.challengerId === userId ? 'challenger' : 'opponent',
            questionCount: item.questionIds.length,
            createdAt: iso(item.createdAt),
            startedAt: startedAt === undefined ? null : iso(startedAt),
            result: scoreJson(results.get(key)),
          };
        }),
    });
  }

  // ------------------------------------------------------------------ borrados en cascada

  function dropMembershipData(groupId: string, userId: string) {
    for (const key of [...weeklyXp.keys()]) {
      if (key.startsWith(`${groupId}|${userId}|`)) weeklyXp.delete(key);
    }
    for (const [key, value] of [...progress.entries()]) {
      if (value.groupId === groupId && key.endsWith(`|${userId}`)) progress.delete(key);
    }
    for (const duel of [...duels.values()]) {
      if (duel.groupId !== groupId) continue;
      if (duel.challengerId !== userId && duel.opponentId !== userId) continue;
      duels.delete(duel.id);
      for (const participant of [duel.challengerId, duel.opponentId]) {
        results.delete(resultKey(duel.id, participant));
        starts.delete(resultKey(duel.id, participant));
      }
    }
  }

  function forgetMemberships(userId: string): number {
    const mine = memberships.filter((item) => item.userId === userId);
    for (const item of mine) {
      dropMembershipData(item.groupId, userId);
      memberships.splice(memberships.indexOf(item), 1);
    }
    return mine.length;
  }

  const byName = (groupName: string) =>
    [...groups.values()].find((group) => group.name === groupName);

  return {
    call(name, userId, args) {
      // Con Party cerrada, como en el plan Gratis, cada función contesta PT001 antes de tocar nada,
      // salvo salir y exportar lo propio
      const open = options.isOpen?.(userId) ?? true;
      if (name === 'party_open') return ok(open);
      if (!open && NEED_OPEN.has(name)) {
        return fail('PT001', 'Party no está abierta para tu cuenta');
      }
      switch (name) {
        case 'party_overview': {
          if (!isMonday(args.p_week_start)) return fail('22023', 'La semana no es válida');
          return ok(overview(userId, args.p_week_start));
        }
        case 'party_create_group':
          return createGroup(userId, args);
        case 'party_join_group':
          return joinGroup(userId, args);
        case 'party_leave_group':
          return leaveGroup(userId, args.p_group);
        case 'party_leave_all':
          return leaveAll(userId);
        case 'party_publish':
          return publish(userId, args);
        case 'party_create_challenge':
          return createChallenge(userId, args);
        case 'party_create_duel':
          return createDuel(userId, args);
        case 'party_start_duel':
          return startDuel(userId, args);
        case 'party_submit_duel_result':
          return submitResult(userId, args);
        case 'party_rotate_code':
          return rotateCode(userId, args);
        case 'party_remove_member':
          return removeMember(userId, args);
        case 'party_delete_challenge':
          return deleteChallenge(userId, args);
        case 'party_export_mine':
          return exportMine(userId);
        default:
          return null;
      }
    },
    forgetMemberships,
    forgetUser(userId) {
      // Antes que nada, cada grupo que administraba pasa al miembro activo más antiguo. Si ya no queda
      // nadie, el grupo se borra con todo lo suyo
      for (const group of [...groups.values()]) {
        if (group.ownerId !== userId) continue;
        const heir = activeIn(group.id)
          .filter((item) => item.userId !== userId)
          .sort((a, b) => a.joinedAt - b.joinedAt || a.userId.localeCompare(b.userId))[0];
        if (heir) {
          group.ownerId = heir.userId;
          continue;
        }
        groups.delete(group.id);
        for (const item of memberships.filter((entry) => entry.groupId === group.id)) {
          dropMembershipData(group.id, item.userId);
          memberships.splice(memberships.indexOf(item), 1);
        }
        for (const challenge of [...challenges.values()]) {
          if (challenge.groupId === group.id) challenges.delete(challenge.id);
        }
      }
      forgetMemberships(userId);
      for (const challenge of challenges.values()) {
        if (challenge.createdBy === userId) challenge.createdBy = null;
      }
      const keep = joinFailures.filter((item) => item.userId !== userId);
      joinFailures.length = 0;
      joinFailures.push(...keep);
    },
    codeOf(groupName) {
      return byName(groupName)?.inviteCode;
    },
    activeMembers(groupName) {
      const group = byName(groupName);
      return group ? activeIn(group.id).map((item) => item.userId) : [];
    },
    ownerOf(groupName) {
      return byName(groupName)?.ownerId;
    },
    publishedXp(groupName, userId) {
      const group = byName(groupName);
      if (!group) return null;
      return weeklyXp.get(`${group.id}|${userId}|${currentWeek()}`) ?? null;
    },
    duelResults(userId) {
      return [...duels.values()]
        .filter((duel) => duel.challengerId === userId || duel.opponentId === userId)
        .flatMap((duel) =>
          [duel.challengerId, duel.opponentId].flatMap((participant) => {
            const score = results.get(resultKey(duel.id, participant));
            return score
              ? [
                  {
                    duelId: duel.id,
                    userId: participant,
                    correct: score.correct,
                    totalMs: score.totalMs,
                  },
                ]
              : [];
          }),
        );
    },
  };
}
