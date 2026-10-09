// Presupuesto del JavaScript inicial (14.4, Fase F). Mide lo que el navegador descarga para pintar
// la primera pantalla, que es el script de entrada y los módulos que declara index.html con
// modulepreload, comprimido con gzip. Lo cargado después, por ruta o al usarse, no cuenta. Lo usan
// npm run budget y tests/security/build-policy.test.ts.
// Uso: node scripts/bundle-budget.ts dist
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';

/** 300 KB comprimidos, como pide la sección 14.4. Aquí un KB son 1,000 bytes */
export const INITIAL_JS_BUDGET_BYTES = 300_000;

export interface InitialAsset {
  file: string;
  gzipBytes: number;
}

export interface BudgetReport {
  assets: InitialAsset[];
  totalGzipBytes: number;
  budgetBytes: number;
  withinBudget: boolean;
}

/** Los archivos JavaScript que index.html carga al abrir, con su ruta dentro de dist */
export function initialScripts(html: string): string[] {
  const files = new Set<string>();
  const tag = /<(?:script|link)\b[^>]*>/g;
  for (const [element] of html.matchAll(tag)) {
    const isScript = element.startsWith('<script') && /type=["']module["']/.test(element);
    const isPreload = element.startsWith('<link') && /rel=["']modulepreload["']/.test(element);
    if (!isScript && !isPreload) continue;
    const href = /(?:src|href)=["']([^"']+)["']/.exec(element)?.[1];
    // Con la base de publicación que sea, el archivo vive en assets/ dentro de dist
    const file = href ? /(?:^|\/)(assets\/[^?#]+\.m?js)(?:[?#].*)?$/.exec(href)?.[1] : undefined;
    if (file) files.add(file);
  }
  return [...files];
}

/** Mide el JavaScript inicial de un build */
export function measureInitialBundle(
  distDir: string,
  budgetBytes = INITIAL_JS_BUDGET_BYTES,
): BudgetReport {
  const html = readFileSync(join(distDir, 'index.html'), 'utf8');
  const assets = initialScripts(html).map((file) => ({
    file,
    gzipBytes: gzipSync(readFileSync(join(distDir, file)), { level: 9 }).length,
  }));
  const totalGzipBytes = assets.reduce((sum, asset) => sum + asset.gzipBytes, 0);
  return { assets, totalGzipBytes, budgetBytes, withinBudget: totalGzipBytes <= budgetBytes };
}

const kb = (bytes: number) => `${(bytes / 1000).toFixed(1)} KB`;

export function formatReport(report: BudgetReport): string {
  const lines = report.assets
    .toSorted((a, b) => b.gzipBytes - a.gzipBytes)
    .map((asset) => `  ${kb(asset.gzipBytes).padStart(10)}  ${asset.file}`);
  const verdict = report.withinBudget ? 'dentro del presupuesto' : 'SE PASÓ del presupuesto';
  return [
    'JavaScript inicial comprimido con gzip',
    ...lines,
    `Total ${kb(report.totalGzipBytes)} de ${kb(report.budgetBytes)}, ${verdict}`,
  ].join('\n');
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  const dist = resolve(process.argv[2] ?? 'dist');
  const report = measureInitialBundle(dist);
  console.log(formatReport(report));
  if (!report.withinBudget) process.exitCode = 1;
}
