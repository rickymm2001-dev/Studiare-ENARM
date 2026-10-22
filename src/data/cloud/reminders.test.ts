// Las llamadas a la base de los recordatorios por correo (B15, 3.2, 3.3 y 3.7)
import { describe, expect, it, vi } from 'vitest';
import type { DueSnapshot, ReminderPrefs } from './engagementContracts';
import { fetchReminderPrefs, putDueSnapshot, saveReminderPrefs, toArgs } from './reminders';

const PREFS: ReminderPrefs = {
  available: true,
  enabled: true,
  hour: 20,
  days: [1, 2, 3, 4, 5],
  frequency: 'weekdays',
  onlyWhenDue: true,
  timeZone: 'America/Merida',
  unsubscribed: false,
};
const SNAPSHOT: DueSnapshot = {
  computedAt: '2026-10-21T15:00:00.000Z',
  timeZone: 'America/Merida',
  days: [{ day: '2026-10-21', due: 37 }],
  newAvailable: 10,
};

const cloudWith = (reply: {
  data?: unknown;
  error?: { code?: string; message?: string } | null;
}) => {
  const rpc = vi.fn(() =>
    Promise.resolve({ data: reply.data ?? null, error: reply.error ?? null }),
  );
  return { cloud: { rpc } as never, rpc };
};

describe('fetchReminderPrefs', () => {
  it('lee lo guardado con my_reminder_prefs', async () => {
    const { cloud, rpc } = cloudWith({ data: PREFS });
    await expect(fetchReminderPrefs(cloud)).resolves.toEqual(PREFS);
    expect(rpc).toHaveBeenCalledWith('my_reminder_prefs');
  });

  it('una respuesta con campos de más se acepta y sin forma buena, o sin cuenta en la nube, es null', async () => {
    await expect(
      fetchReminderPrefs(cloudWith({ data: { ...PREFS, extra: 1 } }).cloud),
    ).resolves.toEqual(PREFS);
    await expect(
      fetchReminderPrefs(cloudWith({ data: { ...PREFS, hour: 3 } }).cloud),
    ).resolves.toBeNull();
    await expect(
      fetchReminderPrefs(cloudWith({ data: { ...PREFS, available: false } }).cloud),
    ).resolves.toBeNull();
    await expect(fetchReminderPrefs(cloudWith({ data: 'x' }).cloud)).resolves.toBeNull();
  });

  it('con la función sin aplicar en la base o sin red, null y sin lanzar', async () => {
    await expect(
      fetchReminderPrefs(cloudWith({ error: { code: 'PGRST202', message: 'no existe' } }).cloud),
    ).resolves.toBeNull();
    const throwing = { rpc: () => Promise.reject(new Error('sin red')) } as never;
    await expect(fetchReminderPrefs(throwing)).resolves.toBeNull();
  });
});

describe('saveReminderPrefs', () => {
  const choice = {
    enabled: true,
    hour: 8,
    days: [5, 1, 1, 3],
    onlyWhenDue: false,
    timeZone: 'America/Tijuana',
  };

  it('manda los parámetros con los nombres de la base, con los días ordenados y sin repetir', async () => {
    const { cloud, rpc } = cloudWith({ data: PREFS });
    await expect(saveReminderPrefs(cloud, choice)).resolves.toEqual({ ok: true, prefs: PREFS });
    expect(rpc).toHaveBeenCalledWith('set_reminder_prefs', {
      p_enabled: true,
      p_hour: 8,
      p_days: [1, 3, 5],
      p_only_when_due: false,
      p_time_zone: 'America/Tijuana',
    });
    expect(toArgs(choice).p_days).toEqual([1, 3, 5]);
  });

  it('dice por qué falló sin repetir el código de la base', async () => {
    const reasons: [{ code?: string }, string][] = [
      [{ code: '42501' }, 'not_active_device'],
      [{ code: '22023' }, 'invalid'],
      [{ code: 'XX000' }, 'unknown'],
      [{}, 'network'],
    ];
    for (const [error, reason] of reasons) {
      await expect(saveReminderPrefs(cloudWith({ error }).cloud, choice)).resolves.toEqual({
        ok: false,
        reason,
      });
    }
    const throwing = { rpc: () => Promise.reject(new Error('sin red')) } as never;
    await expect(saveReminderPrefs(throwing, choice)).resolves.toEqual({
      ok: false,
      reason: 'network',
    });
  });

  it('una respuesta que no tiene la forma buena no cuenta como guardada', async () => {
    await expect(
      saveReminderPrefs(cloudWith({ data: { hola: 1 } }).cloud, choice),
    ).resolves.toEqual({
      ok: false,
      reason: 'unknown',
    });
  });
});

describe('putDueSnapshot', () => {
  it('sube la foto con put_due_snapshot y dice si se guardó', async () => {
    const { cloud, rpc } = cloudWith({});
    await expect(putDueSnapshot(cloud, SNAPSHOT)).resolves.toBe(true);
    expect(rpc).toHaveBeenCalledWith('put_due_snapshot', { p_snapshot: SNAPSHOT });
  });

  it('si falla o la función no existe, false y sin lanzar', async () => {
    await expect(
      putDueSnapshot(cloudWith({ error: { code: 'PGRST202' } }).cloud, SNAPSHOT),
    ).resolves.toBe(false);
    const throwing = { rpc: () => Promise.reject(new Error('sin red')) } as never;
    await expect(putDueSnapshot(throwing, SNAPSHOT)).resolves.toBe(false);
  });

  it('la foto no lleva correo ni texto de tarjetas: solo fechas y números', () => {
    expect(JSON.stringify(SNAPSHOT)).not.toMatch(/@|front|back|text/);
  });
});
