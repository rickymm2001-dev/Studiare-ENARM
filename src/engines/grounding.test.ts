import { describe, expect, it } from 'vitest';
import {
  containsQuote,
  drugsIn,
  groundedRatio,
  normalizeForMatch,
  numbersIn,
  quoteIssues,
  unsupportedFacts,
  wordsOf,
} from './grounding';

describe('texto comparable', () => {
  it('quita acentos, mayúsculas, comillas y espacios de más', () => {
    expect(normalizeForMatch('  La  “Metformina” es   ÚTIL ')).toBe('la "metformina" es util');
  });

  it('une una palabra partida por un guion al final del renglón', () => {
    expect(normalizeForMatch('hipertensión arte-\nrial')).toBe('hipertension arterial');
  });

  it('cuenta solo palabras de dos letras o más', () => {
    expect(wordsOf('A la 5 vez, el pH es 7')).toEqual(['la', 'vez', 'el', 'ph', 'es']);
  });

  it('encuentra una cita sin importar formato y rechaza la vacía', () => {
    expect(
      containsQuote('El Tratamiento   inicial es METFORMINA.', 'tratamiento inicial es metformina'),
    ).toBe(true);
    expect(containsQuote('texto', '   ')).toBe(false);
    expect(containsQuote('texto corto', 'otra cosa')).toBe(false);
  });
});

describe('cifras y fármacos', () => {
  it('lee cifras con coma decimal como punto y no toma la parte de una palabra', () => {
    expect(numbersIn('Dosis de 0,5 mg y 1.5 g; vitamina B12 en 2 tomas')).toEqual([
      '0.5',
      '1.5',
      '2',
    ]);
  });

  it('ignora el número de un hueco cloze', () => {
    expect(numbersIn('{{c1::metformina}} 500 mg')).toEqual(['500']);
  });

  it('encuentra fármacos del léxico y por terminación, sin repetir', () => {
    expect(drugsIn('Metformina y metformina; losartan; hormona y colesterol no')).toEqual([
      'metformina',
      'losartan',
    ]);
    expect(drugsIn('Se indica atorvastatina y empagliflozina')).toEqual([
      'atorvastatina',
      'empagliflozina',
    ]);
  });
});

describe('revisiones de anclaje', () => {
  const source = 'La metformina es el tratamiento inicial de elección en la diabetes tipo 2.';

  it('pide una cita larga y que exista tal cual', () => {
    expect(quoteIssues('la metformina', source)).toEqual(['quote_too_short']);
    expect(quoteIssues('la metformina es el tratamiento inicial de elección', source)).toEqual([]);
    expect(quoteIssues('la insulina es el tratamiento inicial de elección', source)).toEqual([
      'quote_not_in_source',
    ]);
  });

  it('señala cifras y fármacos que el apoyo no trae', () => {
    expect(
      unsupportedFacts('Dosis de 850 mg de metformina y insulina', 'Dosis de 850 mg de metformina'),
    ).toEqual({
      numbers: [],
      drugs: ['insulina'],
    });
    expect(unsupportedFacts('Son 12 horas', 'Son 10 horas').numbers).toEqual(['12']);
  });

  it('mide cuánto de la respuesta está en el apoyo', () => {
    expect(groundedRatio('metformina inicial', 'la metformina es el tratamiento inicial')).toBe(1);
    expect(groundedRatio('insulina glargina', 'la metformina es el tratamiento inicial')).toBe(0);
    // Sin palabras evaluables no hay nada que contradecir
    expect(groundedRatio('si no', 'cualquier cosa')).toBe(1);
  });
});
