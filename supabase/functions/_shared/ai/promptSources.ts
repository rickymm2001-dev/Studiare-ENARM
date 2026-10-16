// Dónde viven los prompts y cómo se llaman (B12, 1.3 del plan). Sin importaciones, para que
// scripts/ai/sync-function-sources.ts lea los archivos sin cargar nada generado por él mismo.

/** Un archivo de prompt tal como está en el repositorio */
export interface PromptSource {
  /** Ruta desde la raíz del repositorio, como server/prompts/forgetting.base.v1.md */
  file: string;
  /** forgetting.base.v1, flashcards.provisional.v1 o flashcards.maestro.v1 */
  version: string;
  /** SHA-256 en hexadecimal del texto tal cual está en el archivo */
  sha256: string;
  text: string;
}

/** Carpetas de los prompts, como aparecen en PromptSource.file */
export const SERVER_PROMPTS_PATH = 'server/prompts';
export const ROOT_PROMPTS_PATH = 'prompts';

/** Nombre de un prompt de motor en server/prompts, como forgetting.base.v1.md */
export const ENGINE_PROMPT_FILE = /^([a-z_]+\.[a-z0-9]+\.v(\d+))\.md$/;

export const PROVISIONAL_FILE = 'flashcards_provisional.md';
export const MASTER_FILE = 'flashcards_maestro.md';
export const PROVISIONAL_VERSION = 'flashcards.provisional.v1';
export const MASTER_VERSION = 'flashcards.maestro.v1';
