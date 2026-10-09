// La imagen del proxy alojado (D-103). Revisa que el Dockerfile copie todo lo que el proxy importa,
// para no descubrirlo cuando el alojamiento no arranque, y que no lleve ninguna llave ni archivo de
// entorno. No necesita Docker.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(import.meta.dirname, '..', '..');
const ENTRY = join(ROOT, 'server', 'src', 'hosted', 'main.ts');
const dockerfile = readFileSync(join(ROOT, 'Dockerfile'), 'utf8');

/** Rutas relativas que importa un archivo, sin las de paquetes */
function localImports(file: string): string[] {
  const text = readFileSync(file, 'utf8');
  const found = [...text.matchAll(/(?:from|import)\s*\(?\s*['"](\.{1,2}\/[^'"]+)['"]/g)];
  return found.flatMap(([, specifier]) => (specifier ? [resolve(dirname(file), specifier)] : []));
}

function closure(entry: string): string[] {
  const seen = new Set<string>();
  const pending = [entry];
  while (pending.length > 0) {
    const file = pending.pop() as string;
    if (seen.has(file) || !existsSync(file)) continue;
    seen.add(file);
    // Los tipos y los archivos de prueba no viajan a la imagen ni se ejecutan allí
    if (file.endsWith('.ts')) pending.push(...localImports(file));
  }
  return [...seen];
}

const copied = [...dockerfile.matchAll(/^COPY\s+(\S+)\s+\S+\s*$/gm)]
  .map(([, source]) => source ?? '')
  .filter((source) => !source.startsWith('package'));

describe('imagen del proxy alojado', () => {
  it('copia todo lo que el proxy importa', () => {
    const missing = closure(ENTRY)
      .map((file) => relative(ROOT, file))
      .filter((file) => !copied.some((source) => file === source || file.startsWith(`${source}/`)));
    expect(missing).toEqual([]);
  });

  it('copia lo que el proxy lee al arrancar, como los prompts', () => {
    expect(copied).toContain('prompts');
    expect(copied).toContain('server');
  });

  it('no lleva llaves, ni archivos de entorno, ni argumentos con secretos', () => {
    const lines = dockerfile.split('\n').filter((line) => !line.trim().startsWith('#'));
    for (const line of lines) {
      expect(line).not.toMatch(/^(ENV|ARG)\s+\S*(KEY|SECRET|TOKEN|PASSWORD)/i);
      expect(line).not.toMatch(/^(COPY|ADD)\s.*\.env/);
      expect(line).not.toMatch(/sk-ant-|sb_secret_|eyJ[A-Za-z0-9_-]{8,}\./);
    }
  });

  it('corre sin permisos de administrador y con una versión de Node que acepta el proyecto', () => {
    expect(dockerfile).toMatch(/^USER node$/m);
    expect(dockerfile).toMatch(/^FROM node:(2[4-9]|[3-9]\d)/m);
  });

  it('el .dockerignore deja fuera los archivos de entorno y los datos locales del proxy', () => {
    const ignore = readFileSync(join(ROOT, '.dockerignore'), 'utf8');
    for (const entry of [
      '**/.env*',
      'server/.env.local',
      'server/ai-config.local.json',
      'node_modules',
    ]) {
      expect(ignore).toContain(entry);
    }
  });
});
