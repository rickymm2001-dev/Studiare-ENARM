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

  it('copia el nivel cognitivo si es de la lista y lo deja sin nivel si falta, es null o no se conoce (V4-B5)', () => {
    const row = wireRow();
    const withLevel = bodyEntitiesOf(wireBody(row, { cognitiveLevel: 'synthesis' }));
    expect(withLevel?.question.cognitiveLevel).toBe('synthesis');
    for (const value of [null, undefined, '', 'dificil']) {
      const entities = bodyEntitiesOf({ ...wireBody(row), cognitiveLevel: value });
      expect(entities).not.toBeNull();
      expect(entities?.question).not.toHaveProperty('cognitiveLevel');
    }
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

  it('copia el idioma inglés de un caso de lectura y deja el español sin el campo (B13)', () => {
    const spanish = bodyEntitiesOf(wireBody(wireRow()));
    expect(spanish?.question).not.toHaveProperty('language');
    const row = wireRow({ language: 'en', branch: 'medical_english' });
    const english = bodyEntitiesOf(
      wireBody(row, {
        gpcRefs: [
          { title: 'Fuente del texto. Texto propio del equipo Studiare.', status: 'to_verify' },
        ],
      }),
    );
    expect(english?.question).toMatchObject({ language: 'en', branch: 'medical_english' });
    // Un idioma que esta versión de la app no conoce se queda como español en vez de descartar la pregunta
    const odd = bodyEntitiesOf({ ...wireBody(wireRow()), language: 'fr' });
    expect(odd?.question).not.toHaveProperty('language');
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
