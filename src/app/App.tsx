import { lazy, Suspense } from 'react';
import { RouterProvider } from 'react-router/dom';
import { cloudConfigured } from '@/data/cloud/client';
import { DataProvider } from '@/data/DataProvider';
import { useCloud } from './cloudState';
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

// El router se crea una sola vez fuera del árbol de React, como pide React Router
const router = createAppRouter();

export function App() {
  // Mi cuenta usa enarm_real y Demostración usa enarm_demo (D-024)
  const database = usePreferences((state) => state.database);
  return (
    <DataProvider kind={database}>
      {cloudConfigured() ? (
        <Suspense fallback={null}>
          <CloudBridge />
        </Suspense>
      ) : null}
      <RouterProvider router={router} />
    </DataProvider>
  );
}
