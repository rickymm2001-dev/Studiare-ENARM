// Arma la app completa en una ruta con un alumno de Mi cuenta ya dentro, para las pruebas de
// pantalla con Testing Library. Siembra lo que la prueba pida antes de mostrar la ruta y deja todo
// limpio al terminar. Solo lo usan las pruebas.
import { render } from '@testing-library/react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createMemoryRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { DataProvider } from '@/data/DataProvider';
import { useDataApi, type DataApi } from '@/data/context';
import { makeUser } from '@/data/testing/fixtures';
import type { User } from '@/data/schemas/people';
import { usePractice } from '@/features/simulator/practice';
import { DEFAULT_PREFERENCES, usePreferences } from '../preferences';
import { routes } from '../router';

export interface RenderedApp {
  api: DataApi;
  user: User;
}

/** Corre la siembra una sola vez y solo entonces muestra la ruta */
function Seeded({ run, children }: { run: (api: DataApi) => Promise<void>; children: ReactNode }) {
  const api = useDataApi();
  const [ready, setReady] = useState(false);
  // useDataApi devuelve un objeto nuevo en cada pintura, así que la siembra se cuida con una marca
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void run(api).then(() => {
      setReady(true);
    });
  }, [api, run]);
  return ready ? <>{children}</> : null;
}

export async function renderApp(
  path: string,
  options: {
    user?: Partial<User>;
    /** Datos que la pantalla necesita, sembrados antes de mostrarla */
    seed?: (api: DataApi, user: User) => Promise<void>;
  } = {},
): Promise<RenderedApp> {
  const user = makeUser(options.user);
  let captured: DataApi | undefined;
  const run = async (api: DataApi) => {
    captured = api;
    await api.repos.users.put(user);
    await options.seed?.(api, user);
  };
  usePreferences.setState({ sessionUserId: user.id });
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <DataProvider kind="real">
      <Seeded run={run}>
        <RouterProvider router={router} />
      </Seeded>
    </DataProvider>,
  );
  // La siembra termina antes de que la ruta se pinte, así que aquí ya hay API
  await new Promise<void>((resolve) => {
    const wait = () => {
      if (captured) resolve();
      else setTimeout(wait, 5);
    };
    wait();
  });
  return { api: captured as DataApi, user };
}

/** Deja la base, las preferencias, la práctica y el navegador como al empezar */
export async function resetApp(api?: DataApi): Promise<void> {
  // Lo que la pantalla alcanzó a mandar a la base termina antes de borrarla, si no la prueba
  // siguiente ve errores de una base cerrada que no le tocan
  await new Promise((resolve) => setTimeout(resolve, 100));
  await api?.deleteAllData?.();
  usePreferences.setState(DEFAULT_PREFERENCES);
  usePractice.setState({
    sessionId: null,
    userId: null,
    questionIds: [],
    index: 0,
    answers: [],
    startedAt: 0,
    ended: false,
    kind: 'practice',
    duelId: null,
    targetTags: [],
  });
  localStorage.clear();
}
