// Volver tarjeta una línea sin saberse las marcas (B6). Lo que escribe cada tipo, dónde parte la
// línea, que las etiquetas nunca queden dentro de un hueco y que el resultado sea la tarjeta pedida
// según el mismo motor que lee las marcas a mano.
import { describe, expect, it } from 'vitest';
import { parseLine, planCards } from './outline';
import { convertLine, lineKindOf, unwrapHoles, type LineCardKind } from './outlineLine';

const caret = (at: number) => ({ selection: { start: at, end: at } });
const selected = (text: string, part: string) => {
  const start = text.indexOf(part);
  return { selection: { start, end: start + part.length } };
};

describe('lineKindOf, qué tarjeta da la línea hoy', () => {
  it('lee cada marca, también la que todavía no tiene su respuesta', () => {
    expect(lineKindOf('Pregunta >> Respuesta')).toBe('forward');
    expect(lineKindOf('Término ;; Descriptor')).toBe('forward');
    expect(lineKindOf('Pregunta >> ')).toBe('forward');
    expect(lineKindOf('Respuesta << Pregunta')).toBe('backward');
    expect(lineKindOf('Concepto :: Definición')).toBe('both');
    expect(lineKindOf('A <> B')).toBe('both');
    expect(lineKindOf('Causas >>>')).toBe('multiline');
    expect(lineKindOf('El {{sodio}} es el catión')).toBe('cloze');
    expect(lineKindOf('{{}}')).toBe('cloze');
    expect(lineKindOf('Solo una nota #Cardio::Arritmias [[Otro]]')).toBe('none');
  });
});

describe('convertLine en una línea sin marca', () => {
  it('pregunta y respuesta parte en los dos puntos y quita el signo', () => {
    expect(convertLine('Tratamiento: salbutamol', 'forward')).toEqual({
      text: 'Tratamiento >> salbutamol',
      cursor: 'Tratamiento >> salbutamol'.length,
    });
    expect(convertLine('IMC = peso entre talla', 'both').text).toBe('IMC :: peso entre talla');
  });

  it('el signo de interrogación se queda con la pregunta', () => {
    expect(convertLine('¿Tratamiento del asma? Salbutamol', 'forward').text).toBe(
      '¿Tratamiento del asma? >> Salbutamol',
    );
  });

  it('lo marcado es la respuesta, o la pregunta si se marcó desde el inicio', () => {
    const text = 'Tratamiento de primera línea salbutamol';
    expect(convertLine(text, 'forward', selected(text, 'salbutamol')).text).toBe(
      'Tratamiento de primera línea >> salbutamol',
    );
    expect(convertLine(text, 'forward', selected(text, 'Tratamiento de primera línea')).text).toBe(
      'Tratamiento de primera línea >> salbutamol',
    );
  });

  it('con el cursor a media línea parte al inicio de su palabra, nunca en medio', () => {
    const text = 'Tratamiento de primera línea salbutamol';
    const inside = text.indexOf('butamol');
    expect(convertLine(text, 'forward', caret(inside)).text).toBe(
      'Tratamiento de primera línea >> salbutamol',
    );
  });

  it('los dos puntos mandan sobre el cursor, para no partir donde se corrigió una letra', () => {
    const text = 'Tratamiento: salbutamol';
    expect(convertLine(text, 'forward', caret(text.indexOf('butamol'))).text).toBe(
      'Tratamiento >> salbutamol',
    );
  });

  it('sin dónde partir pone la marca al final y deja el cursor listo para la respuesta', () => {
    const result = convertLine('Tratamiento del asma', 'forward', caret(20));
    expect(result).toEqual({ text: 'Tratamiento del asma >> ', cursor: 24 });
    // Mientras falta la respuesta todavía no hay tarjeta, y al escribirla sí
    expect(parseLine(result.text).mark.type).toBe('none');
    expect(parseLine(`${result.text}Salbutamol`).mark).toMatchObject({
      type: 'forward',
      left: 'Tratamiento del asma',
      right: 'Salbutamol',
    });
  });

  it('los dos puntos de una etiqueta, un enlace o un hueco no parten la línea', () => {
    expect(convertLine('Ver [[Asma: tratamiento]] hoy', 'forward').text).toBe(
      'Ver [[Asma: tratamiento]] hoy >> ',
    );
    expect(convertLine('Arritmias #Cardio::Ritmo', 'both').text).toBe(
      'Arritmias #Cardio::Ritmo :: ',
    );
  });

  it('el hueco tapa lo marcado o la palabra del cursor, sin su puntuación', () => {
    const text = 'El sodio es el catión principal del LEC.';
    expect(convertLine(text, 'cloze', selected(text, 'catión principal')).text).toBe(
      'El sodio es el {{catión principal}} del LEC.',
    );
    expect(convertLine(text, 'cloze', caret(text.indexOf('odio'))).text).toBe(
      'El {{sodio}} es el catión principal del LEC.',
    );
    // Con el cursor al final tapa la última palabra, sin el punto
    expect(convertLine(text, 'cloze').text).toBe('El sodio es el catión principal del {{LEC}}.');
  });

  it('nunca abre un hueco sobre una etiqueta o un enlace. Ahí deja uno vacío para escribirlo', () => {
    const text = 'Arritmias #Cardio';
    const result = convertLine(text, 'cloze', caret(text.length));
    expect(result.text).toBe('Arritmias #Cardio {{}}');
    expect(result.cursor).toBe(result.text.length - 2);
  });

  it('respuesta abajo pone >>> y, sin líneas debajo, crea una en blanco con el cursor', () => {
    expect(convertLine('Causas de pancreatitis', 'multiline')).toEqual({
      text: 'Causas de pancreatitis >>>',
      cursor: 'Causas de pancreatitis >>>'.length,
      child: { text: '', cursor: 0 },
    });
    expect(convertLine('Causas', 'multiline', { hasChildren: true })).toEqual({
      text: 'Causas >>>',
      cursor: 10,
    });
  });

  it('quitar la tarjeta de una línea sin marca no cambia nada', () => {
    expect(convertLine('Solo una nota', 'none').text).toBe('Solo una nota');
  });
});

describe('convertLine en una línea que ya es tarjeta', () => {
  it('cambia la marca y conserva pregunta, respuesta, etiquetas y enlaces', () => {
    expect(convertLine('Asma >> Obstrucción #Neumo', 'both').text).toBe(
      'Asma :: Obstrucción #Neumo',
    );
    expect(convertLine('Asma :: Obstrucción', 'forward').text).toBe('Asma >> Obstrucción');
    // Al revés se escribe al derecho, con la misma pregunta y la misma respuesta
    expect(convertLine('Broncodilatador << Salbutamol', 'forward').text).toBe(
      'Salbutamol >> Broncodilatador',
    );
  });

  it('ya del tipo pedido no cambia', () => {
    for (const [text, kind] of [
      ['A >> B', 'forward'],
      ['A ;; B', 'forward'],
      ['A <> B', 'both'],
      ['Causas >>>', 'multiline'],
    ] as const) {
      expect(convertLine(text, kind).text).toBe(text);
    }
  });

  it('a hueco, la respuesta queda tapada y las etiquetas van al final', () => {
    expect(convertLine('Asma #Neumo :: Obstrucción reversible', 'cloze').text).toBe(
      'Asma {{Obstrucción reversible}} #Neumo',
    );
    expect(convertLine('Pregunta >> ', 'cloze')).toEqual({ text: 'Pregunta {{}}', cursor: 11 });
  });

  it('a respuesta abajo, la respuesta pasa a la primera línea de abajo', () => {
    expect(convertLine('Causas >> Litiasis', 'multiline', { hasChildren: true })).toEqual({
      text: 'Causas >>>',
      cursor: 10,
      child: { text: 'Litiasis', cursor: 8 },
    });
  });

  it('una línea con huecos se puede volver pregunta y respuesta, con los huecos abiertos', () => {
    expect(convertLine('Tratamiento: {{salbutamol}}', 'forward').text).toBe(
      'Tratamiento >> salbutamol',
    );
    expect(convertLine('Causas de pancreatitis >>>', 'cloze').text).toBe(
      'Causas de {{pancreatitis}}',
    );
  });

  it('otro hueco en una línea con huecos tapa la palabra del cursor, nunca dentro de otro', () => {
    const text = 'El {{sodio}} es el catión principal';
    expect(convertLine(text, 'cloze', caret(text.indexOf('catión') + 2)).text).toBe(
      'El {{sodio}} es el {{catión}} principal',
    );
    expect(convertLine(text, 'cloze', caret(text.indexOf('odio'))).text).toBe(text);
  });

  it('quitar la tarjeta deja Pregunta: Respuesta, que vuelve a partirse en el mismo lugar', () => {
    const plain = convertLine('Asma :: Obstrucción reversible', 'none').text;
    expect(plain).toBe('Asma: Obstrucción reversible');
    expect(convertLine(plain, 'both').text).toBe('Asma :: Obstrucción reversible');
    // Con un signo de interrogación no se agregan los dos puntos
    const question = convertLine('¿Tratamiento? >> Salbutamol', 'none').text;
    expect(question).toBe('¿Tratamiento? Salbutamol');
    expect(convertLine(question, 'forward').text).toBe('¿Tratamiento? >> Salbutamol');
    expect(convertLine('El {{c1::sodio::ion}} es clave', 'none').text).toBe('El sodio es clave');
    expect(convertLine('Causas >>>', 'none').text).toBe('Causas');
  });
});

describe('lo que escribe el botón es la tarjeta que pidió el alumno', () => {
  const expected: Record<LineCardKind, string> = {
    forward: 'basic',
    both: 'basic_reverse',
    cloze: 'cloze',
    multiline: 'basic',
  };
  for (const kind of Object.keys(expected) as LineCardKind[]) {
    it(`${kind} da una nota ${expected[kind]} en el plan del apunte`, () => {
      const result = convertLine('Tratamiento del asma: salbutamol inhalado', kind);
      const children = result.child
        ? [{ id: 'hija', text: result.child.text || 'Dosis', children: [] }]
        : [];
      const { plans } = planCards([{ id: 'linea', text: result.text, children }]);
      expect(plans[0]?.draft.kind).toBe(expected[kind]);
    });
  }
});

describe('unwrapHoles', () => {
  it('abre huecos con y sin número, con pista y uno dentro de otro', () => {
    expect(unwrapHoles('{{a}} y {{c2::b::pista}}')).toBe('a y b');
    expect(unwrapHoles('{{c1::El {{c2::ventrículo}} bombea}}')).toBe('El ventrículo bombea');
    expect(unwrapHoles('sin huecos')).toBe('sin huecos');
  });
});
