// Descompresión zstd con tope (D-026). El formato nuevo de .apkg comprime la base con zstd y una
// bomba de compresión podría pedir muchísima memoria. Se lee el tamaño que declara el marco, si lo
// trae, y además se cuenta lo que sale mientras se descomprime para cortar en cuanto pasa el tope.
import { Decompress } from 'fzstd';
import { ImportError } from './types';

const MAGIC = [0x28, 0xb5, 0x2f, 0xfd];

/** El tamaño del contenido que declara el primer marco, o null si no lo declara */
export function zstdDeclaredSize(bytes: Uint8Array): number | null {
  if (bytes.length < 6 || MAGIC.some((byte, index) => bytes[index] !== byte)) return null;
  const descriptor = bytes[4] ?? 0;
  const sizeFlag = descriptor >> 6;
  const singleSegment = (descriptor & 0x20) !== 0;
  const dictionaryBytes = [0, 1, 2, 4][descriptor & 3] ?? 0;
  const offset = 5 + (singleSegment ? 0 : 1) + dictionaryBytes;
  const sizeBytes = sizeFlag === 0 ? (singleSegment ? 1 : 0) : [0, 2, 4, 8][sizeFlag];
  if (!sizeBytes || offset + sizeBytes > bytes.length) return null;
  let size = 0;
  for (let index = 0; index < sizeBytes; index += 1) {
    size += (bytes[offset + index] ?? 0) * 2 ** (8 * index);
  }
  return sizeFlag === 1 ? size + 256 : size;
}

export function decompressZstd(bytes: Uint8Array, maxBytes: number): Uint8Array {
  const declared = zstdDeclaredSize(bytes);
  if (declared !== null && declared > maxBytes) throw new ImportError('too_large');
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    const stream = new Decompress((chunk) => {
      total += chunk.length;
      if (total > maxBytes) throw new ImportError('too_large');
      chunks.push(chunk);
    });
    stream.push(bytes, true);
  } catch (error) {
    throw error instanceof ImportError ? error : new ImportError('corrupt');
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.length;
  }
  return out;
}
