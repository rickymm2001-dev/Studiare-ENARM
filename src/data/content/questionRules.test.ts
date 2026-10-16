// Pendientes que impiden aprobar una versión (B11, espejo de bank_version_issues). Texto simulado.
import { describe, expect, it } from 'vitest';
import { incompleteOnly, versionIssues, type RuleVersion } from './questionRules';

const taggable = new Set(['anchoring', 'premature_closure', 'framing_effect']);

const complete: RuleVersion = {
  prompt: '[Prueba] ¿Cuál es el diagnóstico?',
  explanation: '[Prueba] Explicación simulada.',
  refs: ['[Prueba] Guía simulada'],
  options: [
    { position: 0, text: '[Prueba] A', isCorrect: true, biasTag: null, rationale: '[Prueba] a' },
    {
      position: 1,
      text: '[Prueba] B',
      isCorrect: false,
      biasTag: 'anchoring',
      rationale: '[Prueba] b',
    },
    {
      position: 2,
      text: '[Prueba] C',
      isCorrect: false,
      biasTag: 'premature_closure',
      rationale: '[Prueba] c',
    },
    {
      position: 3,
      text: '[Prueba] D',
      isCorrect: false,
      biasTag: 'framing_effect',
      rationale: '[Prueba] d',
    },
  ],
  canonicalPositions: [0, 1, 2, 3],
};

describe('pendientes de una versión', () => {
  it('una versión completa se puede aprobar, aunque sea un reactivo raro', () => {
    expect(versionIssues(complete, taggable)).toEqual([]);
  });

  it('pide explicación, referencias, justificaciones y el sesgo de cada distractor', () => {
    const issues = versionIssues(
      {
        ...complete,
        explanation: ' ',
        refs: ['  '],
        options: complete.options.map((option) =>
          option.position === 1
            ? { ...option, rationale: null }
            : option.position === 2
              ? { ...option, biasTag: null }
              : option.position === 3
                ? { ...option, biasTag: 'decision_fatigue' }
                : option,
        ),
      },
      taggable,
    );
    expect(issues).toEqual([
      'explanation_missing',
      'references_missing',
      'rationale_missing:B',
      'bias_missing:C',
      'bias_unknown:D',
    ]);
    expect(incompleteOnly(issues)).toEqual(issues);
  });

  it('una tarea vacía queda pendiente antes de la explicación y sin la propiedad no se revisa', () => {
    expect(versionIssues({ ...complete, task: '', explanation: '' }, taggable)).toEqual([
      'task_undetected',
      'explanation_missing',
    ]);
    expect(incompleteOnly(['task_undetected'])).toEqual(['task_undetected']);
    expect(versionIssues({ ...complete, task: 'diagnosis' }, taggable)).toEqual([]);
    expect(versionIssues(complete, taggable)).toEqual([]);
  });

  it('usa la letra del Sheet si la opción la trae', () => {
    const options = complete.options.map((option) =>
      option.position === 1 ? { ...option, letter: 'B', biasTag: null } : option,
    );
    expect(versionIssues({ ...complete, options }, taggable)).toEqual(['bias_missing:B']);
  });

  it('marca la estructura que no se puede aprobar y la separa de lo incompleto', () => {
    const issues = versionIssues(
      {
        ...complete,
        prompt: '',
        options: complete.options.slice(0, 3).map((option) => ({ ...option, isCorrect: false })),
        canonicalPositions: [1],
      },
      taggable,
    );
    expect(issues).toEqual([
      'prompt_missing',
      'options_count',
      'correct_count',
      'canonical_invalid',
      'bias_missing:A',
    ]);
    expect(incompleteOnly(issues)).toEqual(['bias_missing:A']);
  });
});

describe('pendientes de una versión en inglés (B13, 1.6 del plan de B13)', () => {
  const source = 'Fuente del texto. [Prueba] Texto simulado. CC BY. https://example.org/texto';
  const english: RuleVersion = {
    ...complete,
    language: 'en',
    englishBranch: true,
    refs: [source, '[Prueba] Guía simulada'],
  };

  it('una versión en inglés con su fuente se puede aprobar', () => {
    expect(versionIssues(english, taggable)).toEqual([]);
    // La fuente cuenta como referencia, así que sola basta
    expect(versionIssues({ ...english, refs: [source] }, taggable)).toEqual([]);
  });

  it('sin fuente falta passage_source_missing, después de las referencias y antes de las opciones', () => {
    const noSource: RuleVersion = {
      ...english,
      refs: ['[Prueba] Guía simulada'],
      explanation: '',
      options: complete.options.map((option) =>
        option.position === 1 ? { ...option, rationale: null } : option,
      ),
    };
    expect(versionIssues(noSource, taggable)).toEqual([
      'explanation_missing',
      'passage_source_missing',
      'rationale_missing:B',
    ]);
    expect(versionIssues({ ...english, refs: [] }, taggable)).toEqual([
      'references_missing',
      'passage_source_missing',
    ]);
  });

  it('una licencia fuera de la lista es license_not_allowed y un enlace que falta es passage_source_missing', () => {
    expect(
      versionIssues(
        { ...english, refs: ['Fuente del texto. [Prueba] Texto. CC BY-NC. https://example.org/x'] },
        taggable,
      ),
    ).toEqual(['license_not_allowed']);
    expect(
      versionIssues({ ...english, refs: ['Fuente del texto. [Prueba] Texto. CC BY.'] }, taggable),
    ).toEqual(['passage_source_missing']);
    expect(
      versionIssues(
        { ...english, refs: ['Fuente del texto. Texto propio del equipo Studiare.'] },
        taggable,
      ),
    ).toEqual([]);
  });

  it('el idioma tiene que ir con la rama y eso no se arregla con una celda', () => {
    const outside = versionIssues({ ...english, englishBranch: false }, taggable);
    expect(outside).toEqual(['language_branch_mismatch']);
    const spanishInside = versionIssues(
      { ...complete, language: 'es', englishBranch: true },
      taggable,
    );
    expect(spanishInside).toEqual(['language_branch_mismatch']);
    expect(incompleteOnly(outside)).toEqual([]);
    // Después de la estructura y antes de la tarea
    const order = versionIssues(
      { ...english, englishBranch: false, task: '', canonicalPositions: [1] },
      taggable,
    );
    expect(order).toEqual(['canonical_invalid', 'language_branch_mismatch', 'task_undetected']);
  });

  it('el español no cambia y sin idioma o sin rama no se revisa nada del inglés', () => {
    expect(versionIssues({ ...complete, language: 'es', englishBranch: false }, taggable)).toEqual(
      [],
    );
    expect(
      versionIssues({ ...complete, refs: ['[Prueba] Guía'], language: 'es' }, taggable),
    ).toEqual([]);
    expect(versionIssues({ ...english, englishBranch: undefined }, taggable)).toEqual([]);
    expect(versionIssues({ ...complete, englishBranch: true }, taggable)).toEqual([]);
  });
});
