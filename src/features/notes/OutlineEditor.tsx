// Editor de un apunte en esquema (D-092). Una lista de líneas con sangría. Escribir una marca en una
// línea la vuelve tarjeta, y el guardado automático mantiene las tarjetas al día. Funciona con
// teclado, con la barra de botones para quien no tiene teclado de computadora y con lector de
// pantalla. El texto de cada línea es un campo de texto aparte con su nombre.
import {
  AlignLeft,
  ArrowDown,
  ArrowUp,
  Braces,
  ChevronDown,
  ChevronRight,
  Hash,
  IndentDecrease,
  IndentIncrease,
  Link2,
  MessageSquareQuote,
  Plus,
  Repeat2,
  Trash2,
} from 'lucide-react';
import { useLayoutEffect, useRef, type KeyboardEvent } from 'react';
import { Link } from 'react-router';
import {
  applyMark,
  hasChildren,
  resolveLinks,
  visibleIndexes,
  type MarkKind,
} from '@/engines/outline';
import { screenPath } from '@/app/screens';
import type { OutlinePage } from '@/data/schemas/outlines';
import { t } from '@/i18n/es-MX';
import { cn } from '@/ui/cn';
import { Button } from '@/ui/components/button';
import { TextField } from '@/ui/components/field';
import { Kbd, KeyHint } from '@/ui/components/key-hint';
import type { ReadySession } from '../shared/RequireSession';
import { useOutlineEditor, type SaveStatus } from './useOutlineEditor';

const TOOLS: readonly {
  key: keyof typeof t.notes.toolbar;
  icon: typeof ArrowUp;
  mark?: MarkKind;
}[] = [
  { key: 'card', icon: MessageSquareQuote, mark: 'card' },
  { key: 'reverse', icon: Repeat2, mark: 'reverse' },
  { key: 'hole', icon: Braces, mark: 'hole' },
  { key: 'link', icon: Link2, mark: 'link' },
  { key: 'tag', icon: Hash, mark: 'tag' },
];

/** Cómo se llama una línea en los botones de plegar. Una línea vacía lo dice */
const labelOf = (text: string | undefined) =>
  text === undefined || text === '' ? t.notes.emptyLine : text;

export function OutlineEditor({
  session,
  page,
  pages,
  onCreateLinked,
}: {
  session: ReadySession;
  page: OutlinePage;
  /** Todos los apuntes, para resolver los enlaces */
  pages: readonly OutlinePage[];
  onCreateLinked: (title: string) => void;
}) {
  const editor = useOutlineEditor(session, page);
  const { lines, plan, collapsed, focus } = editor;
  const inputs = useRef(new Map<string, HTMLTextAreaElement>());
  // Después de Escape, el siguiente Tab sale del esquema en lugar de meter un nivel
  const leaveWithTab = useRef(false);

  const byLine = new Map(plan.lines.map((entry) => [entry.lineId, entry] as const));
  const cardsByLine = new Map(plan.cards.map((card) => [card.lineId, card.cards] as const));
  const problemByLine = new Map(plan.problems.map((problem) => [problem.lineId, problem.error]));
  const visible = visibleIndexes(lines, collapsed);
  const resolved = resolveLinks(pages, plan.links);

  // Pone el foco donde lo pidió el último cambio
  useLayoutEffect(() => {
    if (!focus) return;
    const input = inputs.current.get(focus.id);
    if (!input) return;
    input.focus();
    const position = focus.at === 'end' ? input.value.length : focus.at;
    input.setSelectionRange(position, position);
  }, [focus]);

  // Ajusta la altura de cada línea a su texto
  useLayoutEffect(() => {
    for (const input of inputs.current.values()) {
      input.style.height = 'auto';
      if (input.scrollHeight > 0) input.style.height = `${input.scrollHeight}px`;
    }
  }, [lines, collapsed]);

  const activeId = editor.activeId ?? lines[0]?.id ?? '';

  const mark = (kind: MarkKind) => {
    const input = inputs.current.get(activeId);
    if (!input) return;
    const result = applyMark(input.value, input.selectionStart, input.selectionEnd, kind);
    editor.setText(activeId, result.text);
    editor.requestFocus({ id: activeId, at: result.caret });
  };

  const focusLine = (position: number, at: number | 'end') => {
    const id = lines[visible[position] ?? -1]?.id;
    const input = id ? inputs.current.get(id) : undefined;
    if (!input) return;
    input.focus();
    const caret = at === 'end' ? input.value.length : at;
    input.setSelectionRange(caret, caret);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>, id: string, position: number) => {
    const input = event.currentTarget;
    const wasLeaving = leaveWithTab.current;
    leaveWithTab.current = event.key === 'Escape';
    if (event.nativeEvent.isComposing) return;
    switch (event.key) {
      case 'Tab':
        if (wasLeaving) return;
        event.preventDefault();
        if (event.shiftKey) editor.outdent(id);
        else editor.indent(id);
        return;
      case 'Enter':
        if (event.shiftKey) return;
        event.preventDefault();
        editor.addBelow(id, {
          before: input.value.slice(0, input.selectionStart),
          after: input.value.slice(input.selectionEnd),
        });
        return;
      case 'Backspace':
        if (input.value === '' && lines.length > 1) {
          event.preventDefault();
          editor.remove(id);
        }
        return;
      case 'ArrowUp':
        if (event.altKey) {
          event.preventDefault();
          editor.move(id, -1);
        } else if (input.selectionStart === 0 && input.selectionEnd === 0 && position > 0) {
          event.preventDefault();
          focusLine(position - 1, 'end');
        }
        return;
      case 'ArrowDown':
        if (event.altKey) {
          event.preventDefault();
          editor.move(id, 1);
        } else if (
          input.selectionStart === input.value.length &&
          input.selectionEnd === input.value.length &&
          position < visible.length - 1
        ) {
          event.preventDefault();
          focusLine(position + 1, 0);
        }
        return;
    }
  };

  // Los botones no le quitan el foco a la línea, así la selección sigue donde estaba
  const keepFocus = (event: { preventDefault: () => void }) => {
    event.preventDefault();
  };

  return (
    <div className="flex flex-col gap-3">
      <TextField
        label={t.notes.tagsLabel}
        hint={t.notes.tagsHint}
        value={editor.tagsText}
        onChange={(event) => {
          editor.setTagsText(event.target.value);
        }}
      />
      <div
        role="toolbar"
        aria-label={t.notes.toolbar.label}
        className="sticky top-12 z-10 flex flex-wrap items-center gap-1 rounded-xl border border-line bg-surface/95 p-1.5 shadow-card backdrop-blur lg:top-2"
      >
        <ToolButton
          label={t.notes.toolbar.outdent}
          onPress={() => {
            editor.outdent(activeId);
          }}
          onMouseDown={keepFocus}
        >
          <IndentDecrease aria-hidden />
        </ToolButton>
        <ToolButton
          label={t.notes.toolbar.indent}
          onPress={() => {
            editor.indent(activeId);
          }}
          onMouseDown={keepFocus}
        >
          <IndentIncrease aria-hidden />
        </ToolButton>
        <ToolButton
          label={t.notes.toolbar.up}
          onPress={() => {
            editor.move(activeId, -1);
          }}
          onMouseDown={keepFocus}
        >
          <ArrowUp aria-hidden />
        </ToolButton>
        <ToolButton
          label={t.notes.toolbar.down}
          onPress={() => {
            editor.move(activeId, 1);
          }}
          onMouseDown={keepFocus}
        >
          <ArrowDown aria-hidden />
        </ToolButton>
        <span aria-hidden className="mx-1 h-6 w-px bg-line" />
        {TOOLS.map((tool) => (
          <ToolButton
            key={tool.key}
            label={t.notes.toolbar[tool.key]}
            onPress={() => {
              if (tool.mark) mark(tool.mark);
            }}
            onMouseDown={keepFocus}
          >
            <tool.icon aria-hidden />
          </ToolButton>
        ))}
        <span aria-hidden className="mx-1 h-6 w-px bg-line" />
        <ToolButton
          label={t.notes.toolbar.add}
          onPress={() => {
            editor.addBelow(activeId);
          }}
          onMouseDown={keepFocus}
        >
          <Plus aria-hidden />
        </ToolButton>
        <ToolButton
          label={t.notes.toolbar.remove}
          onPress={() => {
            editor.remove(activeId);
          }}
          onMouseDown={keepFocus}
        >
          <Trash2 aria-hidden />
        </ToolButton>
        <SaveState status={editor.status} onRetry={() => void editor.flush()} />
      </div>

      <div role="group" aria-label={t.notes.editorLabel}>
        <ul className="flex flex-col gap-1">
          {visible.map((index, position) => {
            const line = lines[index];
            if (!line) return null;
            const analysis = byLine.get(line.id);
            const error = problemByLine.get(line.id);
            const markKind = analysis?.parsed.mark ?? 'none';
            const cardCount = cardsByLine.get(line.id) ?? 0;
            const folded = collapsed.has(line.id);
            const parent = hasChildren(lines, index);
            const badgeId = `${page.id}-${line.id}-marca`;
            const badge = error
              ? t.notes.problems[error]
              : markKind === 'basic'
                ? t.notes.badges.basic
                : markKind === 'basic_reverse'
                  ? t.notes.badges.basic_reverse
                  : markKind === 'cloze'
                    ? t.notes.badges.cloze(cardCount)
                    : null;
            return (
              <li
                key={line.id}
                className="flex items-start gap-1"
                style={{ paddingLeft: `${line.depth * 1.25}rem` }}
              >
                {parent ? (
                  <button
                    type="button"
                    aria-expanded={!folded}
                    aria-label={
                      folded
                        ? t.notes.expand(labelOf(analysis?.parsed.clean))
                        : t.notes.collapse(labelOf(analysis?.parsed.clean))
                    }
                    onClick={() => {
                      editor.toggleCollapsed(line.id);
                    }}
                    className="mt-1 flex size-8 shrink-0 items-center justify-center rounded-full text-fg-muted hover:bg-muted"
                  >
                    {folded ? (
                      <ChevronRight aria-hidden className="size-4" />
                    ) : (
                      <ChevronDown aria-hidden className="size-4" />
                    )}
                  </button>
                ) : (
                  <span
                    aria-hidden
                    className="mt-1 flex size-8 shrink-0 items-center justify-center"
                  >
                    <span className="size-1.5 rounded-full bg-line-strong" />
                  </span>
                )}
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <textarea
                    ref={(element) => {
                      if (element) inputs.current.set(line.id, element);
                      else inputs.current.delete(line.id);
                    }}
                    rows={1}
                    value={line.text}
                    lang="es"
                    placeholder={t.notes.linePlaceholder}
                    aria-label={t.notes.lineLabel(index + 1, line.depth + 1)}
                    aria-describedby={badge ? badgeId : undefined}
                    aria-invalid={error ? true : undefined}
                    onFocus={() => {
                      editor.setActiveId(line.id);
                    }}
                    onChange={(event) => {
                      editor.setText(line.id, event.target.value);
                    }}
                    onKeyDown={(event) => {
                      onKeyDown(event, line.id, position);
                    }}
                    className={cn(
                      'min-h-9 w-full resize-none overflow-hidden rounded-lg border border-transparent bg-transparent px-2 py-1.5 text-base leading-snug text-fg placeholder:text-fg-muted/60 hover:bg-muted/60 focus-visible:border-line-strong focus-visible:bg-surface focus-visible:outline-2 focus-visible:outline-primary',
                      error && 'border-danger/60',
                    )}
                  />
                  {badge ? (
                    <span
                      id={badgeId}
                      className={cn(
                        'ml-2 w-fit rounded-full px-2 py-0.5 font-mono text-[0.65rem] tracking-wider uppercase',
                        error ? 'bg-danger/15 text-danger' : 'bg-primary/10 text-primary',
                      )}
                    >
                      {badge}
                    </span>
                  ) : null}
                  {analysis && analysis.parsed.links.length > 0 ? (
                    <ul className="ml-2 flex flex-wrap gap-1.5" aria-label={t.notes.links.title}>
                      {analysis.parsed.links.map((title) => {
                        const target = resolved.get(title) ?? null;
                        return (
                          <li key={title}>
                            {target ? (
                              <Link
                                to={`${screenPath('notes')}?apunte=${target.id}`}
                                aria-label={t.notes.links.open(target.title)}
                                className="inline-flex min-h-6 items-center gap-1 rounded-full bg-muted px-2 text-xs font-semibold text-primary hover:underline"
                              >
                                <Link2 aria-hidden className="size-3" />
                                {title}
                              </Link>
                            ) : (
                              <button
                                type="button"
                                aria-label={t.notes.links.missing(title)}
                                onClick={() => {
                                  onCreateLinked(title);
                                }}
                                className="inline-flex min-h-6 items-center gap-1 rounded-full border border-dashed border-line-strong px-2 text-xs font-semibold text-fg-muted hover:bg-muted"
                              >
                                <Plus aria-hidden className="size-3" />
                                {title}
                              </button>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      <KeyHint>
        <AlignLeft aria-hidden className="mr-1 inline size-3.5 align-text-bottom" />
        <Kbd>Tab</Kbd> {t.notes.keys.indent} <Kbd>{t.notes.keys.shift}</Kbd> <Kbd>Tab</Kbd>{' '}
        {t.notes.keys.outdent} <Kbd>Enter</Kbd> {t.notes.keys.enter} <Kbd>Alt</Kbd>{' '}
        {t.notes.keys.arrows} {t.notes.keys.move} <Kbd>Esc</Kbd> {t.notes.keys.escape}{' '}
        <Kbd>Tab</Kbd> {t.notes.keys.leave}
      </KeyHint>
    </div>
  );
}

function ToolButton({
  label,
  children,
  onPress,
  onMouseDown,
}: {
  label: string;
  children: React.ReactNode;
  onPress: () => void;
  onMouseDown: (event: { preventDefault: () => void }) => void;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={label}
      title={label}
      onMouseDown={onMouseDown}
      onClick={onPress}
    >
      {children}
    </Button>
  );
}

/** Estado del guardado automático. Se anuncia con aria-live para el lector de pantalla */
function SaveState({ status, onRetry }: { status: SaveStatus; onRetry: () => void }) {
  const text =
    status === 'saved'
      ? t.notes.save.saved
      : status === 'saving'
        ? t.notes.save.saving
        : status === 'dirty'
          ? t.notes.save.dirty
          : t.notes.save.error;
  return (
    <span className="ml-auto flex items-center gap-2 pr-2 text-sm">
      <span
        role="status"
        className={cn(status === 'error' ? 'font-semibold text-danger' : 'text-fg-muted')}
      >
        {text}
      </span>
      {status === 'error' ? (
        <Button type="button" size="sm" variant="secondary" onClick={onRetry}>
          {t.notes.save.retry}
        </Button>
      ) : null}
    </span>
  );
}
