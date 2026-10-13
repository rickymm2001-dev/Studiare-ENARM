// El esquema del apunte (B6 del plan del cambio, respuesta 74). Lista sus secciones, que son las
// líneas con líneas debajo, hasta tres niveles. Tocar una lleva el cursor a esa línea del editor.
import { useMemo } from 'react';
import type { OutlineNode } from '@/engines/outline';
import { countSections, outlineStructure, type StructureEntry } from '@/engines/outlineSearch';
import { t } from '@/i18n/es-MX';
import { Disclosure } from '@/ui/components/disclosure';

const SHORT = 80;
const shorten = (text: string) => (text.length <= SHORT ? text : `${text.slice(0, SHORT - 1)}…`);

export function OutlineStructure({
  nodes,
  onJump,
}: {
  nodes: readonly OutlineNode[];
  onJump: (nodeId: string) => void;
}) {
  const text = t.outlines.structure;
  const entries = useMemo(() => outlineStructure(nodes), [nodes]);
  const total = countSections(entries);
  return (
    <Disclosure title={text.title} summary={text.summary(total)}>
      {total === 0 ? (
        <p className="text-sm text-fg-muted">{text.empty}</p>
      ) : (
        <nav aria-label={text.label}>
          <Entries entries={entries} onJump={onJump} />
        </nav>
      )}
    </Disclosure>
  );
}

function Entries({
  entries,
  onJump,
}: {
  entries: readonly StructureEntry[];
  onJump: (nodeId: string) => void;
}) {
  return (
    <ul className="flex flex-col">
      {entries.map((entry) => (
        <li key={entry.nodeId} className="flex flex-col">
          <button
            type="button"
            className="min-h-touch rounded-md px-2 py-2 text-left text-sm break-words hover:bg-muted"
            onClick={() => {
              onJump(entry.nodeId);
            }}
          >
            {shorten(entry.text)}
          </button>
          {entry.children.length > 0 ? (
            <div className="border-l border-line pl-3">
              <Entries entries={entry.children} onJump={onJump} />
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
