// Tiempo límite para las lecturas de la nube que deciden si se deja entrar (B9 del plan del cambio).
// supabase-js no le pone tiempo a sus peticiones y una red que no contesta dejaría la pantalla
// esperando para siempre.

/**
 * Lo que responde la promesa, o fallback si tarda más de ms. No cancela la petición, que sigue y se
 * ignora al llegar
 */
export async function settleWithin<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<T>((resolve) => {
    timer = setTimeout(() => {
      resolve(fallback);
    }, ms);
  });
  try {
    return await Promise.race([promise, late]);
  } finally {
    clearTimeout(timer);
  }
}
