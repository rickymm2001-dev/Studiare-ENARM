// Extensiones de TipTap para el editor de apuntes (D-090). El apunte es una sola lista con viñetas
// anidadas. Cada línea lleva un nodeId que la une con su tarjeta, y el editor resalta las marcas
// que cuentan y muestra al final de la línea qué tarjeta saldrá de ella. Aquí no hay reglas de
// tarjetas, esas viven en el motor src/engines/outline.ts.
import { Extension, type Editor } from '@tiptap/core';
import { Document } from '@tiptap/extension-document';
import { BulletList, ListItem } from '@tiptap/extension-list';
import { Paragraph } from '@tiptap/extension-paragraph';
import { Text } from '@tiptap/extension-text';
import { Placeholder, UndoRedo } from '@tiptap/extensions';
import type { Node as ProseNode } from '@tiptap/pm/model';
import { Plugin, PluginKey, Selection, type Transaction } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { newId } from '@/data/ids';
import {
  NODE_ID_PATTERN,
  OUTLINE_LIMITS,
  markTokens,
  parseLine,
  pickIdOwners,
  type ParsedLine,
} from '@/engines/outline';

/** El documento es una sola lista. Así nunca hay texto suelto fuera de una línea del esquema */
const OutlineDocument = Document.extend({ content: 'bulletList' });

/**
 * Cada línea recuerda su id en el documento y en el HTML, para que las ediciones no lo pierdan. Una
 * línea es un solo párrafo y, si acaso, una lista debajo. Así pegar varias líneas hace varias
 * líneas y no un solo renglón con muchas partes
 */
const OutlineListItem = ListItem.extend({
  content: 'paragraph bulletList?',
  addAttributes() {
    return {
      nodeId: {
        default: null,
        // Un id pegado desde fuera que no es un ULID se descarta, porque el apunte entero dejaría de
        // guardarse. La línea recibe uno propio
        parseHTML: (element: HTMLElement) => {
          const id = element.getAttribute('data-node-id');
          return id !== null && NODE_ID_PATTERN.test(id) ? id : null;
        },
        renderHTML: (attributes: { nodeId?: string | null }) =>
          attributes.nodeId ? { 'data-node-id': attributes.nodeId } : {},
      },
    };
  },
});

const idsKey = new PluginKey('outlineNodeIds');

/** Rangos del documento nuevo que las transacciones acaban de insertar, ya llevados al documento final */
function insertedRanges(transactions: readonly Transaction[]): [number, number][] {
  let ranges: [number, number][] = [];
  for (const transaction of transactions) {
    for (const map of transaction.mapping.maps) {
      ranges = ranges.map(([from, to]) => [map.map(from, -1), map.map(to, 1)]);
      map.forEach((_oldStart, _oldEnd, newStart, newEnd) => {
        ranges.push([newStart, newEnd]);
      });
    }
  }
  return ranges;
}

/**
 * Mantiene un id distinto en cada línea y hace que el id siga al contenido. Al partir una línea con
 * Enter, o al pegar una copia, el id queda repetido y aquí una sola lo conserva. Entre las repetidas
 * gana la que tiene texto, luego la que ya estaba antes del cambio y al final la primera. Así Enter
 * al inicio de una línea con tarjeta deja el id con el texto y no con el renglón vacío de arriba, y
 * su historial de repaso sigue donde estaba. No entra al historial de deshacer
 */
const UniqueNodeIds = Extension.create({
  name: 'outlineNodeIds',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: idsKey,
        appendTransaction: (transactions, _old, state) => {
          if (!transactions.some((transaction) => transaction.docChanged)) return null;
          const fresh = insertedRanges(transactions);
          const items: { id: string; rank: number; item: { pos: number; node: ProseNode } }[] = [];
          state.doc.descendants((node, pos) => {
            if (node.type.name !== 'listItem') return;
            const { nodeId: id } = node.attrs as { nodeId?: unknown };
            const hasText = node.firstChild?.textContent.trim() !== '';
            const isNew = fresh.some(([from, to]) => pos >= from && pos < to);
            items.push({
              id: typeof id === 'string' && NODE_ID_PATTERN.test(id) ? id : '',
              rank: (hasText ? 2 : 0) + (isNew ? 0 : 1),
              item: { pos, node },
            });
          });
          const owners = pickIdOwners(items);
          const fixes = items.filter(
            ({ id, item }) => id === '' || owners.get(id)?.pos !== item.pos,
          );
          if (fixes.length === 0) return null;
          const tr = state.tr;
          for (const { item } of fixes) {
            tr.setNodeMarkup(item.pos, undefined, { ...item.node.attrs, nodeId: newId() });
          }
          return tr.setMeta('addToHistory', false);
        },
      }),
    ];
  },
});

const BLOCK_SELECTOR = 'p, h1, h2, h3, h4, h5, h6, pre, blockquote, div, tr';

/**
 * HTML pegado que no trae una lista, como varios párrafos de una página o de Word, con cada bloque
 * convertido en un elemento de lista. Sin esto solo se pegaría el primer párrafo. El texto va sin
 * formato, porque las líneas del apunte son texto plano. Si ya trae lista, se deja como viene
 */
export function htmlBlocksAsList(html: string): string {
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  if (parsed.body.querySelector('li')) return html;
  const blocks = [...parsed.body.querySelectorAll(BLOCK_SELECTOR)].filter(
    (block) => block.querySelector(BLOCK_SELECTOR) === null && block.textContent.trim() !== '',
  );
  if (blocks.length < 2) return html;
  const list = parsed.createElement('ul');
  for (const block of blocks) {
    const item = parsed.createElement('li');
    const paragraph = parsed.createElement('p');
    paragraph.textContent = block.textContent.replace(/\s+/g, ' ').trim();
    item.append(paragraph);
    list.append(item);
  }
  return list.outerHTML;
}

const pasteKey = new PluginKey('outlinePaste');

/** Pegar varios renglones los vuelve varias líneas del esquema */
const OutlinePaste = Extension.create({
  name: 'outlinePaste',
  addProseMirrorPlugins() {
    return [new Plugin({ key: pasteKey, props: { transformPastedHTML: htmlBlocksAsList } })];
  },
});

export type OutlineLimit = 'lines' | 'depth' | 'length';

/** Qué tope del apunte rebasa el documento, o null si cabe. Son los mismos que exige el guardado */
export function outlineLimitHit(doc: ProseNode): OutlineLimit | null {
  const found = { lines: 0, tooDeep: false, tooLong: false };
  const visit = (list: ProseNode, level: number) => {
    list.forEach((item) => {
      found.lines += 1;
      if (level > OUTLINE_LIMITS.maxDepth) found.tooDeep = true;
      item.forEach((part) => {
        if (part.type.name === 'paragraph') {
          if (part.textContent.length > OUTLINE_LIMITS.maxFieldLength) found.tooLong = true;
        } else if (part.type.name === 'bulletList') {
          visit(part, level + 1);
        }
      });
    });
  };
  doc.forEach((list) => {
    visit(list, 1);
  });
  if (found.lines > OUTLINE_LIMITS.maxNodes) return 'lines';
  if (found.tooDeep) return 'depth';
  return found.tooLong ? 'length' : null;
}

const limitsKey = new PluginKey('outlineLimits');

/**
 * El editor no deja pasar de los topes del apunte. Sin esto el guardado rechazaría el apunte entero y
 * se perdería lo escrito. Un cambio que los rebasa no se aplica y se avisa
 */
const OutlineLimits = Extension.create<{ onLimit: (limit: OutlineLimit) => void }>({
  name: 'outlineLimits',
  addOptions() {
    return { onLimit: () => undefined };
  },
  addProseMirrorPlugins() {
    const { onLimit } = this.options;
    return [
      new Plugin({
        key: limitsKey,
        filterTransaction: (transaction) => {
          if (!transaction.docChanged) return true;
          const hit = outlineLimitHit(transaction.doc);
          if (hit === null) return true;
          onLimit(hit);
          return false;
        },
      }),
    ];
  },
});

const isBlank = (item: ProseNode) => item.childCount === 1 && item.textContent === '';

/** Borra una línea en blanco y deja el cursor en la línea más cercana, hacia atrás o hacia delante */
function deleteBlankItem(editor: Editor, itemPos: number, bias: 1 | -1): boolean {
  const { state, view } = editor;
  const item = state.doc.nodeAt(itemPos);
  if (!item) return false;
  const tr = state.tr.delete(itemPos, itemPos + item.nodeSize);
  tr.setSelection(Selection.near(tr.doc.resolve(Math.min(itemPos, tr.doc.content.size)), bias));
  view.dispatch(tr.scrollIntoView());
  return true;
}

/**
 * Backspace y Delete en los bordes de una línea. Por defecto unen los párrafos y el id de una de las
 * dos líneas desaparece, con su tarjeta. Aquí una línea en blanco se borra sin tocar a la de al lado,
 * y Backspace al inicio de una línea metida la saca un nivel en lugar de pegarla con su padre
 */
const OutlineKeys = Extension.create({
  name: 'outlineKeys',
  priority: 1000,
  addKeyboardShortcuts() {
    return {
      Backspace: ({ editor }) => {
        const { selection } = editor.state;
        if (!selection.empty) return false;
        const { $from } = selection;
        if ($from.parentOffset !== 0 || $from.parent.type.name !== 'paragraph') return false;
        const itemDepth = $from.depth - 1;
        if (itemDepth < 1 || $from.node(itemDepth).type.name !== 'listItem') return false;
        if ($from.index(itemDepth) !== 0) return false;
        const listDepth = itemDepth - 1;
        // Una línea metida sale un nivel y conserva su texto y su id
        if (listDepth > 1) return editor.commands.liftListItem('listItem');
        const index = $from.index(listDepth);
        if (index === 0) return false;
        const list = $from.node(listDepth);
        const previous = list.child(index - 1);
        // Un renglón en blanco encima se quita, la línea de abajo sigue siendo la misma
        if (isBlank(previous)) {
          const { state, view } = editor;
          const from = $from.posAtIndex(index - 1, listDepth);
          view.dispatch(state.tr.delete(from, from + previous.nodeSize).scrollIntoView());
          return true;
        }
        // Una línea en blanco se borra y el cursor pasa al final de la de arriba
        if (isBlank($from.node(itemDepth))) {
          return deleteBlankItem(editor, $from.before(itemDepth), -1);
        }
        return false;
      },
      Delete: ({ editor }) => {
        const { selection } = editor.state;
        if (!selection.empty) return false;
        const { $from } = selection;
        if ($from.parent.type.name !== 'paragraph' || $from.parent.content.size !== 0) return false;
        const itemDepth = $from.depth - 1;
        if (itemDepth < 1 || $from.node(itemDepth).type.name !== 'listItem') return false;
        if (!isBlank($from.node(itemDepth))) return false;
        const list = $from.node(itemDepth - 1);
        // Delete en un renglón en blanco con una línea debajo quita el renglón y no vacía a la de abajo
        if ($from.index(itemDepth - 1) >= list.childCount - 1) return false;
        return deleteBlankItem(editor, $from.before(itemDepth), 1);
      },
    };
  },
});

export interface OutlineMarksOptions {
  /** El texto de la insignia que va al final de una línea con tarjeta. null si no lleva */
  badgeOf: (line: ParsedLine) => string | null;
}

const marksKey = new PluginKey('outlineMarks');

function badgeElement(text: string): HTMLElement {
  const element = document.createElement('span');
  element.className = 'outline-badge';
  element.textContent = text;
  element.contentEditable = 'false';
  // La misma información está en la lista de tarjetas de al lado, que sí lee el lector de pantalla
  element.setAttribute('aria-hidden', 'true');
  return element;
}

function decorate(doc: ProseNode, badgeOf: OutlineMarksOptions['badgeOf']): DecorationSet {
  const decorations: Decoration[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name !== 'paragraph') return;
    const text = node.textContent;
    if (text.trim() === '') return false;
    const start = pos + 1;
    for (const token of markTokens(text)) {
      decorations.push(
        Decoration.inline(start + token.start, start + token.end, {
          class: `outline-token outline-token--${token.kind}`,
        }),
      );
    }
    const label = badgeOf(parseLine(text));
    if (label) {
      decorations.push(
        Decoration.widget(start + text.length, () => badgeElement(label), {
          side: 1,
          key: `${String(pos)}:${label}`,
        }),
      );
    }
    return false;
  });
  return DecorationSet.create(doc, decorations);
}

/** Resalta las marcas de cada línea y pone la insignia de la tarjeta que sale de ella */
const OutlineMarks = Extension.create<OutlineMarksOptions>({
  name: 'outlineMarks',
  addOptions() {
    return { badgeOf: () => null };
  },
  addProseMirrorPlugins() {
    const { badgeOf } = this.options;
    return [
      new Plugin({
        key: marksKey,
        // Las decoraciones se recalculan solo cuando cambia el texto y no al mover el cursor
        state: {
          init: (_config, state) => decorate(state.doc, badgeOf),
          apply: (transaction, previous) =>
            transaction.docChanged ? decorate(transaction.doc, badgeOf) : previous,
        },
        props: {
          decorations(state) {
            return marksKey.getState(state) as DecorationSet;
          },
        },
      }),
    ];
  },
});

export function outlineExtensions(input: {
  placeholder: string;
  badgeOf: OutlineMarksOptions['badgeOf'];
  onLimit: (limit: OutlineLimit) => void;
}) {
  return [
    OutlineDocument,
    Paragraph,
    Text,
    BulletList,
    OutlineListItem,
    UndoRedo,
    Placeholder.configure({ placeholder: input.placeholder, showOnlyCurrent: true }),
    UniqueNodeIds,
    OutlineLimits.configure({ onLimit: input.onLimit }),
    OutlineKeys,
    OutlinePaste,
    OutlineMarks.configure({ badgeOf: input.badgeOf }),
  ];
}
