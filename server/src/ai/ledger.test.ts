import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { dayKey, Ledger } from './ledger.ts';

const dirs: string[] = [];
const tempFile = () => {
  const dir = mkdtempSync(join(tmpdir(), 'ai-ledger-'));
  dirs.push(dir);
  return join(dir, 'ledger.json');
};
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const LIMITS = { perStudentPerDay: 2, dailyBudgetUsd: 1 };
const admit = (ledger: Ledger, studentRef = 'alumno-uno-0001') =>
  ledger.admit({ studentRef, engine: 'forgetting', ...LIMITS });

describe('día de los límites', () => {
  it('cuenta el día en hora de México', () => {
    // A las 03:00 UTC todavía es el día anterior en la Ciudad de México
    expect(dayKey(new Date('2026-10-08T03:00:00Z'))).toBe('2026-10-07');
    expect(dayKey(new Date('2026-10-08T09:00:00Z'))).toBe('2026-10-08');
  });
});

describe('límites por alumno', () => {
  it('deja pasar hasta el límite y frena la siguiente', () => {
    const ledger = new Ledger();
    expect(admit(ledger)).toEqual({ ok: true });
    expect(admit(ledger)).toEqual({ ok: true });
    expect(admit(ledger)).toEqual({ ok: false, reason: 'student_limit' });
  });

  it('cada motor tiene su propio cupo para el mismo alumno', () => {
    const ledger = new Ledger();
    admit(ledger);
    admit(ledger);
    expect(admit(ledger).ok).toBe(false);
    expect(
      ledger.admit({ studentRef: 'alumno-uno-0001', engine: 'flashcards', ...LIMITS }),
    ).toEqual({ ok: true });
  });

  it('cada alumno tiene su propio cupo', () => {
    const ledger = new Ledger();
    admit(ledger, 'alumno-uno-0001');
    admit(ledger, 'alumno-uno-0001');
    expect(admit(ledger, 'alumno-dos-0002')).toEqual({ ok: true });
  });

  it('el cupo se renueva al cambiar el día', () => {
    let now = new Date('2026-10-08T15:00:00Z');
    const ledger = new Ledger({ now: () => now });
    admit(ledger);
    admit(ledger);
    expect(admit(ledger).ok).toBe(false);
    now = new Date('2026-10-09T15:00:00Z');
    expect(admit(ledger)).toEqual({ ok: true });
    expect(ledger.summary().day).toBe('2026-10-09');
  });

  it('devolver el cupo deja pasar otra llamada', () => {
    const ledger = new Ledger();
    admit(ledger);
    admit(ledger);
    ledger.release({ studentRef: 'alumno-uno-0001', engine: 'forgetting' });
    expect(admit(ledger).ok).toBe(true);
    // No baja de cero
    const fresh = new Ledger();
    fresh.release({ studentRef: 'nadie-0000000', engine: 'forgetting' });
    expect(fresh.summary().calls).toBe(0);
  });
});

describe('presupuesto del día', () => {
  it('frena todo cuando el gasto real llega al presupuesto', () => {
    const ledger = new Ledger();
    admit(ledger);
    ledger.settle({ engine: 'forgetting', costUsd: 0.6, real: true });
    expect(admit(ledger, 'alumno-dos-0002').ok).toBe(true);
    ledger.settle({ engine: 'forgetting', costUsd: 0.5, real: true });
    expect(admit(ledger, 'alumno-tres-0003')).toEqual({ ok: false, reason: 'budget_exceeded' });
    expect(ledger.summary().spentUsd).toBe(1.1);
  });

  it('el gasto simulado no cuenta contra el presupuesto', () => {
    const ledger = new Ledger();
    ledger.settle({ engine: 'forgetting', costUsd: 5, real: false });
    ledger.settle({ engine: 'forgetting', costUsd: 0, real: true });
    expect(ledger.summary().spentUsd).toBe(0);
  });

  it('resume por motor', () => {
    const ledger = new Ledger();
    ledger.admit({ studentRef: 'alumno-uno-0001', engine: 'flashcards', ...LIMITS });
    ledger.settle({ engine: 'flashcards', costUsd: 0.25, real: true });
    expect(ledger.summary()).toMatchObject({
      calls: 1,
      students: 1,
      spentUsd: 0.25,
      byEngine: { flashcards: { calls: 1, costUsd: 0.25 } },
    });
  });
});

describe('archivo', () => {
  it('sobrevive a reiniciar el proxy el mismo día', () => {
    const file = tempFile();
    const now = () => new Date('2026-10-08T15:00:00Z');
    const first = new Ledger({ file, now });
    admit(first);
    first.settle({ engine: 'forgetting', costUsd: 0.4, real: true });
    const second = new Ledger({ file, now });
    expect(second.summary()).toMatchObject({ calls: 1, spentUsd: 0.4 });
  });

  it('un archivo de otro día o dañado empieza en cero', () => {
    const file = tempFile();
    const first = new Ledger({ file, now: () => new Date('2026-10-07T15:00:00Z') });
    admit(first);
    const nextDay = new Ledger({ file, now: () => new Date('2026-10-08T15:00:00Z') });
    expect(nextDay.summary().calls).toBe(0);
    writeFileSync(file, 'esto no es json');
    expect(new Ledger({ file }).summary().calls).toBe(0);
  });
});
