import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { DayLedger } from '../../../supabase/functions/_shared/ai/ledger.ts';
import type { AdmitV2Input, SettlementV2 } from '../../../supabase/functions/_shared/ai/ports.ts';
import { createLedger } from './ledgerFile.ts';

const dirs: string[] = [];
const tempFile = () => {
  const dir = mkdtempSync(join(tmpdir(), 'ai-ledger-'));
  dirs.push(dir);
  return join(dir, 'ledger.json');
};
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const USER = 'f0000000-0000-4000-8000-000000000001';
const admitInput = (): AdmitV2Input => ({
  userId: USER,
  engine: 'forgetting',
  staff: false,
  perStudentPerDay: 5,
  dailyBudgetUsd: 1,
  engineShare: 1,
  perUserDailyUsd: 1,
  generationRef: null,
  maxGenerations: 20,
  maxSections: 12,
});
const admit = (ledger: DayLedger) => ledger.admit({ ...admitInput(), perStudentPerDay: 2 });
const spend = (costUsd: number): SettlementV2 => ({
  userId: USER,
  engine: 'forgetting',
  model: 'claude-haiku-5-5',
  real: true,
  ok: true,
  costUsd,
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  latencyMs: 0,
  mode: 'sync',
  outcome: 'ok',
  promptVersion: null,
  refusalCategory: null,
  jobId: null,
});

describe('archivo', () => {
  it('sobrevive a reiniciar el proxy el mismo día', async () => {
    const file = tempFile();
    const now = () => new Date('2026-10-08T15:00:00Z');
    const first = createLedger({ file, now });
    await admit(first);
    await first.settle(spend(0.4));
    expect(JSON.parse(readFileSync(file, 'utf8'))).toMatchObject({ day: '2026-10-08' });
    expect(existsSync(`${file}.tmp`)).toBe(false);
    const second = createLedger({ file, now });
    expect(await second.summary()).toMatchObject({ calls: 1, spentUsd: 0.4 });
  });

  it('la reserva de lo que está en vuelo también se guarda, y vence si el proxy murió con ella', async () => {
    const file = tempFile();
    let now = Date.parse('2026-10-08T15:00:00Z');
    const clock = () => new Date(now);
    const first = createLedger({ file, now: clock });
    await first.admit({ ...admitInput(), reserveUsd: 0.6 });
    expect(JSON.parse(readFileSync(file, 'utf8'))).toMatchObject({
      users: { [USER]: { reserved: { forgetting: { usd: 0.6 } } } },
    });
    // El proxy se reinicia con la llamada en vuelo: su reserva sigue contando un rato
    const second = createLedger({ file, now: clock });
    expect(await second.admit({ ...admitInput(), reserveUsd: 0.6 })).toEqual({ ok: true });
    expect(await second.admit({ ...admitInput(), reserveUsd: 0.6 })).toEqual({
      ok: false,
      reason: 'budget_exceeded',
    });
    // Como nadie la asienta, vence a los 5 minutos
    now += 5 * 60_000;
    const third = createLedger({ file, now: clock });
    expect(await third.admit({ ...admitInput(), reserveUsd: 0.6 })).toEqual({ ok: true });
  });

  it('un archivo de otro día o dañado empieza en cero', async () => {
    const file = tempFile();
    const first = createLedger({ file, now: () => new Date('2026-10-07T15:00:00Z') });
    await admit(first);
    const nextDay = createLedger({ file, now: () => new Date('2026-10-08T15:00:00Z') });
    expect((await nextDay.summary()).calls).toBe(0);
    writeFileSync(file, 'esto no es json');
    expect((await createLedger({ file }).summary()).calls).toBe(0);
  });

  it('sin archivo vive solo en memoria y el resumen suma la cola', async () => {
    const ledger = createLedger({
      file: null,
      pendingJobs: () => ({ pendingJobs: 3, inFlightUsd: {} }),
    });
    await admit(ledger);
    expect(await ledger.summary()).toMatchObject({ calls: 1, pendingJobs: 3 });
    expect((await createLedger().summary()).calls).toBe(0);
  });
});
