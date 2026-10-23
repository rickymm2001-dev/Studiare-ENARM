// Lo que pide un botón de la pantalla Mazos al abrir Repasar (V4-B3). Repasar este mazo y Estudiar un
// tema abren Repasar con ese mazo ya elegido, pero eso es una petición de una sola vez. No se escribe en
// la selección que Repasar recuerda en este dispositivo (D-072), porque pisaría los mazos y los temas que
// el alumno tenía elegidos y mañana Repasar abriría en el modo por tema sin que él lo hubiera pedido.
// La petición viaja en el estado de la ruta, Repasar la lee al abrir y la suelta al salir.
import { useEffect, useState } from 'react';
import { useLocation } from 'react-router';
import type { ReviewMode, ReviewSelection } from './selection';

export interface ReviewPreset {
  mode: ReviewMode;
  /** El mazo por el que Repasar elige y cuenta */
  unitId: string;
}

/** Los modos que piden los botones de Mazos. Los demás los elige el alumno dentro de Repasar */
const PRESET_MODES: readonly ReviewMode[] = ['today', 'topic'];

/** Lo que va en el estado de la ruta al navegar a Repasar */
export function reviewPresetState(preset: ReviewPreset): { reviewPreset: ReviewPreset } {
  return { reviewPreset: preset };
}

/** La petición que trae el estado de una ruta. null si no trae ninguna o no es válida */
export function presetFromRouteState(state: unknown): ReviewPreset | null {
  if (typeof state !== 'object' || state === null || !('reviewPreset' in state)) return null;
  const { reviewPreset } = state;
  if (typeof reviewPreset !== 'object' || reviewPreset === null) return null;
  const { mode, unitId } = reviewPreset as Partial<Record<keyof ReviewPreset, unknown>>;
  if (typeof unitId !== 'string' || unitId === '' || unitId.length > 100) return null;
  if (!PRESET_MODES.some((allowed) => allowed === mode)) return null;
  return { mode: mode as ReviewMode, unitId };
}

/**
 * La petición en curso y la selección que Repasar armó con ella. Vive en memoria y no en este
 * dispositivo, así que recargar la pestaña o abrir Repasar desde el menú la deja atrás
 */
let current: { preset: ReviewPreset; built: ReviewSelection | null } | null = null;

export function activeReviewPreset(): ReviewPreset | null {
  return current?.preset ?? null;
}

export function setReviewPreset(next: ReviewPreset | null): void {
  if (next === null) {
    current = null;
    return;
  }
  // Pedir lo mismo otra vez, como al montar de nuevo bajo StrictMode, no borra lo que ya se armó
  if (current?.preset.mode === next.mode && current.preset.unitId === next.unitId) return;
  current = { preset: next, built: null };
}

/** Repasar avisa qué selección armó con la petición, para reconocerla al empezar */
export function rememberBuiltSelection(selection: ReviewSelection): void {
  if (current) current.built = selection;
}

const sameSet = (a: ReadonlySet<string>, b: ReadonlySet<string>) =>
  a.size === b.size && [...a].every((item) => b.has(item));

/**
 * Cierra la petición cuando el alumno empieza a repasar. Dice si empezó justo con lo que la petición
 * armó, y entonces la sesión es de una sola vez y no debe guardarse como su selección. Si cambió algo
 * antes de empezar, eso sí es una elección suya y se guarda como siempre
 */
export function finishReviewPreset(selection: ReviewSelection): boolean {
  const built = current?.built ?? null;
  current = null;
  return (
    built !== null &&
    built.mode === selection.mode &&
    built.includeUntagged === selection.includeUntagged &&
    sameSet(built.decks, selection.decks) &&
    sameSet(built.topics, selection.topics)
  );
}

/**
 * Lee la petición del estado de la ruta al abrir Repasar. Se pone al renderizar, antes de que la
 * selección se arme, y se suelta al salir, así no se queda esperando a la próxima vez
 */
export function useReviewPresetFromRoute(): void {
  const location = useLocation();
  const [preset] = useState(() => {
    const routeState: unknown = location.state;
    const fromRoute = presetFromRouteState(routeState);
    setReviewPreset(fromRoute);
    return fromRoute;
  });
  useEffect(() => {
    setReviewPreset(preset);
    return () => {
      setReviewPreset(null);
    };
  }, [preset]);
}
