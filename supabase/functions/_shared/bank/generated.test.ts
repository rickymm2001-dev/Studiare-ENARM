// Las copias de generated/ tienen que ser iguales a lo que produce npm run bank:shared (B11, 3.12 del
// plan de B11). Si alguien cambia el convertidor, la huella, los contratos, el motor de estructura o
// las taxonomías y no corre el script, esta prueba falla.
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GENERATED_DIR, generateBankShared } from '../../../../scripts/content/sync-bank-shared.ts';

const ROOT = resolve(import.meta.dirname, '../../../..');

describe('copias generadas para bank-sync', () => {
  it('cada archivo en disco es igual al que se genera y no sobra ninguno', async () => {
    const files = await generateBankShared(ROOT);
    expect(files.size).toBe(9);
    for (const [path, text] of files) {
      expect(readFileSync(resolve(ROOT, path), 'utf8'), path).toBe(text);
    }
    const onDisk = readdirSync(resolve(ROOT, GENERATED_DIR)).map(
      (name) => `${GENERATED_DIR}/${name}`,
    );
    expect(onDisk.sort()).toEqual([...files.keys()].sort());
  });

  it('las copias no importan de src ni de zod', async () => {
    const files = await generateBankShared(ROOT);
    for (const [path, text] of files) {
      expect(text, path).not.toMatch(/from '(@\/|\.\.\/|zod)/);
      expect(text, path).toMatch(/^\/\/ Generado por scripts\/content\/sync-bank-shared\.ts/);
    }
  });
});
