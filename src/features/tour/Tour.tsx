// El recorrido guiado (B15, 4.1 a 4.5 del plan de B15). Une la máquina de estados (tourMachine.ts) con la
// navegación, la búsqueda del ancla de cada paso (stepTarget.ts) y el globo (TourOverlay.tsx). Se carga con
// lazy desde TourLauncher solo cuando el recorrido empieza, así no pesa en el JavaScript inicial.
//
// Cada paso navega a su pantalla, espera hasta 3 segundos su ancla y muestra el globo junto a ella, o al
// centro si no la encuentra. Mientras llega el paso siguiente se queda el globo del anterior, para que la
// pantalla no quede sin explicación. Al terminar o saltar el alumno queda como visto en este navegador,
// vuelve a Inicio y el foco queda en su título. Cada cambio de paso se mide con track, que sin el permiso
// Medición de uso no deja salir nada.
import { useCallback, useEffect, useRef, useState } from 'react';
import { usePreferences } from '@/app/preferences';
import { screenPath } from '@/app/screens';
import { track } from '@/data/analytics/catalog';
import { DESKTOP_QUERY, useMediaQuery } from '@/ui/hooks/use-media-query';
import { TOUR_SCREEN_ATTRIBUTE } from './steps';
import { ANCHOR_POLL_MS, probeStep, stepIsReady, targetOf } from './stepTarget';
import {
  IDLE,
  measurementsOf,
  screenOf,
  stepOf,
  tourReducer,
  type NavLayout,
  type TourAction,
  type TourMeasurement,
  type TourState,
  type TourTrigger,
} from './tourMachine';
import { markTourHandled } from './tourState';
import { TourOverlay } from './TourOverlay';

/** Desde este ancho el globo deja de ser una hoja abajo. Es el sm de Tailwind (4.3) */
const WIDE_QUERY = '(min-width: 40rem)';

/**
 * Cómo navega el recorrido. Es la función de react-router, que le pasa TourLauncher. El recorrido diferido no
 * importa react-router por su cuenta, porque en el build un módulo nuevo que lo importe parte el JavaScript
 * inicial en más archivos y lo comprime peor (npm run budget)
 */
export type TourNavigate = (to: string) => void | Promise<void>;

export interface TourProps {
  /** Cómo empezó. auto es al terminar el registro y settings es Ver el recorrido de Configuración */
  trigger: TourTrigger;
  /** El alumno, para dejarlo como visto en este navegador al terminar */
  userId: string;
  /** Terminó o saltó. Quien montó el recorrido lo quita */
  onDone: () => void;
  /** La ruta de ahora, sin la base de la app */
  pathname: string;
  navigate: TourNavigate;
}

/** Lo que muestra el globo ahora. Es el último paso que ya encontró su ancla */
interface Shown {
  key: string;
  index: number;
  element: HTMLElement | null;
}

const NEXT: TourAction = { type: 'next' };
const BACK: TourAction = { type: 'back' };
const SKIP: TourAction = { type: 'skip' };

/** Manda a medir lo que dejó un cambio. Solo sale con el permiso, y un error de medición no rompe nada */
function emit(measurements: readonly TourMeasurement[]): void {
  for (const measurement of measurements) {
    switch (measurement.event) {
      case 'tour_started':
        track(measurement.event, measurement.props);
        break;
      case 'tour_step_viewed':
        track(measurement.event, measurement.props);
        break;
      case 'tour_completed':
        track(measurement.event, measurement.props);
        break;
      case 'tour_skipped':
        track(measurement.event, measurement.props);
        break;
    }
  }
}

/**
 * Lleva el foco al título de Inicio al terminar (4.2). La pantalla puede estar cargando, así que espera
 * hasta 3 segundos a que aparezca. Es una función suelta porque el recorrido ya se desmontó cuando corre
 */
function focusHomeTitle(): void {
  let tries = 0;
  const attempt = () => {
    const title = document.querySelector<HTMLElement>(`[${TOUR_SCREEN_ATTRIBUTE}="home"] h1`);
    if (title) {
      title.focus();
      return;
    }
    tries += 1;
    if (tries < 60) window.setTimeout(attempt, ANCHOR_POLL_MS);
  };
  window.setTimeout(attempt, 0);
}

export function Tour({ trigger, userId, onDone, pathname, navigate }: TourProps) {
  const role = usePreferences((state) => state.role);
  const rail = useMediaQuery(DESKTOP_QUERY);
  const wide = useMediaQuery(WIDE_QUERY);
  const layout: NavLayout = rail ? 'rail' : 'bar';

  const [state, setState] = useState<TourState>(() =>
    tourReducer(IDLE, { type: 'start', trigger }),
  );
  const [shown, setShown] = useState<Shown | null>(null);
  // Siempre el estado más nuevo, para que dos clics seguidos no se pisen antes de pintar
  const latest = useRef(state);
  const startMeasured = useRef(false);
  const navigatedFor = useRef(-1);

  // tour_started y el primer paso visto. La marca evita medirlos dos veces en desarrollo
  useEffect(() => {
    if (startMeasured.current) return;
    startMeasured.current = true;
    emit(measurementsOf(IDLE, latest.current));
  }, []);

  const act = useCallback(
    (action: TourAction) => {
      const previous = latest.current;
      const next = tourReducer(previous, action);
      if (next === previous) return;
      latest.current = next;
      emit(measurementsOf(previous, next));
      setState(next);
      if (next.status === 'ended') {
        // Terminó o saltó. Queda como visto, vuelve a Inicio y el foco va a su título (4.2)
        markTourHandled(userId);
        void navigate(screenPath('home'));
        onDone();
        focusHomeTitle();
      }
    },
    [navigate, onDone, userId],
  );

  const running = state.status === 'running';
  const index = state.status === 'running' ? state.index : -1;
  const step = state.status === 'running' ? stepOf(state) : null;

  // Cada paso navega a su pantalla. Una sola vez por paso, aunque el alumno cambie de ruta por su cuenta
  useEffect(() => {
    if (step === null || navigatedFor.current === index) return;
    navigatedFor.current = index;
    const path = screenPath(screenOf(step));
    if (pathname !== path) void navigate(path);
  }, [step, index, pathname, navigate]);

  // Espera la pantalla y el ancla del paso, hasta 3 segundos, y entonces muestra el globo
  useEffect(() => {
    if (step === null) return;
    const key = `${String(index)}:${layout}:${role}`;
    const startedAt = Date.now();
    let timer = 0;
    let cancelled = false;
    const attempt = () => {
      if (cancelled) return;
      const probe = probeStep(step, layout, role);
      if (stepIsReady(probe, Date.now() - startedAt)) {
        const element = targetOf(probe);
        element?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        setShown({ key, index, element });
        return;
      }
      timer = window.setTimeout(attempt, ANCHOR_POLL_MS);
    };
    timer = window.setTimeout(attempt, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [step, index, layout, role]);

  if (!running || shown === null) return null;
  return (
    <TourOverlay
      key={shown.key}
      index={shown.index}
      target={shown.element}
      layout={layout}
      phone={!wide}
      onNext={() => {
        act(NEXT);
      }}
      onBack={() => {
        act(BACK);
      }}
      onSkip={() => {
        act(SKIP);
      }}
    />
  );
}
