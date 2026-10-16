import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  bundledPromptSets,
  MASTER_MARKER,
} from '../../../supabase/functions/_shared/ai/prompts.ts';
import { loadPrompts, ROOT_PROMPTS_DIR, SERVER_PROMPTS_DIR } from './index.ts';
import { readPromptSources } from './promptFiles.ts';

const dirs: string[] = [];
const tempDir = () => {
  const dir = mkdtempSync(join(tmpdir(), 'ai-prompts-'));
  dirs.push(dir);
  return dir;
};
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const PROVISIONAL =
  '# Provisional\n\n## Reglas que no se pueden saltar\n\n1. Cita tal cual.\n\n## Lo que hace la app después\n\nTexto.';

function promptDirs(master: string | null) {
  const server = tempDir();
  for (const engine of ['forgetting', 'weekly_report', 'bias_tips', 'restructure']) {
    writeFileSync(join(server, `${engine}.base.v1.md`), 'viejo');
    writeFileSync(join(server, `${engine}.base.v10.md`), 'nuevo');
    writeFileSync(join(server, `${engine}.base.v2.md`), 'medio');
  }
  writeFileSync(join(server, 'LEEME.md'), 'No es un prompt de motor');
  const root = tempDir();
  writeFileSync(join(root, 'flashcards_provisional.md'), PROVISIONAL);
  if (master !== null) writeFileSync(join(root, 'flashcards_maestro.md'), master);
  return { serverPromptsDir: server, rootPromptsDir: root };
}

describe('prompts del repositorio', () => {
  it('el proxy de desarrollo y la Edge Function usan los mismos prompts', () => {
    const fromFiles = loadPrompts({
      serverPromptsDir: SERVER_PROMPTS_DIR,
      rootPromptsDir: ROOT_PROMPTS_DIR,
    });
    expect(fromFiles).toEqual(bundledPromptSets());
  });
});

describe('lectura de los archivos', () => {
  it('lee los prompts de motor y los de flashcards con su versión y su huella', () => {
    const sources = readPromptSources(promptDirs(null));
    expect(sources.map((source) => source.file)).toContain('server/prompts/forgetting.base.v10.md');
    expect(sources.map((source) => source.file)).not.toContain('server/prompts/LEEME.md');
    const provisional = sources.find(
      (source) => source.file === 'prompts/flashcards_provisional.md',
    );
    expect(provisional).toMatchObject({ version: 'flashcards.provisional.v1', text: PROVISIONAL });
    expect(provisional?.sha256).toBe(createHash('sha256').update(PROVISIONAL).digest('hex'));
    expect(sources.some((source) => source.file === 'prompts/flashcards_maestro.md')).toBe(false);
  });

  it('usa la versión más alta de cada motor', () => {
    expect(loadPrompts(promptDirs(null)).forgetting).toEqual({
      version: 'forgetting.base.v10',
      text: 'nuevo',
    });
  });

  it('con prompt maestro lo usa y le agrega las reglas fijas de la app', () => {
    const prompts = loadPrompts(promptDirs(`Intro\n${MASTER_MARKER}\nMi prompt de Ricardo`));
    expect(prompts.flashcards.version).toBe('flashcards.maestro.v1');
    expect(prompts.flashcards.text.startsWith('Mi prompt de Ricardo')).toBe(true);
    expect(loadPrompts(promptDirs(`Intro\n${MASTER_MARKER}\n  \n`)).flashcards.version).toBe(
      'flashcards.provisional.v1',
    );
  });

  it('falla de entrada si falta el prompt de un motor', () => {
    const root = tempDir();
    writeFileSync(join(root, 'flashcards_provisional.md'), 'x');
    expect(() => loadPrompts({ serverPromptsDir: tempDir(), rootPromptsDir: root })).toThrow(
      'Falta el prompt',
    );
  });
});
