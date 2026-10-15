// Quién es el responsable que firman el aviso de privacidad y los términos (Fase G, G2, y B16 del plan
// del cambio). La razón social, el domicilio y los correos son públicos por diseño, porque la ley obliga
// a decirlos. Se fijan al publicar la página con VITE_LEGAL_NAME (Plexus Medica S. de R.L. de C.V.,
// respuestas 24 y 42), VITE_LEGAL_ADDRESS, VITE_PRIVACY_EMAIL y VITE_SUPPORT_EMAIL. Sin ellos la app no
// inventa nada. El alumno lee un texto neutro en su lugar y el abogado ve la marca de lo que falta
// (src/features/legal/fillLegal.ts).
import { parsePublicEmail, readSupportEmail } from './support.ts';

/**
 * Versión del aviso de privacidad que acepta el alumno. Cambia cuando cambia el texto. Las versiones se
 * comparan como texto (src/data/usecases/profile.ts), así que cada versión nueva tiene que quedar
 * después de la anterior al ordenarlas. Una segunda versión del mismo día lleva una letra al final,
 * como 2026-10-15b, que queda después de 2026-10-15 y antes de 2026-10-16. Quien aceptó una versión
 * anterior ve el aviso de que cambió (NoticeUpdateNotice). El orden de las que hubo es 2026-10-14,
 * 2026-10-14b (B9), 2026-10-15 (el primer borrador de B16, ya publicado en main) y 2026-10-15b, el
 * texto de B16 que lo reemplaza. Se dejó con letra, y no con 2026-10-16, para que quien aceptó el
 * primer borrador lo vuelva a aceptar sin saltar de día
 */
export const PRIVACY_NOTICE_VERSION = '2026-10-15b';

export interface LegalIdentity {
  /** Razón social del responsable */
  name: string | null;
  address: string | null;
  /** Correo de ayuda. Lo usan los términos para cobros, garantía y quejas */
  email: string | null;
  /**
   * Correo de privacidad, para los derechos sobre los datos. Sin VITE_PRIVACY_EMAIL es el de ayuda, así
   * un solo buzón sirve para los dos
   */
  privacyEmail: string | null;
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
  const support = readSupportEmail(env);
  return {
    name: cleanLine(env.VITE_LEGAL_NAME, 120),
    address: cleanLine(env.VITE_LEGAL_ADDRESS, 240),
    email: support,
    privacyEmail: parsePublicEmail(env.VITE_PRIVACY_EMAIL) ?? support,
  };
}
