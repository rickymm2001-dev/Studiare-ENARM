// Los nombres de los cachés de ejecución de la app, en un solo lugar. vite.config.ts los pone en workbox.runtimeCaching y
// el service worker de despedida de la mudanza (scripts/deploy/moved-site.ts) borra solo estos y los de precarga de
// Workbox de su propio alcance, porque en un sitio de usuario de GitHub Pages todos los proyectos comparten el almacén
// de cachés del origen. Un nombre nuevo en vite.config.ts sin pasar por aquí no lo borraría la despedida

export const RUNTIME_CACHES = {
  simulateWorker: 'simulate-worker',
  importEngine: 'import-engine',
  pdfReader: 'pdf-reader',
  demoMedia: 'demo-media',
} as const;

/** Los nombres, para quien necesita la lista completa */
export const RUNTIME_CACHE_NAMES: readonly string[] = Object.values(RUNTIME_CACHES);
