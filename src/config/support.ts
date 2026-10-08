// Contacto de ayuda para el alumno. La dirección es pública y se fija al publicar la página con la
// variable VITE_SUPPORT_EMAIL (docs/SUPABASE.md). Sin ella la app no inventa una dirección.

/** Dirección de ayuda configurada. null si falta o no parece un correo */
export function readSupportEmail(env: Record<string, unknown> = import.meta.env): string | null {
  const raw = typeof env.VITE_SUPPORT_EMAIL === 'string' ? env.VITE_SUPPORT_EMAIL.trim() : '';
  // Estricto a propósito. Nada que cambie el destino ni agregue parámetros al enlace mailto
  return /^[A-Za-z0-9._+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/.test(raw) ? raw : null;
}

/** Enlace para escribir al contacto de ayuda con el asunto ya puesto */
export function supportMailto(email: string, subject: string): string {
  return `mailto:${email}?subject=${encodeURIComponent(subject)}`;
}
