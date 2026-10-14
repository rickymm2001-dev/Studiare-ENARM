// Datos de prueba para la capa de datos. Solo los usan las pruebas.
import { monotonicFactory } from 'ulid';
import type { PlanKey } from '@/config/billing';
import { createEnarmDb, type EnarmDb } from '../db/database';
import { createDexieRepositories } from '../repos/dexie/createRepositories';
import type { Repositories } from '../repos/types';
import type { DatabaseKind } from '../databases';
import { createEvent, type Clock } from '../events/createEvent';
import type { Question, Option } from '../schemas/bank';
import type { AppEvent, EventPayload, EventType } from '../schemas/events';
import { UserSettingsSchema, type User } from '../schemas/people';

let dbCounter = 0;

/** Base nueva y aislada para cada prueba, sobre fake-indexeddb */
export function freshDb(kind: DatabaseKind = 'real'): EnarmDb {
  dbCounter += 1;
  return createEnarmDb(kind, { name: `test-${kind}-${dbCounter}-${Date.now()}` });
}

/**
 * API de datos de prueba sobre una base nueva. recordEvent solo agrega a la bitácora, sin las
 * derivaciones, que tienen sus propias pruebas. Las pantallas no pueden importar Dexie, así que sus
 * pruebas de integración pasan por aquí
 */
export function testApi(kind: DatabaseKind = 'real') {
  const db = freshDb(kind);
  const repos = createDexieRepositories(db);
  return {
    repos,
    recordEvent: (event: AppEvent) => repos.events.append(event),
    /** Borra la base al terminar la prueba */
    dispose: () => db.delete(),
  };
}

export const newId = monotonicFactory();

/** Reloj fijo que avanza solo cuando la prueba lo pide */
export function fixedClock(
  startIso = '2026-10-01T15:00:00.000Z',
): Clock & { advance(ms: number): void } {
  let current = new Date(startIso).getTime();
  return {
    now: () => new Date(current),
    advance(ms) {
      current += ms;
    },
  };
}

export function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: newId(),
    alias: 'Alumno de prueba',
    role: 'student',
    examDate: '2027-09-14',
    dailyMinutes: 60,
    timeZone: 'America/Merida',
    settings: UserSettingsSchema.parse({}),
    createdAt: '2026-10-01T15:00:00.000Z',
    ...overrides,
  };
}

/**
 * Deja al alumno con un plan, el único ayudante de las pruebas para eso (B8). simulated es el pago
 * simulado local (3.2). cloud es como lo deja my_plan al reflejar la nube, con su fuente y su fin de
 * periodo, que es lo que lee la app con la nube conectada. free queda sin suscripción activa
 */
export async function subscribe(
  api: { repos: Pick<Repositories, 'subscriptions'> },
  user: Pick<User, 'id'>,
  plan: PlanKey = 'monthly',
  from: 'simulated' | 'cloud' = 'simulated',
): Promise<void> {
  const paid = plan !== 'free';
  await api.repos.subscriptions.put({
    userId: user.id,
    plan,
    status: paid ? 'active' : 'none',
    isSimulated: from === 'simulated',
    ...(from === 'cloud' && paid
      ? {
          source: 'payment' as const,
          periodEnd: new Date(Date.now() + 20 * 86_400_000).toISOString(),
        }
      : {}),
    updatedAt: new Date().toISOString(),
  });
}

export function makeEvent<T extends EventType>(
  type: T,
  payload: EventPayload<T>,
  options: { userId: string; clock?: Clock; sessionId?: string | null },
) {
  return createEvent(type, payload, {
    userId: options.userId,
    tz: 'America/Merida',
    sessionId: options.sessionId ?? null,
    clock: options.clock ?? fixedClock(),
    newId: () => newId(),
  });
}

/** Pregunta válida con 4 opciones, la primera correcta */
export function makeQuestionWithOptions(): { question: Question; options: Option[] } {
  const questionVersionId = newId();
  const optionIds = [newId(), newId(), newId(), newId()];
  const options: Option[] = optionIds.map((id, index) => ({
    id,
    optionId: newId(),
    questionVersionId,
    text: `Opción ${index + 1}`,
    isCorrect: index === 0,
    biasTag: index === 0 ? null : 'anchoring',
    secondaryBiasTags: [],
    rationale: 'Justificación de prueba',
  }));
  const question: Question = {
    id: questionVersionId,
    questionId: newId(),
    version: 1,
    caseId: null,
    caseOrder: null,
    vignette: 'Viñeta de prueba',
    prompt: '¿Cuál es el diagnóstico más probable?',
    branch: 'internal_medicine',
    topic: 'cardiology',
    subtopic: 'heart_failure',
    structure: {
      polarity: 'affirmative',
      task: 'diagnosis',
      format: 'clinical_case',
      source: 'auto',
    },
    explanation: 'Explicación de prueba',
    gpcRefs: [{ title: 'GPC de prueba', status: 'to_verify' }],
    physicianDifficulty: 3,
    canonicalOptionIds: optionIds,
    editorialStatus: 'draft',
    isDemo: true,
    createdAt: '2026-10-01T15:00:00.000Z',
  };
  return { question, options };
}
