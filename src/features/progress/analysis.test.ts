import { describe, expect, it } from 'vitest';
import { DEFAULT_THRESHOLDS } from '@/config/thresholds';
import { newId } from '@/data/testing/fixtures';
import type { TopicMastery } from '@/engines/topics';
import { answered, minute, option, question } from '../tutor/testing/fixtures';
import { buildAnalysis, englishProgressFrom, topicsCalibration } from './analysis';
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

describe('Inglés médico en el análisis (B13, 2.7 y 2.8)', () => {
  const caseA = newId();
  const caseB = newId();
  const reading = (caseId: string | null, overrides = {}) =>
    question({
      id: newId(),
      language: 'en',
      branch: 'medical_english',
      topic: 'reading_comprehension',
      caseId,
      caseOrder: caseId ? 1 : null,
      ...overrides,
    });
  const a1 = reading(caseA);
  const a2 = reading(caseA);
  const b1 = reading(caseB);
  const solo = reading(null);
  const spanish = question({ id: newId() });
  const right = option(newId(), true, 'Correcta');
  const bank = {
    questions: new Map([a1, a2, b1, solo, spanish].map((item) => [item.id, item])),
    options: new Map([[right.id, right]]),
    cases: new Map(),
  };
  const SECOND = newId();

  it('junta las respuestas de inglés y cuenta los textos distintos, sin las de español', () => {
    const events = [
      answered(a1, right.id, true, minute(0)),
      answered(a2, right.id, false, minute(1)),
      answered(b1, right.id, true, minute(2)),
      answered(solo, right.id, true, minute(3)),
      answered(spanish, right.id, true, minute(4)),
    ];
    const progress = englishProgressFrom(events, bank);
    expect(progress.answers).toHaveLength(4);
    expect(progress.answers.filter((answer) => answer.correct)).toHaveLength(3);
    expect(progress.texts).toBe(3);
    expect(progress.answers.map((answer) => answer.questionId)).not.toContain(spanish.id);
  });

  it('el tiempo de cada reactivo es el promedio de su texto en esa sesión', () => {
    // El primer reactivo carga con la lectura: 150 s contra 30 s. El texto lleva 90 s por reactivo
    const events = [
      answered(a1, right.id, true, minute(0), { msToAnswer: 150_000 }),
      answered(a2, right.id, true, minute(1), { msToAnswer: 30_000 }),
      // El mismo texto en otra sesión es otro intento, con su propio promedio
      answered(a1, right.id, true, minute(60), { msToAnswer: 60_000 }, SECOND),
    ];
    const progress = englishProgressFrom(events, bank);
    expect(progress.answers.map((answer) => answer.msSpent)).toEqual([90_000, 90_000, 60_000]);
    expect(progress.texts).toBe(1);
  });

  it('una respuesta de una pregunta que ya no está en el banco no cuenta', () => {
    const ghost = reading(caseA);
    expect(englishProgressFrom([answered(ghost, right.id, true, minute(0))], bank)).toEqual({
      answers: [],
      texts: 0,
    });
  });

  it('el análisis trae el inglés aparte y no lo cuenta entre los temas a reforzar', () => {
    const many = Array.from({ length: 30 }, (_, index) =>
      answered(solo, right.id, false, minute(index)),
    );
    const analysis = buildAnalysis({
      bank,
      events: many,
      timeZone: 'America/Merida',
      today: '2026-10-02',
      desiredRetention: 0.9,
      thresholds: DEFAULT_THRESHOLDS,
    });
    expect(analysis.english.answers).toHaveLength(30);
    // Con 30 fallos en un tema de inglés su dominio sale bajo, pero no es un tema a reforzar
    expect(analysis.byTopic.get('reading_comprehension')?.state.kind).toBe('ready');
    expect(analysis.weakTopics.map((topic) => topic.branch)).not.toContain('medical_english');
    expect(analysis.weakTopics).toEqual([]);
  });

  it('un tema de inglés no es el que más cerca está de mostrar su dominio', () => {
    const byTopic = new Map<string, Entry>([
      ['lectura', calibrating(9, 1, 'medical_english')],
      ['corazon', calibrating(2, 8, 'internal_medicine')],
    ]);
    expect(topicsCalibration(byTopic, 5)).toEqual({ have: 2, need: 10 });
    // Solo con inglés no hay nada de la sección clínica que contar y pide el mínimo por tema
    expect(
      topicsCalibration(new Map([['lectura', calibrating(9, 1, 'medical_english')]]), 5),
    ).toEqual({ have: 0, need: 5 });
  });
});
