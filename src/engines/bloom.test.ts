import { describe, expect, it } from 'vitest';
import {
  COGNITIVE_GROUPS,
  COGNITIVE_LEVELS,
  cognitiveGroupOf,
  cognitiveRows,
  isCognitiveLevel,
  levelsOfGroup,
} from './bloom';

describe('niveles de Bloom', () => {
  it('seis niveles en tres grupos, dos por grupo', () => {
    expect(COGNITIVE_LEVELS).toHaveLength(6);
    expect(COGNITIVE_GROUPS.map((group) => levelsOfGroup(group))).toEqual([
      ['knowledge', 'comprehension'],
      ['application', 'analysis'],
      ['synthesis', 'evaluation'],
    ]);
    expect(cognitiveGroupOf('knowledge')).toBe('low');
    expect(cognitiveGroupOf('analysis')).toBe('medium');
    expect(cognitiveGroupOf('evaluation')).toBe('high');
  });

  it('reconoce solo los niveles válidos', () => {
    expect(isCognitiveLevel('synthesis')).toBe(true);
    expect(isCognitiveLevel('creation')).toBe(false);
    expect(isCognitiveLevel(undefined)).toBe(false);
    expect(isCognitiveLevel(3)).toBe(false);
  });
});

describe('cognitiveRows', () => {
  const answer = (level: Parameters<typeof cognitiveGroupOf>[0] | undefined, correct: boolean) => ({
    cognitiveLevel: level,
    correct,
  });

  it('da la exactitud por grupo cuando hay respuestas suficientes', () => {
    const responses = [
      ...Array.from({ length: 10 }, (_, i) => answer('knowledge', i < 8)),
      ...Array.from({ length: 10 }, (_, i) => answer('application', i < 5)),
      ...Array.from({ length: 10 }, (_, i) => answer('evaluation', i < 2)),
    ];
    const rows = cognitiveRows({ responses, minResponses: 10 });
    expect(rows.map((row) => row.accuracy)).toEqual([0.8, 0.5, 0.2]);
    expect(rows.every((row) => row.responsesNeeded === 0)).toBe(true);
  });

  it('con pocas respuestas calibra y dice cuántas faltan', () => {
    const rows = cognitiveRows({
      responses: [answer('analysis', true), answer('analysis', false)],
      minResponses: 10,
    });
    expect(rows[1]).toMatchObject({
      group: 'medium',
      total: 2,
      accuracy: null,
      responsesNeeded: 8,
    });
    expect(rows[0]).toMatchObject({ total: 0, accuracy: null, responsesNeeded: 10 });
  });

  it('una pregunta sin nivel no cuenta en ningún grupo', () => {
    const rows = cognitiveRows({
      responses: [answer(undefined, true), answer(undefined, false)],
      minResponses: 1,
    });
    expect(rows.every((row) => row.total === 0)).toBe(true);
  });
});
