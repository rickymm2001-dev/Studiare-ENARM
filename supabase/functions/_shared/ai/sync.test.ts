// La copia de los motores y los prompts generados tienen que ser iguales a lo que produce
// npm run ai:sync (B12, 1.3 del plan). Si alguien cambia un motor de IA, la lista de textos
// académicos o un prompt y no corre el script, esta prueba falla.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  diffFunctionSources,
  ENGINE_SOURCES,
  ENGINES_DIR,
  GENERATED_MARK,
  generateFunctionSources,
  PROMPTS_MODULE,
} from '../../../../scripts/ai/sync-function-sources.ts';
import { PROMPT_SOURCES } from './prompts.generated.ts';

const ROOT = resolve(import.meta.dirname, '../../../..');

describe('copia generada para la Edge Function de IA', () => {
  it('está al día. Si falla, corre `npm run ai:sync`', () => {
    expect(diffFunctionSources(ROOT), 'corre `npm run ai:sync`').toEqual([]);
  });

  it('copia los siete motores de IA y la lista de textos académicos tal cual, con su encabezado', () => {
    const files = generateFunctionSources(ROOT);
    expect(ENGINE_SOURCES).toHaveLength(8);
    for (const source of ENGINE_SOURCES) {
      const name = source.slice(source.lastIndexOf('/') + 1);
      const copy = files.get(`${ENGINES_DIR}/${name}`);
      expect(copy, source).toBeDefined();
      const lines = (copy ?? '').split('\n');
      expect(lines[0], source).toContain(GENERATED_MARK);
      expect(lines.slice(2).join('\n'), source).toBe(readFileSync(resolve(ROOT, source), 'utf8'));
    }
  });

  it('las copias solo importan zod y entre ellas', () => {
    for (const [path, text] of generateFunctionSources(ROOT)) {
      if (!path.startsWith(ENGINES_DIR)) continue;
      const specifiers = [...text.matchAll(/\bfrom\s+'([^']+)'/g)].map((match) => match[1]);
      for (const specifier of specifiers) {
        expect(specifier, path).toMatch(/^(zod|\.\/[A-Za-z]+\.ts)$/);
      }
    }
  });

  it('los prompts generados traen versión, huella y texto de cada archivo', () => {
    expect(generateFunctionSources(ROOT).has(PROMPTS_MODULE)).toBe(true);
    const files = PROMPT_SOURCES.map((prompt) => prompt.file);
    expect(files).toContain('prompts/flashcards_provisional.md');
    expect(files).toContain('prompts/flashcards_maestro.md');
    for (const engine of ['forgetting', 'weekly_report', 'bias_tips', 'restructure']) {
      expect(
        files.some((file) => file.startsWith(`server/prompts/${engine}.`)),
        engine,
      ).toBe(true);
    }
    for (const prompt of PROMPT_SOURCES) {
      expect(prompt.sha256, prompt.file).toMatch(/^[0-9a-f]{64}$/);
      expect(prompt.text, prompt.file).toBe(readFileSync(resolve(ROOT, prompt.file), 'utf8'));
    }
  });
});
