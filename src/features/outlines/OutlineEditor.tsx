// Editor de apuntes en esquema (D-092). Una lista de viñetas anidadas donde Enter crea una línea,
// Tab la mete en la de arriba y Shift más Tab la saca. El editor solo maneja el árbol de líneas. Las
// marcas, las tarjetas y el guardado los resuelven el motor y quien lo usa. Va en una carga
// diferida porque TipTap pesa bastante y no se necesita fuera de Apuntes.
import type { Editor } from '@tiptap/core';
import { EditorContent, useEditor, useEditorState } from '@tiptap/react';
import {
  Hash,
  IndentDecrease,
  IndentIncrease,
  Link2,
  Redo2,
  Undo2,
  Braces,
  ArrowRightLeft,
  ArrowRight,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { newId } from '@/data/ids';
import {
  docToOutline,
  outlineToDoc,
  type DocNode,
  type OutlineNode,
  type ParsedLine,
} from '@/engines/outline';
import { t } from '@/i18n/es-MX';
import { Button } from '@/ui/components/button';
import { outlineExtensions, type OutlineLimit } from './outlineExtensions';
import './outline.css';

export interface OutlineEditorProps {
  /** Las líneas con las que arranca. Para cargar otro apunte se vuelve a montar con otra key */
  nodes: readonly OutlineNode[];
  onChange: (nodes: OutlineNode[]) => void;
  /** Texto de la insignia de una línea con marca. Debe ser una función estable */
  badgeOf: (line: ParsedLine) => string | null;
  autoFocus?: boolean;
  /** Entrega el editor ya creado, por ejemplo para pedirle el foco o para las pruebas */
  onReady?: (editor: Editor) => void;
}

export function OutlineEditor({
  nodes,
  onChange,
  badgeOf,
  autoFocus = false,
  onReady,
}: OutlineEditorProps) {
  const text = t.outlines.editor;
  const [initial] = useState(() => outlineToDoc(nodes, newId));
  // Cuando un cambio rebasaría un tope del apunte, el editor no lo aplica y aquí se explica por qué
  const [limit, setLimit] = useState<OutlineLimit | null>(null);
  const onLimit = useCallback((hit: OutlineLimit) => {
    setLimit(hit);
  }, []);
  const extensions = useMemo(
    () => outlineExtensions({ placeholder: text.placeholder, badgeOf, onLimit }),
    [text.placeholder, badgeOf, onLimit],
  );
  const firstTool = useRef<HTMLButtonElement | null>(null);

  const editor = useEditor({
    extensions,
    content: initial,
    autofocus: autoFocus ? 'end' : false,
    editorProps: {
      attributes: {
        class: 'outline-editor',
        role: 'textbox',
        'aria-multiline': 'true',
        'aria-label': text.label,
      },
      // Tab sirve para meter líneas. Esc devuelve el foco a las herramientas, así el teclado no
      // queda atrapado en el editor
      handleKeyDown: (_view, event) => {
        if (event.key !== 'Escape') return false;
        firstTool.current?.focus();
        return true;
      },
    },
    onUpdate: ({ editor: current }) => {
      setLimit(null);
      onChange(docToOutline(current.getJSON() as DocNode, newId));
    },
  });

  useEffect(() => {
    onReady?.(editor);
  }, [editor, onReady]);

  const can = useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      undo: current.can().undo(),
      redo: current.can().redo(),
    }),
  });

  const tools = [
    {
      key: 'indent',
      label: text.indent,
      icon: <IndentIncrease aria-hidden />,
      run: () => editor.chain().focus().sinkListItem('listItem').run(),
    },
    {
      key: 'outdent',
      label: text.outdent,
      icon: <IndentDecrease aria-hidden />,
      run: () => editor.chain().focus().liftListItem('listItem').run(),
    },
    {
      key: 'undo',
      label: text.undo,
      icon: <Undo2 aria-hidden />,
      disabled: !can.undo,
      run: () => editor.chain().focus().undo().run(),
    },
    {
      key: 'redo',
      label: text.redo,
      icon: <Redo2 aria-hidden />,
      disabled: !can.redo,
      run: () => editor.chain().focus().redo().run(),
    },
    {
      key: 'forward',
      label: text.insertForward,
      icon: <ArrowRight aria-hidden />,
      run: () => editor.chain().focus().insertContent(' >> ').run(),
    },
    {
      key: 'both',
      label: text.insertBoth,
      icon: <ArrowRightLeft aria-hidden />,
      run: () => editor.chain().focus().insertContent(' :: ').run(),
    },
    {
      key: 'cloze',
      label: text.insertCloze,
      icon: <Braces aria-hidden />,
      run: () => {
        // Con texto seleccionado lo envuelve y sin selección deja el cursor dentro de las llaves
        const { from, to, empty } = editor.state.selection;
        if (empty) {
          editor
            .chain()
            .focus()
            .insertContent('{{}}')
            .setTextSelection(from + 2)
            .run();
          return;
        }
        const selected = editor.state.doc.textBetween(from, to, ' ');
        editor.chain().focus().insertContentAt({ from, to }, `{{${selected}}}`).run();
      },
    },
    {
      key: 'tag',
      label: text.insertTag,
      icon: <Hash aria-hidden />,
      run: () => editor.chain().focus().insertContent(' #').run(),
    },
    {
      key: 'link',
      label: text.insertLink,
      icon: <Link2 aria-hidden />,
      run: () => {
        const { from } = editor.state.selection;
        editor
          .chain()
          .focus()
          .insertContent('[[]]')
          .setTextSelection(from + 2)
          .run();
      },
    },
  ] as const;

  return (
    <div className="flex flex-col gap-2">
      <div role="toolbar" aria-label={text.toolbar} className="flex flex-wrap gap-1">
        {tools.map((tool, index) => (
          <Button
            key={tool.key}
            ref={index === 0 ? firstTool : undefined}
            type="button"
            variant="secondary"
            size="icon"
            title={tool.label}
            aria-label={tool.label}
            disabled={'disabled' in tool ? tool.disabled : false}
            // Sin mousedown el botón le quita el foco al editor antes de actuar
            onMouseDown={(event) => {
              event.preventDefault();
            }}
            onClick={() => {
              tool.run();
            }}
          >
            {tool.icon}
          </Button>
        ))}
      </div>
      <div className="rounded-lg border border-line-strong bg-surface p-3 focus-within:outline-2 focus-within:outline-primary">
        <EditorContent editor={editor} />
      </div>
      <p role="status" className="text-sm font-medium text-warning">
        {limit ? text.limits[limit] : ''}
      </p>
      {/* En el teléfono no hay teclas Esc ni Tab, ahí sirven los botones de la barra */}
      <p className="hidden text-sm text-fg-muted md:block">{text.escapeHint}</p>
    </div>
  );
}
