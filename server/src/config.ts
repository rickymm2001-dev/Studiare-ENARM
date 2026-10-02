// Configuración fija del proxy de IA. El proxy solo escucha en localhost (5.3, 14.3).
import { fileURLToPath } from 'node:url';

/** Única dirección de escucha permitida. Nunca 0.0.0.0 */
export const PROXY_HOST = '127.0.0.1';
export const PROXY_PORT = 8787;

/** Nombre de la variable con la clave. Es el único nombre que el proxy lee (CLAUDE.md, 4.10) */
export const KEY_VARIABLE = 'ENARM_ANTHROPIC_KEY';

/** La clave vive solo en server/.env.local, fuera de git */
export const ENV_FILE = fileURLToPath(new URL('../.env.local', import.meta.url));

/** Tamaño máximo de cualquier petición al proxy (14.3) */
export const MAX_BODY_BYTES = 64 * 1024;

/** Nombres de host aceptados en el encabezado Host. Frena ataques de DNS rebinding */
export const ALLOWED_HOSTNAMES = new Set(['127.0.0.1', 'localhost', '[::1]']);

export const PROXY_VERSION = 1;
