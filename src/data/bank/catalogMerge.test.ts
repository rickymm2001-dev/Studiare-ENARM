import { describe, expect, it } from 'vitest';
import { uuidToUlid } from '../cloud/cloudIds';
import { CatalogEntrySchema } from '../schemas/bankCloud';
import { cloudId, wireRow } from '../testing/bankCloud';
import { catalogEntryOf, mergeCatalogPage } from './catalogMerge';

const page = (rows: unknown[], nextSince: number, done = true, open = true) => ({
  open,
  rows,
  nextSince,
  done,
});

describe('catálogo incremental (5.3)', () => {
  it('convierte los ids de uuid a ULID y conserva todo lo demás sin texto', () => {
    const caseId = cloudId();
    const row = wireRow({
      format: 'serial_case',
      caseId,
      caseOrder: 2,
      caseSize: 3,
      itemKinds: ['control', 'patient_perspective'],
      polarity: 'negative',
      distractorBiases: ['anchoring', 'premature_closure'],
    });
    const entry = catalogEntryOf(row);
    expect(entry).toMatchObject({
      questionId: uuidToUlid(row.questionId),
      versionId: uuidToUlid(row.versionId),
      caseId: uuidToUlid(caseId),
      caseOrder: 2,
      caseSize: 3,
      itemKinds: ['control', 'patient_perspective'],
      polarity: 'negative',
      distractorBiases: ['anchoring', 'premature_closure'],
      status: 'published',
    });
    expect(Object.keys(entry ?? {})).not.toContain('prompt');
  });

  it('una variante guarda de qué pregunta sale y un tipo de reactivo desconocido se ignora', () => {
    const original = cloudId();
    const entry = catalogEntryOf(
      wireRow({ variantOf: original, examEligible: false, itemKinds: ['control', 'nuevo_tipo'] }),
    );
    expect(entry?.variantOf).toBe(uuidToUlid(original));
    expect(entry?.examEligible).toBe(false);
    expect(entry?.itemKinds).toEqual(['control']);
  });

  it('descarta lo que la app no puede guardar', () => {
    expect(catalogEntryOf(null)).toBeNull();
    expect(catalogEntryOf([])).toBeNull();
    expect(catalogEntryOf(wireRow({ questionId: 'no-es-uuid' }))).toBeNull();
    expect(catalogEntryOf(wireRow({ caseId: 'no-es-uuid', caseOrder: 1 }))).toBeNull();
    expect(catalogEntryOf(wireRow({ variantOf: 'no-es-uuid' }))).toBeNull();
    expect(catalogEntryOf(wireRow({ task: 'tarea_nueva' }))).toBeNull();
    expect(catalogEntryOf(wireRow({ difficulty: 7 }))).toBeNull();
    expect(catalogEntryOf({ ...wireRow(), itemKinds: 'control', distractorBiases: null })).toEqual(
      expect.objectContaining({ itemKinds: [], distractorBiases: [] }),
    );
  });

  it('cada página avanza el seq, cuenta lo descartado y deja la fila con el seq más alto', () => {
    const first = wireRow({ seq: 3 });
    const newer = { ...first, versionId: cloudId(), version: 2, seq: 5 };
    const other = wireRow({ seq: 4 });
    const merge = mergeCatalogPage(new Map(), page([first, other, newer, { roto: true }], 5), 0);
    expect(merge.dropped).toBe(1);
    expect(merge.nextSince).toBe(5);
    expect(merge.done).toBe(true);
    expect(merge.upserts.map((entry) => [entry.version, entry.seq])).toEqual([
      [1, 4],
      [2, 5],
    ]);
  });

  it('una fila vieja no reemplaza a la guardada, así una retirada no vuelve a publicada', () => {
    const questionId = cloudId();
    const ulid = uuidToUlid(questionId) ?? '';
    const stored = new Map([[ulid, 9]]);
    const merge = mergeCatalogPage(
      stored,
      page([wireRow({ questionId, seq: 7, status: 'published' })], 9, false),
      8,
    );
    expect(merge.upserts).toEqual([]);
    expect(merge.done).toBe(false);
    expect(merge.nextSince).toBe(9);
    const retired = mergeCatalogPage(
      stored,
      page([wireRow({ questionId, seq: 10, status: 'retired' })], 10),
      9,
    );
    expect(retired.upserts.map((entry) => entry.status)).toEqual(['retired']);
  });

  it('con el banco cerrado no cambia nada y no avanza, y el seq nunca baja', () => {
    expect(mergeCatalogPage(new Map(), page([wireRow()], 0, true, false), 12)).toEqual({
      upserts: [],
      dropped: 0,
      nextSince: 12,
      done: true,
      open: false,
    });
    expect(mergeCatalogPage(new Map(), page([], 3), 12).nextSince).toBe(12);
  });
});

describe('calibración de la noche en el catálogo (B14, 1.6)', () => {
  /** Lo que devuelve catalog_changes en la llave calibration, con los ids en uuid */
  const wireCalibration = (versionId: string, overrides: Record<string, unknown> = {}) => ({
    versionId,
    state: 'provisional',
    difficulty: -0.42,
    se: 0.21,
    students: 134,
    elo: -0.38,
    extreme: false,
    studyDay: '2026-10-15',
    ...overrides,
  });

  it('guarda la calibración con el id de la versión en ULID', () => {
    const row = wireRow();
    const entry = catalogEntryOf({ ...row, calibration: wireCalibration(row.versionId) });
    expect(entry?.calibration).toEqual({
      versionId: uuidToUlid(row.versionId),
      state: 'provisional',
      difficulty: -0.42,
      se: 0.21,
      students: 134,
      elo: -0.38,
      extreme: false,
      studyDay: '2026-10-15',
    });
    // La fila sigue siendo válida para el esquema que la guarda
    expect(CatalogEntrySchema.safeParse(entry).success).toBe(true);
  });

  it('una calibración de otra versión se guarda con su propio id, y la app decide si vale', () => {
    const row = wireRow();
    const older = cloudId();
    const entry = catalogEntryOf({ ...row, calibration: wireCalibration(older) });
    expect(entry?.calibration?.versionId).toBe(uuidToUlid(older));
    expect(entry?.calibration?.versionId).not.toBe(entry?.versionId);
  });

  it('una fila de un servidor de antes no trae la llave y la entrada tampoco', () => {
    const entry = catalogEntryOf(wireRow());
    expect(entry).not.toBeNull();
    expect(Object.keys(entry ?? {})).not.toContain('calibration');
  });

  it('sin calibrar todavía, la fila dice null y la entrada también', () => {
    expect(catalogEntryOf({ ...wireRow(), calibration: null })?.calibration).toBeNull();
  });

  it('una calibración que no se puede leer no tira la pregunta, que queda sin calibración', () => {
    const row = wireRow();
    for (const calibration of [
      'texto',
      [],
      wireCalibration('no-es-uuid'),
      wireCalibration(row.versionId, { state: 'estado_nuevo' }),
      wireCalibration(row.versionId, { students: -3 }),
      wireCalibration(row.versionId, { studyDay: 'ayer' }),
      wireCalibration(row.versionId, { campo_nuevo: true }),
    ]) {
      const entry = catalogEntryOf({ ...row, calibration });
      expect(entry).not.toBeNull();
      expect(entry?.calibration).toBeNull();
    }
  });

  it('una estimación sin valores finitos entra con difficulty y error estándar en null', () => {
    const row = wireRow();
    const entry = catalogEntryOf({
      ...row,
      calibration: wireCalibration(row.versionId, {
        state: 'physician_estimate',
        difficulty: null,
        se: null,
        elo: null,
        extreme: true,
        students: 8,
      }),
    });
    expect(entry?.calibration).toMatchObject({
      state: 'physician_estimate',
      difficulty: null,
      se: null,
      extreme: true,
      students: 8,
    });
  });

  it('cuando la noche sube el seq, la fila nueva con su calibración reemplaza a la guardada', () => {
    const row = wireRow({ seq: 3 });
    const questionId = uuidToUlid(row.questionId) ?? '';
    const merge = mergeCatalogPage(
      new Map([[questionId, 3]]),
      page([{ ...row, seq: 8, calibration: wireCalibration(row.versionId) }], 8),
      3,
    );
    expect(merge.upserts).toHaveLength(1);
    expect(merge.upserts[0]).toMatchObject({ seq: 8, calibration: { state: 'provisional' } });
  });
});
