// ULID estable a partir de una clave de texto. El contenido demo y los alumnos simulados necesitan
// IDs que no cambien entre corridas, para que la misma semilla dé siempre los mismos datos y las
// referencias entre preguntas, opciones y eventos se conserven al regenerar.
import { createRng } from '@/engines/random';

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const MAX_TIME = 2 ** 48 - 1;

function encodeTime(ms: number): string {
  if (!Number.isInteger(ms) || ms < 0 || ms > MAX_TIME) {
    throw new RangeError(`Tiempo inválido para un ULID ${ms}`);
  }
  let rest = ms;
  let out = '';
  for (let index = 0; index < 10; index += 1) {
    out = (CROCKFORD[rest % 32] as string) + out;
    rest = Math.floor(rest / 32);
  }
  return out;
}

/**
 * ULID con la parte de tiempo de `timeMs` y la parte aleatoria derivada de `key`. Dos claves
 * distintas dan IDs distintos con probabilidad práctica de 1. Con el mismo tiempo, el orden entre
 * IDs no es el de creación, así que quien necesite orden debe usar tiempos distintos
 */
export function stableUlid(key: string, timeMs: number): string {
  const rng = createRng(`ulid|${key}`);
  let random = '';
  for (let index = 0; index < 16; index += 1) random += CROCKFORD[rng.int(0, 31)] as string;
  return encodeTime(timeMs) + random;
}

/** Cuántos IDs de un mismo momento se pueden ordenar entre sí con rankedUlid */
export const ULID_RANKS = CROCKFORD.length;

/**
 * Como stableUlid, pero el orden entre IDs del mismo milisegundo es el de su rango. Sirve para
 * eventos que comparten momento, como una respuesta y su XP, y que tienen que repetirse con el
 * mismo ID si se reintenta el registro. El rango va de 0 a ULID_RANKS - 1
 */
export function rankedUlid(key: string, timeMs: number, rank: number): string {
  if (!Number.isInteger(rank) || rank < 0 || rank >= ULID_RANKS) {
    throw new RangeError(`Rango inválido para un ULID ${rank}`);
  }
  const rng = createRng(`ulid|${key}|${rank}`);
  let random = CROCKFORD[rank] as string;
  for (let index = 1; index < 16; index += 1) random += CROCKFORD[rng.int(0, 31)] as string;
  return encodeTime(timeMs) + random;
}

/** Momento fijo del contenido demo, para que sus IDs no dependan del día en que se generan */
export const DEMO_CONTENT_TIME = Date.UTC(2026, 9, 1);
