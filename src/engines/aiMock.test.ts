import { describe, expect, it } from 'vitest';
import { HYPOTHESIS_RULES } from './aiContracts';
import { guardHypothesis } from './aiGuards';
import {
  mockFlashcards,
  mockHypothesis,
  mockOutput,
  mockRestructure,
  mockWeeklyReport,
} from './aiMock';
import {
  flashcardsInput,
  hypothesisInput,
  restructureInput,
  weeklyReportInput,
} from '@/ai/testing/aiSamples';

describe('hipótesis simulada', () => {
  it('da una hipótesis anclada para cada regla', () => {
    for (const rule of HYPOTHESIS_RULES) {
      const input = hypothesisInput({ rule });
      const output = mockHypothesis(input);
      expect(output.hypothesis, rule).not.toBeNull();
      expect(guardHypothesis(output, input), rule).toEqual({ passed: true, issues: [] });
    }
  });

  it('sube la confianza a media con muchos hallazgos y nunca a alta', () => {
    expect(mockHypothesis(hypothesisInput({ recentFindings: 5 })).confidence).toBe('low');
    expect(mockHypothesis(hypothesisInput({ recentFindings: 12 })).confidence).toBe('medium');
  });

  it('no opina cuando la evidencia no alcanza', () => {
    const output = mockHypothesis(
      hypothesisInput({ evidence: hypothesisInput().evidence.slice(0, 1) }),
    );
    expect(output).toEqual({
      hypothesis: null,
      evidence: [],
      confidence: 'low',
      actions: [],
      studentMessage: null,
    });
  });

  it('siempre da lo mismo para la misma entrada', () => {
    expect(mockOutput('forgetting', hypothesisInput())).toEqual(
      mockOutput('forgetting', hypothesisInput()),
    );
  });
});

describe('informe, tarjetas y preguntas simulados', () => {
  it('el informe repite lo calculado y no inventa secciones', () => {
    const output = mockWeeklyReport(weeklyReportInput({ habit: null }));
    expect(output.summary).toContain('120');
    expect(output.habit).toBeNull();
    expect(output.challenge).toBe('Practica diez preguntas de cardiología.');
    expect(output.priorities.map((line) => line.ref)).toEqual(['p1', 'p2', 'p3']);
  });

  it('las tarjetas salen del texto y llevan la señal de controversia cuando afirman un absoluto', () => {
    const plain = mockFlashcards(flashcardsInput());
    expect(plain.cards.length).toBeGreaterThan(0);
    const absolute = mockFlashcards(
      flashcardsInput({
        text: 'La anemia ferropénica siempre se trata con hierro oral durante 3 meses completos.',
      }),
    );
    expect(absolute.cards[0]?.controversy?.sources.length).toBeGreaterThan(0);
  });

  it('un texto sin nada que estudiar no da tarjetas', () => {
    expect(mockFlashcards(flashcardsInput({ text: 'Hola.' })).cards).toEqual([]);
  });

  it('la pregunta reestructurada avisa que es de ejemplo y cambia la clave solo en la excepción', () => {
    const input = restructureInput();
    const except = mockRestructure(input);
    expect(except.rationale).toContain('médico debe revisarla');
    expect(except.options.find((option) => option.isKey)?.label).toBe('B');
    const anchor = mockRestructure(restructureInput({ transform: 'change_anchor' }));
    expect(anchor.options.find((option) => option.isKey)?.label).toBe('A');
    // La cita es una frase de la explicación y, si ninguna alcanza el mínimo, la explicación entera
    expect(input.explanation).toContain(except.quote);
    const short = mockRestructure(restructureInput({ explanation: 'Corta.' }));
    expect(short.quote).toBe('Corta.');
  });

  it('rechaza un motor que no existe', () => {
    expect(() => mockOutput('otro' as never, {} as never)).toThrow('Motor');
  });
});
