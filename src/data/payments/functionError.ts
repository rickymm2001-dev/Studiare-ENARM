// El cuerpo del error de una función de pago (create-checkout, create-portal-session y
// cancel-subscription). supabase-js deja la respuesta en context y aquí se lee su JSON, como
// { error: 'founder_full' } o { error: 'pass_in_force', passEnd: '...' }.

/** El cuerpo JSON del error, o null si no trae uno */
export async function functionErrorBody(error: unknown): Promise<Record<string, unknown> | null> {
  const context = (error as { context?: unknown } | null)?.context;
  if (!(context instanceof Response)) return null;
  try {
    const body: unknown = await context.clone().json();
    return body !== null && typeof body === 'object' && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/** El código de error que mandó la función, si el cuerpo trae uno */
export async function functionErrorCode(error: unknown): Promise<string | null> {
  const code = (await functionErrorBody(error))?.error;
  return typeof code === 'string' ? code : null;
}
