// Genera los íconos provisionales de la PWA (D-016) a partir de un SVG.
// El ícono de la pestaña ya es el símbolo de Studiare (public/favicon-*.png, D-058) y no sale de aquí.
// Usa el Chromium de Playwright que vive dentro del proyecto. Se corre una vez y el resultado
// queda en public/. Para regenerarlos: node scripts/generate-icons.ts
import { join } from 'node:path';

process.env.PLAYWRIGHT_BROWSERS_PATH ??= '0';
const { chromium } = await import('@playwright/test');

const PRIMARY = '#1f5f73';
const ACCENT = '#7cc4d6';
const PUBLIC_DIR = join(import.meta.dirname, '..', 'public');

/** Letra E hecha de rectángulos, sin depender de fuentes. scale 1 ocupa el centro del ícono */
function glyph(scale: number): string {
  const offset = 256 - 256 * scale;
  return `<g transform="translate(${offset} ${offset}) scale(${scale})">
    <rect x="150" y="124" width="70" height="264" rx="22" fill="#ffffff"/>
    <rect x="150" y="124" width="212" height="64" rx="22" fill="#ffffff"/>
    <rect x="150" y="224" width="170" height="64" rx="22" fill="#ffffff"/>
    <rect x="150" y="324" width="212" height="64" rx="22" fill="#ffffff"/>
    <circle cx="372" cy="256" r="26" fill="${ACCENT}"/>
  </g>`;
}

const rounded = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="112" fill="${PRIMARY}"/>${glyph(1)}
</svg>`;

// Maskable. Fondo a sangre y la figura dentro de la zona segura del 80%
const maskable = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="${PRIMARY}"/>${glyph(0.72)}
</svg>`;

const targets = [
  { file: 'pwa-192x192.png', svg: rounded, size: 192 },
  { file: 'pwa-512x512.png', svg: rounded, size: 512 },
  { file: 'maskable-512x512.png', svg: maskable, size: 512 },
  { file: 'apple-touch-icon-180x180.png', svg: maskable, size: 180 },
];

const browser = await chromium.launch();
try {
  for (const target of targets) {
    const page = await browser.newPage({ viewport: { width: target.size, height: target.size } });
    await page.setContent(
      `<html><body style="margin:0;background:transparent">${target.svg.replace('<svg ', `<svg width="${target.size}" height="${target.size}" `)}</body></html>`,
    );
    await page.screenshot({ path: join(PUBLIC_DIR, target.file), omitBackground: true });
    await page.close();
    console.log(`public/${target.file}`);
  }
} finally {
  await browser.close();
}
