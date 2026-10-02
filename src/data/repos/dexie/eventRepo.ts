// Bitácora con Dexie. Este archivo solo agrega y lee. Una prueba revisa que nunca llame a
// métodos que editan o borran, además del bloqueo en database.ts.
import type { EnarmDb } from '../../db/database';
import { UtcDateTimeSchema } from '../../schemas/common';
import { AppEventSchema, type AppEvent } from '../../schemas/events';
import type { EventFilter, EventRepo } from '../types';

const MIN_AT = '0000-01-01T00:00:00.000Z';
const MAX_AT = '9999-12-31T23:59:59.999Z';

/** Los límites de tiempo usan el mismo formato que los eventos, si no la comparación de texto miente */
function timeBounds(filter: EventFilter): { from: string; to: string } {
  return {
    from: filter.from === undefined ? MIN_AT : UtcDateTimeSchema.parse(filter.from),
    to: filter.to === undefined ? MAX_AT : UtcDateTimeSchema.parse(filter.to),
  };
}

function matches(event: AppEvent, filter: EventFilter): boolean {
  if (filter.types && !filter.types.includes(event.type)) return false;
  if (filter.sessionId && event.sessionId !== filter.sessionId) return false;
  if (filter.from && event.at < filter.from) return false;
  if (filter.to && event.at > filter.to) return false;
  return true;
}

function byTime(a: AppEvent, b: AppEvent): number {
  if (a.at !== b.at) return a.at < b.at ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function createDexieEventRepo(db: EnarmDb, options?: { pageSize?: number }): EventRepo {
  const pageSize = options?.pageSize ?? 500;

  return {
    async append(event) {
      const parsed = AppEventSchema.parse(event);
      await db.events.add(parsed);
      return parsed;
    },

    async query(filter) {
      const { from, to } = timeBounds(filter);
      const singleType = filter.types?.length === 1 ? filter.types[0] : undefined;
      const candidates = singleType
        ? await db.events.where('[userId+type]').equals([filter.userId, singleType]).toArray()
        : await db.events
            .where('[userId+at]')
            .between([filter.userId, from], [filter.userId, to], true, true)
            .toArray();
      const result = candidates.filter((event) => matches(event, filter)).sort(byTime);
      return filter.limit === undefined ? result : result.slice(0, filter.limit);
    },

    async *stream(filter) {
      // Paginación por llave [userId+at]. Los eventos del mismo milisegundo se distinguen por ID
      const bounds = timeBounds(filter);
      let lowerAt = bounds.from;
      const upperAt = bounds.to;
      let seenAtLower = new Set<string>();
      let emitted = 0;
      for (;;) {
        const page = await db.events
          .where('[userId+at]')
          .between([filter.userId, lowerAt], [filter.userId, upperAt], true, true)
          .filter((event) => !(event.at === lowerAt && seenAtLower.has(event.id)))
          .limit(pageSize)
          .toArray();
        if (page.length === 0) return;
        page.sort(byTime);
        for (const event of page) {
          if (matches(event, filter)) {
            yield event;
            emitted += 1;
            if (filter.limit !== undefined && emitted >= filter.limit) return;
          }
        }
        const last = page[page.length - 1];
        if (!last) return;
        if (last.at !== lowerAt) {
          lowerAt = last.at;
          seenAtLower = new Set();
        }
        for (const event of page) if (event.at === lowerAt) seenAtLower.add(event.id);
        if (page.length < pageSize) return;
      }
    },
  };
}
