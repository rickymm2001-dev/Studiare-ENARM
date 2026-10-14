// Buscar en todos los apuntes y el esquema de uno (B6).
import { describe, expect, it } from 'vitest';
import type { OutlineNode } from './outline';
import { countSections, outlineStructure, searchOutlines, searchTerms } from './outlineSearch';

const node = (id: string, text: string, ...children: OutlineNode[]): OutlineNode => ({
  id,
  text,
  children,
});

const outlines = [
  {
    id: 'asma',
    title: 'Asma bronquial',
    nodes: [
      node('a1', 'Definición :: Obstrucción reversible de la vía aérea'),
      node(
        'a2',
        'Tratamiento #Neumología',
        node('a3', 'Primera línea >> Salbutamol'),
        node('a4', 'Crisis grave >> Salbutamol con ipratropio'),
        node('a5', 'Salbutamol en nebulización'),
        node('a6', 'Salbutamol inhalado'),
      ),
    ],
  },
  {
    id: 'sodio',
    title: 'Sodio',
    nodes: [node('s1', 'El {{sodio}} es el catión principal del LEC')],
  },
  { id: 'vacio', title: 'Cardiología', nodes: [node('v1', '')] },
];

describe('searchOutlines', () => {
  it('sin palabras no hay resultados', () => {
    expect(searchTerms('   ')).toEqual([]);
    expect(searchOutlines(outlines, '  ')).toEqual([]);
  });

  it('encuentra líneas sin importar mayúsculas ni acentos, con su ruta y en orden', () => {
    const [hit, ...rest] = searchOutlines(outlines, 'CATION');
    expect(rest).toEqual([]);
    expect(hit).toEqual({
      outlineId: 'sodio',
      titleMatch: false,
      lines: [{ nodeId: 's1', text: 'El {{sodio}} es el catión principal del LEC', path: [] }],
      lineCount: 1,
    });
    const [asma] = searchOutlines(outlines, 'via aerea');
    expect(asma?.lines.map((line) => line.nodeId)).toEqual(['a1']);
  });

  it('todas las palabras tienen que estar en la misma línea, en cualquier orden', () => {
    const [hit] = searchOutlines(outlines, 'ipratropio salbutamol');
    expect(hit?.lines.map((line) => line.nodeId)).toEqual(['a4']);
    // La línea se muestra sin la etiqueta y con la sección de la que cuelga
    expect(hit?.lines[0]?.path).toEqual(['Tratamiento']);
  });

  it('las etiquetas también se buscan', () => {
    const [hit] = searchOutlines(outlines, 'neumologia');
    expect(hit?.lines.map((line) => line.nodeId)).toEqual(['a2']);
  });

  it('muestra hasta tres líneas por apunte y dice cuántas son en total', () => {
    const [hit] = searchOutlines(outlines, 'salbutamol');
    expect(hit?.lines.map((line) => line.nodeId)).toEqual(['a3', 'a4', 'a5']);
    expect(hit?.lineCount).toBe(4);
  });

  it('un título que coincide basta, aunque ninguna línea coincida', () => {
    expect(searchOutlines(outlines, 'cardiologia')).toEqual([
      { outlineId: 'vacio', titleMatch: true, lines: [], lineCount: 0 },
    ]);
    expect(searchOutlines(outlines, 'bronquial')[0]).toMatchObject({
      outlineId: 'asma',
      titleMatch: true,
      lineCount: 0,
    });
  });
});

describe('outlineStructure', () => {
  it('las secciones son las líneas con líneas debajo, con la pregunta si son tarjeta', () => {
    const nodes = [
      node('1', 'Fisiopatología', node('1a', 'Inflamación crónica')),
      node('2', 'Causas de pancreatitis >>>', node('2a', 'Litiasis')),
      node('3', 'Asma :: Obstrucción', node('3a', 'Hija')),
      node('4', 'Línea suelta'),
      node('5', '', node('5a', 'Sección sin título arriba', node('5b', 'Detalle'))),
    ];
    expect(outlineStructure(nodes)).toEqual([
      { nodeId: '1', text: 'Fisiopatología', children: [] },
      { nodeId: '2', text: 'Causas de pancreatitis', children: [] },
      { nodeId: '3', text: 'Asma', children: [] },
      // Una línea en blanco con líneas debajo no se lista, pero las de abajo sí
      { nodeId: '5a', text: 'Sección sin título arriba', children: [] },
    ]);
  });

  it('llega hasta tres niveles y cuenta todas las secciones', () => {
    const deep = [
      node(
        '1',
        'Uno',
        node('2', 'Dos', node('3', 'Tres', node('4', 'Cuatro', node('5', 'Cinco')))),
      ),
    ];
    const structure = outlineStructure(deep);
    expect(structure[0]?.children[0]?.children[0]).toEqual({
      nodeId: '3',
      text: 'Tres',
      children: [],
    });
    expect(countSections(structure)).toBe(3);
    expect(countSections(outlineStructure(deep, 5))).toBe(4);
  });
});
