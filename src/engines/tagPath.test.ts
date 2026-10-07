import { describe, expect, it } from 'vitest';
import {
  TAG_MAX_LENGTH,
  buildTagTree,
  countByPath,
  normalizeTags,
  sanitizeTag,
  tagAncestors,
  tagSegments,
  tagUnder,
} from './tagPath';

describe('sanitizeTag', () => {
  it('cambia los espacios por guion bajo y conserva los niveles', () => {
    expect(sanitizeTag('Medicina Interna::Hipertensión Portal')).toBe(
      'Medicina_Interna::Hipertensión_Portal',
    );
    expect(sanitizeTag('  Mieloma   Múltiple ')).toBe('Mieloma_Múltiple');
  });

  it('trata igual los espacios que no se rompen y los saltos de línea', () => {
    expect(sanitizeTag('Absceso Piógeno\nAmebiano')).toBe('Absceso_Piógeno_Amebiano');
  });

  it('quita niveles vacíos y guiones bajos de las orillas de cada nivel', () => {
    expect(sanitizeTag('::A::::B::')).toBe('A::B');
    expect(sanitizeTag('_A_::_B_')).toBe('A::B');
    expect(sanitizeTag('A:: ::B')).toBe('A::B');
  });

  it('quita caracteres invisibles', () => {
    expect(sanitizeTag('Ab​c\u0000')).toBe('Abc');
  });

  it('deja intactos los guiones, los acentos y las mayúsculas', () => {
    expect(sanitizeTag('Medicina-Interna::Infectología::Sepsis')).toBe(
      'Medicina-Interna::Infectología::Sepsis',
    );
  });

  it('devuelve vacío si no queda nada', () => {
    expect(sanitizeTag('   ')).toBe('');
    expect(sanitizeTag('::')).toBe('');
  });

  it('no pasa del largo máximo ni termina en separador', () => {
    const long = `${'a'.repeat(TAG_MAX_LENGTH - 1)}::b`;
    const result = sanitizeTag(long);
    expect(result.length).toBeLessThanOrEqual(TAG_MAX_LENGTH);
    expect(result.endsWith('::')).toBe(false);
    expect(result.endsWith(':')).toBe(false);
  });

  it('es idempotente', () => {
    const once = sanitizeTag('Hipertensión Portal :: Ascitis refractaria');
    expect(sanitizeTag(once)).toBe(once);
  });
});

describe('normalizeTags', () => {
  it('limpia, quita repetidas sin distinguir mayúsculas y vacías, y conserva el orden', () => {
    expect(normalizeTags(['Sepsis', 'sepsis', ' ', 'Shock séptico', 'Sepsis'])).toEqual([
      'Sepsis',
      'Shock_séptico',
    ]);
  });

  it('deja como máximo 50', () => {
    const many = Array.from({ length: 80 }, (_, index) => `t${index}`);
    expect(normalizeTags(many)).toHaveLength(50);
  });
});

describe('rutas', () => {
  it('separa los niveles y da los ancestros', () => {
    expect(tagSegments('A::B::C')).toEqual(['A', 'B', 'C']);
    expect(tagAncestors('A::B::C')).toEqual(['A', 'A::B']);
    expect(tagAncestors('A')).toEqual([]);
  });

  it('una etiqueta cuelga de su ruta y de sí misma, sin confundir prefijos de texto', () => {
    expect(tagUnder('Medicina::Interna', 'Medicina')).toBe(true);
    expect(tagUnder('Medicina', 'Medicina')).toBe(true);
    expect(tagUnder('MedicinaInterna', 'Medicina')).toBe(false);
    expect(tagUnder('medicina::interna', 'MEDICINA')).toBe(true);
  });

  it('cuenta las notas por ruta una sola vez aunque tengan varias etiquetas bajo ella', () => {
    const counts = countByPath([['A::B::C', 'A::B::D'], ['A::B'], ['X']]);
    expect(counts.get('A')).toBe(2);
    expect(counts.get('A::B')).toBe(2);
    expect(counts.get('A::B::C')).toBe(1);
    expect(counts.get('X')).toBe(1);
  });

  it('arma el árbol ordenado por nombre con sus conteos', () => {
    const tree = buildTagTree(countByPath([['Z::b'], ['Z::a'], ['A']]));
    expect(tree.map((node) => node.name)).toEqual(['A', 'Z']);
    expect(tree[1]?.children.map((node) => node.name)).toEqual(['a', 'b']);
    expect(tree[1]?.count).toBe(2);
  });
});
