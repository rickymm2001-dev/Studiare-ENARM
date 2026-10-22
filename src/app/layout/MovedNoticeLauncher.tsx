// Lo único del aviso de la mudanza que viaja en el JavaScript inicial (B17, 3.4). Sin VITE_MOVED_TO y VITE_MOVED_ON,
// que es todo build que no es la demo de GitHub Pages en sus últimas dos semanas, no pinta nada, no baja nada y ni
// siquiera existe el archivo del aviso en el build: las dos variables se cambian por su valor al construir
// (vite.config.ts) y el bundler quita el import de la rama que no se usa. Con las dos, baja MovedNotice con lazy
import { lazy, Suspense } from 'react';

const MOVE_PLANNED = Boolean(import.meta.env.VITE_MOVED_TO && import.meta.env.VITE_MOVED_ON);

// Si su archivo no llega, como sin red antes de que el service worker lo guarde, no se ve, pero la app sigue
const LazyMovedNotice = MOVE_PLANNED
  ? lazy(() =>
      import('./MovedNotice').then(
        (module) => ({ default: module.MovedNotice }),
        () => ({ default: () => null }),
      ),
    )
  : null;

export function MovedNoticeLauncher({ className = '' }: { className?: string }) {
  if (LazyMovedNotice === null) return null;
  return (
    <Suspense fallback={null}>
      <LazyMovedNotice className={className} />
    </Suspense>
  );
}
