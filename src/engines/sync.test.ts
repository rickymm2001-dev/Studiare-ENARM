import { monotonicFactory } from 'ulid';
import { describe, expect, it } from 'vitest';
import type { WidgetLayout } from '@/data/schemas/activity';
import type { Card, Deck, Note } from '@/data/schemas/decks';
import { createEvent } from '@/data/events/createEvent';
import type { OutlinePage } from '@/data/schemas/outlines';
import {
  MAX_CLOCK_SKEW_MS,
  PAGE_SIZE,
  RETRY_MAX_MS,
  SELF,
  WIDGET_LAYOUT_ID,
  canonical,
  clockIsTrustworthy,
  clockSkewMs,
  collectSyncable,
  deletedAtOf,
  eventFromWire,
  eventToWire,
  fromWire,
  idOf,
  keyOf,
  nextEventWatermark,
  planPull,
  planPush,
  remoteWins,
  retryDelayMs,
  SETTLE_MS,
  stampOf,
  toWire,
  watermarkAfter,
  type SyncItem,
  type WireRecord,
} from './sync';

const nextId = monotonicFactory();
const USER = nextId();
const OTHER = nextId();
const T0 = '2026-10-08T10:00:00.000Z';
const T1 = '2026-10-08T10:00:01.000Z';
const T2 = '2026-10-08T10:00:02.000Z';
const T3 = '2026-10-08T10:00:03.000Z';

function deck(overrides: Partial<Deck> = {}): Deck {
  return {
    id: nextId(),
    name: 'Mi mazo',
    description: '',
    ownerId: USER,
    origin: 'manual',
    visibility: 'private',
    isDemo: false,
    parentId: null,
    createdAt: T0,
    updatedAt: T0,
    ...overrides,
  };
}

function note(deckId: string, overrides: Partial<Note> = {}): Note {
  return {
    id: nextId(),
    deckId,
    tags: [],
    origin: 'manual',
    editorialStatus: 'draft',
    sourceQuote: null,
    sourceQuestionVersionId: null,
    isDemo: false,
    createdAt: T0,
    updatedAt: T0,
    kind: 'basic',
    front: '<p>Frente</p>',
    back: '<p>Reverso</p>',
    ...overrides,
  } as Note;
}

function card(noteId: string, deckId: string, overrides: Partial<Card> = {}): Card {
  return { id: nextId(), noteId, deckId, ordinal: 0, createdAt: T0, updatedAt: T0, ...overrides };
}

function outline(deckId: string, overrides: Partial<OutlinePage> = {}): OutlinePage {
  return {
    id: nextId(),
    ownerId: USER,
    title: 'Apunte',
    deckId,
    tags: [],
    lines: [{ id: nextId(), depth: 0, text: 'Hola', noteId: null }],
    createdAt: T0,
    updatedAt: T0,
    ...overrides,
  };
}

function layout(overrides: Partial<WidgetLayout> = {}): WidgetLayout {
  return { userId: USER, preset: 'essential', widgets: [], updatedAt: T0, ...overrides };
}

const item = <K extends SyncItem['kind']>(
  kind: K,
  value: Extract<SyncItem, { kind: K }>['value'],
) => ({ kind, value }) as SyncItem;

describe('identidad y fecha de un registro', () => {
  it('la llave junta el tipo y el ID, y el Inicio tiene un ID fijo', () => {
    const d = deck();
    expect(keyOf(item('deck', d))).toBe(`deck:${d.id}`);
    expect(idOf(item('widget_layout', layout()))).toBe(WIDGET_LAYOUT_ID);
  });

  it('sin fecha de modificación vale la de creación', () => {
    const d = deck({ updatedAt: undefined, createdAt: T1 });
    expect(stampOf(item('deck', d))).toBe(T1);
  });

  it('un borrado se lee de su marca', () => {
    expect(deletedAtOf(item('deck', deck({ deletedAt: T2 })))).toBe(T2);
    expect(deletedAtOf(item('deck', deck()))).toBeNull();
    expect(deletedAtOf(item('widget_layout', layout()))).toBeNull();
  });

  it('canonical no depende del orden de los campos', () => {
    expect(canonical({ a: 1, b: [1, { y: 2, x: 1 }] })).toBe(
      canonical({ b: [1, { x: 1, y: 2 }], a: 1 }),
    );
    expect(canonical({ a: undefined, b: 1 })).toBe(canonical({ b: 1 }));
  });
});

describe('qué se sincroniza', () => {
  it('solo lo propio. Lo precargado, lo de demostración y lo ajeno se queda fuera', () => {
    const mine = deck();
    const preloaded = deck({ ownerId: null, origin: 'preloaded' });
    const demo = deck({ isDemo: true });
    const theirs = deck({ ownerId: OTHER });
    const imported = deck({ origin: 'imported' });
    const generated = deck({ origin: 'generated' });
    const items = collectSyncable({
      userId: USER,
      decks: [mine, preloaded, demo, theirs, imported, generated],
      notes: [
        note(mine.id),
        note(preloaded.id),
        note(theirs.id),
        note(mine.id, { isDemo: true }),
        note(imported.id),
      ],
      cards: [card('n', mine.id), card('n', preloaded.id), card('n', imported.id)],
      outlines: [outline(mine.id), outline(mine.id, { ownerId: OTHER })],
      layout: layout(),
    });
    const kinds = items.map((entry) => entry.kind);
    expect(kinds.filter((kind) => kind === 'deck')).toHaveLength(3);
    expect(kinds.filter((kind) => kind === 'note')).toHaveLength(2);
    expect(kinds.filter((kind) => kind === 'card')).toHaveLength(2);
    expect(kinds.filter((kind) => kind === 'outline')).toHaveLength(1);
    expect(kinds.filter((kind) => kind === 'widget_layout')).toHaveLength(1);
  });

  it('incluye lo marcado como borrado, para que otro dispositivo se entere', () => {
    const gone = deck({ deletedAt: T1, updatedAt: T1 });
    const items = collectSyncable({
      userId: USER,
      decks: [gone],
      notes: [],
      cards: [],
      outlines: [],
      layout: null,
    });
    expect(items).toHaveLength(1);
    expect(deletedAtOf(items[0] as SyncItem)).toBe(T1);
  });

  it('la distribución de otro alumno no se sube', () => {
    const items = collectSyncable({
      userId: USER,
      decks: [],
      notes: [],
      cards: [],
      outlines: [],
      layout: layout({ userId: OTHER }),
    });
    expect(items).toHaveLength(0);
  });
});

describe('del navegador al servidor y de vuelta', () => {
  const d = deck();
  const n = note(d.id);
  const entries: SyncItem[] = [
    item('deck', d),
    item('note', n),
    item('card', card(n.id, d.id)),
    item('outline', outline(d.id)),
    item('widget_layout', layout()),
  ];

  it('el ID del alumno no viaja y vuelve al bajar', () => {
    for (const entry of entries) {
      const wire = toWire(entry, USER);
      expect(JSON.stringify(wire)).not.toContain(USER);
      // Otro navegador tiene otro ID de alumno para la misma cuenta
      const other = nextId();
      const back = fromWire(wire, other);
      expect(back.ok).toBe(true);
      if (back.ok) {
        const owner = back.item.value as { ownerId?: string; userId?: string };
        expect(owner.ownerId ?? owner.userId ?? other).toBe(other);
      }
    }
  });

  it('subir y bajar en el mismo navegador devuelve el mismo registro', () => {
    for (const entry of entries) {
      const back = fromWire(toWire(entry, USER), USER);
      expect(back.ok && canonical(back.item.value)).toBe(canonical(entry.value));
    }
  });

  it('el registro lleva su fecha y su marca de borrado', () => {
    const wire = toWire(item('deck', deck({ updatedAt: T2, deletedAt: T2 })), USER);
    expect(wire.updatedAt).toBe(T2);
    expect(wire.deletedAt).toBe(T2);
  });

  it('un mazo con un dueño distinto de $self se descarta', () => {
    const wire = toWire(item('deck', d), USER);
    expect(fromWire({ ...wire, data: { ...wire.data, ownerId: OTHER } }, USER)).toEqual({
      ok: false,
      reason: 'not_own',
    });
    expect(fromWire({ ...wire, data: { ...wire.data, ownerId: USER } }, USER)).toEqual({
      ok: false,
      reason: 'not_own',
    });
  });

  it('un registro que no cumple el esquema se descarta', () => {
    const wire = toWire(item('deck', d), USER);
    expect(fromWire({ ...wire, data: { ...wire.data, name: '' } }, USER)).toEqual({
      ok: false,
      reason: 'invalid',
    });
    expect(fromWire({ ...wire, data: { ...wire.data, extra: 1 } }, USER)).toEqual({
      ok: false,
      reason: 'invalid',
    });
  });

  it('un registro cuyo ID no coincide con su fila se descarta', () => {
    const wire = toWire(item('deck', d), USER);
    expect(fromWire({ ...wire, id: nextId() }, USER)).toEqual({ ok: false, reason: 'id_mismatch' });
  });

  it('un tipo desconocido se descarta', () => {
    const wire = toWire(item('deck', d), USER);
    expect(fromWire({ ...wire, kind: 'otro' as WireRecord['kind'] }, USER)).toEqual({
      ok: false,
      reason: 'unknown_kind',
    });
  });

  it('no deja pasar contenido precargado ni de demostración como si fuera del alumno', () => {
    const wire = toWire(item('deck', d), USER);
    expect(fromWire({ ...wire, data: { ...wire.data, origin: 'preloaded' } }, USER)).toEqual({
      ok: false,
      reason: 'forbidden',
    });
    expect(fromWire({ ...wire, data: { ...wire.data, isDemo: true } }, USER)).toEqual({
      ok: false,
      reason: 'forbidden',
    });
    const noteWire = toWire(item('note', n), USER);
    expect(fromWire({ ...noteWire, data: { ...noteWire.data, isDemo: true } }, USER)).toEqual({
      ok: false,
      reason: 'forbidden',
    });
  });

  it('SELF es el marcador del dueño', () => {
    expect(toWire(item('deck', d), USER).data.ownerId).toBe(SELF);
    expect(toWire(item('widget_layout', layout()), USER).data.userId).toBe(SELF);
  });
});

describe('quién gana', () => {
  const base = deck();
  const at = (stamp: string, extra: Partial<Deck> = {}) =>
    item('deck', { ...base, updatedAt: stamp, ...extra });

  it('sin copia local gana lo que llega', () => {
    expect(remoteWins(undefined, at(T1))).toBe(true);
  });

  it('gana la fecha más reciente', () => {
    expect(remoteWins(at(T1), at(T2))).toBe(true);
    expect(remoteWins(at(T2), at(T1))).toBe(false);
  });

  it('con la misma fecha y el mismo contenido no hay nada que guardar', () => {
    expect(remoteWins(at(T1), at(T1))).toBe(false);
  });

  it('con la misma fecha y distinto contenido gana el servidor', () => {
    expect(remoteWins(at(T1, { name: 'Local' }), at(T1, { name: 'Servidor' }))).toBe(true);
  });

  it('un borrado más nuevo gana a una edición y una edición más nueva revive el registro', () => {
    expect(remoteWins(at(T1), at(T2, { deletedAt: T2 }))).toBe(true);
    expect(remoteWins(at(T2, { deletedAt: T2 }), at(T1))).toBe(false);
    expect(remoteWins(at(T2, { deletedAt: T2 }), at(T3, { deletedAt: null }))).toBe(true);
  });

  it('planPull deja lo local más nuevo y toma lo demás', () => {
    const a = deck();
    const b = deck();
    const local = new Map<string, SyncItem>([
      [keyOf(item('deck', a)), item('deck', { ...a, updatedAt: T3 })],
      [keyOf(item('deck', b)), item('deck', { ...b, updatedAt: T0 })],
    ]);
    const incoming = [
      item('deck', { ...a, updatedAt: T1 }),
      item('deck', { ...b, updatedAt: T2 }),
      item('deck', { ...deck(), updatedAt: T1 }),
    ];
    const plan = planPull(local, incoming);
    expect(plan).toHaveLength(2);
    expect(plan.map(keyOf)).not.toContain(keyOf(item('deck', a)));
  });
});

describe('qué se sube', () => {
  const stampAt = (index: number) => `2026-10-08T10:00:${String(index).padStart(2, '0')}.000Z`;
  const make = (count: number) =>
    Array.from({ length: count }, (_, index) =>
      item('deck', deck({ updatedAt: stampAt(index), createdAt: T0 })),
    );
  // Un momento lejano, para que la espera de 30 segundos no estorbe en estas pruebas
  const later = new Date('2026-10-08T12:00:00.000Z');

  it('la primera vez sube todo, en orden de fecha', () => {
    const plan = planPush(make(5).reverse(), null, USER);
    expect(plan.map((record) => record.updatedAt)).toEqual([
      stampAt(0),
      stampAt(1),
      stampAt(2),
      stampAt(3),
      stampAt(4),
    ]);
  });

  it('después solo sube lo posterior a la marca de agua', () => {
    const plan = planPush(make(5), stampAt(2), USER);
    expect(plan.map((record) => record.updatedAt)).toEqual([stampAt(3), stampAt(4)]);
  });

  it('el orden es el mismo en cada llamada, con la llave como desempate', () => {
    const same = Array.from({ length: 6 }, () => item('deck', deck({ updatedAt: T1 })));
    const one = planPush(same, null, USER).map((record) => record.id);
    const two = planPush([...same].reverse(), null, USER).map((record) => record.id);
    expect(one).toEqual(two);
  });

  it('al enviar todo, la marca de agua llega a la última fecha', () => {
    const plan = planPush(make(5), null, USER);
    expect(watermarkAfter(plan, 5, null, later)).toBe(stampAt(4));
    expect(watermarkAfter(plan, 99, null, later)).toBe(stampAt(4));
  });

  it('con lotes avanza hasta donde llegó el envío', () => {
    const plan = planPush(make(7), null, USER);
    expect(watermarkAfter(plan, 3, null, later)).toBe(stampAt(2));
    expect(watermarkAfter(plan, 6, stampAt(2), later)).toBe(stampAt(5));
  });

  it('sin enviar nada no cambia', () => {
    expect(watermarkAfter(planPush(make(3), null, USER), 0, stampAt(1), later)).toBe(stampAt(1));
    expect(watermarkAfter([], 0, null, later)).toBeNull();
  });

  it('un lote cortado a la mitad de un grupo con la misma fecha no da por enviado el grupo', () => {
    const items = [
      item('deck', deck({ updatedAt: stampAt(1) })),
      ...Array.from({ length: 4 }, () => item('deck', deck({ updatedAt: stampAt(2) }))),
    ];
    const plan = planPush(items, null, USER);
    // Se enviaron el primero y dos del grupo. Faltan dos del grupo
    expect(watermarkAfter(plan, 3, null, later)).toBe(stampAt(1));
    // Si el corte cae sin nada anterior, la marca se queda como estaba
    const onlyGroup = planPush(items.slice(1), null, USER);
    expect(watermarkAfter(onlyGroup, 2, null, later)).toBeNull();
    expect(watermarkAfter(onlyGroup, 2, stampAt(0), later)).toBe(stampAt(0));
  });

  it('el envío por lotes de un grupo grande termina y no repite', () => {
    const group = Array.from({ length: 10 }, () => item('deck', deck({ updatedAt: T1 })));
    const plan = planPush(group, null, USER);
    const sent: string[] = [];
    for (let from = 0; from < plan.length; from += 3) {
      sent.push(...plan.slice(from, from + 3).map((record) => record.id));
    }
    expect(new Set(sent).size).toBe(10);
    expect(watermarkAfter(plan, 10, null, later)).toBe(T1);
    // Ya subido todo, la siguiente vez no queda nada
    expect(planPush(group, T1, USER)).toHaveLength(0);
  });

  it('la marca de agua no pasa de hace 30 segundos', () => {
    const now = new Date('2026-10-08T10:00:10.000Z');
    const plan = planPush(
      [item('deck', deck({ updatedAt: '2026-10-08T10:00:09.000Z' }))],
      null,
      USER,
    );
    expect(watermarkAfter(plan, 1, null, now)).toBe(
      new Date(now.getTime() - SETTLE_MS).toISOString(),
    );
  });

  it('la marca de agua nunca retrocede', () => {
    const plan = planPush(make(2), null, USER);
    expect(watermarkAfter(plan, 2, '2026-10-08T11:00:00.000Z', later)).toBe(
      '2026-10-08T11:00:00.000Z',
    );
  });

  it('el tamaño de lote es el del servidor', () => {
    expect(PAGE_SIZE).toBe(500);
  });
});

describe('bitácora', () => {
  const clockAt = (iso: string) => ({ now: () => new Date(iso) });
  const xp = (at: string) =>
    createEvent(
      'xp_awarded',
      { amount: 10, reason: 'card_review', sourceEventId: null },
      { userId: USER, tz: 'America/Merida', clock: clockAt(at) },
    );

  it('el evento sube sin el ID del alumno y baja con el del navegador', () => {
    const event = xp(T1);
    const wire = eventToWire(event);
    expect(JSON.stringify(wire)).not.toContain(USER);
    const other = nextId();
    const back = eventFromWire(wire, other);
    expect(back).toEqual({ ...event, userId: other });
  });

  it('un evento que no cumple el esquema se descarta', () => {
    const wire = eventToWire(xp(T1));
    expect(eventFromWire({ ...wire, type: 'no_existe' }, USER)).toBeNull();
    expect(eventFromWire({ ...wire, payload: { amount: -5 } }, USER)).toBeNull();
    expect(eventFromWire({ ...wire, schemaVersion: 99 }, USER)).toBeNull();
  });

  it('la marca de agua avanza con cada página, no pasa de hace 30 segundos y nunca retrocede', () => {
    const later = new Date('2026-10-08T12:00:00.000Z');
    expect(nextEventWatermark(null, T2, later)).toBe(T2);
    expect(nextEventWatermark(T1, T2, later)).toBe(T2);
    expect(nextEventWatermark(T3, T2, later)).toBe(T3);
    const now = new Date('2026-10-08T10:00:10.000Z');
    expect(nextEventWatermark(null, '2026-10-08T10:00:09.000Z', now)).toBe(
      new Date(now.getTime() - SETTLE_MS).toISOString(),
    );
  });
});

describe('reloj y reintentos', () => {
  it('el reloj se acepta dentro de 5 minutos hacia cualquier lado', () => {
    const server = new Date('2026-10-08T10:00:00.000Z');
    expect(
      clockIsTrustworthy(clockSkewMs(new Date(server.getTime() + MAX_CLOCK_SKEW_MS), server)),
    ).toBe(true);
    expect(
      clockIsTrustworthy(clockSkewMs(new Date(server.getTime() - MAX_CLOCK_SKEW_MS), server)),
    ).toBe(true);
    expect(
      clockIsTrustworthy(clockSkewMs(new Date(server.getTime() + MAX_CLOCK_SKEW_MS + 1), server)),
    ).toBe(false);
    expect(clockIsTrustworthy(clockSkewMs(new Date(server.getTime() - 3_600_000), server))).toBe(
      false,
    );
    expect(clockIsTrustworthy(Number.NaN)).toBe(false);
  });

  it('la espera crece al doble y tiene tope', () => {
    expect(retryDelayMs(0)).toBe(0);
    expect(retryDelayMs(1)).toBe(5_000);
    expect(retryDelayMs(2)).toBe(10_000);
    expect(retryDelayMs(3)).toBe(20_000);
    expect(retryDelayMs(50)).toBe(RETRY_MAX_MS);
  });
});
