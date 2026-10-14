// Lo que pide el registro además del correo (B9 del plan del cambio). La edad mínima de la pregunta 45
// y las opciones cerradas de Cómo nos conociste de la respuesta 22, con el código del influencer si lo
// trae. La lista es la misma que acepta la tabla signup_sources de la migración 20261020000001.

/** Edad mínima para crear una cuenta. Ricardo dejó la recomendada (pregunta 45) */
export const MINIMUM_AGE = 18;

/** Cómo nos conoció el alumno. Opcional y con opciones cerradas (respuesta 22) */
export const HEARD_FROM_CHANNELS = [
  'instagram',
  'tiktok',
  'facebook',
  'youtube',
  'influencer',
  'friend',
  'google',
  'university',
  'other',
] as const;
export type HeardFromChannel = (typeof HEARD_FROM_CHANNELS)[number];

/** Código de influencer como lo guarda la base, en mayúsculas, de 2 a 32 letras, números, - o _ */
export const INFLUENCER_CODE = /^[A-Z0-9_-]{2,32}$/;

/** El código como lo escribió el alumno, limpio. null si quedó vacío */
export function normalizeInfluencerCode(raw: string): string | null {
  const code = raw.trim().toUpperCase();
  return code === '' ? null : code;
}
