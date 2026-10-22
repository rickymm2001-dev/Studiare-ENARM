import { lazy, Suspense } from 'react';
import { RouterProvider } from 'react-router/dom';
import { analyticsPossible } from '@/data/analytics/control';
import { cloudConfigured } from '@/data/cloud/client';
import { DataProvider } from '@/data/DataProvider';
import { useCloud } from './cloudState';
import { ErrorReportingGate } from './ErrorReportingGate';
import { usePreferences } from './preferences';
import { createAppRouter } from './router';

// La conexión con la nube trae el SDK de Supabase y la sincronización. Solo hace falta con la nube
// configurada, así que va en su propio archivo y no cuenta en el JavaScript inicial (14.4)
const CloudBridge = lazy(() =>
  import('./cloud')
    .then((module) => ({ default: module.CloudBridge }))
    // Si el archivo no se baja (red intermitente, o una pestaña vieja tras una publicación), la app
    // sigue sin la nube y lo dice, en lugar de quedarse en blanco
    .catch(() => {
      useCloud.getState().set({ status: 'error' });
      return { default: () => null };
    }),
);

// La medición de uso (B15). Con su propia lógica de sesión y el identificador del servidor, solo hace falta si la
// bandera, la llave y el entorno dejan medir alguna vez, así que va aparte y no cuenta en lo inicial (5.4)
const AnalyticsGate = lazy(() =>
  import('./AnalyticsGate')
    .then((module) => ({ default: module.AnalyticsGate }))
    // Si el archivo no baja, la app sigue sin medir
    .catch(() => ({ default: () => null })),
);

// El router se crea una sola vez fuera del árbol de React, como pide React Router
const router = createAppRouter();

export function App() {
  // Mi cuenta usa enarm_real y Demostración usa enarm_demo (D-024)
  const database = usePreferences((state) => state.database);
  return (
    <DataProvider kind={database}>
      <ErrorReportingGate />
      {analyticsPossible() ? (
        <Suspense fallback={null}>
          <AnalyticsGate />
        </Suspense>
      ) : null}
      {cloudConfigured() ? (
        <Suspense fallback={null}>
          <CloudBridge />
        </Suspense>
      ) : null}
      <RouterProvider router={router} />
    </DataProvider>
  );
}
