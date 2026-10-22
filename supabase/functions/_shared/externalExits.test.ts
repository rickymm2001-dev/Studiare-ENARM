// Un solo punto de salida a servicios externos por tipo (B15 del plan del cambio, 2.2 y 5.3). Resend solo se
// toca desde resend.ts, Sentry desde monitoring.ts y PostHog desde analyticsFlush.ts. Así es fácil revisar
// qué sale de las funciones y que nada lleva datos de más. Esta prueba lee el código fuente y falla si otro
// archivo de las funciones menciona la dirección de uno de ellos.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const FUNCTIONS = resolve(import.meta.dirname, '..');

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return name.endsWith('.ts') && !name.endsWith('.test.ts') ? [path] : [];
  });
}

const files = sources(FUNCTIONS).map((path) => ({
  path: relative(FUNCTIONS, path).replaceAll('\\', '/'),
  text: readFileSync(path, 'utf8'),
}));

/** Los archivos que mencionan algo, sin contar comentarios de línea */
const mentioning = (pattern: RegExp) =>
  files
    .filter((file) =>
      file.text
        .split('\n')
        .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
        .some((line) => pattern.test(line)),
    )
    .map((file) => file.path)
    .sort();

describe('puntos de salida a servicios externos', () => {
  it('api.resend.com solo en resend.ts y su doble', () => {
    expect(mentioning(/api\.resend\.com/)).toEqual(['_shared/fakeResend.ts', '_shared/resend.ts']);
  });

  it('PostHog solo en analyticsFlush.ts', () => {
    expect(mentioning(/posthog\.com|\/batch\//i)).toEqual(['_shared/analyticsFlush.ts']);
  });

  it('el sobre de Sentry solo en monitoring.ts', () => {
    expect(mentioning(/sentry\.io|\/envelope\/|x-sentry-auth/i)).toEqual(['_shared/monitoring.ts']);
  });

  it('el entorno de las llaves nuevas solo lo lee runtime.ts, y SENTRY_DSN también monitoring.ts', () => {
    expect(
      mentioning(/['"](?:RESEND_API_KEY|EMAIL_FROM|POSTHOG_PROJECT_KEY|POSTHOG_HOST)['"]/),
    ).toEqual(['_shared/runtime.ts']);
    expect(mentioning(/['"]SENTRY_DSN['"]/)).toEqual([
      '_shared/monitoring.ts',
      '_shared/runtime.ts',
    ]);
  });

  it('ninguna función nueva lleva la llave de servicio fuera de keys.ts, runtime.ts y los index.ts', () => {
    expect(
      mentioning(/SUPABASE_SERVICE_ROLE_KEY/).filter(
        (path) =>
          !path.startsWith('_shared/ai/') &&
          ![
            // keys.ts es quien elige entre la llave nueva y la de siempre (B17, 4.2)
            '_shared/keys.ts',
            '_shared/runtime.ts',
            'admin-reset-mfa/index.ts',
            'ai-proxy/index.ts',
            'ai-batch/index.ts',
          ].includes(path),
      ),
    ).toEqual([]);
  });
});
