// Activa la versión nueva de la app y recarga. Con registerType prompt la versión nueva se baja y espera a que
// el alumno decida (src/app/layout/PwaUpdatePrompt.tsx). Aquí se pide la actualización, se espera a que la
// versión nueva quede lista, se le dice que tome el control y se recarga cuando lo toma. Sin service worker,
// o si algo falla o tarda, solo se recarga, que ya es lo mejor que se puede hacer (D-146). No toca React.

/** Cuánto se espera a que la versión nueva termine de bajarse antes de recargar sin ella */
export const UPDATE_WAIT_MS = 15_000;

export interface UpdateEnvironment {
  /** Lo que hace falta de navigator.serviceWorker. undefined si el navegador no lo tiene */
  serviceWorker: Pick<ServiceWorkerContainer, 'getRegistration' | 'addEventListener'> | undefined;
  reload: () => void;
  waitMs?: number;
}

function browserEnvironment(): UpdateEnvironment {
  return {
    serviceWorker: typeof navigator === 'undefined' ? undefined : navigator.serviceWorker,
    reload: () => {
      window.location.reload();
    },
  };
}

/** El service worker nuevo en espera, o null si no aparece a tiempo */
function waitingWorker(
  registration: ServiceWorkerRegistration,
  waitMs: number,
): Promise<ServiceWorker | null> {
  if (registration.waiting) return Promise.resolve(registration.waiting);
  const installing = registration.installing;
  if (!installing) return Promise.resolve(null);
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      resolve(registration.waiting);
    }, waitMs);
    installing.addEventListener('statechange', () => {
      if (installing.state === 'installed' || installing.state === 'activated') {
        clearTimeout(timer);
        resolve(registration.waiting);
      } else if (installing.state === 'redundant') {
        clearTimeout(timer);
        resolve(null);
      }
    });
  });
}

export async function applyLatestVersion(
  env: UpdateEnvironment = browserEnvironment(),
): Promise<void> {
  const { serviceWorker, reload } = env;
  if (!serviceWorker) {
    reload();
    return;
  }
  try {
    const registration = await serviceWorker.getRegistration();
    if (!registration) {
      reload();
      return;
    }
    // Busca la versión nueva. Si ya había una esperando, sigue sin esperar nada más
    await registration.update();
    const waiting = await waitingWorker(registration, env.waitMs ?? UPDATE_WAIT_MS);
    if (!waiting) {
      reload();
      return;
    }
    serviceWorker.addEventListener('controllerchange', reload, { once: true });
    waiting.postMessage({ type: 'SKIP_WAITING' });
  } catch {
    reload();
  }
}
