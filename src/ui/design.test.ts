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
      const relative = file.slice(SRC.length).replace(/\\/g, '/');
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

  it('contraste accesible de texto (>= 4.5 a 1) y elementos gráficos (>= 3 a 1) en claro y oscuro (D-122)', () => {
    function luminance(hex: string): number {
      const parts = hex.replace('#', '').match(/.{2}/g) ?? [];
      const [r = 0, g = 0, b = 0] = parts
        .map((x) => parseInt(x, 16) / 255)
        .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    }

    function contrastRatio(hex1: string, hex2: string): number {
      const l1 = luminance(hex1);
      const l2 = luminance(hex2);
      const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
      return Math.floor(ratio * 100) / 100;
    }

    function parseTokens(cssBlock: string): Map<string, string> {
      const map = new Map<string, string>();
      for (const match of cssBlock.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-f]{6})/gi)) {
        const key = match[1];
        const val = match[2];
        if (key && val) {
          map.set(`--${key.toLowerCase()}`, val.toLowerCase());
        }
      }
      return map;
    }

    const css = read('ui/tokens.css');
    const darkMediaIndex = css.indexOf('@media (prefers-color-scheme: dark)');
    const darkClassIndex = css.indexOf(':root.dark');
    const themeIndex = css.indexOf('@theme');

    const blocks = [
      { name: 'claro', tokens: parseTokens(css.slice(0, darkMediaIndex)) },
      { name: 'oscuro (media)', tokens: parseTokens(css.slice(darkMediaIndex, darkClassIndex)) },
      { name: 'oscuro (clase)', tokens: parseTokens(css.slice(darkClassIndex, themeIndex)) },
    ];

    const branches = ['mi', 'ped', 'gyo', 'cir', 'fam', 'urg'];

    const textPairs: [string, string][] = [
      ['--enarm-fg', '--enarm-surface'],
      ['--enarm-fg', '--enarm-canvas'],
      ['--enarm-fg-muted', '--enarm-surface'],
      ['--enarm-primary-fg', '--enarm-primary'],
      ['--enarm-primary-ink', '--enarm-primary-soft'],
      ['--enarm-primary-ink', '--enarm-surface'],
      ['--enarm-accent-fg', '--enarm-accent'],
      ['--enarm-accent-ink', '--enarm-accent-soft'],
      ['--enarm-accent-ink', '--enarm-surface'],
      ['--enarm-streak-ink', '--enarm-streak-soft'],
      ['--enarm-streak-ink', '--enarm-surface'],
      ['--enarm-danger-fg', '--enarm-danger'],
      ['--enarm-demo-fg', '--enarm-demo'],
      ['--enarm-sim-fg', '--enarm-sim'],
      ...branches.flatMap((b): [string, string][] => [
        [`--enarm-${b}-ink`, `--enarm-${b}-soft`],
        [`--enarm-${b}-ink`, '--enarm-surface'],
      ]),
    ];

    const graphicPairs: [string, string][] = [
      ['--enarm-line-strong', '--enarm-surface'],
      ['--enarm-line-strong', '--enarm-muted'],
      ['--enarm-chart-scheduled', '--enarm-surface'],
      ['--enarm-chart-done', '--enarm-surface'],
      ['--enarm-chart-done', '--enarm-canvas'],
      ['--enarm-indicator', '--enarm-surface'],
      ['--enarm-accent', '--enarm-surface'],
      ['--enarm-streak', '--enarm-surface'],
      ...branches.map((b): [string, string] => [`--enarm-${b}`, '--enarm-surface']),
    ];

    for (const { name, tokens } of blocks) {
      for (const [fg, bg] of textPairs) {
        const fgColor = tokens.get(fg);
        const bgColor = tokens.get(bg);
        expect(fgColor, `Token ${fg} faltante en ${name}`).toBeDefined();
        expect(bgColor, `Token ${bg} faltante en ${name}`).toBeDefined();
        if (!fgColor || !bgColor) continue;
        const ratio = contrastRatio(fgColor, bgColor);
        expect(
          ratio,
          `Texto ${fg} (${fgColor}) sobre ${bg} (${bgColor}) en ${name} debe ser >= 4.5 a 1`,
        ).toBeGreaterThanOrEqual(4.5);
      }

      for (const [fg, bg] of graphicPairs) {
        const fgColor = tokens.get(fg);
        const bgColor = tokens.get(bg);
        expect(fgColor, `Token ${fg} faltante en ${name}`).toBeDefined();
        expect(bgColor, `Token ${bg} faltante en ${name}`).toBeDefined();
        if (!fgColor || !bgColor) continue;
        const ratio = contrastRatio(fgColor, bgColor);
        expect(
          ratio,
          `Gráfico ${fg} (${fgColor}) sobre ${bg} (${bgColor}) en ${name} debe ser >= 3 a 1`,
        ).toBeGreaterThanOrEqual(3.0);
      }
    }
  });
});
