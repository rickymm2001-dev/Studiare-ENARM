import { RouterProvider } from 'react-router/dom';
import { DataProvider } from '@/data/DataProvider';
import { CloudBridge } from './cloud';
import { usePreferences } from './preferences';
import { createAppRouter } from './router';

// El router se crea una sola vez fuera del árbol de React, como pide React Router
const router = createAppRouter();

export function App() {
  // Mi cuenta usa enarm_real y Demostración usa enarm_demo (D-024)
  const database = usePreferences((state) => state.database);
  return (
    <DataProvider kind={database}>
      <CloudBridge />
      <RouterProvider router={router} />
    </DataProvider>
  );
}
