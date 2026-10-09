import { describe, expect, it } from 'vitest';
import type { AiArtifact } from '@/data/schemas/activity';
import { newId } from '@/data/testing/fixtures';
import { applyTipReviews, tipReviewId, tipReviewsFrom } from './tipReviews';

const artifact = (
  biasKey: string,
  status: AiArtifact['status'],
  tip: string,
  userId: string | null = null,
): AiArtifact => ({
  id: tipReviewId(biasKey),
  userId,
  kind: 'bias_tip',
  status,
  mode: 'template',
  model: 'revision-medica',
  promptVersion: 'bias_tips.review.v1',
  content: { biasKey, tip, baseTip: 'Texto base del consejo.' },
  validatorResult: { passed: true, issues: [] },
  sourceIds: [],
  createdAt: '2026-10-09T10:00:00.000Z',
  decidedAt: status === 'draft' ? null : '2026-10-09T11:00:00.000Z',
  decidedBy: status === 'draft' ? null : newId(),
});

const tips = [
  { tag: 'anchoring', name: 'Anclaje', tip: 'Texto base de anclaje que sigue siendo borrador.' },
  { tag: 'framing_effect', name: 'Encuadre', tip: 'Texto base de encuadre.' },
  { tag: 'sunk_cost_fallacy', name: 'Costo hundido', tip: 'Texto base de costo hundido.' },
];

describe('revisión de consejos', () => {
  it('el ID es estable por consejo', () => {
    expect(tipReviewId('anchoring')).toBe(tipReviewId('anchoring'));
    expect(tipReviewId('anchoring')).not.toBe(tipReviewId('framing_effect'));
  });

  it('lo aprobado o editado cambia el texto y quita la marca, lo rechazado se oculta', () => {
    const reviews = tipReviewsFrom([
      artifact('anchoring', 'edited', 'Texto revisado por el médico de anclaje.'),
      artifact('framing_effect', 'rejected', 'Texto rechazado por el médico.'),
    ]);
    const applied = applyTipReviews(tips, reviews);
    expect(applied.map((tip) => tip.tag)).toEqual(['anchoring', 'sunk_cost_fallacy']);
    expect(applied[0]).toMatchObject({
      tip: 'Texto revisado por el médico de anclaje.',
      reviewed: true,
    });
    expect(applied[1]).toMatchObject({ reviewed: false, tip: 'Texto base de costo hundido.' });
  });

  it('un borrador sin decidir sigue marcado como borrador con el texto base', () => {
    const applied = applyTipReviews(
      tips,
      tipReviewsFrom([artifact('anchoring', 'draft', 'Texto en borrador del médico aquí.')]),
    );
    expect(applied[0]).toMatchObject({ reviewed: false, tip: tips[0]?.tip });
  });

  it('ignora artefactos de un alumno, de otro tipo o con contenido que no se puede leer', () => {
    const alumno = artifact('anchoring', 'approved', 'Texto de un alumno cualquiera.', newId());
    const roto: AiArtifact = {
      ...artifact('framing_effect', 'approved', 'x'),
      content: { tip: 1 },
    };
    const otro: AiArtifact = {
      ...artifact('anchoring', 'approved', 'Texto aprobado largo.'),
      kind: 'hypothesis',
    };
    expect(tipReviewsFrom([alumno, roto, otro]).size).toBe(0);
  });
});
