import { describe, expect, it } from 'vitest';
import { DEFAULT_THRESHOLDS } from '@/config/thresholds';
import { newId } from '@/data/testing/fixtures';
import type { TopicMastery } from '@/engines/topics';
import { answered, minute, option, question } from '../tutor/testing/fixtures';
import { buildAnalysis, topicsCalibration } from './analysis';
import { biasCalibration, biasProfileRows } from './focusItems';

type Entry = Pick<TopicMastery, 'state' | 'branch'>;
const calibrating = (responses: number, responsesNeeded: number, branch = 'rama'): Entry => ({
  branch,
  state: { kind: 'calibrating' as const, responses, responsesNeeded },
});
const ready = (branch = 'rama'): Entry => ({
  branch,
  state: { kind: 'ready' as const, mastery: 0.5, lower: 0.4, upper: 0.6, responses: 30 },
});

describe('cuánto falta para que un tema muestre su dominio', () => {
  it('toma el tema al que menos le falta y, a igual faltante, el que más lleva', () => {
    const byTopic = new Map<string, Entry>([
      ['a', calibrating(2, 9)],
      ['b', calibrating(4, 6)],
      ['c', calibrating(1, 6)],
    ]);
    expect(topicsCalibration(byTopic, 5)).toEqual({ have: 4, need: 10 });
  });

  it('si ya hay un tema con dominio listo no hay nada que calibrar', () => {
    const byTopic = new Map<string, Entry>([
      ['a', calibrating(2, 9)],
      ['b', ready()],
    ]);
    expect(topicsCalibration(byTopic, 5)).toBeNull();
  });

  it('con una rama solo cuentan los temas de esa rama', () => {
    // Un tema listo de cardiología no dice nada de pediatría, que no tiene una sola respuesta
    const byTopic = new Map<string, Entry>([
      ['corazon', ready('internal_medicine')],
      ['crecimiento', calibrating(0, 7, 'pediatrics')],
      ['neonatos', calibrating(2, 5, 'pediatrics')],
    ]);
    expect(topicsCalibration(byTopic, 5)).toBeNull();
    expect(topicsCalibration(byTopic, 5, 'internal_medicine')).toBeNull();
    expect(topicsCalibration(byTopic, 5, 'pediatrics')).toEqual({ have: 2, need: 7 });
    expect(topicsCalibration(byTopic, 5, 'rama_sin_temas')).toEqual({ have: 0, need: 5 });
  });

  it('sin temas pide el mínimo por tema y empieza en cero', () => {
    expect(topicsCalibration(new Map(), 5)).toEqual({ have: 0, need: 5 });
  });
});

describe('análisis de las respuestas', () => {
  const q1 = question({ id: newId(), physicianDifficulty: 4 });
  const right = option(newId(), true, 'Correcta');
  const wrong = option(newId(), false, 'Trampa');
  const options = [right, wrong];
  const bank = {
    questions: new Map([[q1.id, q1]]),
    options: new Map(options.map((item) => [item.id, item])),
    cases: new Map(),
  };
  const input = {
    bank,
    timeZone: 'America/Merida',
    today: '2026-10-02',
    desiredRetention: 0.9,
    thresholds: DEFAULT_THRESHOLDS,
  };

  it('sin respuestas todo calibra y no hay temas débiles ni perfil de sesgos', () => {
    const analysis = buildAnalysis({ ...input, events: [] });
    expect(analysis.responses).toEqual([]);
    expect(analysis.weakTopics).toEqual([]);
    expect(topicsCalibration(analysis.byTopic, 5)?.have).toBe(0);
    expect(biasCalibration(analysis.report)).toEqual({
      have: 0,
      need: DEFAULT_THRESHOLDS.bias.minTaggedErrors,
    });
    expect(biasProfileRows(analysis.report)).toEqual([]);
  });

  it('junta cada respuesta con su rama, tema y la dificultad del médico', () => {
    const analysis = buildAnalysis({
      ...input,
      events: [answered(q1, right.id, true, minute(0)), answered(q1, wrong.id, false, minute(1))],
    });
    expect(analysis.responses).toEqual([
      { branch: 'internal_medicine', topic: 'cardiology', level: 4, correct: true },
      { branch: 'internal_medicine', topic: 'cardiology', level: 4, correct: false },
    ]);
    // Dos respuestas no bastan para un dominio. Sigue calibrando y no marca ningún tema débil
    expect(analysis.weakTopics).toEqual([]);
    expect(analysis.byTopic.get('cardiology')?.state.kind).toBe('calibrating');
  });

  it('una respuesta de una pregunta que ya no está en el banco no cuenta', () => {
    const ghost = question({ id: newId() });
    const analysis = buildAnalysis({
      ...input,
      events: [answered(ghost, right.id, true, minute(0))],
    });
    expect(analysis.responses).toEqual([]);
  });
});
