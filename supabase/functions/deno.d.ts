// Lo mínimo de Deno que usan los archivos index.ts de las funciones, para revisarlos con tsc. El
// resto de las funciones no depende de Deno y se prueba con Vitest.
declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Response | Promise<Response>): unknown;
};
