import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { DayLedger } from '../../../supabase/functions/_shared/ai/ledger.ts';
import type { SettlementV2 } from '../../../supabase/functions/_shared/ai/ports.ts';
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
const admit = (ledger: DayLedger) =>
  ledger.admit({
    userId: USER,
    engine: 'forgetting',
    staff: false,
    perStudentPerDay: 2,
    dailyBudgetUsd: 1,
    engineShare: 1,
    perUserDailyUsd: 1,
    generationRef: null,
    maxGenerations: 20,
    maxSections: 12,
  });
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
