// El reparto de motivos de error por rama para Progreso (B5, comentario 2). Cada error cuenta una vez
// con el último motivo que marcó el alumno, y las causas de antes se leen con la tabla de 4.23. La
// rama sale de la pregunta o de la tarjeta del error. Sin React ni Dexie.
import type { AppEvent } from '@/data/schemas/events';
import {
  errorMotives,
  motivesByGroup,
  reportedMotives,
  type GroupMotives,
} from '@/engines/errorCauses';

/** El grupo de los errores cuya rama no se conoce, como una tarjeta sin tema */
export const NO_BRANCH = 'sin-rama';

/** La clave de un elemento con motivo, para buscar su rama */
export const motiveTargetKey = (kind: 'question' | 'card', id: string) => `${kind}|${id}`;

/** Los elementos con algún motivo marcado, para cargar sus ramas */
export function motiveTargets(events: readonly AppEvent[]): string[] {
  const keys = new Set<string>();
  for (const event of events) {
    if (event.type !== 'cause_reported') continue;
    keys.add(motiveTargetKey(event.payload.targetKind, event.payload.targetId));
  }
  return [...keys].sort();
}

/**
 * Motivos por rama, de la rama con más errores a la que menos. branches da la rama de cada elemento
 * por su clave. Las ramas que no se conocen van juntas al final
 */
export function motivesByBranch(
  events: readonly AppEvent[],
  branches: ReadonlyMap<string, string>,
): GroupMotives[] {
  const rows = motivesByGroup(
    reportedMotives(errorMotives(events)).flatMap((entry) =>
      entry.motive === null
        ? []
        : [
            {
              group: branches.get(motiveTargetKey(entry.kind, entry.targetId)) ?? NO_BRANCH,
              motive: entry.motive,
            },
          ],
    ),
  );
  return [
    ...rows.filter((row) => row.group !== NO_BRANCH),
    ...rows.filter((row) => row.group === NO_BRANCH),
  ];
}
