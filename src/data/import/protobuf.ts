// Lector mínimo de protobuf. El formato nuevo de .apkg guarda la configuración de cada tipo de nota
// como protobuf y solo hace falta un número, el tipo (normal o cloze). Se leen los campos de nivel
// superior, con varint, de 32 y 64 bits y de largo variable, y lo demás se salta.

export interface ProtoVarint {
  field: number;
  value: number;
}

/** Los campos varint de nivel superior. Un mensaje dañado devuelve lo que alcanzó a leer */
export function readVarintFields(bytes: Uint8Array): ProtoVarint[] {
  const fields: ProtoVarint[] = [];
  let offset = 0;
  const varint = (): number | null => {
    let result = 0;
    let shift = 0;
    while (offset < bytes.length) {
      const byte = bytes[offset] ?? 0;
      offset += 1;
      result += (byte & 0x7f) * 2 ** shift;
      if ((byte & 0x80) === 0) return result;
      shift += 7;
      if (shift > 56) return null;
    }
    return null;
  };
  while (offset < bytes.length) {
    const tag = varint();
    if (tag === null) break;
    const field = Math.floor(tag / 8);
    const wire = tag % 8;
    if (wire === 0) {
      const value = varint();
      if (value === null) break;
      fields.push({ field, value });
    } else if (wire === 1) offset += 8;
    else if (wire === 5) offset += 4;
    else if (wire === 2) {
      const length = varint();
      if (length === null) break;
      offset += length;
    } else break;
  }
  return fields;
}
