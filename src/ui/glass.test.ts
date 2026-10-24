// El cristal de V4-B2 (decisión 2). Solo la barra superior, el dock inferior del teléfono y las barras de
// acciones fijas. Las superficies de contenido son sólidas, sin fondos personalizados ni degradados. Esta
// prueba fija dónde se usa, que la utilidad se arma con los tokens y con su respaldo sólido, y que el texto
// sigue pasando 4.5 a 1 aunque debajo del cristal haya algo negro o blanco, que es el peor caso.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = resolve(import.meta.dirname, '..');
const css = readFileSync(resolve(import.meta.dirname, 'tokens.css'), 'utf8');

/** Los únicos archivos que pueden usar la utilidad glass */
const GLASS_FILES = [
  'app/layout/AppShell.tsx',
  'app/layout/BottomNav.tsx',
  // La barra fija de la portada de venta, con la pizarra como superficie (D-148)
  'features/landing/LandingScreen.tsx',
  'ui/components/action-dock.tsx',
  'ui/components/save-bar.tsx',
];

/** Sin comentarios de bloque ni de línea, para buscar solo en el código. No toca las URL con // */
const withoutComments = (text: string) =>
  text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(tsx?|css)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

const FILES = sourceFiles(SRC).map((path) => {
  const rel = relative(SRC, path).split('\\').join('/');
  return { rel, code: withoutComments(readFileSync(path, 'utf8')) };
});

/** El bloque de una utilidad de tokens.css, desde su @utility hasta la siguiente */
const utility = (name: string, next: string) =>
  css.slice(css.indexOf(`@utility ${name} {`), css.indexOf(`@utility ${next}`));

describe('cristal de 6 px', () => {
  it('la utilidad glass solo la usan la barra superior, el dock del teléfono y las barras de acciones fijas', () => {
    // Cualquier aparición de la palabra, sea una clase, una llave de objeto o parte de una plantilla. Con
    // variantes como lg:glass-off o con guiones como bg-glass también cuenta, porque el borde de palabra
    // las separa
    const usage = /\bglass(?:-off|-clear)?\b/;
    const users = FILES.filter((file) => file.rel !== 'ui/tokens.css' && usage.test(file.code)).map(
      (file) => file.rel,
    );
    expect(users.sort()).toEqual([...GLASS_FILES].sort());
  });

  it('la detección ve el cristal en una llave de objeto, en una plantilla y en una variante', () => {
    const usage = /\bglass(?:-off|-clear)?\b/;
    for (const sample of [
      "const styles = { glass: 'p-2' };",
      'const cls = `glass ${extra}`;',
      "cn('lg:glass-off', x)",
      "className={'bg-glass'}",
    ]) {
      expect(usage.test(withoutComments(sample)), sample).toBe(true);
    }
    expect(usage.test(withoutComments('// el cristal usa glass\nconst a = 1;'))).toBe(false);
    expect(usage.test(withoutComments('const glassware = 1;'))).toBe(false);
  });

  it('ningún otro desenfoque de fondo, salvo el velo de los diálogos', () => {
    const offenders: string[] = [];
    for (const file of FILES) {
      if (file.rel === 'ui/tokens.css') continue;
      file.code.split('\n').forEach((line, index) => {
        if (!/backdrop-(blur|filter)/.test(line)) return;
        // El velo oscuro detrás de un diálogo no es cristal. Va con bg-black y desenfoque chico
        const scrim = /bg-black\/\d+/.test(line) && line.includes('backdrop-blur-sm');
        if (!scrim) offenders.push(`${file.rel}:${index + 1}`);
      });
    }
    expect(offenders).toEqual([]);
  });

  it('la utilidad pone 6 px con respaldo sólido, la opacidad de su token y no anima nada', () => {
    expect(css).toMatch(/--enarm-glass-blur:\s*6px;/);
    const glass = utility('glass', 'glass-off');
    expect(glass).toContain('@supports');
    expect(glass).toMatch(/background-color:\s*var\(--enarm-surface\);\s*@supports/);
    // La opacidad sale del token y no de un porcentaje escrito aquí
    expect(glass).toMatch(
      /color-mix\(\s*in srgb,\s*var\(--enarm-surface\)\s+var\(--enarm-glass-opacity\),\s*transparent\s*\)/,
    );
    expect(glass).not.toMatch(/var\(--enarm-surface\)\s+\d+%/);
    expect(glass).toMatch(/backdrop-filter:\s*blur\(var\(--enarm-glass-blur\)\)/);
    expect(glass).not.toMatch(/transition|animation|gradient/);
  });

  it('con prefers-reduced-transparency la superficie vuelve a ser sólida y sin desenfoque', () => {
    const glass = utility('glass', 'glass-off');
    expect(glass).toMatch(
      /@media \(prefers-reduced-transparency: reduce\)\s*\{[^}]*background-color:\s*var\(--enarm-surface\);[^}]*backdrop-filter:\s*none;[^}]*\}/,
    );
    // Va después del @supports, para que mande sobre el color-mix cuando los dos aplican
    expect(glass.indexOf('prefers-reduced-transparency')).toBeGreaterThan(
      glass.indexOf('@supports'),
    );
  });

  it('la superficie queda entre el 90 y el 95 por ciento y el texto pasa 4.5 a 1 con negro o blanco debajo', () => {
    const opacity = Number(/--enarm-glass-opacity:\s*(\d+)%;/.exec(css)?.[1]);
    expect(opacity).toBeGreaterThanOrEqual(90);
    expect(opacity).toBeLessThanOrEqual(95);

    const channels = (hex: string) =>
      [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
    const luminance = (rgb: readonly number[]) => {
      const [r = 0, g = 0, b = 0] = rgb.map((v) => {
        const x = v / 255;
        return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const ratio = (a: readonly number[], b: readonly number[]) => {
      const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
      return (hi + 0.05) / (lo + 0.05);
    };
    const tokens = (block: string) => {
      const map = new Map<string, string>();
      for (const match of block.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-f]{6})/gi)) {
        if (match[1] && match[2]) map.set(`--${match[1].toLowerCase()}`, match[2].toLowerCase());
      }
      return map;
    };
    const darkMedia = css.indexOf('@media (prefers-color-scheme: dark)');
    const darkClass = css.indexOf(':root.dark');
    const themeAt = css.indexOf('@theme');
    const modes = [
      { name: 'claro', tokens: tokens(css.slice(0, darkMedia)) },
      { name: 'oscuro', tokens: tokens(css.slice(darkMedia, darkClass)) },
      { name: 'oscuro por clase', tokens: tokens(css.slice(darkClass, themeAt)) },
    ];
    // Lo que se escribe sobre el cristal. Texto, texto tenue, el color de acción, el de la racha y el
    // aviso de cambios sin guardar de la barra de guardar
    const inks = [
      '--enarm-fg',
      '--enarm-fg-muted',
      '--enarm-primary-ink',
      '--enarm-accent-ink',
      '--enarm-warning',
    ];
    for (const mode of modes) {
      const surface = mode.tokens.get('--enarm-surface');
      expect(surface, mode.name).toBeDefined();
      if (!surface) continue;
      for (const behind of [
        [0, 0, 0],
        [255, 255, 255],
      ] as const) {
        const blended = channels(surface).map(
          (v, i) => (opacity / 100) * v + (1 - opacity / 100) * (behind[i] ?? 0),
        );
        for (const ink of inks) {
          const color = mode.tokens.get(ink);
          expect(color, `${ink} en ${mode.name}`).toBeDefined();
          if (!color) continue;
          expect(
            ratio(channels(color), blended),
            `${ink} sobre cristal ${mode.name} con ${behind.join(',')} debajo`,
          ).toBeGreaterThanOrEqual(4.5);
        }
      }
    }
  });
});
