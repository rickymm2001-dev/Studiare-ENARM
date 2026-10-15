import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from './config.ts';
import { DayLedger, GENERATION_RETRIES, type DayLedgerState } from './ledger.ts';
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
    await ledger.settle(settlement({ costUsd: 0.25, mode: 'batch', jobId: 'trabajo-1' }));
    expect(ledger.log.map((entry) => [entry.real, entry.costUsd, entry.mode])).toEqual([
      [false, 0, 'sync'],
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
