import { describe, expect, it } from 'vitest';
import { AppEventSchema, type AppEvent } from '@/data/schemas/events';
import { newId } from '@/data/testing/fixtures';
import type { StoredErrorCause } from '@/engines/errorCauses';
import { motiveTargetKey, motiveTargets, motivesByBranch, NO_BRANCH } from './motivesView';

const USER = newId();
const at = (minute: number) => new Date(Date.UTC(2026, 9, 1, 15, minute)).toISOString();

function stored(type: AppEvent['type'], minute: number, payload: object): AppEvent {
  return AppEventSchema.parse({
    id: newId(),
    userId: USER,
    at: at(minute),
    tz: 'America/Merida',
    schemaVersion: 1,
    sessionId: null,
    type,
    payload,
  });
}

const failed = (questionVersionId: string, minute: number) =>
  stored('question_answered', minute, {
    questionVersionId,
    optionVersionId: newId(),
    correct: false,
    confidence: null,
    msToAnswer: 30_000,
    changeCount: 0,
    highlightEnabled: false,
  });

const motive = (
  kind: 'question' | 'card',
  targetId: string,
  cause: StoredErrorCause,
  minute: number,
) => stored('cause_reported', minute, { targetKind: kind, targetId, cause });

describe('motivos por rama en Progreso (B5)', () => {
  it('cuenta cada error una vez con su último motivo, por la rama de su pregunta o tarjeta', () => {
    const internal = newId();
    const pediatric = newId();
    const card = newId();
    const orphan = newId();
    const events = [
      failed(internal, 0),
      motive('question', internal, 'knowledge', 1),
      // Lo cambió y vale el último
      motive('question', internal, 'time', 2),
      failed(pediatric, 3),
      // Una causa de antes se lee con la tabla de equivalencias
      motive('question', pediatric, 'rushed_or_tired', 4),
      motive('card', card, 'fatigue', 5),
      motive('question', orphan, 'anxiety', 6),
    ];
    expect(motiveTargets(events)).toEqual(
      [
        motiveTargetKey('question', internal),
        motiveTargetKey('question', pediatric),
        motiveTargetKey('card', card),
        motiveTargetKey('question', orphan),
      ].sort(),
    );
    const branches = new Map([
      [motiveTargetKey('question', internal), 'internal_medicine'],
      [motiveTargetKey('question', pediatric), 'pediatrics'],
      [motiveTargetKey('card', card), 'pediatrics'],
    ]);
    expect(motivesByBranch(events, branches)).toEqual([
      {
        group: 'pediatrics',
        total: 2,
        motives: [
          { motive: 'time', count: 1 },
          { motive: 'fatigue', count: 1 },
        ],
      },
      { group: 'internal_medicine', total: 1, motives: [{ motive: 'time', count: 1 }] },
      // Lo que no tiene rama conocida va al final
      { group: NO_BRANCH, total: 1, motives: [{ motive: 'anxiety', count: 1 }] },
    ]);
  });

  it('Otra razón, que no dice cuál de los siete fue, no cuenta', () => {
    const id = newId();
    const events = [failed(id, 0), motive('question', id, 'other', 1)];
    expect(motivesByBranch(events, new Map())).toEqual([]);
  });

  it('el motivo de una tarjeta de materia libre no cuenta, como en Conócete (B6)', () => {
    const question = newId();
    const card = newId();
    const events = [
      failed(question, 0),
      motive('question', question, 'knowledge', 1),
      // Una tarjeta de Materia::Anatomía, que no tiene rama del ENARM
      motive('card', card, 'fatigue', 2),
    ];
    const branches = new Map([[motiveTargetKey('question', question), 'internal_medicine']]);
    // Sin la lista caería con lo que no tiene rama
    expect(motivesByBranch(events, branches).map((row) => row.group)).toEqual([
      'internal_medicine',
      NO_BRANCH,
    ]);
    expect(motivesByBranch(events, branches, new Set([card]))).toEqual([
      { group: 'internal_medicine', total: 1, motives: [{ motive: 'knowledge', count: 1 }] },
    ]);
  });
});
