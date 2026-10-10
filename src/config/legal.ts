// Quién es el responsable que firman el aviso de privacidad y los términos (Fase G, G2). El nombre
// o razón social, el domicilio y el correo son públicos por diseño, porque la ley obliga a decirlos.
// Se fijan al publicar la página con VITE_LEGAL_NAME, VITE_LEGAL_ADDRESS y VITE_SUPPORT_EMAIL. Sin
// ellos la app no inventa nada y los textos dicen que falta completarlos.
import { readSupportEmail } from './support.ts';

/** Versión del aviso de privacidad que acepta el alumno. Cambia cuando cambia el texto */
export const PRIVACY_NOTICE_VERSION = '2026-10-10';

export interface LegalIdentity {
  name: string | null;
  address: string | null;
  email: string | null;
}

/** Texto de una línea, sin caracteres de control ni marcas que se puedan confundir con código */
function cleanLine(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const text = value
    .replace(/\p{Cc}/gu, '')
    .replace(/[<>]/g, '')
    .trim();
  return text.length >= 3 && text.length <= max ? text : null;
}

export function readLegalIdentity(env: Record<string, unknown> = import.meta.env): LegalIdentity {
  return {
    name: cleanLine(env.VITE_LEGAL_NAME, 120),
    address: cleanLine(env.VITE_LEGAL_ADDRESS, 240),
    email: readSupportEmail(env),
  };
}
