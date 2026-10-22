// Las claves de los pasos del recorrido guiado y lo que este navegador recuerda de él (B15, 4.1, 4.2 y 7.5
// del plan de B15). Las comparten el recorrido, la medición (los eventos tour_*) y el registro, que llama a
// markTourPending. Sin dependencias, para que cualquiera la importe sin cargar el recorrido, que es un
// módulo aparte y se baja solo cuando empieza (4.3).
//
// Las anclas que usa cada paso viven en el encabezado de cada pantalla y en el menú
//   - ScreenHeader pone data-tour-screen con la clave de la pantalla (ScreenKey de src/app/screens.ts)
//   - BottomNav pone data-tour con nav- y la clave de la sección, o nav-more para Más
// así no se toca ninguna pantalla una por una

/** Los ocho pasos, en orden. welcome es la bienvenida al centro y settings es el último */
export const TOUR_STEPS = [
  'welcome',
  'home',
  'review',
  'outlines',
  'simulator',
  'progress',
  'party',
  'settings',
] as const;
export type TourStep = (typeof TOUR_STEPS)[number];

/** El atributo del encabezado de cada pantalla, con su clave de pantalla como valor */
export const TOUR_SCREEN_ATTRIBUTE = 'data-tour-screen';
/** El atributo de cada sección del menú, con nav- y su clave de pantalla, o nav-more para Más */
export const TOUR_NAV_ATTRIBUTE = 'data-tour';

/** Dónde guarda este navegador lo que ya vio del recorrido (4.1). Solo localStorage, nunca la nube */
export const TOUR_STORAGE_KEY = 'enarm.tour.v1';

/**
 * Lo que vive en TOUR_STORAGE_KEY. handled son los ids de los alumnos que ya terminaron o saltaron el
 * recorrido en este navegador, y autoOffer en false apaga que aparezca solo. Sin la clave, o con cualquier
 * valor que no sea false, autoOffer vale true. pending son los alumnos a quienes markTourPending dejó
 * marcados al terminar su registro y todavía no lo terminan ni lo saltan. Es opcional, porque
 * TOUR_AUTO_OFFER_OFF tiene que seguir siendo un estado válido para el lector
 */
export interface TourStoredState {
  handled: string[];
  autoOffer: boolean;
  pending?: string[];
}

/**
 * El estado que dejan las fixtures de las e2e (tests/e2e/support/fixtures.ts) antes de cada prueba, para
 * que las que no son del recorrido nunca lo vean aparecer solo (6.4). tour.spec.ts es la única que no lo
 * escribe. El lector de abajo lo entiende tal cual, y steps.test.ts lo comprueba
 */
export const TOUR_AUTO_OFFER_OFF: Readonly<TourStoredState> = { handled: [], autoOffer: false };

/** Cuántos ids se recuerdan por lista. Un navegador compartido no debe hacer crecer la clave sin fin */
const MAX_REMEMBERED = 50;

const idsOf = (value: unknown): string[] =>
  Array.isArray(value)
    ? value
        .filter((id): id is string => typeof id === 'string' && id !== '' && id.length <= 80)
        .slice(-MAX_REMEMBERED)
    : [];

/**
 * El estado válido que sale de lo que haya guardado, sea lo que sea. Un valor ilegible o de otra forma
 * cuenta como si no hubiera nada, o sea que el recorrido puede ofrecerse. Los campos que no reconoce se
 * descartan
 */
export function parseTourState(raw: unknown): TourStoredState {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { handled: [], autoOffer: true };
  }
  const value = raw as Record<string, unknown>;
  const state: TourStoredState = {
    handled: idsOf(value.handled),
    autoOffer: value.autoOffer !== false,
  };
  const pending = idsOf(value.pending);
  if (pending.length > 0) state.pending = pending;
  return state;
}

function tourStorage(): Storage | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage;
  } catch {
    // Almacenamiento bloqueado. El recorrido sigue sin recordar nada
    return undefined;
  }
}

/** Lo que este navegador recuerda del recorrido. Sin almacenamiento o con un valor roto, nada */
export function readTourState(storage: Pick<Storage, 'getItem'> | undefined = tourStorage()) {
  try {
    const raw = storage?.getItem(TOUR_STORAGE_KEY);
    return parseTourState(raw ? (JSON.parse(raw) as unknown) : null);
  } catch {
    return parseTourState(null);
  }
}

/** Guarda el estado. Si el navegador no deja, el recorrido solo se olvida al cerrar la pestaña */
export function writeTourState(
  state: TourStoredState,
  storage: Pick<Storage, 'setItem'> | undefined = tourStorage(),
): void {
  try {
    storage?.setItem(TOUR_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ventana privada o almacenamiento lleno
  }
}

/** El mismo estado con el alumno marcado como pendiente, sin repetirlo y sin tocar autoOffer */
export function withPending(state: TourStoredState, userId: string): TourStoredState {
  const pending = [...(state.pending ?? []).filter((id) => id !== userId), userId];
  return { ...state, pending: pending.slice(-MAX_REMEMBERED) };
}

/** El mismo estado con el alumno como visto (terminó o saltó) y ya no pendiente */
export function withHandled(state: TourStoredState, userId: string): TourStoredState {
  const { pending, ...rest } = state;
  const left = (pending ?? []).filter((id) => id !== userId);
  return {
    ...rest,
    handled: [...state.handled.filter((id) => id !== userId), userId].slice(-MAX_REMEMBERED),
    ...(left.length > 0 ? { pending: left } : {}),
  };
}

/**
 * Deja marcado que este alumno debe ver el recorrido al llegar a Inicio. La llama OnboardingScreen al
 * terminar el registro en este navegador (4.1). Solo marca. Que aparezca lo decide TourLauncher, con la
 * bandera guidedTour, el rol y autoOffer, así que con autoOffer en false (las e2e que no son del
 * recorrido) la marca queda y nada aparece. Quien ya lo vio no se vuelve a marcar
 */
export function markTourPending(userId: string): void {
  const state = readTourState();
  if (state.handled.includes(userId)) return;
  writeTourState(withPending(state, userId));
}
