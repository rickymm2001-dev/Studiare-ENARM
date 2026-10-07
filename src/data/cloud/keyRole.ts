// Rol que declara una llave de Supabase en formato JWT. Sin dependencias, para usarlo igual en el
// navegador y en el escáner del build. No revisa la firma, solo lee el rol, porque lo único que se
// necesita saber es si una llave de servicio quiere entrar al navegador.

/** El rol del payload de un JWT, o null si el texto no es un JWT con rol */
export function jwtRole(key: string): string | null {
  const parts = key.split('.');
  const payload = parts[1];
  if (parts.length !== 3 || !payload) return null;
  try {
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const decoded: unknown = JSON.parse(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')));
    if (typeof decoded === 'object' && decoded !== null && 'role' in decoded) {
      return typeof decoded.role === 'string' ? decoded.role : null;
    }
    return null;
  } catch {
    return null;
  }
}
