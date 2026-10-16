import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from './config.ts';
import {
  dayKey,
  DayLedger,
  GENERATION_RETRIES,
  RESERVATION_TTL_MS,
  type DayLedgerState,
} from './ledger.ts';
import type { AdmitV2Input, SettlementV2 } from './ports.ts';

const USER = 'f0000000-0000-4000-8000-000000000001';
const OTHER = 'f0000000-0000-4000-8000-000000000002';

const limits = DEFAULT_CONFIG.limits;
const admitInput = (overrides: Partial<AdmitV2Input> = {}): AdmitV2Input => ({
  userId: USER,
  engine: 'forgetting',
  staff: false,
  perStudentPerDay: 3,
  dailyBudgetUsd: 5,
  engineShare: 0.1,
  perUserDailyUsd: 0.3,
  generationRef: null,
  maxGenerations: limits.cardGenerationsPerDay,
  maxSections: limits.sectionsPerGeneration,
  ...overrides,
});
const settlement = (overrides: Partial<SettlementV2> = {}): SettlementV2 => ({
  userId: USER,
  engine: 'forgetting',
  model: 'claude-haiku-5-5',
  real: true,
  ok: true,
  costUsd: 0.01,
  inputTokens: 1000,
  outputTokens: 200,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  latencyMs: 800,
  mode: 'sync',
  outcome: 'ok',
  promptVersion: 'forgetting.base.v1',
  refusalCategory: null,
  jobId: null,
  ...overrides,
});

describe('día de los límites', () => {
  it('cuenta el día en hora de México', () => {
    // A las 03:00 UTC todavía es el día anterior en la Ciudad de México
    expect(dayKey(new Date('2026-10-08T03:00:00Z'))).toBe('2026-10-07');
    expect(dayKey(new Date('2026-10-08T09:00:00Z'))).toBe('2026-10-08');
  });
});

describe('libro del día v2, llamadas por alumno y motor', () => {
  it('deja pasar hasta el límite, cada motor y cada alumno por su lado', async () => {
    const ledger = new DayLedger();
    for (let call = 0; call < 3; call += 1) {
      expect(await ledger.admit(admitInput())).toEqual({ ok: true });
    }
    expect(await ledger.admit(admitInput())).toEqual({ ok: false, reason: 'student_limit' });
    expect(await ledger.admit(admitInput({ engine: 'bias_tips' }))).toEqual({ ok: true });
    expect(await ledger.admit(admitInput({ userId: OTHER }))).toEqual({ ok: true });
  });

  it('devolver el cupo deja pasar otra llamada y nunca baja de cero', async () => {
    const ledger = new DayLedger();
    const one = admitInput({ perStudentPerDay: 1 });
    await ledger.admit(one);
    expect((await ledger.admit(one)).ok).toBe(false);
    await ledger.release({ userId: USER, engine: 'forgetting', generationRef: null });
    expect((await ledger.admit(one)).ok).toBe(true);
    const fresh = new DayLedger();
    await fresh.release({ userId: OTHER, engine: 'forgetting', generationRef: null });
    expect((await fresh.summary()).calls).toBe(0);
  });

  it('el límite de llamadas también cuenta para médicos y admins', async () => {
    const ledger = new DayLedger();
    const staff = admitInput({ staff: true, engine: 'restructure', perStudentPerDay: 1 });
    expect(await ledger.admit(staff)).toEqual({ ok: true });
    expect(await ledger.admit(staff)).toEqual({ ok: false, reason: 'student_limit' });
  });

  it('rechaza límites que no tienen sentido', async () => {
    const ledger = new DayLedger();
    await expect(ledger.admit(admitInput({ perStudentPerDay: 0 }))).rejects.toThrow();
    await expect(ledger.admit(admitInput({ userId: '' }))).rejects.toThrow();
  });
});

describe('generaciones de tarjetas', () => {
  const cards = (ref: string) =>
    admitInput({
      engine: 'flashcards',
      perStudentPerDay: 1000,
      engineShare: 0.55,
      generationRef: ref,
    });

  it('la generación 21 del día no pasa, y una ya abierta sigue', async () => {
    const ledger = new DayLedger();
    for (let index = 1; index <= limits.cardGenerationsPerDay; index += 1) {
      expect(await ledger.admit(cards(`generacion-${String(index).padStart(3, '0')}`))).toEqual({
        ok: true,
      });
    }
    expect(await ledger.admit(cards('generacion-021'))).toEqual({
      ok: false,
      reason: 'generation_limit',
    });
    expect(await ledger.admit(cards('generacion-001'))).toEqual({ ok: true });
  });

  it('una generación acepta sus 12 secciones y 2 reintentos, y la llamada 15 no pasa', async () => {
    const ledger = new DayLedger();
    const allowed = limits.sectionsPerGeneration + GENERATION_RETRIES;
    expect(allowed).toBe(14);
    for (let call = 0; call < allowed; call += 1) {
      expect((await ledger.admit(cards('generacion-unica'))).ok).toBe(true);
    }
    expect(await ledger.admit(cards('generacion-unica'))).toEqual({
      ok: false,
      reason: 'generation_limit',
    });
  });

  it('devolver el cupo también devuelve la sección, y una generación vacía deja de contar', async () => {
    const ledger = new DayLedger();
    const one = admitInput({
      engine: 'flashcards',
      perStudentPerDay: 1000,
      engineShare: 0.55,
      maxGenerations: 1,
      generationRef: 'generacion-a',
    });
    expect((await ledger.admit(one)).ok).toBe(true);
    expect(await ledger.admit({ ...one, generationRef: 'generacion-b' })).toEqual({
      ok: false,
      reason: 'generation_limit',
    });
    await ledger.release({ userId: USER, engine: 'flashcards', generationRef: 'generacion-a' });
    expect((await ledger.admit({ ...one, generationRef: 'generacion-b' })).ok).toBe(true);
    expect(ledger.snapshot().users[USER]?.calls.flashcards).toBe(1);
  });
});

describe('presupuesto', () => {
  it('frena todo cuando el gasto real llega al presupuesto del día', async () => {
    const ledger = new DayLedger();
    await ledger.settle(settlement({ userId: OTHER, engine: 'flashcards', costUsd: 5 }));
    expect(await ledger.admit(admitInput({ engine: 'bias_tips', engineShare: 1 }))).toEqual({
      ok: false,
      reason: 'budget_exceeded',
    });
  });

  it('cada motor tiene su cuota y no se come la de los demás', async () => {
    const ledger = new DayLedger();
    await ledger.settle(settlement({ userId: OTHER, engine: 'forgetting', costUsd: 0.5 }));
    expect(await ledger.admit(admitInput({ engineShare: 0.1 }))).toEqual({
      ok: false,
      reason: 'budget_exceeded',
    });
    expect(await ledger.admit(admitInput({ engine: 'flashcards', engineShare: 0.55 }))).toEqual({
      ok: true,
    });
  });

  it('el alumno tiene su tope en dólares y el equipo no', async () => {
    const ledger = new DayLedger();
    await ledger.settle(settlement({ engine: 'flashcards', costUsd: 0.3 }));
    const cards = admitInput({ engine: 'flashcards', engineShare: 0.55 });
    expect(await ledger.admit(cards)).toEqual({ ok: false, reason: 'budget_exceeded' });
    expect(await ledger.admit({ ...cards, staff: true })).toEqual({ ok: true });
    expect(await ledger.admit({ ...cards, userId: OTHER })).toEqual({ ok: true });
  });

  it('lo simulado no gasta pero deja su renglón, y el resumen suma la cola', async () => {
    const ledger = new DayLedger({
      pendingJobs: () => ({ pendingJobs: 2, inFlightUsd: { forgetting: 0.004 } }),
    });
    await ledger.admit(admitInput());
    await ledger.settle(settlement({ real: false, costUsd: 9 }));
    await ledger.settle(settlement({ costUsd: 0 }));
    await ledger.settle(settlement({ costUsd: 0.25, mode: 'batch', jobId: 'trabajo-1' }));
    expect(ledger.log.map((entry) => [entry.real, entry.costUsd, entry.mode])).toEqual([
      [false, 0, 'sync'],
      [true, 0, 'sync'],
      [true, 0.25, 'batch'],
    ]);
    expect(await ledger.summary()).toMatchObject({
      calls: 1,
      students: 1,
      spentUsd: 0.25,
      byEngine: { forgetting: { calls: 1, costUsd: 0.25 } },
      pendingJobs: 2,
      inFlightUsd: { forgetting: 0.004 },
    });
  });
});

describe('reserva del peor costo al admitir', () => {
  const MINUTE = 60_000;
  const cards = (overrides: Partial<AdmitV2Input> = {}) =>
    admitInput({
      engine: 'flashcards',
      perStudentPerDay: 1000,
      engineShare: 0.55,
      reserveUsd: 0.13,
      ...overrides,
    });
  const clockLedger = () => {
    let now = Date.parse('2026-10-15T15:00:00Z');
    const ledger = new DayLedger({ now: () => new Date(now) });
    return {
      ledger,
      advance: (ms: number) => {
        now += ms;
      },
    };
  };

  it('lo que está en vuelo cuenta en el tope del alumno aunque nada se haya asentado', async () => {
    const ledger = new DayLedger();
    // Con 0.30 de tope y 0.13 de reserva pasan tres llamadas a la vez y la cuarta no
    for (let call = 0; call < 3; call += 1)
      expect(await ledger.admit(cards())).toEqual({ ok: true });
    expect(await ledger.admit(cards())).toEqual({ ok: false, reason: 'budget_exceeded' });
    // La suma es de todos sus motores. Otra alumna y el equipo no tienen ese tope
    expect(await ledger.admit(cards({ engine: 'bias_tips', engineShare: 0.1 }))).toEqual({
      ok: false,
      reason: 'budget_exceeded',
    });
    expect(await ledger.admit(cards({ userId: OTHER }))).toEqual({ ok: true });
    expect(await ledger.admit(cards({ staff: true }))).toEqual({ ok: true });
    expect(ledger.snapshot().users[USER]?.reserved?.flashcards?.usd).toBe(0.52);
  });

  it('la reserva de la llamada que entra no cuenta para ella, así una a una gasta lo de siempre', async () => {
    const ledger = new DayLedger();
    // 0.30 de tope y 0.03 por llamada: pasan 10, aunque la reserva de cada una (0.5) sea mayor que el tope
    let admitted = 0;
    for (let call = 0; call < 20; call += 1) {
      const admission = await ledger.admit(cards({ reserveUsd: 0.5 }));
      if (!admission.ok) break;
      admitted += 1;
      await ledger.settle(settlement({ engine: 'flashcards', costUsd: 0.03, reservedUsd: 0.5 }));
    }
    expect(admitted).toBe(10);
    expect(ledger.snapshot().users[USER]).toMatchObject({ costUsd: 0.3, reserved: {} });
  });

  it('asentar devuelve la reserva y suma el costo real, y liberar solo devuelve la reserva', async () => {
    const ledger = new DayLedger();
    await ledger.admit(cards());
    await ledger.admit(cards());
    await ledger.settle(settlement({ engine: 'flashcards', costUsd: 0.018, reservedUsd: 0.13 }));
    expect(ledger.snapshot().users[USER]).toMatchObject({
      costUsd: 0.018,
      reserved: { flashcards: { usd: 0.13 } },
    });
    await ledger.release({
      userId: USER,
      engine: 'flashcards',
      generationRef: null,
      reservedUsd: 0.13,
    });
    expect(ledger.snapshot().users[USER]).toMatchObject({ costUsd: 0.018, reserved: {} });
    // Devolver de más o dos veces nunca deja nada en negativo ni toca a otro motor o alumno
    await ledger.admit(cards({ userId: OTHER }));
    await ledger.release({
      userId: USER,
      engine: 'flashcards',
      generationRef: null,
      reservedUsd: 5,
    });
    await ledger.settle(settlement({ engine: 'flashcards', costUsd: 0, reservedUsd: 5 }));
    expect(ledger.snapshot().users[OTHER]?.reserved?.flashcards?.usd).toBe(0.13);
    expect(ledger.snapshot().users[USER]?.reserved).toEqual({});
  });

  it('el asiento de un lote, sin reserva, no toca lo que otras llamadas tienen en vuelo', async () => {
    const ledger = new DayLedger();
    await ledger.admit(cards());
    await ledger.settle(
      settlement({ engine: 'flashcards', costUsd: 0.001, mode: 'batch', jobId: 'trabajo-1' }),
    );
    expect(ledger.snapshot().users[USER]?.reserved?.flashcards?.usd).toBe(0.13);
    // Un trabajo por lote tampoco reserva al encolarse
    await ledger.admit(admitInput({ reserveUsd: 0 }));
    expect(ledger.snapshot().users[USER]?.reserved?.forgetting).toBeUndefined();
  });

  it('el presupuesto del día y la cuota del motor suman la reserva de todas las alumnas', async () => {
    const ledger = new DayLedger();
    // Cuota de 0.5 (5 por 0.1): dos alumnas con 0.3 en vuelo la pasan, y otro motor sigue libre
    const weekly = (userId: string) =>
      admitInput({ userId, engine: 'weekly_report', engineShare: 0.1, reserveUsd: 0.3 });
    expect(await ledger.admit(weekly(USER))).toEqual({ ok: true });
    expect(await ledger.admit(weekly(OTHER))).toEqual({ ok: true });
    expect(await ledger.admit(weekly('f0000000-0000-4000-8000-000000000003'))).toEqual({
      ok: false,
      reason: 'budget_exceeded',
    });
    expect(await ledger.admit(cards({ userId: 'f0000000-0000-4000-8000-000000000003' }))).toEqual({
      ok: true,
    });
    // Presupuesto del día de 1 dólar: 0.6 en vuelo y otra de 0.6 que entra mientras
    const total = new DayLedger();
    const small = (userId: string, engine: AdmitV2Input['engine']) =>
      admitInput({
        userId,
        engine,
        engineShare: 1,
        dailyBudgetUsd: 1,
        reserveUsd: 0.6,
        staff: true,
      });
    expect(await total.admit(small(USER, 'forgetting'))).toEqual({ ok: true });
    expect(await total.admit(small(OTHER, 'bias_tips'))).toEqual({ ok: true });
    expect(await total.admit(small(USER, 'weekly_report'))).toEqual({
      ok: false,
      reason: 'budget_exceeded',
    });
  });

  it('lo asentado y lo reservado se suman, y el gasto de un lote cuenta como asentado', async () => {
    const ledger = new DayLedger();
    await ledger.settle(settlement({ engine: 'flashcards', costUsd: 0.1, mode: 'batch' }));
    // 0.1 asentados y 0.13 en vuelo no llegan a 0.3. Con 0.26 en vuelo, sí
    expect(await ledger.admit(cards())).toEqual({ ok: true });
    expect(await ledger.admit(cards())).toEqual({ ok: true });
    expect(await ledger.admit(cards())).toEqual({ ok: false, reason: 'budget_exceeded' });
  });

  it('lo huérfano vence a los 5 minutos, de cualquier alumna, y con 4 minutos sigue contando', async () => {
    const { ledger, advance } = clockLedger();
    expect(RESERVATION_TTL_MS).toBe(5 * MINUTE);
    // La llamada reserva y muere: nunca asienta ni libera
    await ledger.admit(cards({ reserveUsd: 0.4 }));
    advance(4 * MINUTE);
    expect(await ledger.admit(cards({ reserveUsd: 0.01 }))).toEqual({
      ok: false,
      reason: 'budget_exceeded',
    });
    expect(ledger.snapshot().users[USER]?.reserved?.flashcards?.usd).toBe(0.4);
    advance(MINUTE);
    // A los 5 minutos justos ya venció, y quien lo ve puede ser otra alumna
    expect(await ledger.admit(cards({ userId: OTHER, reserveUsd: 0.01 }))).toEqual({ ok: true });
    expect(ledger.snapshot().users[USER]?.reserved).toEqual({});
    expect(await ledger.admit(cards({ reserveUsd: 0.4 }))).toEqual({ ok: true });
    // La reserva nueva empieza su propia hora
    expect(ledger.snapshot().users[USER]?.reserved?.flashcards).toMatchObject({
      usd: 0.4,
      since: Date.parse('2026-10-15T15:05:00Z'),
    });
  });

  it('sumar sobre algo en vuelo conserva la hora de la primera reserva, y lo vencido no resta de más', async () => {
    const { ledger, advance } = clockLedger();
    await ledger.admit(cards({ userId: OTHER, reserveUsd: 0.1 }));
    advance(2 * MINUTE);
    await ledger.admit(cards({ userId: OTHER, reserveUsd: 0.1 }));
    expect(ledger.snapshot().users[OTHER]?.reserved?.flashcards).toMatchObject({
      usd: 0.2,
      since: Date.parse('2026-10-15T15:00:00Z'),
    });
    advance(4 * MINUTE);
    // Venció la primera hora, así que la segunda llamada, ya viva, también se da por perdida
    await ledger.admit(cards({ userId: USER, reserveUsd: 0.1 }));
    expect(ledger.snapshot().users[OTHER]?.reserved).toEqual({});
    // Cuando esa llamada asienta, devolver lo que ya no está no deja nada en negativo
    await ledger.settle(settlement({ userId: OTHER, engine: 'flashcards', reservedUsd: 0.1 }));
    expect(ledger.snapshot().users[OTHER]?.reserved).toEqual({});
  });

  it('rechaza una reserva negativa y sobrevive a reiniciar el proxy', async () => {
    await expect(new DayLedger().admit(cards({ reserveUsd: -0.1 }))).rejects.toThrow();
    await expect(new DayLedger().admit(cards({ reserveUsd: Number.NaN }))).rejects.toThrow();
    let stored: unknown = null;
    const persistence = {
      load: () => stored,
      save: (state: DayLedgerState) => {
        stored = structuredClone(state);
      },
    };
    const now = () => new Date('2026-10-15T15:00:00Z');
    const first = new DayLedger({ persistence, now });
    await first.admit(cards({ reserveUsd: 0.3 }));
    const second = new DayLedger({ persistence, now });
    expect(await second.admit(cards())).toEqual({ ok: false, reason: 'budget_exceeded' });
    await second.settle(settlement({ engine: 'flashcards', costUsd: 0.01, reservedUsd: 0.3 }));
    expect(new DayLedger({ persistence, now }).snapshot().users[USER]).toMatchObject({
      costUsd: 0.01,
      reserved: {},
    });
  });
});

describe('día y archivo', () => {
  const memoryFile = () => {
    let stored: unknown = null;
    return {
      persistence: {
        load: () => stored,
        save: (state: DayLedgerState) => {
          stored = structuredClone(state);
        },
      },
      set: (value: unknown) => {
        stored = value;
      },
    };
  };

  it('el día es el de México, se renueva al cambiar y sobrevive a reiniciar', async () => {
    const file = memoryFile();
    let now = new Date('2026-10-08T15:00:00Z');
    const first = new DayLedger({ persistence: file.persistence, now: () => now });
    await first.admit(admitInput({ perStudentPerDay: 1 }));
    await first.settle(settlement({ costUsd: 0.1 }));
    const second = new DayLedger({ persistence: file.persistence, now: () => now });
    expect(await second.summary()).toMatchObject({ day: '2026-10-08', calls: 1, spentUsd: 0.1 });
    expect(await second.admit(admitInput({ perStudentPerDay: 1 }))).toEqual({
      ok: false,
      reason: 'student_limit',
    });
    // A las 03:00 UTC del 9 todavía es el 8 en la Ciudad de México
    now = new Date('2026-10-09T03:00:00Z');
    expect((await second.summary()).day).toBe('2026-10-08');
    now = new Date('2026-10-09T15:00:00Z');
    expect(await second.admit(admitInput({ perStudentPerDay: 1 }))).toEqual({ ok: true });
  });

  it('un libro guardado antes de las reservas se lee, sin reservas', async () => {
    const file = memoryFile();
    file.set({
      version: 2,
      day: '2026-10-08',
      users: { [USER]: { calls: { forgetting: 1 }, costUsd: 0.2 } },
      generations: {},
      spentUsd: 0.2,
      byEngine: { forgetting: { calls: 1, costUsd: 0.2 } },
    });
    const now = () => new Date('2026-10-08T15:00:00Z');
    const ledger = new DayLedger({ persistence: file.persistence, now });
    expect(await ledger.summary()).toMatchObject({ calls: 1, spentUsd: 0.2 });
    expect(await ledger.admit(admitInput({ reserveUsd: 0.05 }))).toEqual({ ok: true });
  });

  it('un libro de la versión anterior, dañado o ilegible empieza el día en cero', async () => {
    const file = memoryFile();
    file.set({ day: '2026-10-08', students: {}, spentUsd: 3, byEngine: {} });
    const now = () => new Date('2026-10-08T15:00:00Z');
    expect((await new DayLedger({ persistence: file.persistence, now }).summary()).spentUsd).toBe(
      0,
    );
    const failing = {
      load: () => {
        throw new Error('no se pudo leer');
      },
      save: () => undefined,
    };
    expect((await new DayLedger({ persistence: failing }).summary()).calls).toBe(0);
  });
});
