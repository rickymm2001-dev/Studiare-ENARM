// Ayudas de prueba del banco de la nube (B11). Filas del catálogo y cuerpos con la forma exacta que
// devuelven catalog_changes y fetch_questions (2.5 del plan de B11), con ids uuid como en la nube, y un
// doble de rpc que responde con funciones. Todo el texto lleva [Prueba] y es simulado, nunca médico.
import type { SupabaseClient } from '@supabase/supabase-js';
import { ulidToUuid } from '../cloud/cloudIds';
import { newId } from '../ids';
import type { CatalogRow, FetchedQuestion, QuotaInfo } from '../bank/contracts';

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

export function wireQuota(overrides: Partial<QuotaInfo> = {}): QuotaInfo {
  return {
    open: true,
    plan: 'free',
    limit: 20,
    used: 0,
    left: 20,
    day: '2026-10-20',
    resetsAt: '2026-10-21T10:00:00.000Z',
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
  constructor(readonly code: string) {}
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
