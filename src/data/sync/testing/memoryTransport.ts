// Servidor de sincronización en memoria, para las pruebas. Aplica las mismas reglas que
// supabase/migrations/20261008000002_sync.sql: una fecha estrictamente más nueva reemplaza a la
// que ya hay, un evento con el mismo ID se ignora y cada cambio recibe un contador que crece. Se
// puede apagar, hacer fallar o adelantar su reloj. Solo lo usan las pruebas.
import type { WireEvent, WireRecord } from '@/engines/sync';
import { SyncTransportError, type SyncFailure, type SyncTransport } from '../transport';

export interface MemoryServer {
  records: Map<string, { record: WireRecord; seq: number }>;
  events: Map<string, { event: WireEvent; seq: number }>;
  seq: number;
  /** Cuánto se adelanta (o atrasa) el reloj del servidor frente al del dispositivo de la prueba */
  clockOffsetMs: number;
  /** Mientras tenga un valor, toda llamada falla con esa causa */
  failWith: SyncFailure | null;
  /** Falla solo la próxima llamada que lleve este nombre */
  failNext: { call: keyof SyncTransport; failure: SyncFailure } | null;
  /** Cuántas veces se llamó a cada operación, para comprobar lo que se evita */
  calls: Record<keyof SyncTransport, number>;
  /** Registros que llegaron en cada subida, para revisar lo que viaja */
  pushedRecords: WireRecord[][];
  pushedEvents: WireEvent[][];
}

export function createMemoryServer(): MemoryServer {
  return {
    records: new Map(),
    events: new Map(),
    seq: 0,
    clockOffsetMs: 0,
    failWith: null,
    failNext: null,
    calls: { serverTime: 0, pushRecords: 0, pullRecords: 0, pushEvents: 0, pullEvents: 0 },
    pushedRecords: [],
    pushedEvents: [],
  };
}

export function memoryTransport(
  server: MemoryServer,
  now: () => Date = () => new Date(),
): SyncTransport {
  const enter = (call: keyof SyncTransport) => {
    server.calls[call] += 1;
    const failure =
      server.failNext?.call === call ? server.failNext.failure : (server.failWith ?? null);
    if (server.failNext?.call === call) server.failNext = null;
    if (failure) throw new SyncTransportError(failure, `Falla simulada en ${call}`);
  };

  return {
    serverTime() {
      enter('serverTime');
      return Promise.resolve(new Date(now().getTime() + server.clockOffsetMs));
    },

    pushRecords(records) {
      enter('pushRecords');
      server.pushedRecords.push([...records]);
      for (const record of records) {
        const key = `${record.kind}:${record.id}`;
        const existing = server.records.get(key);
        if (!existing || record.updatedAt > existing.record.updatedAt) {
          server.seq += 1;
          server.records.set(key, { record: structuredClone(record), seq: server.seq });
        }
      }
      return Promise.resolve();
    },

    pullRecords(after, limit) {
      enter('pullRecords');
      const rows = [...server.records.values()]
        .filter((row) => row.seq > after)
        .sort((a, b) => a.seq - b.seq)
        .slice(0, limit);
      return Promise.resolve({
        rows: rows.map((row) => ({ seq: row.seq, record: structuredClone(row.record) })),
        next: rows.at(-1)?.seq ?? after,
        more: rows.length >= limit,
      });
    },

    pushEvents(events) {
      enter('pushEvents');
      server.pushedEvents.push([...events]);
      for (const event of events) {
        if (server.events.has(event.id)) continue;
        server.seq += 1;
        server.events.set(event.id, { event: structuredClone(event), seq: server.seq });
      }
      return Promise.resolve();
    },

    pullEvents(after, limit) {
      enter('pullEvents');
      const rows = [...server.events.values()]
        .filter((row) => row.seq > after)
        .sort((a, b) => a.seq - b.seq)
        .slice(0, limit);
      return Promise.resolve({
        rows: rows.map((row) => ({ seq: row.seq, event: structuredClone(row.event) })),
        next: rows.at(-1)?.seq ?? after,
        more: rows.length >= limit,
      });
    },
  };
}
