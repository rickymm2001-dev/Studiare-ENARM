// Propiedades del motor de apuntes con fast-check. Nunca lanza con texto raro, el árbol sobrevive
// al ir y volver del editor y los ids que salen siempre son únicos.
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  countNodes,
  docToOutline,
  OUTLINE_LIMITS,
  outlineToDoc,
  parseLine,
  planCards,
  type DocNode,
  type OutlineNode,
} from './outline';

const MARKS = [
  '>>',
  '<<',
  '<>',
  '::',
  ';;',
  '>>>',
  '{{',
  '}}',
  '{{c1::',
  '#t',
  '[[x]]',
  ' ',
  'a',
  'é',
];
const lineText = fc
  .array(fc.oneof(fc.constantFrom(...MARKS), fc.string({ maxLength: 6 })), { maxLength: 8 })
  .map((parts) => parts.join(''));

/** Un árbol pequeño con ids únicos y líneas sin saltos ni espacios sobrantes */
const treeArb: fc.Arbitrary<OutlineNode[]> = fc
  .array(fc.tuple(lineText, fc.nat({ max: 3 })), { minLength: 1, maxLength: 12 })
  .map((rows) => {
    const roots: OutlineNode[] = [];
    const stack: OutlineNode[][] = [roots];
    rows.forEach(([text, jump], index) => {
      const depth = Math.min(jump, stack.length);
      stack.length = depth === 0 ? 1 : depth;
      const clean = text.replace(/\s+/g, ' ').trim();
      const item: OutlineNode = { id: `n${index}`, text: clean, children: [] };
      (stack.at(-1) ?? roots).push(item);
      stack.push(item.children);
    });
    return roots;
  });

let counter = 0;
const makeId = () => `new-${(counter += 1)}`;

describe('propiedades del motor de apuntes', () => {
  it('parseLine nunca lanza y sus etiquetas y enlaces no traen espacios ni vacíos', () => {
    fc.assert(
      fc.property(fc.string({ unit: 'binary', maxLength: 80 }), lineText, (raw, structured) => {
        for (const text of [raw, structured]) {
          const parsed = parseLine(text);
          expect(parsed.tags.every((tag) => tag !== '' && !/\s/.test(tag))).toBe(true);
          expect(parsed.links.every((title) => title.trim() !== '')).toBe(true);
          expect(parsed.plain).toBe(parsed.plain.trim());
        }
      }),
    );
  });

  it('planCards nunca lanza, respeta los topes y cada tarjeta viene de una línea del árbol', () => {
    fc.assert(
      fc.property(treeArb, (tree) => {
        const { plans, issues } = planCards(tree);
        expect(plans.length).toBeLessThanOrEqual(OUTLINE_LIMITS.maxCards);
        const ids = new Set<string>();
        const walk = (nodes: OutlineNode[]) => {
          nodes.forEach((node) => {
            ids.add(node.id);
            walk(node.children);
          });
        };
        walk(tree);
        expect(plans.every((plan) => ids.has(plan.nodeId))).toBe(true);
        expect(issues.every((issue) => ids.has(issue.nodeId))).toBe(true);
        // Una línea da como mucho una tarjeta
        expect(new Set(plans.map((plan) => plan.nodeId)).size).toBe(plans.length);
      }),
    );
  });

  it('el plan no cambia si se va al editor y se vuelve', () => {
    fc.assert(
      fc.property(treeArb, (tree) => {
        const back = docToOutline(outlineToDoc(tree, makeId), makeId);
        expect(back).toEqual(tree);
        expect(planCards(back)).toEqual(planCards(tree));
      }),
    );
  });

  it('con ids repetidos o ausentes, docToOutline devuelve ids únicos y el mismo número de líneas', () => {
    fc.assert(
      fc.property(treeArb, fc.constantFrom('igual', undefined), (tree, forced) => {
        const doc = outlineToDoc(tree, makeId);
        const wipe = (node: DocNode) => {
          if (node.type === 'listItem') {
            node.attrs = forced === undefined ? {} : { nodeId: forced };
          }
          node.content?.forEach(wipe);
        };
        wipe(doc);
        const back = docToOutline(doc, makeId);
        expect(countNodes(back)).toBe(countNodes(tree));
        const ids: string[] = [];
        const walk = (nodes: OutlineNode[]) => {
          nodes.forEach((node) => {
            ids.push(node.id);
            walk(node.children);
          });
        };
        walk(back);
        expect(new Set(ids).size).toBe(ids.length);
        expect(ids.every((id) => id !== '')).toBe(true);
      }),
    );
  });
});
