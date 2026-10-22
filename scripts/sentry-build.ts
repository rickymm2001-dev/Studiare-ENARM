// Subir los mapas de código a Sentry en el build de producción (B15, 2.3). Solo cuando el build trae las tres
// variables del CI, SENTRY_AUTH_TOKEN (secreto de GitHub), SENTRY_ORG y SENTRY_PROJECT (variables). Sin
// ellas el build sale como siempre, sin mapas, y no se rompe. El token nunca va al bundle del cliente, porque
// no empieza con VITE_ y Vite solo expone esas. Los mapas se generan ocultos (sin el comentario
// sourceMappingURL) y se borran de la carpeta del build después de subirlos, porque el repositorio y la demo
// siguen públicos y un mapa regala el código fuente.
//
// Lo usa vite.config.ts. Está aparte para probarlo sin armar un build

export interface SentryUploadConfig {
  org: string;
  project: string;
  authToken: string;
  /** El nombre de la versión, el mismo VITE_BUILD_ID que lleva cada reporte, para que Sentry empareje mapa y error */
  release: string;
}

const clean = (value: string | undefined): string => (value ?? '').trim();

/** La forma del nombre corto de una organización o un proyecto de Sentry. Sin espacios ni diagonales */
const SLUG = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/;

/** Los primeros 7 caracteres del commit, como VITE_BUILD_ID en vite.config.ts. local fuera del CI */
export const buildIdOf = (env: Record<string, string | undefined>): string =>
  clean(env.GITHUB_SHA).slice(0, 7) || 'local';

/**
 * Las opciones para subir mapas, o null si falta algo. El token no se valida más allá de que exista y no tenga
 * espacios, porque su forma cambia entre tipos de token. Org y proyecto sí deben ser nombres cortos
 */
export function sentryUploadConfig(
  env: Record<string, string | undefined>,
): SentryUploadConfig | null {
  const authToken = clean(env.SENTRY_AUTH_TOKEN);
  const org = clean(env.SENTRY_ORG);
  const project = clean(env.SENTRY_PROJECT);
  if (authToken === '' || /\s/.test(authToken)) return null;
  if (!SLUG.test(org) || !SLUG.test(project)) return null;
  return { org, project, authToken, release: buildIdOf(env) };
}
