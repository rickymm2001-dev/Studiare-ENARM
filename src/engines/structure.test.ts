// Etiquetador de estructura con el diccionario real (7.5). Mayúsculas, minúsculas, acentos,
// dobles negaciones y falsos positivos comunes dentro de la viñeta.
import { describe, expect, it } from 'vitest';
import { StructureDictionarySchema } from '@/data/schemas/content';
import rawDictionary from '@/demo/content/structure-dict.json';
import {
  analyzeStructure,
  detectTask,
  findNegations,
  isProbableMisread,
  normalizeWithMap,
  resolveStructure,
  splitStem,
} from './structure';

const dictionary = StructureDictionarySchema.parse(rawDictionary);
const texts = (prompt: string) => findNegations(prompt, dictionary).map((range) => range.text);

describe('diccionario de estructura', () => {
  it('es válido, está pendiente de revisión médica y cubre las 11 tareas de 13.2', () => {
    expect(dictionary.status).toBe('pending_physician_review');
    expect(new Set(dictionary.tasks.map((entry) => entry.task)).size).toBe(11);
  });
});

describe('negaciones solo en la frase de la pregunta', () => {
  it('encuentra negaciones en mayúsculas, minúsculas y con o sin acento', () => {
    expect(texts('¿Cuál de las siguientes NO es una causa?')).toEqual(['NO']);
    expect(texts('¿cuál de las siguientes no es una causa?')).toEqual(['no']);
    expect(texts('Todas son correctas EXCEPTO:')).toEqual(['EXCEPTO']);
    expect(texts('Todas son indicaciones, excepto una')).toEqual(['excepto']);
    expect(texts('¿Cuál está CONTRAINDICADO?')).toEqual(['CONTRAINDICADO']);
    expect(texts('¿Cuál es la afirmación INCORRECTA?')).toEqual(['INCORRECTA']);
    expect(texts('Señala la opción falsa')).toEqual(['falsa']);
    expect(texts('¿Cuál es el diagnóstico MENOS PROBABLE?')).toEqual(['MENOS PROBABLE']);
    expect(texts('¿Cuál es el hallazgo menos común?')).toEqual(['menos común']);
    expect(texts('Todos son factores de riesgo, a excepción de:')).toEqual(['a excepción de']);
    expect(texts('Todos son útiles SALVO')).toEqual(['SALVO']);
  });

  it('los rangos apuntan al texto original sin cambiarlo, aun con acentos antes', () => {
    const prompt = '¿Cuál fármaco está contraindicado en el embarazo?';
    const [range] = findNegations(prompt, dictionary);
    expect(range).toMatchObject({ kind: 'contraindication', text: 'contraindicado' });
    expect(prompt.slice(range?.start, range?.end)).toBe('contraindicado');
    expect(normalizeWithMap('Útil').text).toBe('util');
  });

  it('no confunde palabras que contienen no ni frases que no niegan', () => {
    expect(texts('¿Cuál es la conducta ante un nódulo tiroideo?')).toEqual([]);
    expect(texts('¿Qué estudio solicitaría por la noche?')).toEqual([]);
    expect(texts('¿Cuántas dosis requiere al menos?')).toEqual([]);
    expect(texts('¿Qué tratamiento indica si no hay respuesta en 48 horas?')).toEqual([]);
    expect(texts('¿Qué dosis se da a menos de 24 horas del parto?')).toEqual([]);
    expect(texts('No obstante, ¿cuál es el diagnóstico?')).toEqual([]);
  });

  it('la viñeta no vuelve negativa la pregunta', () => {
    const result = analyzeStructure(
      {
        vignette: 'Mujer de 34 años que no refiere fiebre ni dolor. Niega antecedentes. No fuma.',
        prompt: '¿Cuál es el diagnóstico más probable?',
        serialCase: false,
      },
      dictionary,
    );
    expect(result).toMatchObject({
      polarity: 'affirmative',
      task: 'diagnosis',
      format: 'clinical_case',
      highlights: [],
    });
  });

  it('una negación vuelve negativa la pregunta y dos marcan doble negación', () => {
    const single = analyzeStructure(
      { vignette: '', prompt: '¿Cuál NO es un criterio diagnóstico?', serialCase: false },
      dictionary,
    );
    expect(single).toMatchObject({ polarity: 'negative', format: 'direct', doubleNegation: false });
    const double = analyzeStructure(
      { vignette: '', prompt: '¿Cuál de las siguientes NO es incorrecta?', serialCase: true },
      dictionary,
    );
    expect(double).toMatchObject({
      polarity: 'affirmative',
      doubleNegation: true,
      format: 'serial_case',
    });
    expect(double.highlights.map((range) => range.text)).toEqual(['NO', 'incorrecta']);
  });
});

describe('tipo de tarea', () => {
  const cases: [string, string | null][] = [
    ['¿Cuál es el diagnóstico más probable?', 'diagnosis'],
    ['¿Cuál es el siguiente paso en el manejo?', 'next_step'],
    ['¿Cuál es el estudio inicial?', 'initial_study'],
    ['¿Cuál es el estándar de oro para confirmar el diagnóstico?', 'confirmatory_study'],
    ['¿Cuál es el tratamiento inicial?', 'initial_treatment'],
    ['¿Cuál es el tratamiento de elección?', 'treatment_of_choice'],
    ['¿Cuál es el mecanismo de acción del fármaco?', 'mechanism'],
    ['¿Cuál es el principal factor de riesgo?', 'risk_factor'],
    ['¿Cuál es la complicación más frecuente?', 'complication_prognosis'],
    ['¿Cuál es la edad de inicio del tamizaje?', 'prevention_screening'],
    ['¿Qué indica el electrocardiograma mostrado?', 'data_interpretation'],
    ['¿Qué hora es?', null],
  ];
  it.each(cases)('%s', (prompt, task) => {
    expect(detectTask(prompt, dictionary)).toBe(task);
  });
});

describe('utilidades', () => {
  it('separa viñeta y frase cuando llegan juntas', () => {
    expect(
      splitStem('Hombre de 60 años con disnea. No refiere fiebre. ¿Cuál NO es una causa?'),
    ).toEqual({
      vignette: 'Hombre de 60 años con disnea. No refiere fiebre.',
      prompt: '¿Cuál NO es una causa?',
    });
    expect(splitStem('Paciente con dolor torácico. Señale el diagnóstico:')).toEqual({
      vignette: 'Paciente con dolor torácico.',
      prompt: 'Señale el diagnóstico:',
    });
  });

  it('la etiqueta del médico gana sobre la automática', () => {
    const auto = analyzeStructure(
      { vignette: '', prompt: '¿Cuál es el diagnóstico?', serialCase: false },
      dictionary,
    );
    expect(resolveStructure(auto, null)).toEqual({
      polarity: 'affirmative',
      task: 'diagnosis',
      format: 'direct',
      source: 'auto',
    });
    expect(
      resolveStructure(auto, { polarity: 'negative', task: 'next_step', format: 'clinical_case' }),
    ).toEqual({
      polarity: 'negative',
      task: 'next_step',
      format: 'clinical_case',
      source: 'physician',
    });
    const unknown = analyzeStructure(
      { vignette: '', prompt: '¿Qué hora es?', serialCase: false },
      dictionary,
    );
    expect(resolveStructure(unknown, null)).toBeNull();
  });

  it('probable mala lectura solo en negativas falladas rápido o con lectura reportada', () => {
    const base = {
      polarity: 'negative',
      correct: false,
      answeredFast: true,
      reportedMisread: false,
    } as const;
    expect(isProbableMisread(base)).toBe(true);
    expect(isProbableMisread({ ...base, answeredFast: false, reportedMisread: true })).toBe(true);
    expect(isProbableMisread({ ...base, answeredFast: false })).toBe(false);
    expect(isProbableMisread({ ...base, correct: true })).toBe(false);
    expect(isProbableMisread({ ...base, polarity: 'affirmative' })).toBe(false);
  });
});

describe('inglés (B13), paso 0', () => {
  it('sin el bloque english en el diccionario el inglés no resalta nada y el español no cambia', () => {
    expect(dictionary.english).toBeUndefined();
    const withoutEnglish = { ...dictionary };
    delete withoutEnglish.english;
    expect(findNegations('Which of the following is NOT a cause?', withoutEnglish, 'en')).toEqual(
      [],
    );
    expect(
      findNegations('¿Cuál de las siguientes NO es una causa?', withoutEnglish, 'es'),
    ).toHaveLength(1);
    expect(findNegations('¿Cuál de las siguientes NO es una causa?', withoutEnglish)).toHaveLength(
      1,
    );
  });

  it('con un bloque english resalta con él y deja el diccionario en español para el español', () => {
    const custom = {
      ...dictionary,
      english: {
        negations: [{ id: 'not', pattern: 'not', kind: 'negation' as const }],
        falsePositives: ['not only'],
      },
    };
    expect(findNegations('Which is NOT a cause?', custom, 'en').map((range) => range.text)).toEqual(
      ['NOT'],
    );
    expect(findNegations('Not only a cause, also a sign', custom, 'en')).toEqual([]);
    // El mismo texto leído como español no usa el bloque en inglés
    expect(findNegations('Which is NOT a cause?', custom, 'es')).toEqual([]);
  });

  it('una pregunta en inglés toma data_interpretation si nadie elige la tarea y ninguna otra cosa cambia', () => {
    const question = {
      vignette: '',
      prompt: 'What is the most likely diagnosis?',
      serialCase: false,
      language: 'en' as const,
    };
    expect(analyzeStructure(question, dictionary)).toMatchObject({
      polarity: 'affirmative',
      task: 'data_interpretation',
      format: 'direct',
    });
    // En español la tarea se detecta por la frase, con language o sin él
    const spanish = { ...question, prompt: '¿Cuál es el diagnóstico más probable?' };
    expect(analyzeStructure({ ...spanish, language: 'es' }, dictionary).task).toBe('diagnosis');
    expect(analyzeStructure({ ...spanish, language: undefined }, dictionary).task).toBe(
      'diagnosis',
    );
  });
});
