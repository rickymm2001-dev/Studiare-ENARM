// Transporte hacia PostHog (B15, 1.4). Un POST a {host}/batch/ con { api_key, batch }, sin cookies, sin
// referente y sin leer la respuesta. Es el único archivo de la app que hace peticiones al host de PostHog,
// y una prueba de arquitectura lo vigila. Parte el lote si pasa de 60 KB, que es el tope de una petición
// con keepalive, reintenta una vez y descarta. Nunca lanza ni escribe en la consola: medir no rompe nada.
import type { AnalyticsConfig } from './config';
import type { AnalyticsRecord, AnalyticsValue } from './catalog';

/** El tope de una petición con keepalive es de 64 KB. Se deja margen para el sobre y los encabezados */
export const KEEPALIVE_LIMIT_BYTES = 60_000;
/** Cuántas veces se intenta mandar un lote antes de descartarlo */
export const SEND_ATTEMPTS = 2;

/** Lo que va en todos los eventos (1.4). Son rangos y listas cerradas, nunca algo del alumno */
export interface CommonProperties {
  app_version: string;
  platform: 'phone' | 'desktop';
  installed: boolean;
  plan_kind: 'free' | 'trial' | 'paid';
  role: 'student' | 'physician' | 'admin' | 'owner';
}

export interface WireEvent {
  event: string;
  distinct_id: string;
  properties: Record<string, AnalyticsValue>;
  timestamp: string;
}

/**
 * Un evento como lo recibe PostHog. $process_person_profile en false deja el evento sin perfil de persona
 * (8.8), así el embudo cuenta personas por su identificador sin guardar nada de ellas. $geoip_disable pide
 * no resolver la ubicación por la IP, además de que el proyecto la descarta (1.9, por confirmar, 8.26)
 */
export function toWireEvent(
  record: AnalyticsRecord,
  distinctId: string,
  common: CommonProperties,
): WireEvent {
  return {
    event: record.event,
    distinct_id: distinctId,
    properties: {
      ...record.properties,
      ...common,
      $lib: 'studiare-web',
      $process_person_profile: false,
      $geoip_disable: true,
    },
    timestamp: new Date(record.at).toISOString(),
  };
}

const bytesOf = (text: string) => new TextEncoder().encode(text).length;

/**
 * Los cuerpos de las peticiones, cada uno de menos de 60 KB. Un evento solo nunca pasa de unos cientos
 * de bytes, así que partir por la mitad de la lista siempre alcanza
 */
export function buildBodies(config: AnalyticsConfig, events: readonly WireEvent[]): string[] {
  if (events.length === 0) return [];
  const body = JSON.stringify({ api_key: config.key, batch: events });
  if (events.length === 1 || bytesOf(body) <= KEEPALIVE_LIMIT_BYTES) return [body];
  const middle = Math.ceil(events.length / 2);
  return [
    ...buildBodies(config, events.slice(0, middle)),
    ...buildBodies(config, events.slice(middle)),
  ];
}

type Fetch = (input: string, init: RequestInit) => Promise<Response>;

async function post(fetchFn: Fetch, url: string, body: string): Promise<boolean> {
  try {
    const reply = await fetchFn(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      mode: 'cors',
    });
    return reply.ok;
  } catch {
    return false;
  }
}

/**
 * Manda los eventos. Cada petición se intenta dos veces y, si no sale, se descarta sin avisar. allowed se
 * consulta antes de cada intento, así retirar el permiso en medio de un reintento lo detiene y no sale
 * nada más. Devuelve cuántas peticiones llegaron, para las pruebas. No espera a nadie y nunca lanza
 */
export async function sendEvents(
  config: AnalyticsConfig,
  events: readonly WireEvent[],
  fetchFn: Fetch = (input, init) => fetch(input, init),
  allowed: () => boolean = () => true,
): Promise<number> {
  let delivered = 0;
  try {
    const url = `${config.host}/batch/`;
    for (const body of buildBodies(config, events)) {
      for (let attempt = 0; attempt < SEND_ATTEMPTS; attempt += 1) {
        if (!allowed()) return delivered;
        if (await post(fetchFn, url, body)) {
          delivered += 1;
          break;
        }
      }
    }
  } catch {
    // Medir nunca debe causar un error
  }
  return delivered;
}
