import { describe, expect, it } from 'vitest';
import { uuidToUlid } from '../cloud/cloudIds';
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
