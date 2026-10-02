// Arma un evento con sus campos comunes y lo valida. El reloj y el generador de IDs se
// inyectan para poder probar de forma determinista.
import { ulid } from 'ulid';
import type { Id } from '../schemas/common';
import {
  AppEventSchema,
  EVENT_SCHEMA_VERSION,
  type EventOf,
  type EventPayload,
  type EventType,
} from '../schemas/events';

export interface Clock {
  now(): Date;
}

export const systemClock: Clock = { now: () => new Date() };

export interface EventContext {
  userId: Id;
  tz: string;
  sessionId?: Id | null;
  clock?: Clock;
  newId?: () => string;
}

export function createEvent<T extends EventType>(
  type: T,
  payload: EventPayload<T>,
  context: EventContext,
): EventOf<T> {
  const clock = context.clock ?? systemClock;
  const now = clock.now();
  const candidate = {
    id: context.newId ? context.newId() : ulid(now.getTime()),
    type,
    userId: context.userId,
    at: now.toISOString(),
    tz: context.tz,
    schemaVersion: EVENT_SCHEMA_VERSION,
    sessionId: context.sessionId ?? null,
    payload,
  };
  // El esquema confirma que el payload corresponde al tipo, así que el resultado es EventOf<T>
  return AppEventSchema.parse(candidate) as EventOf<T>;
}
