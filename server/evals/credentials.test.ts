import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { checkModels } from './anthropic.ts';
import { describeCredentials, loadEvalCredentials } from './credentials.ts';
import Anthropic from '@anthropic-ai/sdk';

const dirs: string[] = [];
const envFile = (content: string | null) => {
  const dir = mkdtempSync(join(tmpdir(), 'enarm-eval-cred-'));
  dirs.push(dir);
  const file = join(dir, '.env.local');
  if (content !== null) writeFileSync(file, content);
  return file;
};

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('credenciales de las evaluaciones', () => {
  it('sin archivo ni entorno no hay claves', () => {
    const credentials = loadEvalCredentials({ envFile: envFile(null), env: {} });
    expect(credentials).toEqual({
      anthropicKey: null,
      openaiKey: null,
      sources: { anthropic: null, openai: null },
    });
    expect(describeCredentials(credentials)).toBe(
      'ENARM_ANTHROPIC_KEY no está. ENARM_OPENAI_KEY no está.',
    );
  });

  it('el archivo manda sobre el entorno y el entorno cubre lo que falta', () => {
    const env: Record<string, string | undefined> = {
      ENARM_ANTHROPIC_KEY: 'clave-del-entorno-a',
      ENARM_OPENAI_KEY: 'clave-del-entorno-o',
      OTRA: 'se queda',
    };
    const credentials = loadEvalCredentials({
      envFile: envFile('ENARM_ANTHROPIC_KEY=clave-del-archivo\n'),
      env,
    });
    expect(credentials.anthropicKey).toBe('clave-del-archivo');
    expect(credentials.openaiKey).toBe('clave-del-entorno-o');
    expect(credentials.sources).toEqual({ anthropic: 'file', openai: 'env' });
    // Se borran del entorno para que ningún proceso hijo las herede
    expect(env).toEqual({ OTRA: 'se queda' });
  });

  it('un valor vacío cuenta como que no está', () => {
    const credentials = loadEvalCredentials({
      envFile: envFile('ENARM_ANTHROPIC_KEY=\nENARM_OPENAI_KEY=   \n'),
      env: { ENARM_ANTHROPIC_KEY: ' ' },
    });
    expect(credentials.anthropicKey).toBeNull();
    expect(credentials.openaiKey).toBeNull();
  });

  it('la descripción dice de dónde salió cada clave y nunca su valor', () => {
    const credentials = loadEvalCredentials({
      envFile: envFile('ENARM_OPENAI_KEY=valor-secreto-openai\n'),
      env: { ENARM_ANTHROPIC_KEY: 'valor-secreto-anthropic' },
    });
    const text = describeCredentials(credentials);
    expect(text).toBe(
      'ENARM_ANTHROPIC_KEY está en el entorno de la sesión. ENARM_OPENAI_KEY está en server/.env.local.',
    );
    expect(text).not.toContain('valor-secreto');
  });
});

describe('revisión de modelos con la Models API', () => {
  const notFound = () =>
    new Anthropic.NotFoundError(404, { type: 'error' }, 'no existe', new Headers());

  it('marca como no disponible un modelo que la cuenta no tiene', async () => {
    const api = {
      retrieve: (id: string) =>
        id === 'claude-haiku-5-5'
          ? Promise.resolve({ id, display_name: 'Claude Haiku 5.5' })
          : Promise.reject(notFound()),
    };
    expect(await checkModels(api, ['claude-haiku-5-5', 'claude-opus-9'])).toEqual([
      { id: 'claude-haiku-5-5', available: true, displayName: 'Claude Haiku 5.5' },
      { id: 'claude-opus-9', available: false, displayName: null },
    ]);
  });

  it('una clave inválida detiene todo con un mensaje propio', async () => {
    const api = {
      retrieve: () =>
        Promise.reject(
          new Anthropic.AuthenticationError(
            401,
            { type: 'error' },
            'texto de la api',
            new Headers(),
          ),
        ),
    };
    await expect(checkModels(api, ['claude-haiku-5-5'])).rejects.toThrow(
      'La clave de evaluaciones no es válida o no tiene permiso.',
    );
  });
});
