// Editor de apuntes en esquema (D-092). Una lista de viñetas anidadas donde Enter crea una línea,
// Tab la mete en la de arriba y Shift más Tab la saca. El editor solo maneja el árbol de líneas. Las
// marcas, las tarjetas y el guardado los resuelven el motor y quien lo usa. Va en una carga
// diferida porque TipTap pesa bastante y no se necesita fuera de Apuntes.
//
// Crear tarjetas sin memorizar marcas (B6 del plan del cambio). La línea del cursor cambia su viñeta
// por el botón Tarjeta con esta línea, y la barra tiene el botón Tarjeta. Los dos abren debajo de la
// línea los tipos de tarjeta, que escriben la marca por el alumno. El botón va en el lugar de la
// viñeta para no quitarle ancho al texto en el teléfono. La barra queda fija arriba, debajo del
// encabezado, así sigue a la mano con el teclado abierto, y sus botones miden 44 px. Si no cabe a lo
// ancho se recorre de lado sin mover la página.
import type { Editor } from '@tiptap/core';
import { EditorContent, useEditor, useEditorState } from '@tiptap/react';
import {
  Hash,
  IndentDecrease,
  IndentIncrease,
  Link2,
  Redo2,
  SquarePlus,
  Undo2,
} from 'lucide-react';
import { useCallback, useEffect, useId, useMemo, useRef, useState, type RefObject } from 'react';
import { newId } from '@/data/ids';
import {
  docToOutline,
  outlineToDoc,
  type DocNode,
  type OutlineNode,
  type ParsedLine,
} from '@/engines/outline';
import type { LineCardKind, LineKind } from '@/engines/outlineLine';
import { t } from '@/i18n/es-MX';
import { cn } from '@/ui/cn';
import { Button } from '@/ui/components/button';
import { convertCurrentLine, currentLine, jumpToLine } from './editorCommands';
import { LineCardMenu } from './LineCardMenu';
import { outlineExtensions, type OutlineLimit } from './outlineExtensions';
import './outline.css';

export interface OutlineEditorProps {
  /** Las líneas con las que arranca. Para cargar otro apunte se vuelve a montar con otra key */
  nodes: readonly OutlineNode[];
  onChange: (nodes: OutlineNode[]) => void;
  /** Texto de la insignia de una línea con marca. Debe ser una función estable */
  badgeOf: (line: ParsedLine) => string | null;
  autoFocus?: boolean;
  /** Línea donde queda el cursor al abrir, por ejemplo la que se buscó o la de una plantilla */
  initialLine?: string | null;
  /**
   * El editor deja aquí cómo saltar a una línea por su id, para el esquema y las citas de la IA. Así
   * quien lo usa no carga ProseMirror antes de tiempo
   */
  jumpRef?: { current: ((nodeId: string) => void) | null };
  /** Entrega el editor ya creado, por ejemplo para pedirle el foco o para las pruebas */
  onReady?: (editor: Editor) => void;
}

/** Dónde está la línea del cursor dentro del recuadro del editor, para poner su botón al lado */
interface LineSpot {
  pos: number;
  top: number;
  bottom: number;
  /** Donde empieza su texto, a la derecha de su viñeta */
  left: number;
  kind: LineKind;
  empty: boolean;
}

const sameSpot = (a: LineSpot, b: LineSpot) =>
  a.pos === b.pos &&
  a.top === b.top &&
  a.bottom === b.bottom &&
  a.left === b.left &&
  a.kind === b.kind &&
  a.empty === b.empty;

/** Lado del botón de la línea. Cubre la viñeta y su área de toque llega a 44 px */
const LINE_BUTTON = 28;

/**
 * Sigue la línea del cursor y su lugar en pantalla. Se mide después de cada cambio del editor, al
 * enfocarlo y al cambiar el tamaño de la ventana
 */
function useLineSpot(editor: Editor, box: RefObject<HTMLDivElement | null>) {
  const [spot, setSpot] = useState<LineSpot | null>(null);
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    const measure = () => {
      const outer = box.current;
      // Antes de montarse el editor todavía no tiene vista que medir
      const line = editor.isInitialized && !editor.isDestroyed ? currentLine(editor) : null;
      const dom = line ? editor.view.nodeDOM(line.pos) : null;
      if (!outer || !line || !(dom instanceof HTMLElement)) {
        setSpot(null);
        return;
      }
      const frame = outer.getBoundingClientRect();
      const rect = dom.getBoundingClientRect();
      const next: LineSpot = {
        pos: line.pos,
        top: Math.round(rect.top - frame.top),
        bottom: Math.round(rect.bottom - frame.top),
        left: Math.round(rect.left - frame.left),
        kind: line.kind,
        empty: line.text.trim() === '',
      };
      setSpot((previous) => (previous && sameSpot(previous, next) ? previous : next));
    };
    const onFocus = () => {
      setFocused(true);
      measure();
    };
    const onBlur = () => {
      setFocused(false);
    };
    measure();
    editor.on('create', measure);
    editor.on('transaction', measure);
    editor.on('focus', onFocus);
    editor.on('blur', onBlur);
    window.addEventListener('resize', measure);
    return () => {
      editor.off('create', measure);
      editor.off('transaction', measure);
      editor.off('focus', onFocus);
      editor.off('blur', onBlur);
      window.removeEventListener('resize', measure);
    };
  }, [editor, box]);
  return { spot, focused };
}

/** Que el botón no le quite el foco al editor al tocarlo */
const keepFocus = (event: { preventDefault: () => void }) => {
  event.preventDefault();
};

export function OutlineEditor({
  nodes,
  onChange,
  badgeOf,
  autoFocus = false,
  initialLine = null,
  jumpRef,
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
  const box = useRef<HTMLDivElement | null>(null);
  const menuId = useId();
  // El menú de tipos de la línea, abierto con el ratón o el dedo, o con el teclado
  const [menu, setMenu] = useState<{ pos: number; keyboard: boolean } | null>(null);

  const editor = useEditor({
    extensions,
    content: initial,
    autofocus: autoFocus && !initialLine ? 'end' : false,
    editorProps: {
      attributes: {
        class: 'outline-editor',
        role: 'textbox',
        'aria-multiline': 'true',
        'aria-label': text.label,
      },
      // La barra fija de arriba y la de navegación de abajo no deben tapar la línea donde escribes
      scrollMargin: { top: 140, bottom: 110, left: 0, right: 0 },
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

  useEffect(() => {
    if (!jumpRef) return;
    jumpRef.current = (nodeId) => {
      jumpToLine(editor, nodeId);
    };
    return () => {
      jumpRef.current = null;
    };
  }, [editor, jumpRef]);

  // La línea pedida al abrir, en cuanto el editor tiene vista
  useEffect(() => {
    if (!initialLine) return;
    const jump = () => {
      jumpToLine(editor, initialLine);
    };
    if (editor.isInitialized) {
      jump();
      return;
    }
    editor.on('create', jump);
    return () => {
      editor.off('create', jump);
    };
  }, [editor, initialLine]);

  const can = useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      undo: current.can().undo(),
      redo: current.can().redo(),
    }),
  });

  const { spot, focused } = useLineSpot(editor, box);
  // El menú es de una línea. Si el cursor se va a otra, se cierra solo
  const openMenu = menu !== null && spot !== null && menu.pos === spot.pos ? menu : null;

  // Si el foco sale del editor a otro lugar que no sea el menú o el botón de la línea, el menú se
  // cierra. Tocar las opciones no le quita el foco al editor
  useEffect(() => {
    const onBlur = ({ event }: { event: FocusEvent }) => {
      const next = event.relatedTarget;
      if (next instanceof Node && box.current?.contains(next)) return;
      setMenu(null);
    };
    editor.on('blur', onBlur);
    return () => {
      editor.off('blur', onBlur);
    };
  }, [editor]);

  const toggleMenu = (keyboard: boolean) => {
    if (openMenu) {
      setMenu(null);
      return;
    }
    if (spot) setMenu({ pos: spot.pos, keyboard });
  };

  const choose = (kind: LineCardKind | 'none') => {
    setMenu(null);
    convertCurrentLine(editor, kind);
  };

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

  // El botón de la línea se ve mientras escribes en una línea con texto, o con su menú abierto
  const showLineButton = spot !== null && !spot.empty && (focused || openMenu !== null);

  return (
    <div className="flex flex-col gap-2">
      <div
        role="toolbar"
        aria-label={text.toolbar}
        // Debajo del encabezado fijo, que mide 3 rem y su borde en el teléfono y 4 rem en computadora
        className="sticky top-[calc(3rem+1px)] z-10 -mx-1 flex gap-0.5 overflow-x-auto bg-surface px-1 py-1 sm:gap-1 lg:top-topbar lg:flex-wrap lg:overflow-visible"
      >
        <Button
          ref={firstTool}
          type="button"
          variant="secondary"
          className="shrink-0 px-3"
          title={text.cardLabel}
          aria-label={text.cardLabel}
          aria-expanded={openMenu !== null}
          aria-controls={openMenu ? menuId : undefined}
          onMouseDown={keepFocus}
          onClick={(event) => {
            // detail 0 es un clic del teclado, con Enter o Espacio
            toggleMenu(event.detail === 0);
          }}
        >
          <SquarePlus aria-hidden />
          <span className="hidden sm:inline">{text.card}</span>
        </Button>
        {tools.map((tool) => (
          <Button
            key={tool.key}
            type="button"
            variant="secondary"
            size="icon"
            className="shrink-0"
            title={tool.label}
            aria-label={tool.label}
            disabled={'disabled' in tool ? tool.disabled : false}
            // Sin mousedown el botón le quita el foco al editor antes de actuar
            onMouseDown={keepFocus}
            onClick={() => {
              tool.run();
            }}
          >
            {tool.icon}
          </Button>
        ))}
      </div>
      <div
        ref={box}
        className="relative rounded-lg border border-line-strong bg-surface p-3 focus-within:outline-2 focus-within:outline-focus"
      >
        <EditorContent editor={editor} />
        {showLineButton ? (
          <button
            type="button"
            // El mismo botón está en la barra, que sí se alcanza con el teclado
            tabIndex={-1}
            title={text.lineButton}
            aria-label={text.lineButton}
            aria-expanded={openMenu !== null}
            aria-controls={openMenu ? menuId : undefined}
            className={cn(
              // Se ve de 28 px sobre la viñeta y su área de toque mide 44 px hacia la izquierda,
              // arriba y abajo, nunca sobre el texto de la línea
              'absolute flex items-center justify-center rounded-md border text-primary-ink',
              "before:absolute before:-inset-y-2 before:right-0 before:-left-4 before:content-['']",
              openMenu ? 'border-primary bg-primary-soft' : 'border-line-strong bg-surface',
            )}
            // Alineado con el primer renglón de la línea, que mide lo mismo que el botón
            style={{
              top: spot.top,
              left: Math.max(0, spot.left - LINE_BUTTON - 2),
              width: LINE_BUTTON,
              height: LINE_BUTTON,
            }}
            onMouseDown={keepFocus}
            onClick={() => {
              toggleMenu(false);
            }}
          >
            <SquarePlus aria-hidden className="size-4" />
          </button>
        ) : null}
        {openMenu && spot ? (
          <LineCardMenu
            id={menuId}
            kind={spot.kind}
            empty={spot.empty}
            focusFirst={openMenu.keyboard}
            style={{ top: spot.bottom + 4 }}
            onChoose={choose}
            onClose={(returnFocus) => {
              setMenu(null);
              if (returnFocus) editor.commands.focus();
            }}
          />
        ) : null}
      </div>
      <p role="status" className="text-sm font-medium text-warning">
        {limit ? text.limits[limit] : ''}
      </p>
      {/* Las marcas siempre a la vista, también en el modo clase y en el teléfono */}
      <p className="text-sm text-fg-muted">
        <span className="font-medium">{text.marksLabel}</span>
        {text.marks.map((entry) => (
          <span key={entry.mark} className="whitespace-nowrap">
            {' · '}
            <code className="font-mono font-semibold text-primary-ink">{entry.mark}</code>{' '}
            {entry.what}
          </span>
        ))}
      </p>
      {/* En el teléfono no hay teclas Esc ni Tab, ahí sirven los botones de la barra */}
      <p className="hidden text-sm text-fg-muted md:block">{text.escapeHint}</p>
    </div>
  );
}
