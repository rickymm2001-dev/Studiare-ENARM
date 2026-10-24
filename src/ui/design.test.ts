// Reglas del sistema de diseño desde D-150, la portada por dentro. Degradados solo en la portada y
// bajo la línea de la carga de repaso de Inicio, el color de acción es el marino #01337a en claro y
// #1a4f9c en los dos modos oscuros, los tokens y utilidades de degradado y dorado ya no existen, el
// botón es una píldora sin variante dorada, y todo lo que se pinta pasa el contraste de WCAG.
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
const relativeOf = (file: string) => file.slice(SRC.length).replace(/\\/g, '/');

/**
 * La portada de venta sigue el boceto de Ricardo (D-149) con manchas de luz, y la carga de repaso de
 * Inicio lleva el sombreado degradado bajo su línea que pidió Ricardo (D-150). Nada más usa degradados
 */
const GRADIENT_OK = new Set([
  'features/landing/landing.css',
  'features/home/sections/ReviewLoadCard.tsx',
]);

describe('sistema de diseño de la portada por dentro (D-150)', () => {
  it('no hay degradados en CSS, TSX ni canvas, salvo en la portada y la carga de repaso', () => {
    const pattern =
      /-gradient\(|create(?:Linear|Radial|Conic)Gradient\(|<(?:linear|radial)Gradient\b/;
    const offenders = sourceFiles(SRC)
      .map(relativeOf)
      .filter((relative) => !GRADIENT_OK.has(relative) && pattern.test(read(relative)));
    expect(offenders).toEqual([]);
    // La excepción de la portada existe y sigue siendo solo esa, con la carga de repaso
    expect(pattern.test(read('features/landing/landing.css'))).toBe(true);
  });

  it('no hay utilidades de degradado de Tailwind', () => {
    // bg-linear, bg-radial y bg-conic son las de Tailwind 4 y bg-gradient-to las de antes
    const pattern = /\bbg-(?:linear|radial|conic)\b|\bbg-gradient-to-/;
    const offenders = sourceFiles(SRC).flatMap((file) =>
      readFileSync(file, 'utf8')
        .split('\n')
        .flatMap((line, index) =>
          pattern.test(line) ? [`${relativeOf(file)}:${String(index + 1)}`] : [],
        ),
    );
    expect(offenders).toEqual([]);
  });

  it('el color de acción es el marino #01337a en claro y #1a4f9c en los dos bloques oscuros', () => {
    const tokens = read('ui/tokens.css');
    const primaries = [...tokens.matchAll(/--enarm-primary:\s*(#[0-9a-f]{6})/gi)].map((match) =>
      match[1]?.toLowerCase(),
    );
    expect(primaries).toEqual(['#01337a', '#1a4f9c', '#1a4f9c']);
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

  it('el botón es una píldora y no tiene variante dorada', () => {
    const button = read('ui/components/button.tsx');
    expect(button).not.toMatch(/\bgold\b/);
    expect(button).toContain('rounded-full');
  });

  it('la letra va al 80 por ciento con piso de 11 px y los títulos en la fuente del texto', () => {
    const tokens = read('ui/tokens.css');
    expect(tokens).toMatch(/--text-base:\s*0\.8rem/);
    expect(tokens).toMatch(/--text-xs:\s*0\.6875rem/);
    expect(tokens).toMatch(/--font-display:\s*\n?\s*var\(--enarm-font-heading\)/);
    expect(read('ui/appearance.ts')).not.toContain('FONT_FAMILIES.serif,');
  });

  it('contraste accesible de texto (>= 4.5 a 1) y elementos gráficos (>= 3 a 1) en claro y oscuro (D-128)', () => {
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

    // Los dos bloques oscuros, por preferencia del sistema y por clase, son el mismo tema
    expect(blocks[1]?.tokens).toEqual(blocks[2]?.tokens);

    const branches = ['mi', 'ped', 'gyo', 'cir', 'fam', 'urg'];

    const textPairs: [string, string][] = [
      ['--enarm-fg', '--enarm-surface'],
      ['--enarm-fg', '--enarm-canvas'],
      ['--enarm-fg-muted', '--enarm-surface'],
      // Etiqueta de rama neutral, ícono neutral de Mazos y #etiquetas de Apuntes
      ['--enarm-fg-muted', '--enarm-muted'],
      ['--enarm-fg', '--enarm-muted'],
      ['--enarm-primary-fg', '--enarm-primary'],
      ['--enarm-primary-ink', '--enarm-primary-soft'],
      ['--enarm-primary-ink', '--enarm-surface'],
      ['--enarm-accent-fg', '--enarm-accent'],
      ['--enarm-accent-ink', '--enarm-accent-soft'],
      ['--enarm-accent-ink', '--enarm-surface'],
      // XP ganado en el encabezado de Repasar
      ['--enarm-accent-ink', '--enarm-canvas'],
      ['--enarm-streak-ink', '--enarm-streak-soft'],
      ['--enarm-streak-ink', '--enarm-surface'],
      ['--enarm-danger-fg', '--enarm-danger'],
      ['--enarm-demo-fg', '--enarm-demo'],
      ['--enarm-sim-fg', '--enarm-sim'],
      // Títulos en marino, barra pizarra y tintes de las tarjetas (D-150)
      ['--enarm-heading', '--enarm-surface'],
      ['--enarm-heading', '--enarm-canvas'],
      ['--enarm-heading', '--enarm-cream'],
      ['--enarm-slate-fg', '--enarm-slate'],
      ['--enarm-slate-muted', '--enarm-slate'],
      ['--enarm-fg', '--enarm-cream'],
      ['--enarm-fg', '--enarm-panel'],
      ['--enarm-fg', '--enarm-sage'],
      ['--enarm-fg-muted', '--enarm-cream'],
      ['--enarm-fg-muted', '--enarm-panel'],
      ['--enarm-fg-muted', '--enarm-sage'],
      ['--enarm-primary-ink', '--enarm-cream'],
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
      ['--enarm-chart-compare', '--enarm-surface'],
      ['--enarm-indicator', '--enarm-surface'],
      ['--enarm-indicator', '--enarm-cream'],
      ['--enarm-indicator', '--enarm-slate'],
      ['--enarm-accent', '--enarm-surface'],
      // Barra de XP y de nivel sobre su riel y flama de la racha sobre su fondo suave
      ['--enarm-accent', '--enarm-muted'],
      ['--enarm-accent', '--enarm-accent-soft'],
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
