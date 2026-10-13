// Party en la nube (B7 del plan del cambio, respuestas 69 y 77). Llamadas tipadas a las funciones de
// supabase/migrations/20261018000001_party_cloud.sql. Cada respuesta se valida con zod, porque el
// servidor es un tercero, y cada error se traduce a una causa que la pantalla sabe decir. Aquí no se
// decide nada. Al servidor solo viajan ids seudónimos y cifras de estudio, y de él solo llegan alias.
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

type Rpc = Pick<SupabaseClient, 'rpc'>;

export type PartyFailure =
  /** La sesión venció o no hay */
  | 'no_session'
  /** Este dispositivo ya no es el activo de la cuenta */
  | 'other_device'
  /** Party no está abierta para la cuenta. Llega con el plan Gratis en B8 */
  | 'closed'
  /** Ya no está en ese grupo o no participa en ese duelo */
  | 'not_member'
  /** El servidor rechazó los datos */
  | 'invalid'
  /** La migración de Party todavía no está aplicada en el proyecto */
  | 'unavailable'
  | 'network'
  | 'unknown';

export type PartyReply<T> = { ok: true; value: T } | { ok: false; reason: PartyFailure };

interface RpcError {
  code?: string | null;
  message?: string | null;
}

/** Traduce el error de la base. Sin código es que la petición ni llegó al servidor */
export function partyFailureOf(error: RpcError): PartyFailure {
  const code = error.code ?? '';
  if (code === '28000' || code === 'PGRST301') return 'no_session';
  if (code === '42501') return 'other_device';
  if (code === 'PT001') return 'closed';
  if (code === 'PT002') return 'not_member';
  if (code === '22023' || code === '22P02') return 'invalid';
  if (code === 'PGRST202') return 'unavailable';
  if (code === '') return 'network';
  return 'unknown';
}

/** Postgres manda las fechas con zona, por ejemplo 2026-10-13T15:00:00.123456+00:00 */
const TimestampSchema = z.iso.datetime({ offset: true });
/** Los ids de la nube son uuid. Se aceptan aunque no sigan la versión de uno aleatorio */
const CloudIdSchema = z.guid();
/** Los códigos que genera la base no llevan 0, O, 1, I ni L, pero se aceptan los que ya existan */
const CloudInviteCodeSchema = z.string().regex(/^[A-Z0-9]{6}$/);

export const PartyMemberSchema = z.object({
  userId: CloudIdSchema,
  alias: z.string().min(1).max(40),
  isSelf: z.boolean(),
  /** XP de la semana que pidió el resumen, como lo publicó ese miembro */
  weeklyXp: z.number().int().nonnegative(),
  joinedAt: TimestampSchema,
});
export type PartyMember = z.infer<typeof PartyMemberSchema>;

/** accuracy era de los duelos simulados y no se crea en la nube, pero se lee sin romper nada */
export const PartyChallengeMetricSchema = z.enum(['cards', 'questions', 'xp', 'accuracy']);
export type PartyChallengeMetric = z.infer<typeof PartyChallengeMetricSchema>;

export const PartyChallengeSchema = z.object({
  id: CloudIdSchema,
  title: z.string().min(1).max(80),
  metric: PartyChallengeMetricSchema,
  target: z.number().positive(),
  startsAt: TimestampSchema,
  endsAt: TimestampSchema,
  createdBySelf: z.boolean(),
  /** Suma de los aportes de los miembros activos */
  total: z.number().nonnegative(),
  /** El aporte que publicó quien llama. null si todavía no publica nada */
  mine: z.number().int().nonnegative().nullable(),
});
export type PartyChallenge = z.infer<typeof PartyChallengeSchema>;

export const DuelScoreSchema = z.object({
  correct: z.number().int().nonnegative(),
  answered: z.number().int().positive(),
  totalMs: z.number().int().nonnegative(),
  finishedAt: TimestampSchema,
});
export type DuelScore = z.infer<typeof DuelScoreSchema>;

export const PartyDuelSchema = z.object({
  id: CloudIdSchema,
  challengerId: CloudIdSchema,
  opponentId: CloudIdSchema,
  questionIds: z.array(z.string().min(1).max(64)).min(1).max(40),
  createdAt: TimestampSchema,
  /** El resultado propio. null mientras no juega */
  mine: DuelScoreSchema.nullable(),
  /** El del rival. El servidor lo manda solo después del propio */
  rival: DuelScoreSchema.nullable(),
});
export type PartyDuel = z.infer<typeof PartyDuelSchema>;

export const PartyGroupSchema = z.object({
  id: CloudIdSchema,
  name: z.string().min(1).max(60),
  inviteCode: CloudInviteCodeSchema,
  isOwner: z.boolean(),
  joinedAt: TimestampSchema,
  members: z.array(PartyMemberSchema),
  challenges: z.array(PartyChallengeSchema),
  duels: z.array(PartyDuelSchema),
});
export type PartyGroup = z.infer<typeof PartyGroupSchema>;

export const PartyOverviewSchema = z.object({
  /** Lunes de la semana de las cifras, como yyyy-mm-dd */
  weekStart: z.iso.date(),
  groups: z.array(PartyGroupSchema),
});
export type PartyOverview = z.infer<typeof PartyOverviewSchema>;

async function call<T>(
  cloud: Rpc,
  name: string,
  args: Record<string, unknown> | undefined,
  schema: z.ZodType<T>,
): Promise<PartyReply<T>> {
  try {
    const reply = args === undefined ? await cloud.rpc(name) : await cloud.rpc(name, args);
    if (reply.error) return { ok: false, reason: partyFailureOf(reply.error) };
    const parsed = schema.safeParse(reply.data as unknown);
    return parsed.success ? { ok: true, value: parsed.data } : { ok: false, reason: 'unknown' };
  } catch {
    return { ok: false, reason: 'network' };
  }
}

/** Los grupos de quien llama con sus miembros, retos y duelos. weekStart es el lunes de la tabla */
export function fetchPartyOverview(
  cloud: Rpc,
  weekStart: string,
): Promise<PartyReply<PartyOverview>> {
  return call(cloud, 'party_overview', { p_week_start: weekStart }, PartyOverviewSchema);
}

const CreateGroupSchema = z.union([
  z.object({
    status: z.literal('created'),
    groupId: CloudIdSchema,
    inviteCode: CloudInviteCodeSchema,
  }),
  z.object({ status: z.enum(['too_many', 'limit']) }),
]);
export type CreateGroupOutcome = z.infer<typeof CreateGroupSchema>;

export function createPartyGroup(
  cloud: Rpc,
  name: string,
): Promise<PartyReply<CreateGroupOutcome>> {
  return call(cloud, 'party_create_group', { p_name: name }, CreateGroupSchema);
}

const JoinGroupSchema = z.union([
  z.object({ status: z.enum(['joined', 'already']), groupId: CloudIdSchema }),
  z.object({ status: z.enum(['invalid', 'not_found', 'full', 'too_many', 'rate_limited']) }),
]);
export type JoinGroupOutcome = z.infer<typeof JoinGroupSchema>;
export type JoinStatus = JoinGroupOutcome['status'];

/** Lo que escribió el alumno, sin espacios ni guiones y en mayúsculas */
export function normalizeInviteCode(value: string): string {
  return value.replace(/[\s-]/g, '').toUpperCase();
}

export function joinPartyGroup(cloud: Rpc, code: string): Promise<PartyReply<JoinGroupOutcome>> {
  return call(cloud, 'party_join_group', { p_code: code }, JoinGroupSchema);
}

/** true si estaba en el grupo y salió */
export function leavePartyGroup(cloud: Rpc, groupId: string): Promise<PartyReply<boolean>> {
  return call(cloud, 'party_leave_group', { p_group: groupId }, z.boolean());
}

/** Sale de todos sus grupos. Devuelve de cuántos salió */
export function leaveAllPartyGroups(cloud: Rpc): Promise<PartyReply<number>> {
  return call(cloud, 'party_leave_all', undefined, z.number().int().nonnegative());
}

/** Lo que publica cada alumno de sí mismo. Sale de su bitácora y solo viaja como estas cifras */
export interface PartyNumbers {
  weekStart: string;
  weeklyXp: number;
  contributions: readonly { challengeId: string; amount: number }[];
}

/** Publica el XP de la semana en todos sus grupos y sus aportes. Devuelve cuántas filas cambiaron */
export function publishPartyNumbers(
  cloud: Rpc,
  numbers: PartyNumbers,
): Promise<PartyReply<number>> {
  return call(
    cloud,
    'party_publish',
    {
      p_week_start: numbers.weekStart,
      p_xp: numbers.weeklyXp,
      p_progress: numbers.contributions.map((item) => ({
        challengeId: item.challengeId,
        amount: item.amount,
      })),
    },
    z.number().int().nonnegative(),
  );
}

const CreateChallengeSchema = z.union([
  z.object({ status: z.literal('created'), challengeId: CloudIdSchema }),
  z.object({ status: z.literal('limit') }),
]);
export type CreateChallengeOutcome = z.infer<typeof CreateChallengeSchema>;

export function createPartyChallenge(
  cloud: Rpc,
  input: { groupId: string; title: string; metric: 'cards' | 'questions' | 'xp'; target: number },
): Promise<PartyReply<CreateChallengeOutcome>> {
  return call(
    cloud,
    'party_create_challenge',
    {
      p_group: input.groupId,
      p_title: input.title,
      p_metric: input.metric,
      p_target: input.target,
    },
    CreateChallengeSchema,
  );
}

const CreateDuelSchema = z.union([
  z.object({ status: z.literal('created'), duelId: CloudIdSchema }),
  z.object({ status: z.enum(['rival_gone', 'limit']) }),
]);
export type CreateDuelOutcome = z.infer<typeof CreateDuelSchema>;

export function createPartyDuel(
  cloud: Rpc,
  input: { groupId: string; opponentId: string; questionIds: readonly string[] },
): Promise<PartyReply<CreateDuelOutcome>> {
  return call(
    cloud,
    'party_create_duel',
    {
      p_group: input.groupId,
      p_opponent: input.opponentId,
      p_question_ids: [...input.questionIds],
    },
    CreateDuelSchema,
  );
}

/** saved la primera vez y already si el servidor ya tenía el resultado, que no cambia */
export function submitPartyDuelResult(
  cloud: Rpc,
  input: { duelId: string; correct: number; totalMs: number },
): Promise<PartyReply<'saved' | 'already'>> {
  return call(
    cloud,
    'party_submit_duel_result',
    { p_duel: input.duelId, p_correct: input.correct, p_total_ms: input.totalMs },
    z.enum(['saved', 'already']),
  );
}
