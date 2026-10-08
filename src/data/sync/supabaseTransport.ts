// Sincronización con Supabase (D-095). Escribe solo con las funciones sync_push_records y
// sync_push_events, que aplican la regla de la fecha más reciente en el servidor, y lee con las
// políticas por fila de sync_records y events. Lo que baja se valida de nuevo con zod, porque el
// servidor es un tercero.
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { SYNC_KINDS, type WireEvent, type WireRecord } from '@/engines/sync';
import {
  SyncTransportError,
  type Page,
  type PulledEvent,
  type PulledRecord,
  type SyncFailure,
  type SyncTransport,
} from './transport';

interface CloudError {
  code?: string | null;
  message?: string | null;
  status?: number | null;
}

/** Traduce el error de Supabase a la causa que importa. Sin código es que la red no respondió */
export function failureOf(error: CloudError): SyncFailure {
  const code = error.code ?? '';
  if (code === '42501') return 'device';
  if (code === '28000' || code === 'PGRST301' || error.status === 401) return 'auth';
  if (code === 'SY002') return 'clock';
  if (code === '') return 'network';
  return 'server';
}

function fail(error: CloudError): never {
  throw new SyncTransportError(failureOf(error), error.message ?? 'Error de sincronización');
}

const Seq = z.coerce.number().int().nonnegative();

const RecordRowSchema = z.object({
  kind: z.enum(SYNC_KINDS),
  record_id: z.string().min(1).max(64),
  data: z.record(z.string(), z.unknown()),
  updated_at: z.string(),
  deleted_at: z.string().nullable(),
  server_seq: Seq,
});

const EventRowSchema = z.object({
  id: z.string().min(1).max(64),
  type: z.string().min(1).max(64),
  at: z.string(),
  tz: z.string().min(1).max(64),
  session_id: z.string().nullable(),
  schema_version: z.coerce.number().int(),
  payload: z.record(z.string(), z.unknown()),
  seq: Seq,
});

/** Postgres devuelve las fechas con zona, por ejemplo 2026-10-08T10:00:00+00:00 */
function isoOf(value: string): string {
  const time = Date.parse(value);
  if (Number.isNaN(time))
    throw new SyncTransportError('server', 'El servidor mandó una fecha inválida');
  return new Date(time).toISOString();
}

/**
 * El cursor sigue la última fila que llegó, también la que se saltó por no entenderse, para no
 * pedirla una y otra vez. Hay otra página si esta vino llena
 */
function pageOf<T>(
  raws: readonly unknown[],
  limit: number,
  after: number,
  field: 'seq' | 'server_seq',
  rows: T[],
): Page<T> {
  let next = after;
  for (const raw of raws) {
    const parsed = Seq.safeParse((raw as Record<string, unknown> | null)?.[field]);
    if (parsed.success && parsed.data > next) next = parsed.data;
  }
  return { rows, next, more: raws.length >= limit };
}

export function createSupabaseTransport(cloud: SupabaseClient): SyncTransport {
  return {
    async serverTime() {
      const reply = await cloud.rpc('sync_clock');
      if (reply.error) fail(reply.error);
      const data: unknown = reply.data;
      const time = typeof data === 'string' ? Date.parse(data) : Number.NaN;
      if (Number.isNaN(time))
        throw new SyncTransportError('server', 'El servidor no mandó su hora');
      return new Date(time);
    },

    async pushRecords(records) {
      if (records.length === 0) return;
      const { error } = await cloud.rpc('sync_push_records', { p_records: records });
      if (error) fail(error);
    },

    async pullRecords(after, limit) {
      const { data, error } = await cloud
        .from('sync_records')
        .select('kind, record_id, data, updated_at, deleted_at, server_seq')
        .gt('server_seq', after)
        .order('server_seq', { ascending: true })
        .limit(limit);
      if (error) fail(error);
      const rows: unknown = data;
      const raws: unknown[] = Array.isArray(rows) ? (rows as unknown[]) : [];
      const out: PulledRecord[] = [];
      for (const raw of raws) {
        const row = RecordRowSchema.safeParse(raw);
        // Un tipo que este navegador no conoce, por ejemplo de una versión más nueva, se salta pero
        // el cursor sigue. Quedará sin bajar hasta que la app se actualice y se reinicie el avance
        if (!row.success) continue;
        const record: WireRecord = {
          kind: row.data.kind,
          id: row.data.record_id,
          updatedAt: isoOf(row.data.updated_at),
          deletedAt: row.data.deleted_at === null ? null : isoOf(row.data.deleted_at),
          data: row.data.data,
        };
        out.push({ seq: row.data.server_seq, record });
      }
      return pageOf(raws, limit, after, 'server_seq', out);
    },

    async pushEvents(events) {
      if (events.length === 0) return;
      const { error } = await cloud.rpc('sync_push_events', { p_events: events });
      if (error) fail(error);
    },

    async pullEvents(after, limit) {
      const { data, error } = await cloud
        .from('events')
        .select('id, type, at, tz, session_id, schema_version, payload, seq')
        .gt('seq', after)
        .order('seq', { ascending: true })
        .limit(limit);
      if (error) fail(error);
      const rows: unknown = data;
      const raws: unknown[] = Array.isArray(rows) ? (rows as unknown[]) : [];
      const out: PulledEvent[] = [];
      for (const raw of raws) {
        const row = EventRowSchema.safeParse(raw);
        if (!row.success) continue;
        const event: WireEvent = {
          id: row.data.id,
          type: row.data.type,
          at: isoOf(row.data.at),
          tz: row.data.tz,
          sessionId: row.data.session_id,
          schemaVersion: row.data.schema_version,
          payload: row.data.payload,
        };
        out.push({ seq: row.data.seq, event });
      }
      return pageOf(raws, limit, after, 'seq', out);
    },
  };
}
