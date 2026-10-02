import { RouterProvider } from 'react-router/dom';
import { DataProvider } from '@/data/DataProvider';
import { createAppRouter } from './router';

// El router se crea una sola vez fuera del árbol de React, como pide React Router
const router = createAppRouter();

export function App() {
  return (
    <DataProvider kind="real">
      <RouterProvider router={router} />
    </DataProvider>
  );
}
