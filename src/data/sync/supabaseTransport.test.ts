import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { createSupabaseTransport, failureOf } from './supabaseTransport';
import { SyncTransportError } from './transport';

interface Reply {
  data?: unknown;
  error?: { code?: string; message?: string; status?: number } | null;
}

/** Imita lo que usa el transporte de Supabase. Anota cada llamada y devuelve lo que se le diga */
function fakeCloud(reply: Reply) {
  const calls: { rpc: [string, unknown?][]; from: string[]; filters: unknown[] } = {
    rpc: [],
    from: [],
    filters: [],
  };
  const result = () => Promise.resolve({ data: reply.data ?? null, error: reply.error ?? null });
  const chain = {
    select: (columns: string) => {
      calls.filters.push(['select', columns]);
      return chain;
    },
    gt: (column: string, value: number) => {
      calls.filters.push(['gt', column, value]);
      return chain;
    },
    order: (column: string, options: unknown) => {
      calls.filters.push(['order', column, options]);
      return chain;
    },
    limit: (count: number) => {
      calls.filters.push(['limit', count]);
      return result();
    },
  };
  const cloud = {
    rpc: (name: string, args?: unknown) => {
      calls.rpc.push([name, args]);
      return result();
    },
    from: (table: string) => {
      calls.from.push(table);
      return chain;
    },
  } as unknown as SupabaseClient;
  return { cloud, calls };
}

const record = {
  kind: 'deck' as const,
  id: '01J9Z000000000000000000001',
  updatedAt: '2026-10-08T10:00:00.000Z',
  deletedAt: null,
  data: { id: '01J9Z000000000000000000001' },
};

describe('causa de un error del servidor', () => {
  it('traduce los códigos que importan', () => {
    expect(failureOf({ code: '42501' })).toBe('device');
    expect(failureOf({ code: '28000' })).toBe('auth');
    expect(failureOf({ code: 'PGRST301' })).toBe('auth');
    expect(failureOf({ code: 'XX000', status: 401 })).toBe('auth');
    expect(failureOf({ code: 'SY002' })).toBe('clock');
    expect(failureOf({ code: '22023' })).toBe('server');
    // Sin código es que la red no respondió
    expect(failureOf({ message: 'TypeError: Failed to fetch' })).toBe('network');
    expect(failureOf({ code: '' })).toBe('network');
  });
});

describe('transporte con Supabase', () => {
  it('lee la hora del servidor', async () => {
    const { cloud, calls } = fakeCloud({ data: '2026-10-08T10:00:05.123456+00:00' });
    const time = await createSupabaseTransport(cloud).serverTime();
    expect(time.toISOString()).toBe('2026-10-08T10:00:05.123Z');
    expect(calls.rpc[0]?.[0]).toBe('sync_clock');
  });

  it('una hora que no se entiende es un error del servidor', async () => {
    const { cloud } = fakeCloud({ data: 'ayer' });
    await expect(createSupabaseTransport(cloud).serverTime()).rejects.toMatchObject({
      failure: 'server',
    });
  });

  it('sube registros y eventos por las funciones del servidor', async () => {
    const { cloud, calls } = fakeCloud({ data: 1 });
    const transport = createSupabaseTransport(cloud);
    await transport.pushRecords([record]);
    await transport.pushEvents([
      {
        id: 'e1',
        type: 'xp_awarded',
        at: '2026-10-08T10:00:00.000Z',
        tz: 'America/Merida',
        sessionId: null,
        schemaVersion: 1,
        payload: {},
      },
    ]);
    expect(calls.rpc.map(([name]) => name)).toEqual(['sync_push_records', 'sync_push_events']);
    expect(calls.rpc[0]?.[1]).toEqual({ p_records: [record] });
  });

  it('no llama al servidor si no hay nada que subir', async () => {
    const { cloud, calls } = fakeCloud({});
    const transport = createSupabaseTransport(cloud);
    await transport.pushRecords([]);
    await transport.pushEvents([]);
    expect(calls.rpc).toHaveLength(0);
  });

  it('un error al subir sale con su causa', async () => {
    const { cloud } = fakeCloud({ error: { code: '42501', message: 'no es el activo' } });
    const transport = createSupabaseTransport(cloud);
    const error = await transport.pushRecords([record]).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(SyncTransportError);
    expect(error).toMatchObject({ failure: 'device' });
  });

  it('baja registros con el cursor y convierte las fechas', async () => {
    const { cloud, calls } = fakeCloud({
      data: [
        {
          kind: 'deck',
          record_id: 'D1',
          data: { id: 'D1' },
          updated_at: '2026-10-08T10:00:00+00:00',
          deleted_at: null,
          server_seq: 7,
        },
        {
          kind: 'note',
          record_id: 'N1',
          data: { id: 'N1' },
          updated_at: '2026-10-08T10:00:01.5+00:00',
          deleted_at: '2026-10-08T10:00:01.5+00:00',
          server_seq: '8',
        },
      ],
    });
    const page = await createSupabaseTransport(cloud).pullRecords(5, 500);
    expect(calls.from).toEqual(['sync_records']);
    expect(calls.filters).toContainEqual(['gt', 'server_seq', 5]);
    expect(calls.filters).toContainEqual(['limit', 500]);
    expect(page.next).toBe(8);
    expect(page.more).toBe(false);
    expect(page.rows[0]).toEqual({
      seq: 7,
      record: {
        kind: 'deck',
        id: 'D1',
        updatedAt: '2026-10-08T10:00:00.000Z',
        deletedAt: null,
        data: { id: 'D1' },
      },
    });
    expect(page.rows[1]?.record).toMatchObject({
      updatedAt: '2026-10-08T10:00:01.500Z',
      deletedAt: '2026-10-08T10:00:01.500Z',
    });
  });

  it('salta lo que no entiende pero el cursor lo pasa, y avisa si la página vino llena', async () => {
    const { cloud } = fakeCloud({
      data: [
        {
          kind: 'tipo_nuevo',
          record_id: 'X',
          data: {},
          updated_at: '2026-10-08T10:00:00+00:00',
          deleted_at: null,
          server_seq: 9,
        },
        { basura: true },
      ],
    });
    const page = await createSupabaseTransport(cloud).pullRecords(5, 2);
    expect(page.rows).toHaveLength(0);
    expect(page.next).toBe(9);
    expect(page.more).toBe(true);
  });

  it('baja eventos con el cursor por seq', async () => {
    const { cloud, calls } = fakeCloud({
      data: [
        {
          id: 'e1',
          type: 'xp_awarded',
          at: '2026-10-08T10:00:00+00:00',
          tz: 'America/Merida',
          session_id: null,
          schema_version: 1,
          payload: { amount: 1 },
          seq: 3,
        },
      ],
    });
    const page = await createSupabaseTransport(cloud).pullEvents(2, 500);
    expect(calls.from).toEqual(['events']);
    expect(calls.filters).toContainEqual(['gt', 'seq', 2]);
    expect(page.rows[0]?.event).toEqual({
      id: 'e1',
      type: 'xp_awarded',
      at: '2026-10-08T10:00:00.000Z',
      tz: 'America/Merida',
      sessionId: null,
      schemaVersion: 1,
      payload: { amount: 1 },
    });
    expect(page.next).toBe(3);
  });

  it('sin filas el cursor se queda donde estaba', async () => {
    const { cloud } = fakeCloud({ data: [] });
    const page = await createSupabaseTransport(cloud).pullEvents(41, 500);
    expect(page).toEqual({ rows: [], next: 41, more: false });
  });
});
