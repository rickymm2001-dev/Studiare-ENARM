// IDs nuevos con ULID monotónico, ordenables por tiempo (PLAN.md 4.1).
import { monotonicFactory } from 'ulid';

const next = monotonicFactory();

export function newId(): string {
  return next();
}
