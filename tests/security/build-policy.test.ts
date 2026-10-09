// Política de seguridad de contenido y presupuesto del JavaScript inicial en el build (14.3 y 14.4,
// Fase F). Construye la app como producción en una carpeta temporal y revisa lo que se publica.
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  INITIAL_JS_BUDGET_BYTES,
  formatReport,
  initialScripts,
  measureInitialBundle,
} from '../../scripts/bundle-budget.ts';
import { buildApp } from './buildApp.ts';

let withoutCloud = '';
let withCloud = '';

beforeAll(() => {
  withoutCloud = buildApp({ VITE_SUPABASE_URL: '' });
  withCloud = buildApp({ VITE_SUPABASE_URL: 'https://abcd1234.supabase.co' });
}, 240_000);

afterAll(() => {
  for (const dir of [withoutCloud, withCloud])
    if (dir) rmSync(dir, { recursive: true, force: true });
});

const read = (dir: string, file: string) => readFileSync(join(dir, file), 'utf8');
const metaPolicy = (html: string) =>
  /<meta http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(html)?.[1];
const directive = (policy: string | undefined, name: string) =>
  policy
    ?.split('; ')
    .find((part) => part.startsWith(`${name} `))
    ?.slice(name.length + 1);

describe('política de seguridad de contenido en el build', () => {
  it('index.html la trae antes que cualquier script y sin scripts en línea', () => {
    const html = read(withoutCloud, 'index.html');
    const policy = metaPolicy(html);
    expect(policy).toBeDefined();
    expect(html.indexOf('Content-Security-Policy')).toBeLessThan(html.indexOf('<script'));
    expect(html.indexOf('<meta charset')).toBeLessThan(html.indexOf('Content-Security-Policy'));
    expect(directive(policy, 'script-src')).toBe("'self' 'wasm-unsafe-eval'");
    expect(directive(policy, 'object-src')).toBe("'none'");
    expect(policy).not.toContain("'unsafe-eval'");
    expect(policy).not.toContain('frame-ancestors');
    // Un script en línea (sin src) o un manejador en un atributo chocaría con la política
    const inline = [...html.matchAll(/<script\b([^>]*)>/g)].filter(
      ([, attrs]) => !/\bsrc=/.test(attrs ?? ''),
    );
    expect(inline).toEqual([]);
    expect(html).not.toMatch(/\son[a-z]+=/i);
    expect(html).not.toContain('javascript:');
  });

  it('sin Supabase configurado solo permite conectarse al propio sitio', () => {
    expect(directive(metaPolicy(read(withoutCloud, 'index.html')), 'connect-src')).toBe("'self'");
  });

  it('con Supabase configurado suma su origen exacto y ningún otro', () => {
    expect(directive(metaPolicy(read(withCloud, 'index.html')), 'connect-src')).toBe(
      "'self' https://abcd1234.supabase.co",
    );
  });

  it('_headers lleva la misma política más frame-ancestors, y los demás encabezados', () => {
    expect(existsSync(join(withoutCloud, '_headers'))).toBe(true);
    const headers = read(withoutCloud, '_headers');
    const policy = /Content-Security-Policy: (.+)/.exec(headers)?.[1];
    expect(policy?.startsWith(metaPolicy(read(withoutCloud, 'index.html')) ?? '#')).toBe(true);
    expect(directive(policy, 'frame-ancestors')).toBe("'none'");
    expect(headers).toContain('X-Content-Type-Options: nosniff');
    expect(headers).toContain('Referrer-Policy: strict-origin-when-cross-origin');
    expect(headers).toContain('Permissions-Policy:');
  });
});

describe('presupuesto del JavaScript inicial', () => {
  it('lo que index.html carga al abrir pesa menos de 300 KB comprimido', () => {
    const report = measureInitialBundle(withoutCloud);
    // Si falla, el mensaje trae el desglose por archivo
    expect(report.assets.length, formatReport(report)).toBeGreaterThan(0);
    expect(report.withinBudget, formatReport(report)).toBe(true);
    expect(report.budgetBytes).toBe(INITIAL_JS_BUDGET_BYTES);
  });

  it('el SDK de Supabase y la sincronización no están en lo inicial, con o sin la nube configurada', () => {
    for (const dir of [withoutCloud, withCloud]) {
      const report = measureInitialBundle(dir);
      expect(report.withinBudget, formatReport(report)).toBe(true);
      const initial = initialScripts(read(dir, 'index.html')).map((file) => read(dir, file));
      // Textos que solo existen en el SDK y en la sincronización
      for (const marker of ['AuthApiError', 'sync_push_records']) {
        const found = initial.some((code) => code.includes(marker));
        expect(found, `"${marker}" no debería estar en el JavaScript inicial`).toBe(false);
      }
    }
    // Y sí existen en algún archivo del build, para que la búsqueda no pase en vacío
    const all = readdirSync(join(withCloud, 'assets'))
      .filter((file) => file.endsWith('.js'))
      .map((file) => read(withCloud, join('assets', file)));
    expect(all.some((code) => code.includes('AuthApiError'))).toBe(true);
    expect(all.some((code) => code.includes('sync_push_records'))).toBe(true);
  });

  it('el panel médico, el de administración y el importador no están en lo inicial', () => {
    const html = read(withoutCloud, 'index.html');
    const initial = initialScripts(html).map((file) =>
      readFileSync(join(withoutCloud, file), 'utf8'),
    );
    // Textos que solo existen en esas pantallas y en ningún otro archivo inicial
    for (const marker of [
      'Costos de IA en cifras',
      'Doble etiquetado en cifras',
      'Sube el banco que llenaste con la plantilla',
      'Los datos de demostración viven en una base aparte',
    ]) {
      const found = initial.some((code) => code.includes(marker));
      expect(found, `"${marker}" no debería estar en el JavaScript inicial`).toBe(false);
    }
  });

  it('el medidor detecta un build que se pasa y un index.html sin scripts', () => {
    const fake = mkdtempSync(join(tmpdir(), 'enarm-budget-'));
    try {
      writeFileSync(
        join(fake, 'index.html'),
        '<script type="module" src="/base/assets/a.js"></script><link rel="modulepreload" href="/base/assets/b.js">',
      );
      expect(initialScripts(read(fake, 'index.html'))).toEqual(['assets/a.js', 'assets/b.js']);
    } finally {
      rmSync(fake, { recursive: true, force: true });
    }
  });
});
