// Ayudas de prueba del banco de la nube (B11). Filas del catálogo y cuerpos con la forma exacta que
// devuelven catalog_changes y fetch_questions (2.5 del plan de B11), con ids uuid como en la nube, y un
// doble de rpc que responde con funciones. Todo el texto lleva [Prueba] y es simulado, nunca médico.
import type { SupabaseClient } from '@supabase/supabase-js';
import { ulidToUuid } from '../cloud/cloudIds';
import { newId } from '../ids';
import { studyDayEnd, studyDayOf } from '../../engines/studyDay';
import type { CatalogRow, DenyReason, FetchedQuestion, QuotaInfo } from '../bank/contracts';

/** Un uuid nuevo que la app puede convertir a ULID */
export function cloudId(): string {
  const uuid = ulidToUuid(newId());
  if (!uuid) throw new Error('No se pudo crear el id de prueba');
  return uuid;
}

export function wireRow(overrides: Partial<CatalogRow> = {}): CatalogRow {
  return {
    questionId: cloudId(),
    versionId: cloudId(),
    version: 1,
    branch: 'internal_medicine',
    topic: 'cardiology',
    subtopic: 'hypertension',
    difficulty: 3,
    itemKinds: [],
    polarity: 'affirmative',
    task: 'diagnosis',
    format: 'direct',
    caseId: null,
    caseOrder: null,
    caseSize: null,
    variantOf: null,
    examEligible: true,
    distractorBiases: ['anchoring'],
    optionCount: 4,
    language: 'es',
    status: 'published',
    seq: 1,
    ...overrides,
  };
}

/** El cuerpo de la versión de una fila del catálogo, con cuatro opciones */
export function wireBody(
  row: CatalogRow,
  overrides: Partial<FetchedQuestion> = {},
): FetchedQuestion {
  const options = ['A', 'B', 'C', 'D'].map((letter, position) => ({
    id: cloudId(),
    optionId: cloudId(),
    position,
    text: `[Prueba] Opción ${letter} simulada`,
    isCorrect: position === 0,
    biasTag: position === 0 ? null : 'anchoring',
    secondaryBiasTags: [],
    rationale: `[Prueba] Justificación simulada ${letter}`,
  }));
  return {
    questionId: row.questionId,
    versionId: row.versionId,
    version: row.version,
    branch: row.branch,
    topic: row.topic,
    subtopic: row.subtopic,
    caseId: row.caseId,
    caseOrder: row.caseOrder,
    vignette: '[Prueba] Contenido simulado, no es contenido médico.',
    prompt: '[Prueba] ¿Cuál es la respuesta simulada?',
    structure: { polarity: row.polarity, task: row.task, format: row.format, source: 'physician' },
    explanation: '[Prueba] Explicación simulada.',
    gpcRefs: [{ title: '[Prueba] Referencia simulada', status: 'to_verify' }],
    itemKinds: row.itemKinds,
    clues: [],
    physicianDifficulty: row.difficulty,
    variantOf: row.variantOf,
    canonicalOptionIds: options.map((option) => option.id),
    language: row.language,
    createdAt: '2026-10-20T15:00:00.000Z',
    options,
    ...overrides,
  };
}

/**
 * El día de estudio de Mérida de este instante y cuándo termina. No llevan fecha fija, porque una cuota con
 * un resetsAt ya vencido la app la da por caducada y las pruebas dejarían de ver los topes
 */
export function wireQuota(overrides: Partial<QuotaInfo> = {}): QuotaInfo {
  const day = studyDayOf(new Date(), 'America/Merida');
  return {
    open: true,
    plan: 'free',
    limit: 20,
    used: 0,
    left: 20,
    day,
    resetsAt: studyDayEnd(day, 'America/Merida').toISOString(),
    brake: { retryAt: null },
    ...overrides,
  };
}

export interface RpcCall {
  name: string;
  args: Record<string, unknown> | undefined;
}

type Handler = (args: Record<string, unknown> | undefined) => unknown;

/** Lo que devuelve un manejador para responder como error de la base, con su SQLSTATE */
export class FakeDbError {
  readonly code: string;
  constructor(code: string) {
    this.code = code;
  }
}

/**
 * Un doble de cloud.rpc. Cada función responde con lo que devuelve su manejador. Un manejador que
 * devuelve FakeDbError responde como error de la base, y uno que lanza, como falla de red
 */
export function fakeRpc(
  handlers: Record<string, Handler>,
): { calls: RpcCall[] } & Pick<SupabaseClient, 'rpc'> {
  const calls: RpcCall[] = [];
  const fake = {
    calls,
    rpc(name: string, args?: Record<string, unknown>) {
      calls.push({ name, args });
      const handler = handlers[name];
      if (!handler) {
        return Promise.resolve({ data: null, error: { code: 'PGRST202', message: name } });
      }
      try {
        const data = handler(args);
        return Promise.resolve(
          data instanceof FakeDbError
            ? { data: null, error: { code: data.code, message: name } }
            : { data, error: null },
        );
      } catch (error) {
        return Promise.reject(error instanceof Error ? error : new Error(String(error)));
      }
    },
  };
  // supabase-js devuelve un constructor de consultas que también es promesa. La app solo lo espera
  return fake as unknown as { calls: RpcCall[] } & Pick<SupabaseClient, 'rpc'>;
}

/**
 * Un servidor del banco en memoria, con las reglas de 2.2. Gratis abre freeLimit preguntas nuevas por
 * día, un caso seriado se concede completo o nada y lo ya abierto no gasta otra vez
 */
export function fakeBankServer(
  rows: CatalogRow[],
  options: { freeLimit?: number; open?: boolean; plan?: string } = {},
) {
  const bodies = new Map<string, FetchedQuestion>(
    rows.map((row) => [row.versionId, wireBody(row)]),
  );
  const read = new Set<string>();
  const limit = options.freeLimit ?? 20;
  const state = {
    open: options.open ?? true,
    offline: false,
    deny: new Map<string, DenyReason>(),
    /** El freno de un plan de pago. Con hora, todo lo nuevo sale negado con brake */
    brakeUntil: null as string | null,
    plan: options.plan ?? 'free',
    agreement: {
      pairs: 31,
      kappa: 0.52,
      vocabulary: 'bias' as 'bias' | 'trap',
      calibrating: false,
      minPairs: 30,
      minKappa: 0.4,
    },
  };
  const free = () => state.plan === 'free';
  const quota = () =>
    wireQuota({
      plan: state.plan,
      limit: free() ? limit : null,
      used: read.size,
      left: free() ? Math.max(0, limit - read.size) : null,
      open: state.open,
      brake: { retryAt: state.brakeUntil },
    });
  const throwIfOffline = () => {
    if (state.offline) throw new Error('Failed to fetch');
  };
  const server = fakeRpc({
    catalog_changes(args) {
      throwIfOffline();
      const since = Number(args?.p_since ?? 0);
      const pageSize = Number(args?.p_limit ?? 1000);
      if (!state.open) return { open: false, rows: [], nextSince: since, done: true };
      const after = rows.filter((row) => row.seq > since).sort((a, b) => a.seq - b.seq);
      const page = after.slice(0, pageSize);
      return {
        open: true,
        rows: page,
        nextSince: page.at(-1)?.seq ?? since,
        done: page.length === after.length,
      };
    },
    fetch_questions(args) {
      throwIfOffline();
      const ids = (args?.p_version_ids as string[] | undefined) ?? [];
      if (ids.length > 100) return new FakeDbError('22023');
      const granted: FetchedQuestion[] = [];
      const denied: { id: string; reason: DenyReason }[] = [];
      const handled = new Set<string>();
      for (const id of ids) {
        if (handled.has(id)) continue;
        const body = bodies.get(id);
        const forced = state.deny.get(id);
        if (!state.open || !body || forced) {
          handled.add(id);
          denied.push({ id, reason: !state.open ? 'closed' : (forced ?? 'not_found') });
          continue;
        }
        const unit = body.caseId
          ? ids.filter((other) => bodies.get(other)?.caseId === body.caseId)
          : [id];
        for (const member of unit) handled.add(member);
        const fresh = unit.filter((member) => !read.has(member));
        if (free() && read.size + fresh.length > limit) {
          denied.push(...unit.map((member) => ({ id: member, reason: 'daily_limit' as const })));
          continue;
        }
        if (!free() && state.brakeUntil && fresh.length > 0) {
          denied.push(...unit.map((member) => ({ id: member, reason: 'brake' as const })));
          continue;
        }
        for (const member of unit) {
          read.add(member);
          granted.push(bodies.get(member) as FetchedQuestion);
        }
      }
      const caseIds = [...new Set(granted.flatMap((body) => (body.caseId ? [body.caseId] : [])))];
      return {
        questions: granted,
        cases: caseIds.map((id) => ({
          id,
          vignette: '[Prueba] Caso simulado',
          createdAt: '2026-10-20T15:00:00.000Z',
        })),
        denied,
        quota: quota(),
      };
    },
    bank_quota() {
      throwIfOffline();
      return quota();
    },
    bias_agreement_summary() {
      throwIfOffline();
      return {
        pairs: 31,
        kappa: 0.52,
        vocabulary: 'bias',
        calibrating: false,
        minPairs: 30,
        minKappa: 0.4,
      };
    },
  });
  return { server, state, read, bodies };
}
