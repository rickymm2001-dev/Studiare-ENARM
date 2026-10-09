// Límites del importador (D-026 y D-093). Los del paquete .apkg son los de D-026. Los de hojas y
// documentos son juicio de diseño, ajustable. Se revisan antes de descomprimir, con los tamaños que
// declara el zip, y la descompresión nunca pasa del tamaño declarado.

const MB = 1024 * 1024;

export interface ImportLimits {
  /** Tamaño descomprimido total de un paquete. D-026 */
  maxUnpackedBytes: number;
  /** Archivos dentro de un paquete. D-026 */
  maxFiles: number;
  /** Cada archivo de medios. D-026 */
  maxMediaBytes: number;
  /** La base de datos de un .apkg, que se abre en memoria */
  maxDatabaseBytes: number;
  /** Un CSV, una hoja de Excel o un documento de Word */
  maxDocumentBytes: number;
  /** Notas por importación */
  maxNotes: number;
  /** Largo de un campo ya convertido a HTML, igual que la nota guardada */
  maxFieldChars: number;
}

export const IMPORT_LIMITS: ImportLimits = {
  maxUnpackedBytes: 600 * MB,
  maxFiles: 5000,
  maxMediaBytes: 50 * MB,
  maxDatabaseBytes: 300 * MB,
  maxDocumentBytes: 50 * MB,
  maxNotes: 50_000,
  maxFieldChars: 20_000,
};
