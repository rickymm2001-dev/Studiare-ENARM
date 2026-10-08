// Tipos del importador (D-093). Un archivo, de cualquier formato, se lee a una lista de notas en
// bruto y una lista de avisos. Nada de esto toca la base. Guardar es otro paso (importParsed) que
// sanea el texto, evita duplicados y crea los mazos privados del alumno.

export type ImportSource = 'apkg' | 'csv' | 'xlsx' | 'docx';

export type ImportNoteKind = 'basic' | 'basic_reverse' | 'cloze';

export interface ParsedNote {
  /** Identificador de la nota en el archivo de origen, para no duplicarla al volver a importar */
  guid: string | null;
  kind: ImportNoteKind;
  /** Frente, o el texto con huecos si es cloze */
  front: string;
  /** Reverso, o la nota extra si es cloze */
  back: string;
  /** El contenido es HTML del archivo. Si no, es texto plano y se escapa al guardar */
  html: boolean;
  tags: string[];
  /** Mazo dentro del archivo, de la raíz a la hoja. Vacío es el mazo raíz de la importación */
  deckPath: string[];
  /** Fila o posición en el archivo, para decir dónde está un problema */
  position: number | null;
}

export type ImportWarningCode =
  /** Imágenes y audios del archivo, que por ahora no se importan */
  | 'media_skipped'
  | 'image_occlusion'
  | 'extra_templates'
  | 'extra_columns'
  | 'deck_too_deep'
  | 'revlog_ignored';

export interface ImportWarning {
  code: ImportWarningCode;
  count: number;
}

export type RowErrorCode =
  'empty_front' | 'empty_back' | 'cloze_without_holes' | 'too_long' | 'too_many_notes';

export interface RowError {
  position: number | null;
  code: RowErrorCode;
}

export interface ParsedImport {
  source: ImportSource;
  fileName: string;
  notes: ParsedNote[];
  warnings: ImportWarning[];
  errors: RowError[];
}

export type ImportErrorCode =
  /** El archivo o su contenido descomprimido pasa los límites */
  | 'too_large'
  | 'too_many_files'
  /** Una ruta dentro del zip sale de su carpeta */
  | 'unsafe_path'
  /** No es un archivo que se pueda leer */
  | 'corrupt'
  | 'unsupported'
  | 'no_collection'
  | 'empty';

export class ImportError extends Error {
  readonly code: ImportErrorCode;

  constructor(code: ImportErrorCode, detail?: string) {
    super(detail ?? code);
    this.code = code;
    this.name = 'ImportError';
  }
}

/** Cuenta avisos del mismo tipo y los junta */
export class WarningTally {
  private readonly counts = new Map<ImportWarningCode, number>();

  add(code: ImportWarningCode, count = 1): void {
    if (count > 0) this.counts.set(code, (this.counts.get(code) ?? 0) + count);
  }

  toList(): ImportWarning[] {
    return [...this.counts].map(([code, count]) => ({ code, count }));
  }
}
