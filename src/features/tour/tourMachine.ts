// La máquina de estados del recorrido guiado (B15, 4.2 a 4.5 del plan de B15). Pura, sin React, sin DOM y
// sin tiempo. Dice en qué paso va el alumno, qué pasa con Siguiente, Atrás, Saltar introducción y Terminar,
// qué pantalla y qué ancla usa cada paso según el ancho y el rol, y qué eventos de medición deja cada
// cambio. Lo demás (navegar, buscar el ancla, pintar el globo) lo hace Tour.tsx con esto como guía.
import type { ScreenKey } from '@/app/screens';
import type { AnalyticsEvent, PropsOf } from '@/data/analytics/catalog';
import type { Role } from '@/data/schemas/common';
import { NAV_MORE_ANCHOR } from './anchors';
import { TOUR_STEPS, type TourStep } from './steps';

/** Cómo empezó el recorrido. auto es al terminar el registro y settings es Ver el recorrido de Configuración */
export type TourTrigger = PropsOf<'tour_started'>['trigger'];

/** Cuántos pasos tiene el recorrido */
export const TOUR_LENGTH = TOUR_STEPS.length;

// ===================================================================== Pasos, pantallas y anclas

/**
 * El menú que se ve. rail es el riel lateral de computadora (desde 1024 px) y bar es la barra de abajo del
 * teléfono y de la tableta, donde Apuntes, Party y Configuración viven en Más
 */
export type NavLayout = 'rail' | 'bar';

interface StepSpec {
  /** La pantalla a la que navega el paso. Su encabezado lleva data-tour-screen con esta clave */
  screen: ScreenKey;
  /** El data-tour de la sección del menú que señala, o null si el paso va al centro */
  anchor: Readonly<Record<NavLayout, string | null>>;
}

/** Cada paso con su pantalla y su ancla en computadora y en el teléfono (4.2) */
export const STEP_SPECS: Readonly<Record<TourStep, StepSpec>> = {
  welcome: { screen: 'home', anchor: { rail: null, bar: null } },
  home: { screen: 'home', anchor: { rail: 'nav-home', bar: 'nav-home' } },
  review: { screen: 'review', anchor: { rail: 'nav-review', bar: 'nav-review' } },
  outlines: { screen: 'outlines', anchor: { rail: 'nav-outlines', bar: NAV_MORE_ANCHOR } },
  simulator: {
    screen: 'simulatorSetup',
    anchor: { rail: 'nav-simulatorSetup', bar: 'nav-simulatorSetup' },
  },
  progress: { screen: 'progress', anchor: { rail: 'nav-progress', bar: 'nav-progress' } },
  party: { screen: 'party', anchor: { rail: 'nav-party', bar: NAV_MORE_ANCHOR } },
  // En computadora es el engrane de Configuración, fijo abajo del riel
  settings: { screen: 'settings', anchor: { rail: 'nav-settings', bar: NAV_MORE_ANCHOR } },
};

/** Los roles cuyo menú tiene las secciones del alumno. El del médico es otro, y el recorrido no es suyo (8.18) */
const ROLES_WITH_STUDENT_MENU: readonly Role[] = ['student', 'admin', 'owner'];

/** La pantalla que abre el paso */
export const screenOf = (step: TourStep): ScreenKey => STEP_SPECS[step].screen;

/**
 * El data-tour del elemento que señala el paso, o null si va al centro. Depende del menú que se ve y del
 * rol, porque el menú de un médico no tiene estas secciones
 */
export function anchorOf(step: TourStep, layout: NavLayout, role: Role = 'student'): string | null {
  return ROLES_WITH_STUDENT_MENU.includes(role) ? STEP_SPECS[step].anchor[layout] : null;
}

// ===================================================================== Estados y transiciones

export type TourState =
  | { status: 'idle' }
  | { status: 'running'; index: number; trigger: TourTrigger }
  /** Terminó (Terminar en el último paso) o saltó (Saltar introducción o Escape) en el paso index */
  | { status: 'ended'; outcome: 'completed' | 'skipped'; index: number; trigger: TourTrigger };

export type TourAction =
  { type: 'start'; trigger: TourTrigger } | { type: 'next' } | { type: 'back' } | { type: 'skip' };

export const IDLE: TourState = { status: 'idle' };

/**
 * El estado que sigue. Devuelve el mismo objeto si la acción no hace nada, por ejemplo Atrás en el primer
 * paso, cualquier cosa antes de empezar o empezar cuando ya va en marcha, así quien lo usa sabe que no pasó
 * nada. Empezar después de terminar o de saltar arranca otra vez en el primer paso
 */
export function tourReducer(state: TourState, action: TourAction): TourState {
  if (action.type === 'start') {
    return state.status === 'running'
      ? state
      : { status: 'running', index: 0, trigger: action.trigger };
  }
  if (state.status !== 'running') return state;
  switch (action.type) {
    case 'next':
      return state.index >= TOUR_LENGTH - 1
        ? { status: 'ended', outcome: 'completed', index: state.index, trigger: state.trigger }
        : { ...state, index: state.index + 1 };
    case 'back':
      return state.index === 0 ? state : { ...state, index: state.index - 1 };
    case 'skip':
      return { status: 'ended', outcome: 'skipped', index: state.index, trigger: state.trigger };
  }
}

/** El paso en que está el estado, o null si no ha empezado */
export function stepOf(state: TourState): TourStep | null {
  return state.status === 'idle' ? null : (TOUR_STEPS[state.index] ?? null);
}

/** Lo que dice el globo del avance. number empieza en 1 */
export function progressOf(index: number) {
  return {
    number: index + 1,
    total: TOUR_LENGTH,
    /** Atrás se ve desde el segundo paso */
    canGoBack: index > 0,
    /** En el último paso Siguiente dice Terminar */
    isLast: index >= TOUR_LENGTH - 1,
  };
}

// ===================================================================== Medición

/** Un evento de medición del recorrido, con las propiedades de su lista cerrada (4.5) */
export type TourMeasurement = {
  [E in Extract<AnalyticsEvent, `tour_${string}`>]: { event: E; props: PropsOf<E> };
}[Extract<AnalyticsEvent, `tour_${string}`>];

/**
 * Los eventos que deja pasar de un estado al otro. Empezar mide tour_started y el primer paso visto, cada
 * paso nuevo mide tour_step_viewed, terminar mide tour_completed y saltar mide tour_skipped con el paso donde
 * se saltó. Quien los manda es track, que sin el permiso Medición de uso no deja salir nada (1.1)
 */
export function measurementsOf(previous: TourState, next: TourState): TourMeasurement[] {
  if (next === previous || next.status === 'idle') return [];
  const step = stepOf(next);
  if (step === null) return [];
  if (next.status === 'ended') {
    return [
      next.outcome === 'completed'
        ? { event: 'tour_completed', props: { step } }
        : { event: 'tour_skipped', props: { step } },
    ];
  }
  const viewed: TourMeasurement = { event: 'tour_step_viewed', props: { step } };
  if (previous.status !== 'running') {
    return [{ event: 'tour_started', props: { trigger: next.trigger } }, viewed];
  }
  return previous.index === next.index ? [] : [viewed];
}
