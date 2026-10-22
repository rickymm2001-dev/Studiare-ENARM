// La máquina del recorrido guiado (B15, 4.2 a 4.5 del plan de B15)
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { ANALYTICS_EVENTS, sanitizeEvent } from '@/data/analytics/catalog';
import { SCREENS } from '@/app/screens';
import {
  IDLE,
  STEP_SPECS,
  TOUR_LENGTH,
  anchorOf,
  measurementsOf,
  progressOf,
  screenOf,
  stepOf,
  tourReducer,
  type NavLayout,
  type TourAction,
  type TourState,
} from './tourMachine';
import { TOUR_STEPS } from './steps';

const run = (actions: TourAction[], from: TourState = IDLE): TourState =>
  actions.reduce(tourReducer, from);
const START: TourAction = { type: 'start', trigger: 'auto' };
const NEXT: TourAction = { type: 'next' };
const BACK: TourAction = { type: 'back' };
const SKIP: TourAction = { type: 'skip' };

describe('avance del recorrido', () => {
  it('antes de empezar ninguna acción hace nada', () => {
    for (const action of [NEXT, BACK, SKIP]) expect(tourReducer(IDLE, action)).toBe(IDLE);
    expect(stepOf(IDLE)).toBeNull();
  });

  it('empieza en la bienvenida, con el modo en que empezó', () => {
    const state = tourReducer(IDLE, { type: 'start', trigger: 'settings' });
    expect(state).toEqual({ status: 'running', index: 0, trigger: 'settings' });
    expect(stepOf(state)).toBe('welcome');
  });

  it('Siguiente recorre los ocho pasos en orden y en el último termina', () => {
    let state = run([START]);
    const seen = [stepOf(state)];
    for (let index = 1; index < TOUR_LENGTH; index += 1) {
      state = tourReducer(state, NEXT);
      seen.push(stepOf(state));
    }
    expect(seen).toEqual([...TOUR_STEPS]);
    expect(state).toEqual({ status: 'running', index: 7, trigger: 'auto' });
    expect(tourReducer(state, NEXT)).toEqual({
      status: 'ended',
      outcome: 'completed',
      index: 7,
      trigger: 'auto',
    });
  });

  it('Atrás vuelve un paso y en el primero no hace nada', () => {
    const first = run([START]);
    expect(tourReducer(first, BACK)).toBe(first);
    const third = run([START, NEXT, NEXT]);
    expect(run([BACK], third)).toEqual({ status: 'running', index: 1, trigger: 'auto' });
  });

  it('Saltar introducción termina en cualquier paso, en el paso donde se saltó', () => {
    for (let index = 0; index < TOUR_LENGTH; index += 1) {
      const state = run([START, ...Array.from({ length: index }, () => NEXT), SKIP]);
      expect(state).toEqual({ status: 'ended', outcome: 'skipped', index, trigger: 'auto' });
    }
  });

  it('lo que ya terminó no avanza ni retrocede, pero se puede empezar otra vez desde el primer paso', () => {
    const skipped = run([START, NEXT, SKIP]);
    for (const action of [NEXT, BACK, SKIP]) expect(tourReducer(skipped, action)).toBe(skipped);
    expect(run([{ type: 'start', trigger: 'settings' }], skipped)).toEqual({
      status: 'running',
      index: 0,
      trigger: 'settings',
    });
  });

  it('empezar cuando ya va en marcha no lo reinicia', () => {
    const third = run([START, NEXT, NEXT]);
    expect(tourReducer(third, { type: 'start', trigger: 'settings' })).toBe(third);
  });

  it('con cualquier secuencia de acciones el paso siempre existe y lo terminado no se mueve', () => {
    const action = fc.constantFrom<TourAction>(START, NEXT, BACK, SKIP, {
      type: 'start',
      trigger: 'settings',
    });
    fc.assert(
      fc.property(fc.array(action, { maxLength: 40 }), (actions) => {
        let state: TourState = IDLE;
        for (const each of actions) {
          const next = tourReducer(state, each);
          if (next.status !== 'idle') {
            expect(next.index).toBeGreaterThanOrEqual(0);
            expect(next.index).toBeLessThan(TOUR_LENGTH);
            expect(stepOf(next)).not.toBeNull();
          }
          if (state.status === 'ended' && each.type !== 'start') expect(next).toBe(state);
          state = next;
        }
      }),
    );
  });

  it('el avance dice cuántos pasos van, desde dónde se puede volver y cuándo es el último', () => {
    expect(progressOf(0)).toEqual({ number: 1, total: 8, canGoBack: false, isLast: false });
    expect(progressOf(1).canGoBack).toBe(true);
    expect(progressOf(6).isLast).toBe(false);
    expect(progressOf(7)).toEqual({ number: 8, total: 8, canGoBack: true, isLast: true });
  });
});

describe('pantalla y ancla de cada paso', () => {
  it('cada paso tiene su pantalla, que existe', () => {
    expect(Object.keys(STEP_SPECS)).toEqual([...TOUR_STEPS]);
    for (const step of TOUR_STEPS) expect(Object.keys(SCREENS)).toContain(screenOf(step));
    expect(TOUR_STEPS.map(screenOf)).toEqual([
      'home',
      'home',
      'review',
      'outlines',
      'simulatorSetup',
      'progress',
      'party',
      'settings',
    ]);
  });

  it('en computadora señala el riel, con el engrane de Configuración al final', () => {
    expect(TOUR_STEPS.map((step) => anchorOf(step, 'rail'))).toEqual([
      null,
      'nav-home',
      'nav-review',
      'nav-outlines',
      'nav-simulatorSetup',
      'nav-progress',
      'nav-party',
      'nav-settings',
    ]);
  });

  it('en el teléfono señala la barra de abajo y, para lo que vive en Más, Más', () => {
    expect(TOUR_STEPS.map((step) => anchorOf(step, 'bar'))).toEqual([
      null,
      'nav-home',
      'nav-review',
      'nav-more',
      'nav-simulatorSetup',
      'nav-progress',
      'nav-more',
      'nav-more',
    ]);
  });

  it('la bienvenida va al centro en los dos menús', () => {
    for (const layout of ['rail', 'bar'] as const satisfies NavLayout[]) {
      expect(anchorOf('welcome', layout)).toBeNull();
    }
  });

  it('el alumno, el admin y el dueño tienen el menú del alumno y el médico no, así que va al centro', () => {
    for (const role of ['student', 'admin', 'owner'] as const) {
      expect(anchorOf('review', 'rail', role)).toBe('nav-review');
    }
    expect(anchorOf('review', 'rail', 'physician')).toBeNull();
    expect(anchorOf('settings', 'bar', 'physician')).toBeNull();
  });
});

describe('medición del recorrido', () => {
  it('empezar mide tour_started con cómo empezó y el primer paso visto', () => {
    const started = run([{ type: 'start', trigger: 'settings' }]);
    expect(measurementsOf(IDLE, started)).toEqual([
      { event: 'tour_started', props: { trigger: 'settings' } },
      { event: 'tour_step_viewed', props: { step: 'welcome' } },
    ]);
  });

  it('cada paso nuevo mide tour_step_viewed, adelante y atrás', () => {
    const first = run([START]);
    const second = tourReducer(first, NEXT);
    expect(measurementsOf(first, second)).toEqual([
      { event: 'tour_step_viewed', props: { step: 'home' } },
    ]);
    expect(measurementsOf(second, tourReducer(second, BACK))).toEqual([
      { event: 'tour_step_viewed', props: { step: 'welcome' } },
    ]);
  });

  it('terminar mide tour_completed en el último paso y saltar mide tour_skipped donde se saltó', () => {
    const last = run([START, ...Array.from({ length: 7 }, () => NEXT)]);
    expect(measurementsOf(last, tourReducer(last, NEXT))).toEqual([
      { event: 'tour_completed', props: { step: 'settings' } },
    ]);
    const third = run([START, NEXT, NEXT]);
    expect(measurementsOf(third, tourReducer(third, SKIP))).toEqual([
      { event: 'tour_skipped', props: { step: 'review' } },
    ]);
  });

  it('lo que no cambia nada no mide nada', () => {
    const first = run([START]);
    expect(measurementsOf(first, tourReducer(first, BACK))).toEqual([]);
    expect(measurementsOf(IDLE, tourReducer(IDLE, NEXT))).toEqual([]);
    const ended = run([START, SKIP]);
    expect(measurementsOf(ended, tourReducer(ended, NEXT))).toEqual([]);
  });

  it('todo lo que mide cumple las listas cerradas del catálogo, sin ningún texto libre', () => {
    const events: ReturnType<typeof measurementsOf> = [];
    let state: TourState = IDLE;
    for (const action of [
      START,
      NEXT,
      NEXT,
      BACK,
      ...Array.from({ length: 8 }, () => NEXT),
    ] satisfies TourAction[]) {
      const next = tourReducer(state, action);
      events.push(...measurementsOf(state, next));
      state = next;
    }
    for (const trigger of ['auto', 'settings'] as const) {
      events.push(...measurementsOf(IDLE, tourReducer(IDLE, { type: 'start', trigger })));
    }
    events.push(...measurementsOf(run([START, NEXT]), run([START, NEXT, SKIP])));
    expect(events.length).toBeGreaterThan(10);
    for (const { event, props } of events) {
      expect(Object.keys(ANALYTICS_EVENTS)).toContain(event);
      expect(sanitizeEvent(event, props), event).toEqual(props);
    }
  });
});
