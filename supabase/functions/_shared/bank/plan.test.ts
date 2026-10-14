// Pruebas del planeador de bank-sync (B11, 3.5 del plan de B11). Cada fila de la tabla de qué hacer
// con un renglón y el salto por huella del Sheet en la corrida de Cron. Usa el Sheet simulado despues.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createFakeGoogle, type FakeSheetFixture } from './fakeGoogle.ts';
import type { VersionContent } from './generated/contentHash.ts';
import type { SyncQuestion, SyncRowPayload } from './generated/contracts.ts';
import { createGoogleClient } from './google.ts';
import { createMemoryStore } from './memoryStore.ts';
import {
  countPlan,
  expectedOutcome,
  planSheet,
  resolveComparisons,
  versionsToCompare,
  type KnownQuestion,
} from './plan.ts';
import { tableFromValues } from './sheetTable.ts';
import { convertBankTable, runSync, type BankSyncDeps, type SyncTrigger } from './sync.ts';

const ID_PATTERN = '^[A-Z]{2,4}-[0-9]{4,5}$';
const fixture = JSON.parse(
  readFileSync(
    resolve(import.meta.dirname, '../../../../tests/fixtures/bank-sheet/despues.json'),
    'utf8',
  ),
) as FakeSheetFixture;
const values = (fixture.values.valueRanges[0] as { values: unknown[][] }).values;
const converted = convertBankTable(tableFromValues('Preguntas', values), ID_PATTERN);

async function freshPayload(key: string): Promise<SyncRowPayload> {
  const fresh = await planSheet(converted, []);
  const row = fresh.rows.find((item) => item.payload.key === key);
  if (!row) throw new Error(`el Sheet despues no trae ${key}`);
  return row.payload;
}

/** Lo que sabría la base de una pregunta que la sincronización ya aplicó tal cual está en el Sheet */
async function known(key: string, changes: Partial<KnownQuestion> = {}): Promise<KnownQuestion> {
  const payload = await freshPayload(key);
  return {
    key,
    questionId: `q-${key}`,
    rowHash: payload.rowHash,
    metaHash: payload.metaHash,
    latestVersionId: `v-${key}`,
    latestSource: 'sheet',
    appliedVersionId: `v-${key}`,
    forceNext: false,
    conflictRowHash: null,
    status: 'active',
    ...changes,
  };
}

/** La versión de la app con el mismo contenido que el renglón, escrita como la guarda la base */
function versionOf(question: SyncQuestion): VersionContent {
  return {
    branch: question.branch,
    topic: question.topic,
    subtopic: question.subtopic,
    difficulty: question.difficulty,
    itemKinds: [...question.itemKinds].reverse(),
    task: question.task,
    polarity: question.polarity,
    language: question.language,
    vignette: `${question.vignette}  \r\n`,
    prompt: question.prompt.normalize('NFD'),
    explanation: question.explanation,
    refs: question.refs,
    options: question.options.map((option, position) => ({
      letter: position === 0 ? null : option.letter.toLowerCase(),
      position,
      text: option.text,
      isCorrect: option.correct,
      biasTag: option.bias,
      rationale: option.rationale,
    })),
    canonical: question.canonical,
    caseKey: question.caseKey,
    caseOrder: question.caseOrder,
    caseVignette: question.caseVignette,
  };
}

describe('qué hace con cada renglón (3.5)', () => {
  it('ID nuevo se crea y un renglón rechazado viaja sin pregunta', async () => {
    const plan = await planSheet(converted, []);
    const created = plan.rows.find((row) => row.payload.key === 'GO-0001');
    expect(created?.payload).toMatchObject({ decision: 'create', expectLatestVersionId: null });
    expect(created?.payload.question).toBeDefined();
    expect(created?.payload.rowHash).toMatch(/^[0-9a-f]{64}$/);

    const rejected = plan.rows.filter((row) => row.payload.decision === 'rejected');
    expect(rejected.length).toBeGreaterThan(0);
    for (const row of rejected) {
      expect(row.payload.question).toBeUndefined();
      expect(row.payload.problems.length).toBeGreaterThan(0);
    }
    // Las claves rechazadas también cuentan como vistas, así no se marcan como faltantes
    expect(plan.seenKeys).toContain('GO-0011');
    expect(plan.seenKeys).toContain('GO-0016');
    expect(plan.seenKeys.filter((key) => key === 'GO-0016')).toHaveLength(1);
  });

  it('misma huella que la aplicada no viaja y solo cuenta como sin cambios', async () => {
    const plan = await planSheet(converted, [await known('GO-0001')]);
    expect(plan.rows.some((row) => row.payload.key === 'GO-0001')).toBe(false);
    expect(plan.unchanged).toBe(1);
    expect(plan.seenKeys).toContain('GO-0001');
  });

  it('solo cambiaron Autor, Revisor o Estado', async () => {
    const plan = await planSheet(converted, [await known('GO-0004', { metaHash: 'otra' })]);
    const row = plan.rows.find((item) => item.payload.key === 'GO-0004');
    expect(row?.payload).toMatchObject({
      decision: 'meta_only',
      expectLatestVersionId: 'v-GO-0004',
    });
    expect(row?.compareWith).toBeNull();
  });

  it('huella distinta y la más reciente es la de la sincronización crea versión', async () => {
    const plan = await planSheet(converted, [await known('GO-0005', { rowHash: 'vieja' })]);
    const row = plan.rows.find((item) => item.payload.key === 'GO-0005');
    expect(row?.payload).toMatchObject({ decision: 'version', expectLatestVersionId: 'v-GO-0005' });
    expect(row?.compareWith).toBeNull();
  });

  it('Usar la del Sheet crea versión aunque la huella sea la misma', async () => {
    const plan = await planSheet(converted, [
      await known('GO-0013', { forceNext: true, latestVersionId: 'v-app', latestSource: 'app' }),
    ]);
    const row = plan.rows.find((item) => item.payload.key === 'GO-0013');
    expect(row?.payload).toMatchObject({ decision: 'version', expectLatestVersionId: 'v-app' });
  });

  it('la más reciente nació en la app. Igual es converged, distinta o perdida es conflict', async () => {
    const fromApp = { latestVersionId: 'v-app', latestSource: 'app', rowHash: 'vieja' } as const;
    const plan = await planSheet(converted, [
      await known('GO-0007', { ...fromApp, latestVersionId: 'v-app-7' }),
      await known('GO-0012', { ...fromApp, latestVersionId: 'v-app-12' }),
      await known('GO-0014', {
        ...fromApp,
        latestVersionId: 'v-app-14',
        latestSource: 'ai_variant',
      }),
    ]);
    expect(versionsToCompare(plan)).toEqual(['v-app-7', 'v-app-12', 'v-app-14']);
    for (const key of ['GO-0007', 'GO-0012', 'GO-0014']) {
      expect(plan.rows.find((row) => row.payload.key === key)?.payload.decision).toBe('conflict');
    }

    const same = (await freshPayload('GO-0012')).question;
    const other = (await freshPayload('GO-0007')).question;
    if (!same || !other) throw new Error('faltan preguntas en despues');
    const changed = versionOf(other);
    await resolveComparisons(
      plan,
      new Map([
        ['v-app-12', versionOf(same)],
        ['v-app-7', { ...changed, prompt: `${changed.prompt} Corregida en la app.` }],
      ]),
    );
    const decisionOf = (key: string) =>
      plan.rows.find((row) => row.payload.key === key)?.payload.decision;
    expect(decisionOf('GO-0012')).toBe('converged');
    expect(decisionOf('GO-0007')).toBe('conflict');
    expect(decisionOf('GO-0014')).toBe('conflict');
    expect(versionsToCompare(plan)).toEqual([]);
    expect(plan.rows.find((row) => row.payload.key === 'GO-0012')?.payload).toMatchObject({
      expectLatestVersionId: 'v-app-12',
    });
  });

  it('los conteos salen de las decisiones', async () => {
    const plan = await planSheet(converted, [
      await known('GO-0001'),
      await known('GO-0004', { metaHash: 'otra' }),
      await known('GO-0005', { rowHash: 'vieja' }),
    ]);
    const counts = countPlan(converted, plan);
    expect(counts).toMatchObject({ read: 24, unchanged: 1, meta: 1, versioned: 1, conflict: 0 });
    expect(counts.created + counts.rejected + counts.meta + counts.versioned).toBe(23);
    expect(expectedOutcome('meta_only')).toBe('meta');
    expect(expectedOutcome('create')).toBe('created');
  });
});

describe('salto por huella del Sheet', () => {
  async function run(trigger: SyncTrigger, lastSheetHash: string | null) {
    const google = await createFakeGoogle([fixture]);
    const store = createMemoryStore({ begin: { lastSheetHash } });
    const deps: BankSyncDeps = {
      env: {},
      log: () => undefined,
      authorizeAdmin: () => Promise.resolve(null),
      cronOk: () => Promise.resolve(true),
      store,
      google: (key) =>
        createGoogleClient(key, {
          fetch: google.fetch,
          now: () => Date.now(),
          sleep: () => Promise.resolve(),
        }),
      waitUntil: () => undefined,
    };
    const begin = await store.begin(trigger, 'real', null);
    const report = await runSync(
      deps,
      begin,
      deps.google(google.key),
      fixture.spreadsheet.spreadsheetId,
      trigger,
    );
    return { report, store };
  }

  it('Cron con la misma huella termina sin escribir renglones, el admin sí corre', async () => {
    const first = await run('cron', null);
    const hash = first.store.finished[0]?.input.summary.sheetHash;
    expect(typeof hash).toBe('string');
    expect(first.store.applied.length).toBeGreaterThan(0);

    const again = await run('cron', String(hash));
    expect(again.report).toMatchObject({ status: 'skipped', reason: 'no_changes' });
    expect(again.store.applied).toEqual([]);
    expect(again.store.finished[0]?.input).toMatchObject({ seenKeys: null, status: 'skipped' });

    const manual = await run('manual', String(hash));
    expect(manual.report.status).toBe('partial');
    expect(manual.store.applied.length).toBeGreaterThan(0);

    const changed = await run('cron', 'otra');
    expect(changed.store.applied.length).toBeGreaterThan(0);
  });
});
