// Lee los prompts de sus archivos, para el proxy de desarrollo y para npm run ai:sync (B12, 1.2 y
// 1.3 del plan). Aquí solo se leen los archivos de server/prompts y de prompts con su versión y su
// huella SHA-256. El armado es el mismo de la Edge Function, buildPromptSets del núcleo. No importa
// nada generado, para que ai:sync funcione aunque la copia generada falte o esté vieja.
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ENGINE_PROMPT_FILE,
  MASTER_FILE,
  MASTER_VERSION,
  PROVISIONAL_FILE,
  PROVISIONAL_VERSION,
  ROOT_PROMPTS_PATH,
  SERVER_PROMPTS_PATH,
  type PromptSource,
} from '../../../supabase/functions/_shared/ai/promptSources.ts';

export const SERVER_PROMPTS_DIR = fileURLToPath(new URL('../../prompts', import.meta.url));
export const ROOT_PROMPTS_DIR = fileURLToPath(new URL('../../../prompts', import.meta.url));

export interface PromptDirs {
  serverPromptsDir: string;
  rootPromptsDir: string;
}

export const REPO_PROMPT_DIRS: PromptDirs = {
  serverPromptsDir: SERVER_PROMPTS_DIR,
  rootPromptsDir: ROOT_PROMPTS_DIR,
};

const sha256 = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');

const source = (file: string, version: string, text: string): PromptSource => ({
  file,
  version,
  sha256: sha256(text),
  text,
});

/**
 * Los archivos de prompt en orden de ruta. De server/prompts los que se llaman como un prompt de
 * motor y de prompts el maestro y el provisional de flashcards, si existen
 */
export function readPromptSources(dirs: PromptDirs = REPO_PROMPT_DIRS): PromptSource[] {
  const sources: PromptSource[] = [];
  for (const name of readdirSync(dirs.serverPromptsDir).sort()) {
    const match = ENGINE_PROMPT_FILE.exec(name);
    if (!match?.[1]) continue;
    const text = readFileSync(join(dirs.serverPromptsDir, name), 'utf8');
    sources.push(source(`${SERVER_PROMPTS_PATH}/${name}`, match[1], text));
  }
  for (const [name, version] of [
    [MASTER_FILE, MASTER_VERSION],
    [PROVISIONAL_FILE, PROVISIONAL_VERSION],
  ] as const) {
    const path = join(dirs.rootPromptsDir, name);
    if (!existsSync(path)) continue;
    sources.push(source(`${ROOT_PROMPTS_PATH}/${name}`, version, readFileSync(path, 'utf8')));
  }
  return sources;
}
