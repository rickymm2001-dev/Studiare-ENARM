import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { KEY_VARIABLE } from './config.ts';
import { loadAiCredentials } from './env.ts';

// Valor falso que no se parece a una clave real
const FAKE_KEY = 'clave-falsa-de-prueba';

const dirs: string[] = [];
function envFileWith(content: string | null): string {
  const dir = mkdtempSync(join(tmpdir(), 'enarm-env-'));
  dirs.push(dir);
  const file = join(dir, '.env.local');
  if (content !== null) writeFileSync(file, content);
  return file;
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('lectura de server/.env.local', () => {
  it('sin archivo corre en modo simulado', () => {
    expect(loadAiCredentials({ envFile: envFileWith(null) })).toEqual({
      mode: 'mock',
      apiKey: null,
    });
  });

  it('con la clave corre en modo real y no la copia a process.env', () => {
    const credentials = loadAiCredentials({
      envFile: envFileWith(`${KEY_VARIABLE}=${FAKE_KEY}\n`),
    });
    expect(credentials).toEqual({ mode: 'real', apiKey: FAKE_KEY });
    expect(process.env[KEY_VARIABLE]).toBeUndefined();
  });

  it('con la clave vacía o con otras variables corre en modo simulado', () => {
    expect(loadAiCredentials({ envFile: envFileWith(`${KEY_VARIABLE}=\n`) }).mode).toBe('mock');
    expect(loadAiCredentials({ envFile: envFileWith('OTRA_VARIABLE=valor\n') }).mode).toBe('mock');
  });

  it('--mock fuerza el modo simulado aunque haya clave', () => {
    const envFile = envFileWith(`${KEY_VARIABLE}=${FAKE_KEY}\n`);
    expect(loadAiCredentials({ envFile, forceMock: true })).toEqual({ mode: 'mock', apiKey: null });
  });

  it('el archivo de ejemplo nombra la variable sin valor', async () => {
    const { readFileSync } = await import('node:fs');
    const example = readFileSync(join(import.meta.dirname, '..', '.env.example'), 'utf8');
    expect(example).toMatch(new RegExp(`^${KEY_VARIABLE}=$`, 'm'));
    const values = example
      .split('\n')
      .filter((line) => line.trim() && !line.startsWith('#'))
      .map((line) => line.split('=')[1]?.trim());
    expect(values.every((value) => value === '')).toBe(true);
  });
});
