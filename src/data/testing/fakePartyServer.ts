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
  /** Lo que pasa al borrar la cuenta. Además de lo anterior se van sus grupos creados */
  forgetUser(userId: string): void;
  /** El código del grupo con ese nombre, como si alguien lo compartiera */
  codeOf(groupName: string): string | undefined;
  /** Los ids de los miembros activos del grupo con ese nombre */
  activeMembers(groupName: string): string[];
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
}

type Metric = 'cards' | 'questions' | 'xp';

interface Group {
  id: string;
  name: string;
  inviteCode: string;
  ownerId: string;
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
        const groupChallenges = [...challenges.values()]
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
              return {
                id: item.id,
                challengerId: item.challengerId,
                opponentId: item.opponentId,
                questionIds: [...item.questionIds],
                createdAt: iso(item.createdAt),
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
    if (!isInt(xp) || xp < 0 || xp > 1_000_000) return fail('22023', 'El XP no es válido');
    const items = args.p_progress ?? [];
    if (!Array.isArray(items) || items.length > 50) {
      return fail('22023', 'Se esperaba un arreglo de hasta 50 aportes');
    }
    let changed = 0;
    for (const own of activeOf(userId)) {
      const key = `${own.groupId}|${userId}|${weekStart}`;
      if (weeklyXp.get(key) === xp) continue;
      weeklyXp.set(key, xp);
      changed += 1;
    }
    for (const item of items as unknown[]) {
      if (typeof item !== 'object' || item === null) return fail('22023', 'Aporte inválido');
      const { challengeId, amount } = item as Record<string, unknown>;
      if (!isUuid(challengeId) || !isInt(amount) || amount < 0 || amount > 1_000_000) {
        return fail('22023', 'Aporte inválido');
      }
      const challenge = challenges.get(challengeId);
      if (
        !challenge ||
        challenge.endsAt <= now() - DAY_MS ||
        !isMember(challenge.groupId, userId)
      ) {
        continue;
      }
      const key = `${challengeId}|${userId}`;
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
    const open = [...challenges.values()].filter(
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
    };
    challenges.set(challenge.id, challenge);
    return ok({ status: 'created', challengeId: challenge.id });
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

  function submitResult(userId: string, args: Readonly<Record<string, unknown>>): FakePartyResult {
    const duel = isUuid(args.p_duel) ? duels.get(args.p_duel) : undefined;
    if (
      !duel ||
      (duel.challengerId !== userId && duel.opponentId !== userId) ||
      !isMember(duel.groupId, userId)
    ) {
      return fail('PT002', 'No participas en ese duelo');
    }
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
    if (results.has(key)) return ok('already');
    results.set(key, { correct, answered, totalMs, finishedAt: now() });
    return ok('saved');
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
      results.delete(resultKey(duel.id, duel.challengerId));
      results.delete(resultKey(duel.id, duel.opponentId));
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
      switch (name) {
        case 'party_open':
          return ok(true);
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
        case 'party_submit_duel_result':
          return submitResult(userId, args);
        default:
          return null;
      }
    },
    forgetMemberships,
    forgetUser(userId) {
      forgetMemberships(userId);
      for (const group of [...groups.values()]) {
        if (group.ownerId !== userId) continue;
        groups.delete(group.id);
        for (const item of memberships.filter((entry) => entry.groupId === group.id)) {
          dropMembershipData(group.id, item.userId);
          memberships.splice(memberships.indexOf(item), 1);
        }
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
