// Extensiones de TipTap para el editor de apuntes (D-090). El apunte es una sola lista con viñetas
// anidadas. Cada línea lleva un nodeId que la une con su tarjeta, y el editor resalta las marcas
// que cuentan y muestra al final de la línea qué tarjeta saldrá de ella. Aquí no hay reglas de
// tarjetas, esas viven en el motor src/engines/outline.ts.
import { Extension } from '@tiptap/core';
import { Document } from '@tiptap/extension-document';
import { BulletList, ListItem } from '@tiptap/extension-list';
import { Paragraph } from '@tiptap/extension-paragraph';
import { Text } from '@tiptap/extension-text';
import { Placeholder, UndoRedo } from '@tiptap/extensions';
import type { Node as ProseNode } from '@tiptap/pm/model';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { newId } from '@/data/ids';
import { markTokens, parseLine, type ParsedLine } from '@/engines/outline';

/** El documento es una sola lista. Así nunca hay texto suelto fuera de una línea del esquema */
const OutlineDocument = Document.extend({ content: 'bulletList' });

/** Cada línea recuerda su id en el documento y en el HTML, para que las ediciones no lo pierdan */
const OutlineListItem = ListItem.extend({
  addAttributes() {
    return {
      nodeId: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute('data-node-id'),
        renderHTML: (attributes: { nodeId?: string | null }) =>
          attributes.nodeId ? { 'data-node-id': attributes.nodeId } : {},
      },
    };
  },
});

const idsKey = new PluginKey('outlineNodeIds');

/**
 * Mantiene un id distinto en cada línea. Al partir una línea con Enter la nueva hereda el id de la
 * original y aquí recibe uno propio. La primera en el orden del documento conserva el suyo, así su
 * tarjeta y su historial de repaso siguen donde estaban. No entra al historial de deshacer
 */
const UniqueNodeIds = Extension.create({
  name: 'outlineNodeIds',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: idsKey,
        appendTransaction: (transactions, _old, state) => {
          if (!transactions.some((transaction) => transaction.docChanged)) return null;
          const seen = new Set<string>();
          const fixes: { pos: number; attrs: Record<string, unknown> }[] = [];
          state.doc.descendants((node, pos) => {
            if (node.type.name !== 'listItem') return;
            const { nodeId: id } = node.attrs as { nodeId?: unknown };
            if (typeof id === 'string' && id !== '' && !seen.has(id)) {
              seen.add(id);
              return;
            }
            const fresh = newId();
            seen.add(fresh);
            fixes.push({ pos, attrs: { ...node.attrs, nodeId: fresh } });
          });
          if (fixes.length === 0) return null;
          const tr = state.tr;
          for (const fix of fixes) tr.setNodeMarkup(fix.pos, undefined, fix.attrs);
          return tr.setMeta('addToHistory', false);
        },
      }),
    ];
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
        props: { decorations: (state) => decorate(state.doc, badgeOf) },
      }),
    ];
  },
});

export function outlineExtensions(input: {
  placeholder: string;
  badgeOf: OutlineMarksOptions['badgeOf'];
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
    OutlineMarks.configure({ badgeOf: input.badgeOf }),
  ];
}
