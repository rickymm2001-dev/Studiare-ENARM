// La analítica es una sola puerta y un solo transporte (B15, 1.9 y 6.1). Se revisa con el código de src
//   - Solo config.ts lee VITE_POSTHOG_KEY y VITE_POSTHOG_HOST
//   - Solo transport.ts hace peticiones al host de PostHog (fetch, beacon, XHR o un script de fuera)
//   - Nada importa posthog-js, y nada de la analítica toca cookies, localStorage ni sessionStorage
//   - Ninguna pantalla manda eventos por su cuenta: todas pasan por track del catálogo
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(import.meta.dirname, '..', '..');

function listFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? listFiles(path) : [path];
  });
}

const rel = (path: string) => relative(SRC, path).split(sep).join('/');
const isTest = (file: string) => /\.test\.tsx?$/.test(file) || file.includes(`${sep}testing${sep}`);
const withoutComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');

const sources = listFiles(SRC)
  .filter((file) => /\.tsx?$/.test(file) && !isTest(file))
  .map((file) => ({ file: rel(file), code: withoutComments(readFileSync(file, 'utf8')) }));

const filesThat = (test: (code: string) => boolean) =>
  sources.filter(({ code }) => test(code)).map(({ file }) => file);

describe('arquitectura de la analítica', () => {
  it('solo config.ts lee las variables de PostHog', () => {
    // Leerlas es env.VITE_POSTHOG_x o import.meta.env['VITE_POSTHOG_x']. Nombrarlas en un texto, como hace la
    // descripción de la bandera, no las lee
    expect(filesThat((code) => /env(\.|\[\s*['"])VITE_POSTHOG_(KEY|HOST)/.test(code))).toEqual([
      'data/analytics/config.ts',
    ]);
  });

  it('solo transport.ts hace peticiones al host de PostHog', () => {
    // El host solo llega por config.host, y las direcciones de PostHog no se escriben en ningún otro lado
    // salvo en la lista cerrada de csp.ts, que no hace peticiones
    expect(filesThat((code) => code.includes('posthog.com'))).toEqual(['config/csp.ts']);
    expect(filesThat((code) => code.includes('/batch/'))).toEqual(['data/analytics/transport.ts']);
    // Y dentro del transporte, el único fetch es el que recibe el cliente
    const transport = sources.find(({ file }) => file === 'data/analytics/transport.ts');
    expect(transport?.code).toMatch(/fetch\(input, init\)/);
    expect(transport?.code).not.toMatch(/sendBeacon|XMLHttpRequest|new Image|createElement/);
  });

  it('nadie importa posthog-js ni carga un script de fuera', () => {
    expect(filesThat((code) => /posthog-js|posthog-node|from ['"]posthog/.test(code))).toEqual([]);
    expect(filesThat((code) => /createElement\(['"]script['"]\)/.test(code))).toEqual([]);
  });

  it('la analítica no toca cookies ni el almacenamiento del navegador', () => {
    const analytics = sources.filter(({ file }) => file.startsWith('data/analytics/'));
    expect(analytics.length).toBeGreaterThan(5);
    for (const { file, code } of analytics) {
      expect(code, file).not.toMatch(/document\.cookie|localStorage|sessionStorage|indexedDB/);
    }
  });

  it('track es la única puerta y solo el control y el cliente enchufan quien la recibe', () => {
    expect(filesThat((code) => /export function track\b/.test(code))).toEqual([
      'data/analytics/catalog.ts',
    ]);
    expect(filesThat((code) => code.includes('setAnalyticsSink('))).toEqual([
      'data/analytics/catalog.ts',
      'data/analytics/client.ts',
      'data/analytics/control.ts',
    ]);
  });
});
