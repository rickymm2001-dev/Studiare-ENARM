import { describe, expect, it } from 'vitest';
import { OUTLINE_LIMITS, type OutlineNode } from '../../engines/outline';
import { newId } from '../testing/fixtures';
import { NoteSchema } from './decks';
import { OutlineNodeSchema, OutlineSchema } from './outlines';

const STAMP = '2026-10-08T12:00:00.000Z';

const line = (text: string, children: OutlineNode[] = []): OutlineNode => ({
  id: newId(),
  text,
  children,
});

const outline = (overrides: Record<string, unknown> = {}) => ({
  id: newId(),
  ownerId: newId(),
  title: 'Cardiología',
  deckId: newId(),
  nodes: [line('Tema', [line('Pregunta >> Respuesta')])],
  createdAt: STAMP,
  ...overrides,
});

/** Una cadena de líneas con tantos niveles como se pide */
function chain(levels: number): OutlineNode {
  let node = line('hoja');
  for (let level = 1; level < levels; level += 1) node = line('rama', [node]);
  return node;
}

describe('OutlineSchema', () => {
  it('acepta un apunte con árbol, uno vacío y los campos de sincronización opcionales', () => {
    expect(OutlineSchema.parse(outline()).nodes).toHaveLength(1);
    expect(OutlineSchema.parse(outline({ nodes: [] })).nodes).toEqual([]);
    expect(OutlineSchema.parse(outline({ updatedAt: STAMP, deletedAt: null }))).toMatchObject({
      updatedAt: STAMP,
      deletedAt: null,
    });
    expect(OutlineSchema.parse(outline({ deletedAt: STAMP })).deletedAt).toBe(STAMP);
    // Una línea en blanco es válida, es la que deja el editor al empezar
    expect(OutlineSchema.parse(outline({ nodes: [line('')] })).nodes[0]?.text).toBe('');
  });

  it('recorta el título y pide de 1 a 120 caracteres', () => {
    expect(OutlineSchema.parse(outline({ title: '  Nefrología  ' })).title).toBe('Nefrología');
    expect(OutlineSchema.parse(outline({ title: 'x'.repeat(120) })).title).toHaveLength(120);
    expect(() => OutlineSchema.parse(outline({ title: '' }))).toThrow();
    expect(() => OutlineSchema.parse(outline({ title: '   ' }))).toThrow();
    expect(() => OutlineSchema.parse(outline({ title: 'x'.repeat(121) }))).toThrow();
  });

  it('pide todos sus campos y no acepta de más', () => {
    for (const key of ['id', 'ownerId', 'title', 'deckId', 'nodes', 'createdAt']) {
      expect(() => OutlineSchema.parse({ ...outline(), [key]: undefined }), key).toThrow();
    }
    expect(() => OutlineSchema.parse({ ...outline(), extra: 1 })).toThrow();
    expect(() => OutlineSchema.parse(outline({ id: 'no-es-ulid' }))).toThrow();
    expect(() => OutlineSchema.parse(outline({ deckId: 'no-es-ulid' }))).toThrow();
    expect(() => OutlineSchema.parse(outline({ createdAt: '2026-10-08' }))).toThrow();
    expect(() => OutlineSchema.parse(outline({ deletedAt: 'ayer' }))).toThrow();
  });

  it('cada línea lleva ID, texto de hasta 3,000 caracteres y sus hijas, y no acepta campos de más', () => {
    const max = OUTLINE_LIMITS.maxFieldLength;
    expect(OutlineNodeSchema.parse(line('x'.repeat(max))).text).toHaveLength(max);
    expect(() => OutlineNodeSchema.parse(line('x'.repeat(max + 1)))).toThrow('3,000 caracteres');
    expect(() => OutlineNodeSchema.parse({ id: newId(), text: 'x' })).toThrow();
    expect(() => OutlineNodeSchema.parse({ id: 'uno', text: 'x', children: [] })).toThrow();
    expect(() => OutlineNodeSchema.parse({ ...line('x'), marca: true })).toThrow();
    // También las líneas hijas se validan
    expect(() =>
      OutlineSchema.parse(outline({ nodes: [line('a', [line('x'.repeat(max + 1))])] })),
    ).toThrow('3,000 caracteres');
  });

  it('acepta justo 2,000 líneas y 8 niveles, y rechaza una más', () => {
    const flat = (count: number) => Array.from({ length: count }, () => line('x'));
    expect(
      OutlineSchema.parse(outline({ nodes: flat(OUTLINE_LIMITS.maxNodes) })).nodes,
    ).toHaveLength(OUTLINE_LIMITS.maxNodes);
    expect(() =>
      OutlineSchema.parse(outline({ nodes: flat(OUTLINE_LIMITS.maxNodes + 1) })),
    ).toThrow('2,000 líneas');
    // Las líneas hijas también cuentan
    expect(() =>
      OutlineSchema.parse(outline({ nodes: [line('padre', flat(OUTLINE_LIMITS.maxNodes))] })),
    ).toThrow('2,000 líneas');
    expect(OutlineSchema.parse(outline({ nodes: [chain(OUTLINE_LIMITS.maxDepth)] }))).toBeDefined();
    expect(() =>
      OutlineSchema.parse(outline({ nodes: [chain(OUTLINE_LIMITS.maxDepth + 1)] })),
    ).toThrow('8 niveles');
  });

  it('dos líneas con el mismo ID no pasan, estén donde estén', () => {
    const first = line('uno');
    expect(() =>
      OutlineSchema.parse(outline({ nodes: [first, { ...line('dos'), id: first.id }] })),
    ).toThrow('mismo ID');
    expect(() =>
      OutlineSchema.parse(
        outline({
          nodes: [first, line('otra', [line('honda', [{ ...line('copia'), id: first.id }])])],
        }),
      ),
    ).toThrow('mismo ID');
  });
});

describe('notas con y sin la unión a un apunte', () => {
  const note = (overrides: Record<string, unknown> = {}) => ({
    id: newId(),
    deckId: newId(),
    tags: [],
    origin: 'manual',
    editorialStatus: 'draft',
    sourceQuote: null,
    sourceQuestionVersionId: null,
    isDemo: false,
    createdAt: STAMP,
    ...overrides,
  });
  const basic = { kind: 'basic', front: '<p>f</p>', back: '<p>b</p>' };
  const kinds = [
    { kind: 'basic', front: '<p>f</p>', back: '<p>b</p>' },
    { kind: 'basic_reverse', front: '<p>f</p>', back: '<p>b</p>' },
    { kind: 'cloze', text: '<p>{{c1::x}}</p>', extra: '' },
  ];

  it('las tres clases de nota aceptan los campos nuevos y también pasan sin ellos', () => {
    for (const content of kinds) {
      const base = { ...note(), ...content };
      const without = NoteSchema.parse(base);
      expect(without.outlineId).toBeUndefined();
      expect(without.outlineNodeId).toBeUndefined();
      const outlineId = newId();
      const outlineNodeId = newId();
      expect(NoteSchema.parse({ ...base, outlineId, outlineNodeId })).toMatchObject({
        outlineId,
        outlineNodeId,
      });
      // Suelta, con los dos en null, que es como queda al borrar el apunte y conservar las tarjetas
      const detached = NoteSchema.parse({ ...base, outlineId: null, outlineNodeId: null });
      expect(detached.outlineId).toBeNull();
      expect(detached.outlineNodeId).toBeNull();
    }
  });

  it('rechaza los IDs que no son ULID y la unión a medias', () => {
    const base = { ...note(), ...basic };
    expect(() => NoteSchema.parse({ ...base, outlineId: 'x', outlineNodeId: newId() })).toThrow();
    expect(() => NoteSchema.parse({ ...base, outlineId: newId(), outlineNodeId: 'x' })).toThrow();
    expect(() => NoteSchema.parse({ ...base, outlineId: newId() })).toThrow('juntos');
    expect(() => NoteSchema.parse({ ...base, outlineNodeId: newId() })).toThrow('juntos');
    expect(() => NoteSchema.parse({ ...base, outlineId: newId(), outlineNodeId: null })).toThrow(
      'juntos',
    );
    expect(() => NoteSchema.parse({ ...base, outlineId: null, outlineNodeId: newId() })).toThrow(
      'juntos',
    );
  });

  it('una nota generada sigue citando su fuente aunque venga de un apunte', () => {
    const linked = { outlineId: newId(), outlineNodeId: newId() };
    expect(() =>
      NoteSchema.parse({ ...note(), ...basic, ...linked, origin: 'generated' }),
    ).toThrow();
    expect(
      NoteSchema.parse({
        ...note(),
        ...basic,
        ...linked,
        origin: 'generated',
        sourceQuote: 'frase',
        sourceQuestionVersionId: newId(),
      }).origin,
    ).toBe('generated');
  });
});
