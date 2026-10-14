// Lo mínimo de Deno que usan los archivos index.ts de las funciones, para revisarlos con tsc. El
// resto de las funciones no depende de Deno y se prueba con Vitest.
declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Response | Promise<Response>): unknown;
};

// Tareas en segundo plano de Supabase Edge Functions (B11). La función sigue viva hasta que termina la
// promesa, dentro de sus límites. beforeunload avisa antes de apagarla. Documentación vigente en
// supabase/supabase, apps/docs/content/guides/functions/background-tasks.mdx
declare const EdgeRuntime: {
  waitUntil(promise: Promise<unknown>): void;
};
declare function addEventListener(type: 'beforeunload', listener: () => void): void;
