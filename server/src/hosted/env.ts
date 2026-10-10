// Variables de entorno del proxy alojado (D-103, Fase G bloque G1). El alojamiento las da al
// arrancar. Aquí se validan todas juntas, para que un error de configuración se diga completo y en
// español al arrancar y no a media tarde con un alumno esperando. Nunca se imprime ningún valor.
// La clave de IA se llama igual que en el proxy local, ENARM_ANTHROPIC_KEY, y vive solo en los
// secretos del alojamiento. Nunca en el repositorio, en el navegador ni en una imagen.
import { jwtRole } from '../../../src/data/cloud/keyRole.ts';
import { KEY_VARIABLE } from '../config.ts';

export interface HostedEnv {
  port: number;
  supabaseUrl: string;
  anonKey: string;
  serviceKey: string;
  origins: ReadonlySet<string>;
  /** null solo con ALLOW_MOCK=1, que deja correr con respuestas fijas para probar el despliegue */
  apiKey: string | null;
}

export type HostedEnvResult = { ok: true; env: HostedEnv } | { ok: false; problems: string[] };

const SUPABASE_URL = /^https:\/\/[a-z0-9-]+\.supabase\.co$/;
const ORIGIN = /^https:\/\/[a-z0-9.-]+(:\d{1,5})?$/;

type Source = Record<string, string | undefined>;

export function readHostedEnv(source: Source): HostedEnvResult {
  const problems: string[] = [];
  const get = (name: string) => (source[name] ?? '').trim();

  const supabaseUrl = get('SUPABASE_URL').replace(/\/+$/, '');
  if (!SUPABASE_URL.test(supabaseUrl)) {
    problems.push('SUPABASE_URL debe ser la dirección del proyecto, como https://abc.supabase.co');
  }

  const anonKey = get('SUPABASE_ANON_KEY');
  if (anonKey.length < 20) {
    problems.push('Falta SUPABASE_ANON_KEY, la llave pública del proyecto');
  } else if (anonKey.startsWith('sb_secret_') || jwtRole(anonKey) === 'service_role') {
    problems.push('SUPABASE_ANON_KEY trae una llave secreta. Va la llave pública');
  }

  const serviceKey = get('SUPABASE_SERVICE_ROLE_KEY');
  if (serviceKey.length < 20) {
    problems.push('Falta SUPABASE_SERVICE_ROLE_KEY, la llave de servicio del proyecto');
  } else if (serviceKey === anonKey) {
    problems.push('SUPABASE_SERVICE_ROLE_KEY es igual a la llave pública. Falta la de servicio');
  } else if (jwtRole(serviceKey) === 'anon') {
    problems.push('SUPABASE_SERVICE_ROLE_KEY trae la llave pública. Falta la de servicio');
  }

  const origins = get('APP_ORIGINS')
    .split(',')
    .map((origin) => origin.trim().replace(/\/+$/, ''))
    .filter((origin) => origin !== '');
  if (origins.length === 0) {
    problems.push('Falta APP_ORIGINS, las direcciones de la app, separadas por comas');
  }
  for (const origin of origins) {
    if (!ORIGIN.test(origin) || origin.includes('*')) {
      problems.push(
        `APP_ORIGINS trae una dirección no válida. Va como https://sitio.com, sin ruta`,
      );
      break;
    }
  }

  const apiKey = get(KEY_VARIABLE);
  const allowMock = get('ALLOW_MOCK') === '1';
  if (apiKey === '' && !allowMock) {
    problems.push(
      `Falta ${KEY_VARIABLE}. Sin ella los alumnos recibirían respuestas fijas. Para probar el despliegue sin clave, pon ALLOW_MOCK=1`,
    );
  }

  const portText = get('PORT');
  const port = portText === '' ? 8787 : Number(portText);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    problems.push('PORT debe ser un número de puerto entre 1 y 65535');
  }

  if (problems.length > 0) return { ok: false, problems };
  return {
    ok: true,
    env: {
      port,
      supabaseUrl,
      anonKey,
      serviceKey,
      origins: new Set(origins),
      apiKey: apiKey === '' ? null : apiKey,
    },
  };
}
