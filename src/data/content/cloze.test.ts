import { describe, expect, it } from 'vitest';
import {
  clozeHoles,
  clozeOpenings,
  maskCloze,
  parseCloze,
  renderClozeFace,
  type ClozeHoleNode,
} from './cloze';

const render = (text: string, ordinal: number, reveal: boolean) =>
  renderClozeFace(parseCloze(text).nodes, ordinal, reveal);

function firstHole(text: string): ClozeHoleNode {
  const node = parseCloze(text).nodes.find((entry) => entry.kind === 'hole');
  if (node?.kind !== 'hole') throw new Error('El texto no tiene huecos');
  return node;
}

describe('analizador de huecos', () => {
  it('arma el árbol de un hueco con su pista', () => {
    expect(parseCloze('El {{c1::DIU::método}} protege')).toEqual({
      openings: 1,
      nodes: [
        { kind: 'text', text: 'El ' },
        {
          kind: 'hole',
          ordinal: 1,
          closed: true,
          hint: 'método',
          children: [{ kind: 'text', text: 'DIU' }],
        },
        { kind: 'text', text: ' protege' },
      ],
    });
  });

  it('arma un hueco dentro de otro y conserva el orden en que aparecen', () => {
    const tree = parseCloze('{{c1::El {{c2::ventrículo izquierdo}} bombea a la aorta}}');
    expect(tree.openings).toBe(2);
    const outer = firstHole('{{c1::El {{c2::ventrículo izquierdo}} bombea a la aorta}}');
    expect(outer.ordinal).toBe(1);
    expect(outer.children.map((child) => child.kind)).toEqual(['text', 'hole', 'text']);
    expect(clozeHoles('{{c1::El {{c2::ventrículo izquierdo}} bombea a la aorta}}')).toEqual([
      { ordinal: 1, answer: 'El ventrículo izquierdo bombea a la aorta', hint: undefined },
      { ordinal: 2, answer: 'ventrículo izquierdo', hint: undefined },
    ]);
  });

  it('acepta varios niveles y huecos hermanos dentro de uno', () => {
    const text = '{{c1::A {{c2::B {{c3::C}} D}} E {{c4::F}} G}}';
    expect(clozeHoles(text).map((hole) => [hole.ordinal, hole.answer])).toEqual([
      [1, 'A B C D E F G'],
      [2, 'B C D'],
      [3, 'C'],
      [4, 'F'],
    ]);
    expect(clozeOpenings(text)).toBe(4);
  });

  it('la pista es lo que sigue al primer :: del último texto del hueco', () => {
    expect(clozeHoles('{{c1::a::b::c}}')).toEqual([{ ordinal: 1, answer: 'a', hint: 'b::c' }]);
    // Con un hueco adentro, la pista del de afuera va después de él
    expect(clozeHoles('{{c1::El {{c2::VI::cavidad}} bombea::pista}}')).toEqual([
      { ordinal: 1, answer: 'El VI bombea', hint: 'pista' },
      { ordinal: 2, answer: 'VI', hint: 'cavidad' },
    ]);
    // Una pista vacía es como no tenerla
    expect(clozeHoles('{{c1::a::}}')).toEqual([{ ordinal: 1, answer: 'a', hint: undefined }]);
    // Un :: seguido de otro hueco no es pista, es parte de la respuesta
    expect(clozeHoles('{{c1::a::b {{c2::c}}}}')).toEqual([
      { ordinal: 1, answer: 'a::b c', hint: undefined },
      { ordinal: 2, answer: 'c', hint: undefined },
    ]);
  });

  it('las llaves sueltas y lo que no es un hueco son texto normal', () => {
    for (const text of [
      'a { b } c',
      'sin {{ número }} aquí',
      '{{c::sin número}} {{c1:sin dos puntos}} {c1::una llave}',
      'cierre }} suelto y {{',
      '{{C1::mayúscula}}',
      '',
    ]) {
      expect(clozeOpenings(text)).toBe(0);
      expect(clozeHoles(text)).toEqual([]);
      expect(maskCloze(text)).toBe(text);
    }
  });

  it('un }} sin hueco abierto queda como texto y un } de más después de un hueco también', () => {
    expect(clozeHoles('a }} b {{c1::x}}} c')).toEqual([
      { ordinal: 1, answer: 'x', hint: undefined },
    ]);
    expect(maskCloze('a }} b {{c1::x}}} c')).toBe('a }} b […]} c');
  });

  it('una llave suelta dentro de un hueco no lo cierra, solo lo cierra la pareja }}', () => {
    expect(clozeHoles('{{c1::a { b } c}}')).toEqual([
      { ordinal: 1, answer: 'a { b } c', hint: undefined },
    ]);
    // Un {{ sin cN:: tampoco abre nada. Es texto y el primer }} cierra el hueco que sigue abierto
    expect(clozeHoles('{{c1::a {{ b }} c')).toEqual([
      { ordinal: 1, answer: 'a {{ b ', hint: undefined },
    ]);
  });

  it('un hueco que el texto deja sin cerrar queda marcado y cierra al final', () => {
    const text = 'La {{c1::creatinina sube';
    expect(clozeOpenings(text)).toBe(1);
    // No cuenta como hueco completo, pero está en el árbol para poder ocultarlo
    expect(clozeHoles(text)).toEqual([]);
    expect(firstHole(text)).toMatchObject({ ordinal: 1, closed: false });
    expect(clozeHoles('{{c1::A {{c2::B}} C')).toEqual([
      { ordinal: 2, answer: 'B', hint: undefined },
    ]);
    expect(clozeOpenings('{{c1::A {{c2::B}} C')).toBe(2);
  });

  it('mascara los huecos de primer nivel con todo lo que llevan adentro', () => {
    expect(maskCloze('El {{c1::A {{c2::B}} C}} y {{c3::D}} suben')).toBe('El […] y […] suben');
  });

  it('un texto con miles de huecos anidados no desborda la pila', () => {
    const depth = 3000;
    const text = `${'{{c1::'.repeat(depth)}fondo${'}}'.repeat(depth)}`;
    expect(clozeOpenings(text)).toBe(depth);
    expect(clozeHoles(text)).toHaveLength(depth);
    expect(render(text, 1, false)).toBe('<mark>[…]</mark>');
    expect(render(text, 1, true)).toBe('<mark>fondo</mark>');
    expect(render(text, 2, false)).toBe('fondo');
  });
});

describe('caras de una tarjeta cloze', () => {
  const nested = '{{c1::El {{c2::ventrículo izquierdo}} bombea a la aorta}}';

  it('al preguntar c1 se oculta el hueco entero con lo que lleva adentro', () => {
    expect(render(nested, 1, false)).toBe('<mark>[…]</mark>');
  });

  it('al preguntar c2 solo se oculta el hueco de adentro y el de afuera es texto normal', () => {
    expect(render(nested, 2, false)).toBe('El <mark>[…]</mark> bombea a la aorta');
  });

  it('al mostrar la respuesta se resaltan los huecos con ese número y los demás son texto', () => {
    expect(render(nested, 1, true)).toBe('<mark>El ventrículo izquierdo bombea a la aorta</mark>');
    expect(render(nested, 2, true)).toBe('El <mark>ventrículo izquierdo</mark> bombea a la aorta');
  });

  it('un hueco oculto se muestra con su pista y la de uno que no se pregunta no sale', () => {
    const text = 'El {{c1::VI::cavidad}} y la {{c2::aorta::vaso}}';
    expect(render(text, 1, false)).toBe('El <mark>[cavidad]</mark> y la aorta');
    expect(render(text, 2, false)).toBe('El VI y la <mark>[vaso]</mark>');
    expect(render('{{c1::A {{c2::B::pista}} C::pista externa}}', 1, false)).toBe(
      '<mark>[pista externa]</mark>',
    );
    expect(render('{{c1::A {{c2::B::pista}} C}}', 2, false)).toBe('A <mark>[pista]</mark> C');
  });

  it('un hueco con el mismo número dentro de otro se oculta con él y no se resalta dos veces', () => {
    const text = '{{c1::A {{c1::B}} C}} y {{c1::D}}';
    expect(render(text, 1, false)).toBe('<mark>[…]</mark> y <mark>[…]</mark>');
    expect(render(text, 1, true)).toBe('<mark>A B C</mark> y <mark>D</mark>');
  });

  it('un hueco de otro número que contiene uno que se pregunta deja ver su texto alrededor', () => {
    expect(render('{{c2::Antes {{c1::secreto}} después}}', 1, false)).toBe(
      'Antes <mark>[…]</mark> después',
    );
  });

  it('un número que el texto no tiene deja todo el texto normal', () => {
    expect(render(nested, 7, false)).toBe('El ventrículo izquierdo bombea a la aorta');
    expect(render(nested, 7, true)).toBe('El ventrículo izquierdo bombea a la aorta');
  });

  it('un hueco sin cerrar nunca deja la respuesta a la vista en la pregunta', () => {
    expect(render('La {{c1::creatinina sube', 1, false)).toBe('La <mark>[…]</mark>');
    expect(render('A {{c1::B {{c2::C}} D', 1, false)).toBe('A <mark>[…]</mark>');
    expect(render('A {{c1::B {{c2::C}} D', 2, false)).toBe('A B <mark>[…]</mark> D');
  });

  it('respeta las etiquetas del HTML ya saneado que rodean al hueco', () => {
    expect(render('<p>El <b>{{c1::VI}}</b> late</p>', 1, false)).toBe(
      '<p>El <b><mark>[…]</mark></b> late</p>',
    );
    expect(render('<p>{{c1::<b>VI</b> y {{c2::<i>AD</i>}}}}</p>', 2, true)).toBe(
      '<p><b>VI</b> y <mark><i>AD</i></mark></p>',
    );
  });
});
