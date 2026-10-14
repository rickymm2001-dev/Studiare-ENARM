import { describe, expect, it } from 'vitest';
import { DEFAULT_THRESHOLDS } from '@/config/thresholds';
import {
  canCallLlm,
  countListItems,
  evaluateError,
  groupPatterns,
  type ErrorContext,
  type Finding,
} from './forgetting';

const thresholds = DEFAULT_THRESHOLDS.forgetting;

function context(overrides: Partial<ErrorContext> = {}): ErrorContext {
  return {
    eventId: 'e1',
    itemId: 'i1',
    kind: 'question',
    at: '2026-10-01T15:00:00.000Z',
    subtopic: 'insuficiencia_cardiaca',
    lapses: null,
    answerListItems: null,
    confusedWithItemId: null,
    confidence: 'unsure',
    probableMisread: false,
    fatigueContext: false,
    rapidGuess: false,
    baseTopicWeak: false,
    predictedRetrievability: null,
    daysSinceLastReview: null,
    reportedCause: null,
    ...overrides,
  };
}

describe('reglas de olvido (7.9)', () => {
  it('sin señales no crea hallazgos', () => {
    expect(evaluateError(context(), thresholds)).toEqual([]);
  });

  it('cada regla se cumple con su condición y trae evidencia y acción', () => {
    const cases: [Partial<ErrorContext>, string, string][] = [
      [{ kind: 'card', lapses: 3 }, 'persistent_lapse', 'review_explanation'],
      [{ answerListItems: 4 }, 'list_card', 'split_card'],
      [{ confusedWithItemId: 'i2' }, 'interference', 'create_contrast_card'],
      [{ confidence: 'sure' }, 'high_confidence_error', 'repeat_soon'],
      [{ probableMisread: true }, 'misreading', 'enable_highlight'],
      [{ fatigueContext: true }, 'fatigue', 'suggest_break'],
      [{ rapidGuess: true }, 'rushing', 'slow_down'],
      [{ baseTopicWeak: true }, 'foundation_gap', 'review_base_topic'],
      [
        { kind: 'card', predictedRetrievability: 0.6, daysSinceLastReview: 40 },
        'expected_forgetting',
        'none',
      ],
    ];
    for (const [override, rule, action] of cases) {
      const [finding] = evaluateError(context(override), thresholds);
      expect(finding, rule).toMatchObject({ rule, action, area: 'insuficiencia_cardiaca' });
      expect(finding?.evidence.eventIds).toEqual(['e1']);
    }
    expect(
      evaluateError(context({ confusedWithItemId: 'i2' }), thresholds)[0]?.evidence.itemIds,
    ).toEqual(['i1', 'i2']);
  });

  it('bordes de las reglas', () => {
    expect(evaluateError(context({ kind: 'card', lapses: 2 }), thresholds)).toEqual([]);
    expect(evaluateError(context({ answerListItems: 3 }), thresholds)).toEqual([]);
    expect(
      evaluateError(
        context({ kind: 'card', predictedRetrievability: 0.85, daysSinceLastReview: 40 }),
        thresholds,
      ),
    ).toEqual([]);
    expect(
      evaluateError(
        context({ kind: 'card', predictedRetrievability: 0.6, daysSinceLastReview: 10 }),
        thresholds,
      ),
    ).toEqual([]);
  });

  it('el olvido esperado es informativo y no alarma', () => {
    const [finding] = evaluateError(
      context({ kind: 'card', predictedRetrievability: 0.5, daysSinceLastReview: 30 }),
      thresholds,
    );
    expect(finding?.severity).toBe('info');
  });

  it('compara la causa reportada con las señales', () => {
    expect(
      evaluateError(context({ probableMisread: true, reportedCause: 'misread' }), thresholds)[0]
        ?.causeMatchesSignals,
    ).toBe(true);
    expect(
      evaluateError(context({ rapidGuess: true, reportedCause: 'confused' }), thresholds)[0]
        ?.causeMatchesSignals,
    ).toBe(false);
    expect(
      evaluateError(context({ rapidGuess: true, reportedCause: 'other' }), thresholds)[0]
        ?.causeMatchesSignals,
    ).toBeNull();
    expect(
      evaluateError(context({ rapidGuess: true }), thresholds)[0]?.causeMatchesSignals,
    ).toBeNull();
  });
});

describe('patrones', () => {
  const now = new Date('2026-10-15T15:00:00.000Z');
  const finding = (day: number, rule: Finding['rule'] = 'misreading', area = 'neg'): Finding => ({
    rule,
    area,
    evidence: { eventIds: [`e${day}`], itemIds: [`i${day}`] },
    action: 'enable_highlight',
    severity: rule === 'expected_forgetting' ? 'info' : 'notice',
    causeMatchesSignals: null,
    at: new Date(now.getTime() - day * 24 * 60 * 60 * 1000).toISOString(),
  });

  it('se confirma con 5 hallazgos en 14 días', () => {
    const forming = groupPatterns({
      findings: [1, 2, 3, 4].map((day) => finding(day)),
      now,
      thresholds,
    });
    expect(forming[0]).toMatchObject({ status: 'forming', recentFindings: 4, findingsNeeded: 1 });
    const confirmed = groupPatterns({
      findings: [1, 2, 3, 4, 13].map((day) => finding(day)),
      now,
      thresholds,
    });
    expect(confirmed[0]).toMatchObject({ status: 'confirmed', recentFindings: 5 });
    expect(confirmed[0]?.evidence.eventIds).toHaveLength(5);
    const old = groupPatterns({
      findings: [1, 2, 3, 4, 20].map((day) => finding(day)),
      now,
      thresholds,
    });
    expect(old[0]?.status).toBe('forming');
  });

  it('agrupa por regla y área y no agrupa el olvido esperado', () => {
    const patterns = groupPatterns({
      findings: [finding(1), finding(2, 'misreading', 'otra'), finding(3, 'expected_forgetting')],
      now,
      thresholds,
    });
    expect(patterns).toHaveLength(2);
  });

  it('llama al LLM como máximo una vez cada 7 días', () => {
    expect(canCallLlm({ status: 'forming' }, null, now)).toBe(false);
    expect(canCallLlm({ status: 'confirmed' }, null, now)).toBe(true);
    expect(canCallLlm({ status: 'confirmed' }, '2026-10-10T15:00:00.000Z', now)).toBe(false);
    expect(canCallLlm({ status: 'confirmed' }, '2026-10-08T15:00:00.000Z', now)).toBe(true);
  });

  it('cuenta elementos de una respuesta de tarjeta', () => {
    expect(countListItems('Fiebre, tos, disnea y dolor torácico')).toBe(4);
    expect(
      countListItems('Hipertensión<br>Diabetes<br>Tabaquismo<br>Dislipidemia<br>Obesidad'),
    ).toBe(5);
    expect(countListItems('Metformina')).toBe(1);
  });
});
