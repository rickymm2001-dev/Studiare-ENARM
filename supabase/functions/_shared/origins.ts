// Los orígenes que pueden llamar a las funciones desde el navegador (B17, 4.1 del plan). Aquí vive la única
// lectura de la lista APP_ORIGINS. corsHeaders (http.ts) la usa sin protestar, porque una entrada mala solo quita
// un permiso, y ai-proxy la usa estricta (ai/cors.ts) y deja de atender si alguna no sirve. Va en su archivo, sin
// imports, para que las funciones de IA la lleven sin cargar el resto de http.ts. Sin Deno, para probarla con
// Vitest.

/** Un origen exacto. https, minúsculas, sin usuario, sin ruta y sin comodines */
const EXACT_ORIGIN = /^https:\/\/[a-z0-9.-]+(?::\d{1,5})?$/;
/**
 * Cualquiera puede publicar en un subdominio de pages.dev, así que una dirección de ahí nunca es de
 * confianza. La app vive en el dominio propio de Ricardo, y las vistas previas, que son de pages.dev, no
 * llaman a las funciones
 */
const PAGES_DEV_HOST = /(?:^|\.)pages\.dev$/;

export type OriginIssue = 'invalid' | 'pages_dev';

/** Por qué un origen no sirve para la lista, o null si sirve */
export function originIssue(origin: string): OriginIssue | null {
  if (!EXACT_ORIGIN.test(origin)) return 'invalid';
  const host = origin.slice('https://'.length).replace(/:\d+$/, '');
  return PAGES_DEV_HOST.test(host) ? 'pages_dev' : null;
}

export interface OriginList {
  /** Los que sirven, sin repetir y con el orden en que llegaron */
  origins: string[];
  /** Un motivo por cada entrada que no sirvió. Nunca la entrada, que puede ser cualquier cosa */
  issues: OriginIssue[];
}

/** Lee una lista de orígenes separados por comas, como APP_ORIGINS. Quita espacios y diagonales finales */
export function parseOriginList(value: string | undefined): OriginList {
  const origins: string[] = [];
  const issues: OriginIssue[] = [];
  for (const raw of (value ?? '').split(',')) {
    const origin = raw.trim().replace(/\/+$/, '');
    if (origin === '') continue;
    const issue = originIssue(origin);
    if (issue !== null) issues.push(issue);
    else if (!origins.includes(origin)) origins.push(origin);
  }
  return { origins, issues };
}
