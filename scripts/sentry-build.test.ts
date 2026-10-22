// Subir los mapas de código a Sentry solo en el build del CI (B15, 2.3 y 6.3)
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveConfig } from 'vite';
import { buildIdOf, sentryUploadConfig } from './sentry-build.ts';

const FULL = {
  SENTRY_AUTH_TOKEN: 'sntrys_ejemplo-falso',
  SENTRY_ORG: 'plexus',
  SENTRY_PROJECT: 'studiare-web',
};

describe('sentryUploadConfig', () => {
  it('con las tres variables arma las opciones, con la versión del commit', () => {
    expect(sentryUploadConfig({ ...FULL, GITHUB_SHA: 'abcdef0123456789' })).toEqual({
      org: 'plexus',
      project: 'studiare-web',
      authToken: 'sntrys_ejemplo-falso',
      release: 'abcdef0',
    });
  });

  it('sin el commit la versión es local, igual que VITE_BUILD_ID', () => {
    expect(sentryUploadConfig(FULL)?.release).toBe('local');
    expect(buildIdOf({})).toBe('local');
    expect(buildIdOf({ GITHUB_SHA: '  ' })).toBe('local');
  });

  it('si falta cualquiera de las tres, o está vacía, no sube nada', () => {
    for (const missing of Object.keys(FULL)) {
      const env: Record<string, string | undefined> = { ...FULL, [missing]: undefined };
      expect(sentryUploadConfig(env), missing).toBeNull();
      expect(sentryUploadConfig({ ...env, [missing]: '   ' }), missing).toBeNull();
    }
    expect(sentryUploadConfig({})).toBeNull();
  });

  it('rechaza un token con espacios y nombres de organización o proyecto que no son nombres cortos', () => {
    expect(sentryUploadConfig({ ...FULL, SENTRY_AUTH_TOKEN: 'dos palabras' })).toBeNull();
    expect(sentryUploadConfig({ ...FULL, SENTRY_ORG: 'mi org' })).toBeNull();
    expect(sentryUploadConfig({ ...FULL, SENTRY_PROJECT: '../otro' })).toBeNull();
    expect(sentryUploadConfig({ ...FULL, SENTRY_PROJECT: 'a/b' })).toBeNull();
  });
});

// Cargar la configuración de Vite completa, con el plugin de PWA, tarda más que una prueba normal
vi.setConfig({ testTimeout: 90_000 });

describe('vite.config.ts con y sin las variables de Sentry', () => {
  const saved = { ...process.env };
  afterEach(() => {
    for (const key of Object.keys(FULL)) {
      if (saved[key] === undefined) Reflect.deleteProperty(process.env, key);
      else process.env[key] = saved[key];
    }
  });

  const resolved = () =>
    resolveConfig(
      {
        root: join(import.meta.dirname, '..'),
        logLevel: 'silent',
        configFile: join(import.meta.dirname, '..', 'vite.config.ts'),
      },
      'build',
      'production',
    );

  it('sin las variables no hay mapas ni plugin de Sentry, y el build no cambia', async () => {
    for (const key of Object.keys(FULL)) Reflect.deleteProperty(process.env, key);
    const config = await resolved();
    expect(config.build.sourcemap).toBe(false);
    expect(config.plugins.some((plugin) => plugin.name.includes('sentry'))).toBe(false);
    expect(config.plugins.some((plugin) => plugin.name === 'enarm-without-source-maps')).toBe(
      false,
    );
  });

  it('con las tres variables genera mapas ocultos, sube con el plugin y los quita del build', async () => {
    Object.assign(process.env, FULL);
    const config = await resolved();
    expect(config.build.sourcemap).toBe('hidden');
    expect(config.plugins.some((plugin) => plugin.name.includes('sentry'))).toBe(true);
    expect(config.plugins.some((plugin) => plugin.name === 'enarm-without-source-maps')).toBe(true);
  });
});
