// Lectura segura de un zip (D-026). Se revisa el índice completo antes de descomprimir nada. Si la
// suma de lo descomprimido, el número de archivos o el tamaño de uno pasa los límites, o si una ruta
// sale de su carpeta, se rechaza todo. Solo se descomprimen los archivos que pide quien llama, así
// los medios, que pueden pesar cientos de megas, nunca se abren. Nada se escribe a disco.
import { unzipSync, type UnzipFileInfo } from 'fflate';
import { ImportError } from './types';
import type { ImportLimits } from './limits';

/** El zip empieza con PK. Sirve para saber si un archivo es un paquete antes de abrirlo */
export function looksLikeZip(bytes: Uint8Array): boolean {
  return (
    bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 3 && bytes[3] === 4
  );
}

/** Una ruta que sale de su carpeta, es absoluta o usa trucos para escaparse */
export function isUnsafePath(name: string): boolean {
  if (name.includes('\0') || name.includes('\\')) return true;
  if (name.startsWith('/') || /^[A-Za-z]:/.test(name)) return true;
  return name.split('/').some((segment) => segment === '..');
}

export interface ZipPeek {
  /** Nombres de todos los archivos del zip */
  names: string[];
}

/** Solo los nombres del zip, sin descomprimir nada. Revisa los límites y las rutas */
export function listZip(bytes: Uint8Array, limits: ImportLimits): ZipPeek {
  const names: string[] = [];
  readZip(bytes, limits, (info) => {
    names.push(info.name);
    return false;
  });
  return { names };
}

/**
 * Descomprime solo los archivos que acepta wanted, después de revisar todo el índice. Devuelve un
 * mapa de nombre a bytes
 */
export function readZip(
  bytes: Uint8Array,
  limits: ImportLimits,
  wanted: (info: UnzipFileInfo) => boolean,
): Record<string, Uint8Array> {
  let files = 0;
  let unpacked = 0;
  const accepted = new Set<string>();
  try {
    unzipSync(bytes, {
      filter: (info) => {
        files += 1;
        if (files > limits.maxFiles) throw new ImportError('too_many_files');
        if (isUnsafePath(info.name)) throw new ImportError('unsafe_path', info.name);
        unpacked += info.originalSize;
        if (unpacked > limits.maxUnpackedBytes) throw new ImportError('too_large');
        // Los archivos de medios tienen su propio tope. Las carpetas no pesan nada
        if (info.originalSize > limits.maxMediaBytes && !info.name.startsWith('collection.'))
          throw new ImportError('too_large', info.name);
        const take = wanted(info);
        if (take) accepted.add(info.name);
        return false;
      },
    });
  } catch (error) {
    throw error instanceof ImportError ? error : new ImportError('corrupt');
  }
  if (accepted.size === 0) return {};
  try {
    return unzipSync(bytes, { filter: (info) => accepted.has(info.name) });
  } catch (error) {
    throw error instanceof ImportError ? error : new ImportError('corrupt');
  }
}
