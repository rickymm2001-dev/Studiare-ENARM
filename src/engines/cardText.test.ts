import { describe, expect, it } from 'vitest';
import {
  clozeFlatten,
  clozeRender,
  countWords,
  decodeEntities,
  htmlToBlocks,
  htmlToPlain,
  parseCloze,
} from './cardText';

describe('decodeEntities', () => {
  it('decodifica las entidades con nombre y las numéricas', () => {
    expect(decodeEntities('a &amp; b &lt;c&gt; &quot;d&quot; &#39;e&#39; &#xE1; &aacute;')).toBe(
      'a & b <c> "d" \'e\' á á',
    );
    expect(decodeEntities('&iquest;Qu&eacute;&nbsp;es?')).toBe('¿Qué es?');
  });

  it('no decodifica dos veces y deja un espacio en lo desconocido o inválido', () => {
    expect(decodeEntities('&amp;lt;')).toBe('&lt;');
    expect(decodeEntities('x&foo;y')).toBe('x y');
    expect(decodeEntities('x&#0;y&#1114112;z&#xD800;w')).toBe('x y z w');
  });

  it('un & sin punto y coma queda tal cual', () => {
    expect(decodeEntities('R&D y AT&T')).toBe('R&D y AT&T');
  });
});

describe('htmlToBlocks', () => {
  it('quita etiquetas en línea sin partir palabras', () => {
    expect(htmlToPlain('H<sub>2</sub>O y <b>Meta</b>formina')).toBe('H2O y Metaformina');
  });

  it('separa bloques con p, br, div y celdas', () => {
    const blocks = htmlToBlocks('<p>Uno</p><p>Dos<br>Tres</p><div>Cuatro</div>');
    expect(blocks.map((block) => block.text)).toEqual(['Uno', 'Dos', 'Tres', 'Cuatro']);
    expect(htmlToBlocks('<table><tr><td>A</td><td>B</td></tr></table>')).toHaveLength(2);
  });

  it('marca el primer bloque de cada li como elemento de lista', () => {
    const blocks = htmlToBlocks('<ul><li>Uno</li><li></li><li>Dos<p>sigue</p></li></ul>Fin');
    expect(blocks).toEqual([
      { text: 'Uno', listItem: true },
      { text: 'Dos', listItem: true },
      { text: 'sigue', listItem: false },
      { text: 'Fin', listItem: false },
    ]);
  });

  it('en texto plano el salto de línea separa y en HTML es un espacio', () => {
    expect(htmlToBlocks('Uno\r\nDos\n\nTres\rCuatro').map((block) => block.text)).toEqual([
      'Uno',
      'Dos',
      'Tres',
      'Cuatro',
    ]);
    expect(htmlToBlocks('<p>Uno\ny dos</p>').map((block) => block.text)).toEqual(['Uno y dos']);
  });

  it('decodifica entidades después de quitar etiquetas, así el texto escapado sigue siendo texto', () => {
    expect(htmlToPlain('&lt;b&gt;negrita&lt;/b&gt;')).toBe('<b>negrita</b>');
    expect(htmlToPlain('<p>Dos&nbsp;palabras &amp; m&aacute;s</p>')).toBe('Dos palabras & más');
  });

  it('una desigualdad no es una etiqueta', () => {
    expect(htmlToPlain('PaO2 < 60 mmHg y pH<7.35, K>5')).toBe('PaO2 < 60 mmHg y pH<7.35, K>5');
  });

  it('quita comentarios, scripts y estilos', () => {
    expect(htmlToPlain('a<!-- oculto -->b<script>alert(1)</script><style>p{}</style>c')).toBe(
      'ab c',
    );
  });

  it('las imágenes no cuentan como texto salvo que se pida su archivo', () => {
    const html = 'Mira <img src="corazon.png" alt="x"> esto <img src=\'a.jpg\'> y <img src=b.gif>';
    expect(htmlToPlain(html)).toBe('Mira esto y');
    expect(htmlToPlain(html, { keepImageNames: true })).toBe('Mira corazon.png esto a.jpg y b.gif');
    expect(htmlToPlain('<img alt="sin src">', { keepImageNames: true })).toBe('');
  });

  it('un texto vacío o solo de etiquetas no da bloques', () => {
    expect(htmlToBlocks('')).toEqual([]);
    expect(htmlToBlocks('<p> </p><br>')).toEqual([]);
  });
});

describe('countWords', () => {
  it('cuenta palabras y cifras, no signos sueltos', () => {
    expect(countWords('')).toBe(0);
    expect(countWords('  ')).toBe(0);
    expect(countWords('Dosis de 0.5 mg → cada 8 h - ya')).toBe(8);
  });
});

describe('parseCloze', () => {
  it('lee un hueco con y sin pista', () => {
    const { holes } = parseCloze('La {{c1::metformina::fármaco}} baja la {{c2::glucosa}}');
    expect(holes).toEqual([
      { kind: 'hole', ordinal: 1, content: ['metformina'], hint: 'fármaco' },
      { kind: 'hole', ordinal: 2, content: ['glucosa'], hint: null },
    ]);
  });

  it('lee huecos anidados en el orden en que se abren', () => {
    const { parts, holes } = parseCloze('{{c1::A {{c2::B::hb}} C::ha}} fin');
    expect(holes.map((hole) => [hole.ordinal, hole.hint])).toEqual([
      [1, 'ha'],
      [2, 'hb'],
    ]);
    expect(clozeFlatten(parts)).toBe('A B C fin');
    expect(clozeFlatten(holes[0]?.content ?? [])).toBe('A B C');
  });

  it('los cierres seguidos cierran del más interno al más externo', () => {
    const { holes, parts } = parseCloze('{{c1::a {{c2::b}}}} x');
    expect(holes.map((hole) => clozeFlatten(hole.content))).toEqual(['a b', 'b']);
    expect(clozeFlatten(parts)).toBe('a b x');
  });

  it('la primera :: de un hueco es la de su pista y las demás son parte de la pista', () => {
    const { holes } = parseCloze('{{c1::a::b::c}} {{c2::x::}} {{c3::y:: }}');
    expect(holes.map((hole) => hole.hint)).toEqual(['b::c', null, null]);
  });

  it('una pista puede venir después de un hueco anidado', () => {
    const { holes } = parseCloze('{{c1::{{c2::B}}::pista}}');
    expect(holes[0]?.hint).toBe('pista');
    expect(holes[0]?.content.map((part) => (typeof part === 'string' ? part : 'hueco'))).toEqual([
      'hueco',
      '',
    ]);
    const nestedHint = parseCloze('{{c1::A::uno {{c2::dos}} tres}}');
    expect(nestedHint.holes[0]?.hint).toBe('uno dos tres');
  });

  it('un hueco sin cierre es texto y conserva lo que tiene adentro', () => {
    const open = parseCloze('Hola {{c1::mundo {{c2::cierra}} sin fin');
    expect(open.holes.map((hole) => hole.ordinal)).toEqual([2]);
    expect(clozeFlatten(open.parts)).toBe('Hola {{c1::mundo cierra sin fin');
    const twice = parseCloze('{{c1::a {{c2::b {{c3::c}}');
    expect(twice.holes.map((hole) => hole.ordinal)).toEqual([3]);
    expect(clozeFlatten(twice.parts)).toBe('{{c1::a {{c2::b c');
  });

  it('un }} suelto, una llave sola o un {{ sin número son texto', () => {
    const plain = '}} { {{x}} {{c::y}} {{cx::z}} ::';
    const parsed = parseCloze(plain);
    expect(parsed.holes).toEqual([]);
    expect(clozeFlatten(parsed.parts)).toBe(plain);
    expect(parseCloze('')).toEqual({ parts: [], holes: [] });
  });

  it('un hueco puede traer HTML y atravesar etiquetas', () => {
    const { holes } = parseCloze('<p>Es {{c1::<b>dos</b> cosas}}</p>');
    expect(clozeFlatten(holes[0]?.content ?? [])).toBe('<b>dos</b> cosas');
  });
});

describe('clozeRender', () => {
  const text = 'La {{c1::metformina::fármaco}} y la {{c2::insulina}} bajan {{c1::la glucosa}}';
  const { parts } = parseCloze(text);

  it('tapa todos los huecos con el número preguntado y muestra los demás', () => {
    expect(htmlToPlain(clozeRender(parts, 1, { hints: false }))).toBe(
      'La […] y la insulina bajan […]',
    );
    expect(htmlToPlain(clozeRender(parts, 2, { hints: false }))).toBe(
      'La metformina y la […] bajan la glucosa',
    );
  });

  it('la pista aparece solo si se pide', () => {
    expect(htmlToPlain(clozeRender(parts, 1, { hints: true }))).toBe(
      'La […fármaco] y la insulina bajan […]',
    );
  });

  it('un hueco anidado queda tapado junto con el que lo contiene', () => {
    const nested = parseCloze('{{c1::A {{c2::B}} C}} fin').parts;
    expect(htmlToPlain(clozeRender(nested, 1, { hints: false }))).toBe('[…] fin');
    expect(htmlToPlain(clozeRender(nested, 2, { hints: false }))).toBe('A […] C fin');
    expect(htmlToPlain(clozeRender(nested, 9, { hints: false }))).toBe('A B C fin');
  });
});
