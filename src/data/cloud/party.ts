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
  /** El duelo no se ha empezado en el servidor, así que todavía no acepta su resultado */
  | 'not_started'
  /** Cifras que no se pueden estudiar de verdad, como más XP que el tope de la semana */
  | 'implausible'
  /** Solo quien administra el grupo, o quien creó el reto, puede hacerlo */
  | 'not_owner'
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
  if (code === 'PT003') return 'not_started';
  if (code === 'PT004') return 'implausible';
  if (code === 'PT005') return 'not_owner';
  if (code === '22023' || code === '22P02') return 'invalid';
  if (code === 'PGRST202') return 'unavailable';
  if (code === '') return 'network';
  return 'unknown';
}

/**
 * Los topes de las cifras que manda cada alumno, los mismos de party_limit en el servidor. Pasarlos
 * da PT004. La app nunca los pasa, porque recorta antes de mandar
 */
export const PARTY_CAPS = {
  /** XP de la semana. Con el tope de 1,500 XP diarios por volumen y la racha, una semana real queda lejos */
  weeklyXp: 50_000,
  /** Un acierto de un duelo pide al menos este tiempo, en milisegundos */
  duelMsPerCorrect: 3_000,
} as const;

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
  /** Cuándo lo empezó quien llama, en cualquier dispositivo. null si todavía no lo empieza */
  startedAt: TimestampSchema.nullable().default(null),
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

/**
 * Empieza el duelo en el servidor. Desde ahí cuenta su intento, aunque no lo termine. started la
 * primera vez y already si ya lo había empezado, en este o en otro dispositivo
 */
export function startPartyDuel(
  cloud: Rpc,
  duelId: string,
): Promise<PartyReply<'started' | 'already'>> {
  return call(cloud, 'party_start_duel', { p_duel: duelId }, z.enum(['started', 'already']));
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

// ---------------------------------------------------------------------------------------------
// Moderación. Solo quien administra el grupo, y para borrar un reto también quien lo creó

const RotateCodeSchema = z.object({
  status: z.literal('rotated'),
  inviteCode: CloudInviteCodeSchema,
});

/** Cambia el código de invitación. El de antes y su enlace dejan de servir */
export function rotatePartyCode(
  cloud: Rpc,
  groupId: string,
): Promise<PartyReply<z.infer<typeof RotateCodeSchema>>> {
  return call(cloud, 'party_rotate_code', { p_group: groupId }, RotateCodeSchema);
}

/** Quita a un miembro del grupo. true si estaba dentro */
export function removePartyMember(
  cloud: Rpc,
  input: { groupId: string; memberId: string },
): Promise<PartyReply<boolean>> {
  return call(
    cloud,
    'party_remove_member',
    { p_group: input.groupId, p_member: input.memberId },
    z.boolean(),
  );
}

/** Borra un reto para todo el grupo. true si lo borró y false si ya estaba borrado */
export function deletePartyChallenge(
  cloud: Rpc,
  challengeId: string,
): Promise<PartyReply<boolean>> {
  return call(cloud, 'party_delete_challenge', { p_challenge: challengeId }, z.boolean());
}

// ---------------------------------------------------------------------------------------------
// Exportar mis datos. Las filas propias de Party, que viven solo en la nube

const ExportScoreSchema = z.object({
  correct: z.number().int().nonnegative(),
  answered: z.number().int().positive(),
  totalMs: z.number().int().nonnegative(),
  finishedAt: TimestampSchema,
});

export const PartyExportSchema = z.object({
  memberships: z.array(
    z.object({
      groupId: CloudIdSchema,
      /** Solo de los grupos donde sigue */
      groupName: z.string().nullable(),
      isOwner: z.boolean(),
      joinedAt: TimestampSchema,
      leftAt: TimestampSchema.nullable(),
    }),
  ),
  weeklyXp: z.array(
    z.object({
      groupId: CloudIdSchema,
      weekStart: z.iso.date(),
      xp: z.number().int().nonnegative(),
      updatedAt: TimestampSchema,
    }),
  ),
  challengeContributions: z.array(
    z.object({
      challengeId: CloudIdSchema,
      groupId: CloudIdSchema,
      amount: z.number().int().nonnegative(),
      updatedAt: TimestampSchema,
    }),
  ),
  challengesCreated: z.array(
    z.object({
      challengeId: CloudIdSchema,
      groupId: CloudIdSchema,
      title: z.string(),
      metric: PartyChallengeMetricSchema,
      target: z.number().positive(),
      startsAt: TimestampSchema,
      endsAt: TimestampSchema,
      deletedAt: TimestampSchema.nullable(),
    }),
  ),
  duels: z.array(
    z.object({
      duelId: CloudIdSchema,
      groupId: CloudIdSchema,
      role: z.enum(['challenger', 'opponent']),
      questionCount: z.number().int().positive(),
      createdAt: TimestampSchema,
      startedAt: TimestampSchema.nullable(),
      result: ExportScoreSchema.nullable(),
    }),
  ),
});
export type PartyExport = z.infer<typeof PartyExportSchema>;

/** Las filas de Party de quien llama, sin nada de los demás. No pide que Party esté abierta */
export function fetchMyPartyExport(cloud: Rpc): Promise<PartyReply<PartyExport>> {
  return call(cloud, 'party_export_mine', undefined, PartyExportSchema);
}
