// Cómo encuentra el recorrido lo que señala cada paso (B15, 4.2 del plan de B15). Cada paso navega a su
// pantalla y espera hasta 3 segundos a que aparezca su ancla. Si no la encuentra, o está escondida, el
// paso se muestra al centro y no se rompe nada. Estas funciones solo miran el documento. Quien espera y
// vuelve a mirar es Tour.tsx.
import type { Role } from '@/data/schemas/common';
import { TOUR_NAV_ATTRIBUTE, TOUR_SCREEN_ATTRIBUTE, type TourStep } from './steps';
import { anchorOf, screenOf, type NavLayout } from './tourMachine';

/** Lo más que espera el ancla de un paso, en milisegundos (4.2) */
export const ANCHOR_WAIT_MS = 3000;
/** Cada cuánto vuelve a mirar mientras espera */
export const ANCHOR_POLL_MS = 50;

export interface StepProbe {
  /**
   * none, el paso va al centro por diseño. found, el ancla está a la vista. hidden, existe pero no se ve,
   * como el riel oculto con el botón del menú. missing, todavía no existe
   */
  anchor: 'none' | 'found' | 'hidden' | 'missing';
  element: HTMLElement | null;
  /** Ya está pintado el encabezado de la pantalla del paso */
  screenReady: boolean;
}

/** Si el elemento ocupa lugar en la página y no está escondido */
export function isShown(element: HTMLElement): boolean {
  if (element.getClientRects().length === 0) return false;
  const style = getComputedStyle(element);
  return style.visibility !== 'hidden' && style.display !== 'none';
}

/** Mira el documento y dice qué hay de lo que pide el paso */
export function probeStep(
  step: TourStep,
  layout: NavLayout,
  role: Role,
  root: ParentNode = document,
): StepProbe {
  const anchor = anchorOf(step, layout, role);
  const screenReady = root.querySelector(`[${TOUR_SCREEN_ATTRIBUTE}="${screenOf(step)}"]`) !== null;
  if (anchor === null) return { anchor: 'none', element: null, screenReady };
  const element = root.querySelector<HTMLElement>(`[${TOUR_NAV_ATTRIBUTE}="${anchor}"]`);
  if (element === null) return { anchor: 'missing', element: null, screenReady };
  return isShown(element)
    ? { anchor: 'found', element, screenReady }
    : { anchor: 'hidden', element: null, screenReady };
}

/**
 * Si ya se puede mostrar el paso. Cuando existe el ancla, o el paso no la lleva, y la pantalla ya pintó su
 * encabezado. Al pasar ANCHOR_WAIT_MS se muestra con lo que haya, al centro si falta el ancla
 */
export function stepIsReady(probe: StepProbe, waitedMs: number): boolean {
  return (probe.anchor !== 'missing' && probe.screenReady) || waitedMs >= ANCHOR_WAIT_MS;
}

/** El elemento que se resalta, o null si el paso va al centro */
export const targetOf = (probe: StepProbe): HTMLElement | null =>
  probe.anchor === 'found' ? probe.element : null;
