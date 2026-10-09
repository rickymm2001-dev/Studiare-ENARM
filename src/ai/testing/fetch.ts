// Ayudas de prueba para simular fetch.

/** La URL de lo que se le pasa a fetch, sin tener que convertir un objeto a texto */
export function urlOf(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  return input instanceof URL ? input.href : input.url;
}
