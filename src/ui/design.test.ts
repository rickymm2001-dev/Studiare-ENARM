// Reglas del sistema de diseño (B2 del plan del cambio, D-121). Sin degradados en src (CSS, canvas,
// utilidades de Tailwind ni SVG), el color de acción es exactamente #156082 en claro y en los dos
// modos oscuros, los tokens y utilidades de degradado y dorado ya no existen y el botón no tiene
// variante dorada.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC = fileURLToPath(new URL('../', import.meta.url));

/** Todos los archivos de código y estilos de src, sin las pruebas */
function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    if (!/\.(ts|tsx|css)$/.test(entry.name) || /\.test\.tsx?$/.test(entry.name)) return [];
    return [path];
  });
}

const read = (relative: string) => readFileSync(join(SRC, relative), 'utf8');

describe('sistema de diseño sobrio (B2, D-121)', () => {
  it('no hay degradados en CSS, TSX ni canvas', () => {
    const pattern = /-gradient\(|create(?:Linear|Radial|Conic)Gradient\(/;
    const offenders = sourceFiles(SRC)
      .filter((file) => pattern.test(readFileSync(file, 'utf8')))
      .map((file) => file.slice(SRC.length));
    expect(offenders).toEqual([]);
  });

  it('no hay utilidades de degradado de Tailwind ni degradados de SVG', () => {
    // bg-linear, bg-radial y bg-conic son las de Tailwind 4 y bg-gradient-to las de antes. En SVG un
    // degradado se declara con linearGradient o radialGradient
    const pattern = /\bbg-(?:linear|radial|conic)\b|\bbg-gradient-to-|<(?:linear|radial)Gradient\b/;
    const offenders = sourceFiles(SRC).flatMap((file) =>
      readFileSync(file, 'utf8')
        .split('\n')
        .flatMap((line, index) =>
          pattern.test(line) ? [`${file.slice(SRC.length)}:${String(index + 1)}`] : [],
        ),
    );
    expect(offenders).toEqual([]);
  });

  it('el color de acción es #156082 en claro y en los dos bloques oscuros', () => {
    const tokens = read('ui/tokens.css');
    const primaries = [...tokens.matchAll(/--enarm-primary:\s*(#[0-9a-f]{6})/gi)].map((match) =>
      match[1]?.toLowerCase(),
    );
    expect(primaries).toEqual(['#156082', '#156082', '#156082']);
    // Los botones y la navegación usan el token, nunca otro color de acción escrito a mano
    expect(read('ui/components/button.tsx')).toContain('bg-primary ');
  });

  it('los tokens y utilidades de degradado y dorado ya no existen', () => {
    const css = read('ui/tokens.css') + read('index.css');
    for (const name of [
      '--enarm-hero',
      '--enarm-gold',
      '--enarm-flame',
      '--enarm-primary-grad',
      '--enarm-shadow-glow',
      '.bg-hero',
      '.bg-gold',
      '.bg-flame',
      '.bg-brand',
      '.text-gradient-gold',
    ]) {
      expect(css, name).not.toContain(name);
    }
  });

  it('el botón no tiene variante dorada ni usa píldoras', () => {
    const button = read('ui/components/button.tsx');
    expect(button).not.toMatch(/\bgold\b/);
    expect(button).not.toContain('rounded-full');
  });

  it('sin píldoras fuera de círculos, barras y el reloj del Pomodoro (H01 de la revisión de B2)', () => {
    // Un círculo lleva size- y no tiene relleno horizontal. Una píldora sí lo tiene. Las barras, las
    // muestras de las gráficas y el reloj del Pomodoro viven en estos archivos y pueden ser redondos
    const ROUND_OK = new Set([
      'ui/components/progress-bar.tsx',
      'features/review/CardTimerBar.tsx',
      'features/party/ChallengeRow.tsx',
      'app/layout/HeaderStats.tsx',
      'features/home/sections/ReviewLoadCard.tsx',
      'features/pomodoro/Pomodoro.tsx',
      'features/profile/AvatarPicker.tsx',
      'features/profile/AvatarCropper.tsx',
    ]);
    const offenders = sourceFiles(SRC).flatMap((file) => {
      const relative = file.slice(SRC.length);
      if (ROUND_OK.has(relative)) return [];
      return readFileSync(file, 'utf8')
        .split('\n')
        .flatMap((line, index) => {
          if (!line.includes('rounded-full')) return [];
          const pill = /\bp[xlr]-/.test(line);
          const circle = /\bsize-/.test(line) && !pill;
          return circle ? [] : [`${relative}:${String(index + 1)}`];
        });
    });
    expect(offenders).toEqual([]);
  });
});
