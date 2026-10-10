// Ids de la app en la nube (Fase G, G6, docs/BANCO_EN_LA_NUBE.md). La app usa ULID de 26 caracteres y
// Supabase usa uuid en sus tablas. Las dos cosas son un número de 128 bits, así que se pasa de una a
// otra sin perder nada y sin una tabla de equivalencias. El uuid que sale no sigue las reglas de versión
// y variante de un uuid generado al azar, y Postgres lo acepta igual en una columna uuid.
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const ULID_PATTERN = /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/i;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** El uuid en minúsculas que le corresponde al ULID, o null si no es un ULID válido */
export function ulidToUuid(ulid: string): string | null {
  if (!ULID_PATTERN.test(ulid)) return null;
  let value = 0n;
  for (const char of ulid.toUpperCase()) value = value * 32n + BigInt(ALPHABET.indexOf(char));
  const hex = value.toString(16).padStart(32, '0');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** El ULID en mayúsculas que le corresponde al uuid, o null si no es un uuid válido */
export function uuidToUlid(uuid: string): string | null {
  if (!UUID_PATTERN.test(uuid)) return null;
  let value = BigInt(`0x${uuid.replaceAll('-', '')}`);
  let ulid = '';
  for (let index = 0; index < 26; index += 1) {
    ulid = `${ALPHABET.charAt(Number(value % 32n))}${ulid}`;
    value /= 32n;
  }
  // Un uuid más grande que el máximo de un ULID dejaría el primer carácter fuera de rango
  return ULID_PATTERN.test(ulid) ? ulid : null;
}
