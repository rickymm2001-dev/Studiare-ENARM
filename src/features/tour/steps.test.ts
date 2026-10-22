// @vitest-environment jsdom
// Las claves del recorrido y su estado en el navegador (B15, 4.1, 4.2 y 7.5 del plan de B15)
import { describe, expect, it, vi } from 'vitest';
import { SCREENS } from '@/app/screens';
import {
  TOUR_AUTO_OFFER_OFF,
  TOUR_NAV_ATTRIBUTE,
  TOUR_SCREEN_ATTRIBUTE,
  TOUR_STEPS,
  TOUR_STORAGE_KEY,
  markTourPending,
  parseTourState,
  readTourState,
  withHandled,
  withPending,
  writeTourState,
  type TourStoredState,
} from './steps';

/** Un almacenamiento en memoria, con la forma que usan el lector y el escritor */
function memoryStorage(initial?: string) {
  const values = new Map<string, string>();
  if (initial !== undefined) values.set(TOUR_STORAGE_KEY, initial);
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    values,
  };
}

describe('pasos del recorrido', () => {
  it('son ocho, en el orden del plan, y el primero es la bienvenida', () => {
    expect([...TOUR_STEPS]).toEqual([
      'welcome',
      'home',
      'review',
      'outlines',
      'simulator',
      'progress',
      'party',
      'settings',
    ]);
  });

  it('los pasos con pantalla se llaman como la clave de su pantalla', () => {
    // welcome es al centro y simulator es la pantalla simulatorSetup. Los demás son una pantalla
    const screens = ['home', 'review', 'outlines', 'progress', 'party', 'settings'];
    for (const step of screens) expect(Object.keys(SCREENS)).toContain(step);
    expect(Object.keys(SCREENS)).toContain('simulatorSetup');
  });

  it('las anclas y la clave del estado son las del plan', () => {
    expect(TOUR_SCREEN_ATTRIBUTE).toBe('data-tour-screen');
    expect(TOUR_NAV_ATTRIBUTE).toBe('data-tour');
    expect(TOUR_STORAGE_KEY).toBe('enarm.tour.v1');
  });

  it('el estado que dejan las e2e apaga que aparezca solo y no marca a nadie como visto', () => {
    expect(TOUR_AUTO_OFFER_OFF).toEqual({ handled: [], autoOffer: false });
    // Es JSON puro, para escribirlo en localStorage tal cual
    expect(JSON.parse(JSON.stringify(TOUR_AUTO_OFFER_OFF))).toEqual(TOUR_AUTO_OFFER_OFF);
  });
});

describe('lo que el navegador recuerda del recorrido', () => {
  it('sin nada guardado el recorrido puede ofrecerse solo y nadie está visto', () => {
    expect(parseTourState(null)).toEqual({ handled: [], autoOffer: true });
    expect(readTourState(memoryStorage())).toEqual({ handled: [], autoOffer: true });
    expect(readTourState(undefined)).toEqual({ handled: [], autoOffer: true });
  });

  it('entiende el estado de las e2e tal cual, como no ofrecer solo', () => {
    // Es lo que escribe presetTourOffer en cada contexto de las pruebas que no son del recorrido
    const stored = memoryStorage(JSON.stringify(TOUR_AUTO_OFFER_OFF));
    expect(readTourState(stored)).toEqual({ handled: [], autoOffer: false });
    expect(readTourState(stored).pending).toBeUndefined();
  });

  it('un valor roto o de otra forma cuenta como si no hubiera nada', () => {
    for (const broken of ['{', '[]', '"texto"', '42', 'null', '']) {
      expect(readTourState(memoryStorage(broken)), broken).toEqual({
        handled: [],
        autoOffer: true,
      });
    }
    // Un campo de un tipo equivocado se descarta y los demás se conservan
    expect(parseTourState({ handled: ['a', 7, '', null, 'b'], autoOffer: 'no' })).toEqual({
      handled: ['a', 'b'],
      autoOffer: true,
    });
    expect(parseTourState({ handled: 'a', pending: { a: 1 }, autoOffer: false })).toEqual({
      handled: [],
      autoOffer: false,
    });
  });

  it('un almacenamiento que lanza no rompe nada', () => {
    const blocked = {
      getItem: () => {
        throw new Error('bloqueado');
      },
      setItem: () => {
        throw new Error('lleno');
      },
    };
    expect(readTourState(blocked)).toEqual({ handled: [], autoOffer: true });
    expect(() => {
      writeTourState({ handled: [], autoOffer: true }, blocked);
    }).not.toThrow();
  });

  it('escribe y vuelve a leer lo mismo', () => {
    const stored = memoryStorage();
    const state: TourStoredState = { handled: ['a'], autoOffer: false, pending: ['b'] };
    writeTourState(state, stored);
    expect(readTourState(stored)).toEqual(state);
  });

  it('marca y desmarca alumnos sin repetirlos ni perder autoOffer', () => {
    const marked = withPending({ handled: ['a'], autoOffer: false }, 'b');
    expect(marked).toEqual({ handled: ['a'], autoOffer: false, pending: ['b'] });
    expect(withPending(marked, 'b').pending).toEqual(['b']);
    expect(withPending(marked, 'c').pending).toEqual(['b', 'c']);
    // Al terminar o saltar el alumno pasa a visto y deja de estar pendiente
    expect(withHandled(withPending(marked, 'c'), 'b')).toEqual({
      handled: ['a', 'b'],
      autoOffer: false,
      pending: ['c'],
    });
    expect(withHandled(marked, 'b')).toEqual({ handled: ['a', 'b'], autoOffer: false });
    expect(withHandled(withHandled(marked, 'b'), 'b').handled).toEqual(['a', 'b']);
  });

  it('solo recuerda los últimos ids, para que un navegador compartido no haga crecer la clave', () => {
    let state: TourStoredState = { handled: [], autoOffer: true };
    for (let index = 0; index < 120; index += 1) state = withHandled(state, `alumno-${index}`);
    expect(state.handled).toHaveLength(50);
    expect(state.handled.at(-1)).toBe('alumno-119');
    expect(state.handled[0]).toBe('alumno-70');
  });
});

describe('markTourPending', () => {
  it('deja al alumno pendiente en este navegador, sin tocar lo demás', () => {
    localStorage.setItem(
      TOUR_STORAGE_KEY,
      JSON.stringify({ handled: ['viejo'], autoOffer: false }),
    );
    markTourPending('nuevo');
    expect(readTourState()).toEqual({ handled: ['viejo'], autoOffer: false, pending: ['nuevo'] });
    // Marcarlo otra vez no lo repite
    markTourPending('nuevo');
    expect(readTourState().pending).toEqual(['nuevo']);
  });

  it('no vuelve a marcar a quien ya vio el recorrido', () => {
    localStorage.setItem(TOUR_STORAGE_KEY, JSON.stringify({ handled: ['visto'], autoOffer: true }));
    markTourPending('visto');
    expect(readTourState()).toEqual({ handled: ['visto'], autoOffer: true });
  });

  it('sin nada guardado lo deja con autoOffer en true, que es como llega quien entra por primera vez', () => {
    localStorage.removeItem(TOUR_STORAGE_KEY);
    markTourPending('nuevo');
    expect(readTourState()).toEqual({ handled: [], autoOffer: true, pending: ['nuevo'] });
  });

  it('no lanza con el almacenamiento bloqueado', () => {
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
      throw new Error('bloqueado');
    });
    expect(() => {
      markTourPending('nuevo');
    }).not.toThrow();
    expect(readTourState()).toEqual({ handled: [], autoOffer: true });
  });
});
