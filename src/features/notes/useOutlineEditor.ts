// Estado del editor de apuntes (D-092). Las líneas, el foco y las operaciones de estructura viven
// aquí y el guardado automático lo hace OutlineAutosaver, que guarda un instante después de que el
// alumno deja de escribir. Lo que escribe se queda en pantalla aunque el guardado falle.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useDataApi } from '@/data/context';
import { newId } from '@/data/ids';
import type { OutlineLine, OutlinePage } from '@/data/schemas/outlines';
import { saveOutline } from '@/data/usecases/outlines';
import {
  OUTLINE_LINES_MAX,
  analyzeOutline,
  indentLine,
  insertLineBelow,
  moveLine,
  outdentLine,
  removeLine,
  type OutlinePlan,
} from '@/engines/outline';
import { normalizeTags } from '@/engines/tagPath';
import type { ReadySession } from '../shared/RequireSession';
import { OutlineAutosaver, type SaveStatus } from './outlineAutosave';

export type { SaveStatus };

/** Cuánto espera el guardado automático después de la última tecla */
export const AUTOSAVE_MS = 900;

/** A qué línea y dónde poner el cursor después de un cambio. Cada pedido es un objeto nuevo */
export interface FocusRequest {
  id: string;
  /** Posición del cursor. 'end' es al final del texto */
  at: number | 'end';
}

const blankLine = (depth: number): OutlineLine => ({
  id: newId(),
  depth,
  text: '',
  noteId: null,
});

export function useOutlineEditor(session: ReadySession, page: OutlinePage) {
  const api = useDataApi();
  const [initial] = useState(() => (page.lines.length > 0 ? page.lines : [blankLine(0)]));
  const [lines, setLines] = useState<OutlineLine[]>(initial);
  const [tagsText, setTagsTextState] = useState(page.tags.join(' '));
  const [status, setStatus] = useState<SaveStatus>('saved');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set());
  const [focus, setFocus] = useState<FocusRequest | null>(null);
  const [saver] = useState(() => new OutlineAutosaver(AUTOSAVE_MS));
  // Lo más reciente que hay en pantalla. Los manejadores leen de aquí y no del estado, porque dos
  // cambios seguidos antes de pintar deben verse el uno al otro, y el guardado nunca ve algo viejo
  const linesRef = useRef<OutlineLine[]>(initial);
  const tagsRef = useRef<string[]>(normalizeTags(page.tags));

  const tags = useMemo(() => normalizeTags(tagsText.split(/\s+/)), [tagsText]);
  const plan: OutlinePlan = useMemo(() => analyzeOutline(lines, tags), [lines, tags]);

  const userId = session.user.id;
  // Se vuelve a configurar en cada pintura porque la API cambia de identidad, y eso no debe soltar
  // el guardador ni guardar antes de tiempo
  useEffect(() => {
    saver.configure({
      save: async (snapshot) => (await saveOutline(api, { id: userId }, page.id, snapshot)).page,
      onStatus: setStatus,
      // Se adoptan solo los IDs de nota. El texto sigue siendo el que el alumno tiene en pantalla
      onSaved: (saved) => {
        const noteIds = new Map(saved.lines.map((line) => [line.id, line.noteId] as const));
        const merged = linesRef.current.map((line) => {
          const noteId = noteIds.get(line.id);
          return noteId === undefined || noteId === line.noteId ? line : { ...line, noteId };
        });
        linesRef.current = merged;
        saver.setSnapshot({ lines: merged, tags: tagsRef.current });
        setLines(merged);
      },
    });
  }, [api, page.id, saver, userId]);

  // Al salir, o al ocultar la pestaña, se guarda lo pendiente
  useEffect(() => {
    saver.setSnapshot({ lines: linesRef.current, tags: tagsRef.current });
    const onHide = () => {
      if (document.visibilityState === 'hidden') void saver.flush();
    };
    document.addEventListener('visibilitychange', onHide);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      saver.dispose();
    };
  }, [saver]);

  const commit = (next: OutlineLine[]) => {
    linesRef.current = next;
    saver.setSnapshot({ lines: next, tags: tagsRef.current });
    setLines(next);
    setStatus('dirty');
    saver.touch();
  };
  const edit = (change: (current: OutlineLine[]) => OutlineLine[]) => {
    commit(change(linesRef.current));
  };

  const indexOf = (id: string) => linesRef.current.findIndex((line) => line.id === id);

  const setText = (id: string, text: string) => {
    edit((current) => current.map((line) => (line.id === id ? { ...line, text } : line)));
  };

  /** Línea nueva debajo de la actual. Si se pasa split, parte el texto en el cursor */
  const addBelow = (id: string, split?: { before: string; after: string }) => {
    const index = indexOf(id);
    if (index < 0 || linesRef.current.length >= OUTLINE_LINES_MAX) return;
    const created = blankLine(0);
    edit((current) => {
      const at = current.findIndex((line) => line.id === id);
      const inserted = insertLineBelow(current, at, (depth) => ({
        ...created,
        depth,
        text: split?.after ?? '',
      }));
      return inserted.lines.map((line) =>
        split && line.id === id ? { ...line, text: split.before } : line,
      );
    });
    setFocus({ id: created.id, at: 0 });
  };

  const restructure = (
    id: string,
    change: (current: OutlineLine[], index: number) => OutlineLine[],
  ) => {
    const index = indexOf(id);
    if (index < 0) return;
    edit((current) =>
      change(
        current,
        current.findIndex((line) => line.id === id),
      ),
    );
    setFocus({ id, at: 'end' });
  };
  const indent = (id: string) => {
    restructure(id, (current, index) => indentLine(current, index));
  };
  const outdent = (id: string) => {
    restructure(id, (current, index) => outdentLine(current, index));
  };
  const move = (id: string, direction: -1 | 1) => {
    restructure(id, (current, index) => moveLine(current, index, direction).lines);
  };

  const remove = (id: string) => {
    const index = indexOf(id);
    if (index < 0) return;
    if (linesRef.current.length === 1) {
      // La última línea no se quita, solo se vacía
      setText(id, '');
      return;
    }
    const target = linesRef.current[index > 0 ? index - 1 : index + 1];
    edit((current) =>
      removeLine(
        current,
        current.findIndex((line) => line.id === id),
      ),
    );
    if (target) setFocus({ id: target.id, at: 'end' });
  };

  const toggleCollapsed = (id: string) => {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return {
    lines,
    plan,
    tagsText,
    setTagsText: (value: string) => {
      setTagsTextState(value);
      tagsRef.current = normalizeTags(value.split(/\s+/));
      saver.setSnapshot({ lines: linesRef.current, tags: tagsRef.current });
      setStatus('dirty');
      saver.touch();
    },
    status,
    activeId,
    setActiveId,
    collapsed,
    toggleCollapsed,
    focus,
    requestFocus: setFocus,
    setText,
    addBelow,
    indent,
    outdent,
    move,
    remove,
    flush: () => saver.flush(),
  };
}
