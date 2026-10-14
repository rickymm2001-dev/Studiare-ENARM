import { describe, expect, it } from 'vitest';
import {
  buildTopicOutline,
  compareTopicNames,
  sortTopicNames,
  topicNamesAt,
  type TopicNode,
} from './deckTopics';

/** Los nombres de un nivel con sus hijos, para comparar árboles de un vistazo */
const shape = (nodes: readonly TopicNode[]): unknown =>
  nodes.map((node) => (node.children.length === 0 ? node.name : [node.name, shape(node.children)]));

describe('orden alfabético del español (comentario 8)', () => {
  it('no distingue acentos ni mayúsculas y la ñ va después de la n', () => {
    expect(
      sortTopicNames([
        'Úlcera péptica',
        'Zika',
        'Ántrax',
        'Oído medio',
        'Ñandú',
        'Nefritis',
        'Éter',
        'Esófago de Barrett',
        'anemia',
      ]),
    ).toEqual([
      'anemia',
      'Ántrax',
      'Esófago de Barrett',
      'Éter',
      'Nefritis',
      'Ñandú',
      'Oído medio',
      'Úlcera péptica',
      'Zika',
    ]);
  });

  it('compara como el colador de es-MX con sensibilidad base', () => {
    expect(compareTopicNames('Lupus', 'lupus')).toBe(0);
    expect(compareTopicNames('Patología', 'Patologia')).toBe(0);
    expect(compareTopicNames('Nene', 'Ñu')).toBeLessThan(0);
    expect(compareTopicNames('Ñu', 'Oso')).toBeLessThan(0);
  });

  it('sin repetidos, aunque cambien acentos o mayúsculas, y se queda el que lleva acentos', () => {
    expect(
      sortTopicNames([
        'Patologia puerperal',
        'Patología puerperal',
        'LUPUS',
        'Lupus',
        'lupus',
        '  ',
        'Cesárea',
      ]),
    ).toEqual(['Cesárea', 'Lupus', 'Patología puerperal']);
  });

  it('el nombre que se muestra no depende del orden de las tarjetas', () => {
    const forward = sortTopicNames(['Artritis Reumatoide', 'Artritis reumatoide']);
    const backward = sortTopicNames(['Artritis reumatoide', 'Artritis Reumatoide']);
    expect(forward).toEqual(['Artritis reumatoide']);
    expect(backward).toEqual(forward);
  });
});

describe('árbol de temas de un mazo', () => {
  it('agrupa por rama, ordena cada nivel y no repite temas', () => {
    const outline = buildTopicOutline([
      ['Medicina interna', 'Reumatología', 'Lupus eritematoso sistémico'],
      ['Medicina interna', 'Reumatología', 'Artritis reumatoide'],
      ['Medicina interna', 'Reumatología', 'Artritis reumatoide'],
      ['Medicina interna', 'Nefrología', 'Síndrome nefrótico'],
      ['Obstetricia', 'Puerperio'],
      ['Ginecología', 'Amenorreas', 'Amenorreas primarias'],
      ['Ginecología', 'Amenorreas', 'amenorreas primarias'],
    ]);
    expect(shape(outline.branches)).toEqual([
      ['Ginecología', [['Amenorreas', ['Amenorreas primarias']]]],
      [
        'Medicina interna',
        [
          ['Nefrología', ['Síndrome nefrótico']],
          ['Reumatología', ['Artritis reumatoide', 'Lupus eritematoso sistémico']],
        ],
      ],
      ['Obstetricia', ['Puerperio']],
    ]);
    expect(outline.leaves).toBe(5);
    expect(outline.cards).toBe(7);
    expect(outline.untagged).toBe(0);
  });

  it('cuenta las tarjetas de cada tema y las que no tienen tema', () => {
    const outline = buildTopicOutline([
      ['Urgencias', 'Toxíndromes', 'Síndrome colinérgico'],
      ['Urgencias', 'Toxíndromes', 'Síndrome anticolinérgico'],
      ['Urgencias', 'Quemaduras'],
      ['Urgencias'],
      [],
      ['', '  '],
    ]);
    const [branch] = outline.branches;
    expect(branch?.name).toBe('Urgencias');
    expect(branch?.cards).toBe(4);
    expect(branch?.children.map((node) => [node.name, node.cards])).toEqual([
      ['Quemaduras', 1],
      ['Toxíndromes', 2],
    ]);
    expect(outline.untagged).toBe(2);
    expect(outline.leaves).toBe(3);
  });

  it('solo muestra los primeros niveles, sin recortar los nombres', () => {
    const long = 'Granulomatosis eosinofílica con poliangitis (Churg-Strauss)';
    const outline = buildTopicOutline([['Medicina interna', 'Reumatología', long, 'Más fino']]);
    expect(shape(outline.branches)).toEqual([['Medicina interna', [['Reumatología', [long]]]]]);
    expect(shape(buildTopicOutline([['A', 'B', 'C']], 1).branches)).toEqual(['A']);
  });

  it('un mismo tema con acentos distintos queda una sola vez y con acentos', () => {
    const outline = buildTopicOutline([
      ['Obstetricia', 'Patologia puerperal'],
      ['Obstetricia', 'Patología puerperal'],
    ]);
    expect(shape(outline.branches)).toEqual([['Obstetricia', ['Patología puerperal']]]);
    expect(outline.branches[0]?.children[0]?.cards).toBe(2);
  });

  it('lista los nombres de un nivel de todo el árbol', () => {
    const outline = buildTopicOutline([
      ['Ginecología', 'Infectología', 'Bartolinitis'],
      ['Medicina interna', 'Infectología', 'Sepsis'],
      ['Medicina interna', 'Hematología'],
    ]);
    expect(topicNamesAt(outline, 0)).toEqual(['Ginecología', 'Medicina interna']);
    expect(topicNamesAt(outline, 1)).toEqual(['Hematología', 'Infectología']);
    expect(topicNamesAt(outline, 2)).toEqual(['Bartolinitis', 'Sepsis']);
  });
});
