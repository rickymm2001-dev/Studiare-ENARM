// Órdenes del editor de apuntes que usan la barra, el botón de la línea, el esquema y la búsqueda
// (B6 del plan del cambio). Leen la línea donde está el cursor, le aplican el tipo de tarjeta que se
// eligió y saltan a una línea por su id. Las reglas de las marcas viven en el motor
// src/engines/outlineLine.ts. Aquí solo se cambia el documento, y la línea conserva su id, así su
// tarjeta y su historial siguen (D-092).
import type { Editor } from '@tiptap/core';
import { TextSelection } from '@tiptap/pm/state';
import { convertLine, lineKindOf, type LineCardKind, type LineKind } from '@/engines/outlineLine';

export interface CurrentLine {
  /** Posición justo antes del párrafo de la línea */
  pos: number;
  /** Donde empieza y termina su texto en el documento */
  from: number;
  to: number;
  text: string;
  kind: LineKind;
  /** La selección dentro del texto de la línea */
  selection: { start: number; end: number };
  hasChildren: boolean;
}

/** La línea donde está el cursor, o null si el cursor no está en una línea */
export function currentLine(editor: Editor): CurrentLine | null {
  const { selection } = editor.state;
  const { $head } = selection;
  const paragraph = $head.parent;
  if (paragraph.type.name !== 'paragraph' || $head.depth < 2) return null;
  const item = $head.node($head.depth - 1);
  if (item.type.name !== 'listItem') return null;
  const from = $head.start();
  const to = $head.end();
  const clamp = (value: number) => Math.max(0, Math.min(value, to) - from);
  const text = paragraph.textContent;
  return {
    pos: $head.before(),
    from,
    to,
    text,
    kind: lineKindOf(text),
    selection: { start: clamp(selection.from), end: clamp(selection.to) },
    hasChildren: item.childCount > 1,
  };
}

/**
 * Vuelve la línea del cursor del tipo de tarjeta pedido, o le quita la tarjeta. Con >>> la respuesta
 * pasa a una línea nueva debajo. Si el cambio rebasa un tope del apunte, el editor no lo aplica.
 * Devuelve si cambió algo
 */
export function convertCurrentLine(editor: Editor, kind: LineCardKind | 'none'): boolean {
  const line = currentLine(editor);
  if (!line) return false;
  const result = convertLine(line.text, kind, {
    selection: line.selection,
    hasChildren: line.hasChildren,
  });
  const { schema } = editor.state;
  const tr = editor.state.tr;
  if (result.text === '') tr.delete(line.from, line.to);
  else tr.insertText(result.text, line.from, line.to);
  let caret = line.from + result.cursor;
  if (result.child) {
    // La línea nueva va primera entre las que cuelgan. Si no había, con su propia lista
    const $line = tr.doc.resolve(line.from);
    const itemDepth = $line.depth - 1;
    const item = $line.node(itemDepth);
    const afterParagraph = $line.after();
    const paragraph = schema.nodes.paragraph?.create(
      null,
      result.child.text === '' ? undefined : schema.text(result.child.text),
    );
    const listItem = paragraph ? schema.nodes.listItem?.create(null, paragraph) : undefined;
    if (!listItem) return false;
    if (item.childCount > 1) {
      tr.insert(afterParagraph + 1, listItem);
      caret = afterParagraph + 3 + result.child.cursor;
    } else {
      const list = schema.nodes.bulletList?.create(null, listItem);
      if (!list) return false;
      tr.insert(afterParagraph, list);
      caret = afterParagraph + 3 + result.child.cursor;
    }
  }
  if (tr.doc.eq(editor.state.doc) && caret === editor.state.selection.head) return false;
  tr.setSelection(TextSelection.create(tr.doc, Math.min(caret, tr.doc.content.size)));
  editor.view.dispatch(tr.scrollIntoView());
  editor.view.focus();
  return true;
}

/** La posición del párrafo de la línea con ese id, o null si ya no está */
function linePosition(editor: Editor, nodeId: string): number | null {
  let found: number | null = null;
  editor.state.doc.descendants((node, pos) => {
    if (found !== null) return false;
    if (node.type.name === 'listItem' && (node.attrs as { nodeId?: unknown }).nodeId === nodeId) {
      // El párrafo es el primer hijo de la línea
      found = pos + 1;
      return false;
    }
    return true;
  });
  return found;
}

/**
 * Lleva el cursor al final de la línea con ese id y la muestra en pantalla, por ejemplo desde el
 * esquema o desde la búsqueda. Devuelve si la encontró
 */
export function jumpToLine(editor: Editor, nodeId: string): boolean {
  const at = linePosition(editor, nodeId);
  if (at === null) return false;
  const paragraph = editor.state.doc.nodeAt(at);
  const end = at + 1 + (paragraph?.content.size ?? 0);
  editor.chain().focus().setTextSelection(end).scrollIntoView().run();
  // La barra de herramientas queda fija arriba, así que la línea se centra para que se vea entera.
  // jsdom no implementa scrollIntoView, por eso se revisa que exista
  const dom = editor.view.nodeDOM(at);
  if (dom instanceof HTMLElement && 'scrollIntoView' in dom)
    dom.scrollIntoView({ block: 'center' });
  return true;
}
