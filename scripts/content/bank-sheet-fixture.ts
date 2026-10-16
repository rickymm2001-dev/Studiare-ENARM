// Corre la sincronización del banco contra los tres Sheets simulados de tests/fixtures/bank-sheet, sin
// red y sin base (B11, 6.4 paso 1 del plan de B11). Usa la misma función que corre en Supabase, con un
// Google de mentira y una base en memoria, e imprime el reporte de renglones. Es la prueba de oro de
// tests/content/bankSheetFixture.test.ts. ingles es el Sheet de casos de lectura en inglés de B13 y no
// toca los reportes de oro de antes y despues, que son de B11.
// Uso: npm run bank:fixture             imprime los tres reportes
//      npm run bank:fixture -- --write  reescribe expected-antes.json, expected-despues.json y expected-ingles.json
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as prettier from 'prettier';
import {
  createFakeGoogle,
  type FakeSheetFixture,
} from '../../supabase/functions/_shared/bank/fakeGoogle.ts';
import type { SyncRowResult } from '../../supabase/functions/_shared/bank/generated/contracts.ts';
import { createGoogleClient } from '../../supabase/functions/_shared/bank/google.ts';
import { createMemoryStore } from '../../supabase/functions/_shared/bank/memoryStore.ts';
import { expectedOutcome } from '../../supabase/functions/_shared/bank/plan.ts';
import { runSync, type BankSyncDeps } from '../../supabase/functions/_shared/bank/sync.ts';

const FIXTURES = resolve(import.meta.dirname, '..', '..', 'tests', 'fixtures', 'bank-sheet');
export const FIXTURE_NAMES = ['antes', 'despues', 'ingles'] as const;
export type FixtureName = (typeof FIXTURE_NAMES)[number];

export interface FixtureReport {
  status: string;
  reason: string | null;
  mode: 'dry_run' | 'apply';
  counts: Record<string, number>;
  rows: Omit<SyncRowResult, 'questionId'>[];
}

export function readFixture(name: FixtureName): FakeSheetFixture {
  return JSON.parse(readFileSync(resolve(FIXTURES, `${name}.json`), 'utf8')) as FakeSheetFixture;
}

/** El reporte de una corrida de Sincronizar ahora contra un Sheet simulado, con la base vacía */
export async function fixtureReport(name: FixtureName): Promise<FixtureReport> {
  const fixture = readFixture(name);
  const google = await createFakeGoogle([fixture]);
  const store = createMemoryStore();
  const deps: BankSyncDeps = {
    env: {},
    log: () => undefined,
    authorizeAdmin: () => Promise.resolve(null),
    cronOk: () => Promise.resolve(false),
    store,
    google: (key) =>
      createGoogleClient(key, {
        fetch: google.fetch,
        now: () => Date.now(),
        sleep: () => Promise.resolve(),
      }),
    waitUntil: () => undefined,
  };
  const begin = await store.begin('manual', 'real', null);
  const report = await runSync(
    deps,
    begin,
    deps.google(google.key),
    fixture.spreadsheet.spreadsheetId,
    'manual',
  );
  return {
    status: report.status,
    reason: report.reason,
    mode: store.applied.some((call) => call.forceDryRun) ? 'dry_run' : begin.mode,
    counts: report.counts,
    rows: store.applied
      .flatMap((call) => call.rows)
      .map((row) => ({
        rowNumber: row.rowNumber,
        sheetKey: row.key === '' ? null : row.key,
        outcome: expectedOutcome(row.decision),
        incomplete: row.incomplete,
        notices: row.notices,
        problems: row.problems,
      })),
  };
}

export function expectedPath(name: FixtureName): string {
  return resolve(FIXTURES, `expected-${name}.json`);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  const write = process.argv.includes('--write');
  for (const name of FIXTURE_NAMES) {
    const report = await fixtureReport(name);
    const path = expectedPath(name);
    const config = (await prettier.resolveConfig(path)) ?? {};
    const text = await prettier.format(JSON.stringify(report), { ...config, filepath: path });
    if (write) writeFileSync(path, text);
    console.log(`Sheet simulado ${name}. ${report.status}, ${report.mode}`);
    console.log(text);
  }
}
