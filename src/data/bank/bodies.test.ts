import { describe, expect, it } from 'vitest';
import { uuidToUlid } from '../cloud/cloudIds';
import { cloudId, wireBody, wireRow } from '../testing/bankCloud';
import { bodyEntitiesOf, caseEntityOf } from './bodies';

describe('cuerpos que bajan de la nube (5.2)', () => {
  it('quedan como versión aprobada, sin marca de demostración y con los ids en ULID', () => {
    const row = wireRow();
    const body = wireBody(row);
    const entities = bodyEntitiesOf(body);
    expect(entities?.question).toMatchObject({
      id: uuidToUlid(row.versionId),
      questionId: uuidToUlid(row.questionId),
      editorialStatus: 'approved',
      isDemo: false,
      caseId: null,
      caseOrder: null,
      explanation: '[Prueba] Explicación simulada.',
      canonicalOptionIds: body.options.map((option) => uuidToUlid(option.id)),
    });
    expect(entities?.question).not.toHaveProperty('variantOf');
    expect(entities?.question).not.toHaveProperty('itemKinds');
    expect(entities?.options.map((option) => option.questionVersionId)).toEqual(
      Array(4).fill(uuidToUlid(row.versionId)),
    );
    expect(entities?.options.map((option) => option.optionId)).toEqual(
      body.options.map((option) => uuidToUlid(option.optionId)),
    );
  });

  it('acepta reactivos imperfectos y de tipos raros, con casos seriados y variantes', () => {
    const caseId = cloudId();
    const original = cloudId();
    const row = wireRow({
      caseId,
      caseOrder: 2,
      format: 'serial_case',
      polarity: 'negative',
      itemKinds: ['incoherent', 'obscure_detail', 'patient_perspective', 'inverse_resolution'],
      variantOf: original,
    });
    const body = wireBody(row, {
      vignette: '',
      explanation: '',
      gpcRefs: [],
      clues: [{ text: '[Prueba] Dato simulado', strength: 'nonspecific' }],
    });
    const entities = bodyEntitiesOf(body);
    expect(entities?.question).toMatchObject({
      caseId: uuidToUlid(caseId),
      caseOrder: 2,
      variantOf: uuidToUlid(original),
      itemKinds: ['incoherent', 'obscure_detail', 'patient_perspective', 'inverse_resolution'],
      clues: [{ text: '[Prueba] Dato simulado', strength: 'nonspecific' }],
      vignette: '',
    });
  });

  it('las opciones quedan en el orden del médico aunque lleguen revueltas', () => {
    const body = wireBody(wireRow());
    const reversed = { ...body, options: [...body.options].reverse() };
    expect(bodyEntitiesOf(reversed)?.options.map((option) => option.text)).toEqual(
      body.options.map((option) => option.text),
    );
  });

  it('descarta completo lo que no se puede guardar', () => {
    const body = wireBody(wireRow());
    const broken = [
      null,
      { ...body, versionId: 'no-es-uuid' },
      { ...body, caseId: 'no-es-uuid' },
      { ...body, variantOf: 7 },
      { ...body, prompt: '' },
      { ...body, structure: { ...body.structure, task: 'tarea_nueva' } },
      { ...body, options: body.options.map((option) => ({ ...option, isCorrect: true })) },
      { ...body, options: [...body.options.slice(1)] },
      { ...body, options: [null, ...body.options] },
      { ...body, canonicalOptionIds: [cloudId(), cloudId()] },
      { ...body, canonicalOptionIds: ['mal', 'peor'] },
      { ...body, createdAt: 'ayer' },
      {
        ...body,
        options: body.options.map((option, index) =>
          index === 1 ? { ...option, biasTag: null } : option,
        ),
      },
    ];
    for (const raw of broken) expect(bodyEntitiesOf(raw)).toBeNull();
  });

  it('el caso clínico pasa con su viñeta y sin marca de demostración', () => {
    const id = cloudId();
    expect(
      caseEntityOf({ id, vignette: '[Prueba] Caso simulado', createdAt: '2026-10-20 15:00:00+00' }),
    ).toEqual({
      id: uuidToUlid(id),
      vignette: '[Prueba] Caso simulado',
      isDemo: false,
      createdAt: '2026-10-20T15:00:00.000Z',
    });
    expect(caseEntityOf({ id, vignette: '', createdAt: '2026-10-20T15:00:00.000Z' })).toBeNull();
    expect(caseEntityOf('caso')).toBeNull();
  });
});
