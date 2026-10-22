// @vitest-environment jsdom
// La foto de tarjetas vencidas para el recordatorio por correo (B15, 3.3): qué cuenta y cuándo sube
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { writeStoredFlags } from '@/config/featureFlags';
import { DueSnapshotSchema, type ReminderPrefs } from '@/data/cloud/engagementContracts';
import { createEvent } from '@/data/events/createEvent';
import { makeUser, newId, testApi } from '@/data/testing/fixtures';
import { seedManualCards, seedOverdueCards } from '@/data/testing/seedCards';
import {
  SNAPSHOT_MIN_GAP_MS,
  buildDueSnapshot,
  createDueSnapshotSync,
  uploadDueSnapshot,
} from './dueSnapshot';

const ZONE = 'America/Merida';
const disposers: (() => Promise<void>)[] = [];
afterEach(async () => {
  await Promise.all(disposers.splice(0).map((dispose) => dispose()));
  writeStoredFlags(null);
});

async function setup(options: { overdue: number; unseen?: number; suspended?: number }) {
  const api = testApi('real');
  disposers.push(() => api.dispose());
  const user = makeUser();
  await api.repos.users.put(user);
  const { overdueIds } = await seedOverdueCards(api, user, {
    overdue: options.overdue,
    ...(options.unseen === undefined ? {} : { unseen: options.unseen }),
  });
  if (options.suspended) {
    await api.recordEvent(
      createEvent(
        'cards_suspended',
        { cardIds: overdueIds.slice(0, options.suspended), reason: 'manual' },
        { userId: user.id, tz: user.timeZone },
      ),
    );
  }
  return { api, user };
}

describe('buildDueSnapshot', () => {
  it('cuenta las vencidas de hoy y las nuevas, con catorce días y la forma que acepta el servidor', async () => {
    const { api, user } = await setup({ overdue: 12, unseen: 5 });
    const snapshot = await buildDueSnapshot(api, user.id, ZONE, new Date());
    expect(snapshot).not.toBeNull();
    expect(DueSnapshotSchema.safeParse(snapshot).success).toBe(true);
    expect(snapshot?.timeZone).toBe(ZONE);
    expect(snapshot?.days).toHaveLength(14);
    expect(snapshot?.days[0]?.due).toBe(12);
    expect(snapshot?.newAvailable).toBe(5);
  });

  it('no cuenta las tarjetas suspendidas', async () => {
    const { api, user } = await setup({ overdue: 12, suspended: 4 });
    const snapshot = await buildDueSnapshot(api, user.id, ZONE, new Date());
    expect(snapshot?.days[0]?.due).toBe(8);
  });

  it('no cuenta las tarjetas de mazos que el alumno no sigue', async () => {
    const { api, user } = await setup({ overdue: 3 });
    const other = makeUser();
    await api.repos.users.put(other);
    await seedManualCards(api, other, { count: 7, suspended: 0 });
    const snapshot = await buildDueSnapshot(api, user.id, ZONE, new Date());
    expect(snapshot?.newAvailable).toBe(0);
    expect(snapshot?.days[0]?.due).toBe(3);
  });

  it('solo lleva fechas y números: nada de ids, textos ni correos', async () => {
    const { api, user } = await setup({ overdue: 4, unseen: 2 });
    const snapshot = await buildDueSnapshot(api, user.id, ZONE, new Date());
    const text = JSON.stringify(snapshot);
    expect(text).not.toContain(user.id);
    expect(text).not.toMatch(/@|Pregunta|cardId|noteId|deckId/);
    expect(Object.keys(snapshot ?? {}).sort()).toEqual([
      'computedAt',
      'days',
      'newAvailable',
      'timeZone',
    ]);
  });

  it('un alumno que no está en este dispositivo no da foto', async () => {
    const api = testApi('real');
    disposers.push(() => api.dispose());
    await expect(buildDueSnapshot(api, newId(), ZONE)).resolves.toBeNull();
  });
});

describe('uploadDueSnapshot', () => {
  it('sube la foto con put_due_snapshot', async () => {
    const { api, user } = await setup({ overdue: 2 });
    const rpc = vi.fn(() => Promise.resolve({ data: null, error: null }));
    await expect(uploadDueSnapshot(api, { rpc } as never, user.id, ZONE)).resolves.toBe(true);
    const [name, args] = rpc.mock.calls[0] as unknown as [
      string,
      { p_snapshot: { timeZone: string } },
    ];
    expect(name).toBe('put_due_snapshot');
    expect(args.p_snapshot.timeZone).toBe(ZONE);
  });

  it('si el servidor falla o lanza, false y sin lanzar', async () => {
    const { api, user } = await setup({ overdue: 2 });
    const failing = { rpc: () => Promise.resolve({ data: null, error: { code: 'XX000' } }) };
    await expect(uploadDueSnapshot(api, failing as never, user.id, ZONE)).resolves.toBe(false);
    const throwing = { rpc: () => Promise.reject(new Error('sin red')) };
    await expect(uploadDueSnapshot(api, throwing as never, user.id, ZONE)).resolves.toBe(false);
  });
});

describe('createDueSnapshotSync', () => {
  const PREFS: ReminderPrefs = {
    available: true,
    enabled: true,
    hour: 20,
    days: [0, 1, 2, 3, 4, 5, 6],
    frequency: 'daily',
    onlyWhenDue: true,
    timeZone: ZONE,
    unsubscribed: false,
  };

  /** Una nube que contesta los recordatorios que se le den y cuenta cada llamada */
  function fakeCloud(prefs: Partial<ReminderPrefs> | null) {
    const calls: string[] = [];
    const cloud = {
      rpc: vi.fn((name: string) => {
        calls.push(name);
        if (name === 'my_reminder_prefs') {
          return Promise.resolve(
            prefs === null
              ? { data: null, error: { code: 'PGRST202' } }
              : { data: { ...PREFS, ...prefs }, error: null },
          );
        }
        return Promise.resolve({ data: null, error: null });
      }),
    };
    return { cloud: cloud as never, calls };
  }

  it('con los recordatorios apagados no sube nada y no vuelve a preguntar antes de 30 minutos', async () => {
    const { api, user } = await setup({ overdue: 2 });
    let now = Date.parse('2026-10-21T15:00:00.000Z');
    const sync = createDueSnapshotSync(() => now);
    const { cloud, calls } = fakeCloud({ enabled: false });
    await sync.afterSync(api, cloud, user.id);
    now += 5 * 60_000;
    await sync.afterSync(api, cloud, user.id);
    expect(calls).toEqual(['my_reminder_prefs']);
    // A los 30 minutos los vuelve a leer, por si los prendió en otro dispositivo
    now += SNAPSHOT_MIN_GAP_MS;
    await sync.afterSync(api, cloud, user.id);
    expect(calls).toEqual(['my_reminder_prefs', 'my_reminder_prefs']);
  });

  it('con los recordatorios prendidos sube al abrir y después a lo mucho cada 30 minutos', async () => {
    const { api, user } = await setup({ overdue: 2 });
    let now = Date.parse('2026-10-21T15:00:00.000Z');
    const sync = createDueSnapshotSync(() => now);
    const { cloud, calls } = fakeCloud({});
    await sync.afterSync(api, cloud, user.id);
    expect(calls).toEqual(['my_reminder_prefs', 'put_due_snapshot']);
    now += 5 * 60_000;
    await sync.afterSync(api, cloud, user.id);
    expect(calls).toHaveLength(2);
    now += SNAPSHOT_MIN_GAP_MS;
    await sync.afterSync(api, cloud, user.id);
    expect(calls.filter((call) => call === 'put_due_snapshot')).toHaveLength(2);
  });

  it('después de terminar un repaso sube en la siguiente sincronización, sin esperar los 30 minutos', async () => {
    const { api, user } = await setup({ overdue: 2 });
    let now = Date.now();
    const sync = createDueSnapshotSync(() => now);
    const { cloud, calls } = fakeCloud({});
    await sync.afterSync(api, cloud, user.id);
    now += 60_000;
    await api.recordEvent(
      createEvent(
        'session_ended',
        { kind: 'review', reason: 'completed', items: 2, correct: null, durationMs: 1000, xp: 0 },
        {
          userId: user.id,
          tz: ZONE,
          sessionId: newId(),
          clock: { now: () => new Date(now - 1000) },
        },
      ),
    );
    await sync.afterSync(api, cloud, user.id);
    expect(calls.filter((call) => call === 'put_due_snapshot')).toHaveLength(2);
    // Una práctica del simulador no cuenta como repaso
    now += 60_000;
    await api.recordEvent(
      createEvent(
        'session_ended',
        { kind: 'practice', reason: 'completed', items: 2, correct: 1, durationMs: 1000, xp: 0 },
        {
          userId: user.id,
          tz: ZONE,
          sessionId: newId(),
          clock: { now: () => new Date(now - 1000) },
        },
      ),
    );
    await sync.afterSync(api, cloud, user.id);
    expect(calls.filter((call) => call === 'put_due_snapshot')).toHaveLength(2);
  });

  it('quien se dio de baja desde un correo no sube nada', async () => {
    const { api, user } = await setup({ overdue: 2 });
    const sync = createDueSnapshotSync(() => Date.now());
    const { cloud, calls } = fakeCloud({ enabled: false, unsubscribed: true });
    await sync.afterSync(api, cloud, user.id);
    expect(calls).toEqual(['my_reminder_prefs']);
  });

  it('con la bandera emailReminders apagada no hace ninguna llamada', async () => {
    writeStoredFlags({ emailReminders: false });
    const { api, user } = await setup({ overdue: 2 });
    const sync = createDueSnapshotSync(() => Date.now());
    const { cloud, calls } = fakeCloud({});
    await sync.afterSync(api, cloud, user.id);
    expect(calls).toEqual([]);
  });

  it('si la función no existe en el servidor no sube nada y no lanza', async () => {
    const { api, user } = await setup({ overdue: 2 });
    const sync = createDueSnapshotSync(() => Date.now());
    const { cloud, calls } = fakeCloud(null);
    await expect(sync.afterSync(api, cloud, user.id)).resolves.toBeUndefined();
    expect(calls).toEqual(['my_reminder_prefs']);
  });

  it('forget hace que la siguiente sincronización relea los recordatorios', async () => {
    const { api, user } = await setup({ overdue: 2 });
    const sync = createDueSnapshotSync(() => Date.now());
    const { cloud, calls } = fakeCloud({ enabled: false });
    await sync.afterSync(api, cloud, user.id);
    sync.forget();
    await sync.afterSync(api, cloud, user.id);
    expect(calls).toEqual(['my_reminder_prefs', 'my_reminder_prefs']);
  });

  it('sube con la zona que el servidor guardó, no con la del perfil', async () => {
    const { api, user } = await setup({ overdue: 2 });
    const sync = createDueSnapshotSync(() => Date.now());
    const { cloud } = fakeCloud({ timeZone: 'America/Tijuana' });
    await sync.afterSync(api, cloud, user.id);
    const put = (cloud as unknown as { rpc: ReturnType<typeof vi.fn> }).rpc.mock.calls.find(
      ([name]) => name === 'put_due_snapshot',
    );
    expect((put?.[1] as { p_snapshot: { timeZone: string } }).p_snapshot.timeZone).toBe(
      'America/Tijuana',
    );
  });
});
