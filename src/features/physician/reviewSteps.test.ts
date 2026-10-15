// Pasos de la revisión de una pregunta en el editor (4.1 y 4.4 del plan de B11), como función pura
import { describe, expect, it } from 'vitest';
import type { EditorQuestion, EditorVersion } from '@/data/bank/contracts';
import {
  approvalBlockers,
  needsComment,
  reviewViewOf,
  sourceKeyLabel,
  splitIncomplete,
} from './reviewSteps';

const version = (overrides: Partial<EditorVersion> = {}): EditorVersion => ({
  versionId: 'v2',
  version: 2,
  status: 'in_review',
  source: 'sheet',
  author: null,
  createdAt: '2026-10-14T10:00:00.000Z',
  submittedAt: null,
  decidedAt: null,
  branch: 'internal_medicine',
  topic: 'cardiology',
  subtopic: 'hypertension',
  difficulty: 3,
  itemKinds: [],
  structure: {
    polarity: 'affirmative',
    task: 'diagnosis',
    format: 'clinical_case',
    source: 'auto',
  },
  vignette: '[Prueba] Caso',
  prompt: '[Prueba] ¿Pregunta?',
  explanation: '[Prueba] Explicación',
  gpcRefs: [],
  clues: [],
  caseId: null,
  caseOrder: null,
  variantOf: null,
  canonicalOptionIds: ['o1', 'o2'],
  options: [
    {
      id: 'o1',
      optionId: 's1',
      letter: 'A',
      position: 0,
      text: 'A',
      isCorrect: true,
      biasTag: null,
      secondaryBiasTags: [],
      rationale: 'r',
      hidden: false,
    },
    {
      id: 'o2',
      optionId: 's2',
      letter: 'B',
      position: 1,
      text: 'B',
      isCorrect: false,
      biasTag: 'anchoring',
      secondaryBiasTags: [],
      rationale: 'r',
      hidden: false,
    },
  ],
  incomplete: [],
  flags: ['kind_control_check'],
  decisions: [],
  ...overrides,
});

const question = (
  review: Partial<EditorQuestion['review']>,
  versions: EditorVersion[] = [version()],
  sync: Partial<EditorQuestion['sync']> = {},
): EditorQuestion => ({
  question: {} as EditorQuestion['question'],
  versions,
  case: null,
  review: { role: 'reviewer', state: 'ready', myLabels: [], pendingOptionIds: [], ...review },
  reports: { open: 0, byReason: {} },
  distractorFlags: [],
  sync: {
    origin: 'sheet',
    sourceKey: 'sheet:GO-0012',
    lastRunAt: null,
    conflictSince: null,
    missingSince: null,
    ...sync,
  },
});

describe('pasos de la revisión', () => {
  it('el revisor primero etiqueta a ciegas y no edita', () => {
    const view = reviewViewOf(question({ state: 'blind_pending', pendingOptionIds: ['s2'] }));
    expect(view?.step).toBe('blind');
    expect(view?.editable).toBe(false);
    expect(view?.blind).toEqual({ total: 1, done: 0, pending: ['s2'] });
  });

  it('con las etiquetas listas decide sobre la versión en revisión', () => {
    const view = reviewViewOf(question({ state: 'ready' }));
    expect(view?.step).toBe('decide');
    expect(view?.editable).toBe(true);
    expect(view?.flags).toEqual(['kind_control_check']);
  });

  it('el autor con un borrador lo manda a revisión y con la versión en revisión espera', () => {
    expect(
      reviewViewOf(question({ role: 'author', state: 'none' }, [version({ status: 'draft' })]))
        ?.step,
    ).toBe('draft');
    expect(reviewViewOf(question({ role: 'author', state: 'none' }))?.step).toBe('waiting');
    expect(
      reviewViewOf(question({ role: 'author', state: 'none' }, [version({ status: 'approved' })]))
        ?.step,
    ).toBe('closed');
  });

  it('un borrador que regresó con cambios pedidos ya está decidido y pide una versión nueva', () => {
    const returned = version({
      status: 'draft',
      decisions: [
        {
          physician: { id: 'p2', alias: 'Beto' },
          decision: 'request_changes',
          comment: 'Revisa la clave',
          decidedAt: '2026-10-14T15:00:00.000Z',
        },
      ],
    });
    const view = reviewViewOf(question({ role: 'author', state: 'none' }, [returned]));
    expect(view?.step).toBe('draft');
    expect(view?.decided).toBe(true);
    expect(
      reviewViewOf(question({ role: 'author', state: 'none' }, [version({ status: 'draft' })]))
        ?.decided,
    ).toBe(false);
  });

  it('el revisor no ve ni edita un borrador hasta etiquetarlo a ciegas', () => {
    const hidden = version({ status: 'draft' });
    hidden.options = hidden.options.map((option) =>
      option.isCorrect ? option : { ...option, biasTag: null, rationale: null, hidden: true },
    );
    const view = reviewViewOf(question({ role: 'reviewer', state: 'none' }, [hidden]));
    expect(view?.step).toBe('waiting');
    expect(view?.editable).toBe(false);
    expect(view?.authorHidden).toBe(true);
    // Con sus etiquetas cerradas ya lo ve y lo edita
    const seen = reviewViewOf(
      question({ role: 'reviewer', state: 'none' }, [version({ status: 'draft' })]),
    );
    expect(seen?.step).toBe('draft');
    expect(seen?.editable).toBe(true);
    expect(seen?.authorHidden).toBe(false);
  });

  it('el admin y quien no está asignado solo leen', () => {
    for (const role of ['admin', 'none'] as const) {
      const view = reviewViewOf(question({ role, state: 'none' }));
      expect(view?.step).toBe('read_only');
      expect(view?.editable).toBe(false);
    }
  });

  it('dice qué cambió contra la versión anterior y de dónde viene', () => {
    const previous = version({ versionId: 'v1', version: 1, explanation: 'Otra' });
    const view = reviewViewOf(question({ state: 'ready' }, [version(), previous], {}));
    expect(view?.changes).toEqual(['explanation']);
    expect(view?.fromSheet).toBe(true);
    expect(view?.sheetKey).toBe('GO-0012');
    expect(reviewViewOf(question({ state: 'ready' }))?.changes).toBeNull();
    expect(
      reviewViewOf(question({ state: 'ready' }, undefined, { conflictSince: '2026-10-14' }))
        ?.conflict,
    ).toBe(true);
  });

  it('sin versiones no hay vista', () => {
    expect(reviewViewOf(question({}, []))).toBeNull();
  });

  it('aprobar pide sin pendientes y todas las casillas', () => {
    const view = { incomplete: ['explanation_missing'], flags: ['topic_inferred'] };
    expect(approvalBlockers(view, new Set())).toEqual(['incomplete', 'flags']);
    expect(approvalBlockers({ ...view, incomplete: [] }, new Set(['topic_inferred']))).toEqual([]);
    expect(needsComment('approve')).toBe(false);
    expect(needsComment('reject')).toBe(true);
  });

  it('separa el código de un pendiente de su letra y quita el prefijo del ID', () => {
    expect(splitIncomplete('rationale_missing:B')).toEqual({
      code: 'rationale_missing',
      letter: 'B',
    });
    expect(splitIncomplete('explanation_missing')).toEqual({
      code: 'explanation_missing',
      letter: null,
    });
    expect(sourceKeyLabel('import:MI-0001')).toBe('MI-0001');
    expect(sourceKeyLabel(null)).toBeNull();
  });
});
