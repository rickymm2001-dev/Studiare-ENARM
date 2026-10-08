// Dos dispositivos que editan lo mismo en cualquier orden terminan con lo mismo (D-095). Se modela
// un servidor que aplica la regla de la fecha más reciente (se queda con lo que ya tenía si hay
// empate) y dos navegadores con IDs de alumno distintos, y se sincroniza en cualquier orden.
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { Deck } from '@/data/schemas/decks';
import {
  PAGE_SIZE,
  canonical,
  fromWire,
  idOf,
  keyOf,
  planPull,
  planPush,
  stampOf,
  watermarkAfter,
  type SyncItem,
  type WireRecord,
} from './sync';

const DECK_IDS = [
  '01J9Z000000000000000000001',
  '01J9Z000000000000000000002',
  '01J9Z000000000000000000003',
];
const USER_IDS = { A: '01J9Z0000000000000000000A1', B: '01J9Z0000000000000000000B1' } as const;
const BASE = Date.parse('2026-10-08T10:00:00.000Z');
/** Con lotes de 2 se prueba el corte a la mitad de un grupo con la misma fecha */
const BATCH = 2;

type Who = keyof typeof USER_IDS;

interface Server {
  rows: Map<string, { wire: WireRecord; seq: number }>;
  seq: number;
}

function serverPush(server: Server, records: readonly WireRecord[]): void {
  for (const wire of records) {
    const key = `${wire.kind}:${wire.id}`;
    const existing = server.rows.get(key);
    // La regla del servidor. Solo una fecha estrictamente más nueva reemplaza a la que ya había
    if (!existing || wire.updatedAt > existing.wire.updatedAt) {
      server.seq += 1;
      server.rows.set(key, { wire, seq: server.seq });
    }
  }
}

interface Client {
  userId: string;
  store: Map<string, SyncItem>;
  cursor: number;
  watermark: string | null;
}

function newClient(who: Who): Client {
  return { userId: USER_IDS[who], store: new Map(), cursor: 0, watermark: null };
}

function sync(client: Client, server: Server, now: Date): void {
  // Bajar. Todo lo que tenga un contador mayor que el cursor
  const fresh = [...server.rows.values()]
    .filter((row) => row.seq > client.cursor)
    .sort((a, b) => a.seq - b.seq);
  const incoming: SyncItem[] = [];
  for (const row of fresh) {
    const parsed = fromWire(row.wire, client.userId);
    if (parsed.ok) incoming.push(parsed.item);
    client.cursor = row.seq;
  }
  for (const remote of planPull(client.store, incoming)) client.store.set(keyOf(remote), remote);

  // Subir en lotes. La marca de agua avanza con cada lote que llega
  const plan = planPush([...client.store.values()], client.watermark, client.userId);
  for (let sent = 0; sent < plan.length; sent += BATCH) {
    serverPush(server, plan.slice(sent, sent + BATCH));
    client.watermark = watermarkAfter(
      plan,
      Math.min(sent + BATCH, plan.length),
      client.watermark,
      now,
    );
  }
}

function write(client: Client, deckId: string, at: number, label: string, deleted: boolean): void {
  const stamp = new Date(BASE + at * 1000).toISOString();
  const deck: Deck = {
    id: deckId,
    name: label,
    description: '',
    ownerId: client.userId,
    origin: 'manual',
    visibility: 'private',
    isDemo: false,
    parentId: null,
    createdAt: new Date(BASE).toISOString(),
    updatedAt: stamp,
    deletedAt: deleted ? stamp : null,
  };
  client.store.set(keyOf({ kind: 'deck', value: deck }), { kind: 'deck', value: deck });
}

type Op =
  | { type: 'write'; who: Who; deck: number; advance: number; deleted: boolean }
  | { type: 'sync'; who: Who; advance: number };

const opArb: fc.Arbitrary<Op> = fc.oneof(
  fc.record({
    type: fc.constant('write' as const),
    who: fc.constantFrom<Who>('A', 'B'),
    deck: fc.integer({ min: 0, max: DECK_IDS.length - 1 }),
    // 0 deja dos escrituras con exactamente la misma fecha
    advance: fc.integer({ min: 0, max: 20 }),
    deleted: fc.boolean(),
  }),
  fc.record({
    type: fc.constant('sync' as const),
    who: fc.constantFrom<Who>('A', 'B'),
    advance: fc.integer({ min: 0, max: 20 }),
  }),
);

interface World {
  server: Server;
  clients: Record<Who, Client>;
  /** La mejor fecha escrita para cada mazo, con la que debe quedar todo */
  best: Map<string, string>;
  time: number;
}

function run(ops: readonly Op[]): World {
  const world: World = {
    server: { rows: new Map(), seq: 0 },
    clients: { A: newClient('A'), B: newClient('B') },
    best: new Map(),
    time: 1,
  };
  let counter = 0;
  for (const op of ops) {
    world.time += op.advance;
    if (op.type === 'write') {
      counter += 1;
      const id = DECK_IDS[op.deck] as string;
      write(world.clients[op.who], id, world.time, `${op.who}${counter}`, op.deleted);
      const stamp = new Date(BASE + world.time * 1000).toISOString();
      const best = world.best.get(id);
      if (best === undefined || stamp > best) world.best.set(id, stamp);
    } else {
      sync(world.clients[op.who], world.server, new Date(BASE + world.time * 1000));
    }
  }
  return world;
}

/** Sincroniza hasta que ya no hay nada que mover, con el reloj lo bastante adelante */
function settle(world: World): void {
  const later = new Date(BASE + (world.time + 3600) * 1000);
  for (let round = 0; round < 3; round += 1) {
    sync(world.clients.A, world.server, later);
    sync(world.clients.B, world.server, later);
  }
}

const dataOf = (store: ReadonlyMap<string, SyncItem>) =>
  [...store.entries()]
    .map(([key, item]) => [key, canonical({ ...item.value, ownerId: 'dueño' })] as const)
    .sort(([a], [b]) => (a < b ? -1 : 1));

describe('convergencia de dos dispositivos', () => {
  it('terminan con lo mismo y con la edición más reciente de cada mazo', () => {
    fc.assert(
      fc.property(fc.array(opArb, { minLength: 1, maxLength: 40 }), (ops) => {
        const world = run(ops);
        settle(world);
        expect(dataOf(world.clients.A.store)).toEqual(dataOf(world.clients.B.store));
        for (const [key, item] of world.clients.A.store) {
          expect(stampOf(item)).toBe(world.best.get(idOf(item)));
          const row = world.server.rows.get(key);
          expect(row?.wire.updatedAt).toBe(stampOf(item));
        }
        // Todo lo que se escribió quedó en los dos
        expect(world.clients.A.store.size).toBe(world.best.size);
      }),
      { numRuns: 300 },
    );
  });

  it('sincronizar otra vez no cambia nada ni sube nada', () => {
    fc.assert(
      fc.property(fc.array(opArb, { minLength: 1, maxLength: 40 }), (ops) => {
        const world = run(ops);
        settle(world);
        const before = dataOf(world.clients.A.store);
        const seq = world.server.seq;
        const later = new Date(BASE + (world.time + 7200) * 1000);
        sync(world.clients.A, world.server, later);
        sync(world.clients.B, world.server, later);
        expect(dataOf(world.clients.A.store)).toEqual(before);
        expect(world.server.seq).toBe(seq);
      }),
      { numRuns: 200 },
    );
  });

  it('un borrado más nuevo se propaga y una edición más nueva revive el mazo', () => {
    const world: World = {
      server: { rows: new Map(), seq: 0 },
      clients: { A: newClient('A'), B: newClient('B') },
      best: new Map(),
      time: 1,
    };
    const id = DECK_IDS[0] as string;
    const at = (seconds: number) => new Date(BASE + seconds * 1000);
    write(world.clients.A, id, 1, 'creado', false);
    sync(world.clients.A, world.server, at(100));
    sync(world.clients.B, world.server, at(100));
    expect(world.clients.B.store.size).toBe(1);

    write(world.clients.B, id, 200, 'borrado', true);
    sync(world.clients.B, world.server, at(400));
    sync(world.clients.A, world.server, at(400));
    const afterDelete = [...world.clients.A.store.values()][0];
    expect(
      afterDelete && 'deletedAt' in afterDelete.value && afterDelete.value.deletedAt,
    ).toBeTruthy();

    write(world.clients.A, id, 500, 'revivido', false);
    sync(world.clients.A, world.server, at(700));
    sync(world.clients.B, world.server, at(700));
    const revived = [...world.clients.B.store.values()][0];
    expect(revived?.value).toMatchObject({ name: 'revivido', deletedAt: null });
  });

  it('un dispositivo con otro ID de alumno recibe los mazos como suyos', () => {
    const world: World = {
      server: { rows: new Map(), seq: 0 },
      clients: { A: newClient('A'), B: newClient('B') },
      best: new Map(),
      time: 1,
    };
    write(world.clients.A, DECK_IDS[0] as string, 1, 'de A', false);
    sync(world.clients.A, world.server, new Date(BASE + 100_000));
    sync(world.clients.B, world.server, new Date(BASE + 100_000));
    const received = [...world.clients.B.store.values()][0];
    expect(received?.value).toMatchObject({ ownerId: USER_IDS.B, name: 'de A' });
    expect(JSON.stringify([...world.server.rows.values()])).not.toContain(USER_IDS.A);
    expect(PAGE_SIZE).toBeGreaterThan(BATCH);
  });
});
