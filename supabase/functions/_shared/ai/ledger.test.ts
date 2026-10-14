import { describe, expect, it } from 'vitest';
import { dayKey, Ledger, type LedgerPersistence, type LedgerState } from './ledger.ts';

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

describe('dónde se guarda', () => {
  /** Guarda en memoria, como lo haría un archivo o una tabla */
  const memory = () => {
    let stored: unknown = null;
    const persistence: LedgerPersistence = {
      load: () => stored,
      save: (state: LedgerState) => {
        stored = structuredClone(state);
      },
    };
    return {
      persistence,
      set: (value: unknown) => {
        stored = value;
      },
    };
  };

  it('sobrevive a reiniciar el proxy el mismo día', () => {
    const store = memory();
    const now = () => new Date('2026-10-08T15:00:00Z');
    const first = new Ledger({ persistence: store.persistence, now });
    admit(first);
    first.settle({ engine: 'forgetting', costUsd: 0.4, real: true });
    const second = new Ledger({ persistence: store.persistence, now });
    expect(second.summary()).toMatchObject({ calls: 1, spentUsd: 0.4 });
  });

  it('lo guardado de otro día, dañado o que no se puede leer empieza en cero', () => {
    const store = memory();
    const first = new Ledger({
      persistence: store.persistence,
      now: () => new Date('2026-10-07T15:00:00Z'),
    });
    admit(first);
    const nextDay = new Ledger({
      persistence: store.persistence,
      now: () => new Date('2026-10-08T15:00:00Z'),
    });
    expect(nextDay.summary().calls).toBe(0);
    store.set({ day: 'no es un libro' });
    expect(new Ledger({ persistence: store.persistence }).summary().calls).toBe(0);
    const failing: LedgerPersistence = {
      load: () => {
        throw new Error('no se pudo leer');
      },
      save: () => undefined,
    };
    expect(new Ledger({ persistence: failing }).summary().calls).toBe(0);
  });
});
