import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { Ledger } from '../../../supabase/functions/_shared/ai/ledger.ts';
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

const admit = (ledger: Ledger) =>
  ledger.admit({
    studentRef: 'alumno-uno-0001',
    engine: 'forgetting',
    perStudentPerDay: 2,
    dailyBudgetUsd: 1,
  });

describe('archivo', () => {
  it('sobrevive a reiniciar el proxy el mismo día', () => {
    const file = tempFile();
    const now = () => new Date('2026-10-08T15:00:00Z');
    const first = createLedger({ file, now });
    admit(first);
    first.settle({ engine: 'forgetting', costUsd: 0.4, real: true });
    expect(JSON.parse(readFileSync(file, 'utf8'))).toMatchObject({ day: '2026-10-08' });
    expect(existsSync(`${file}.tmp`)).toBe(false);
    const second = createLedger({ file, now });
    expect(second.summary()).toMatchObject({ calls: 1, spentUsd: 0.4 });
  });

  it('un archivo de otro día o dañado empieza en cero', () => {
    const file = tempFile();
    const first = createLedger({ file, now: () => new Date('2026-10-07T15:00:00Z') });
    admit(first);
    const nextDay = createLedger({ file, now: () => new Date('2026-10-08T15:00:00Z') });
    expect(nextDay.summary().calls).toBe(0);
    writeFileSync(file, 'esto no es json');
    expect(createLedger({ file }).summary().calls).toBe(0);
  });

  it('sin archivo vive solo en memoria', () => {
    const ledger = createLedger({ file: null });
    admit(ledger);
    expect(ledger.summary().calls).toBe(1);
    expect(createLedger().summary().calls).toBe(0);
  });
});
