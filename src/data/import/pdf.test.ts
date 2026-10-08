import { describe, expect, it } from 'vitest';
import { extractPdfText, PDF_LIMITS } from './pdf';
import { buildPdf } from './testing/pdf';
import { ImportError } from './types';

// En Node se usa la versión de pdf.js hecha para Node. El navegador carga la suya con su worker
const deps = { loadPdfjs: () => import('pdfjs-dist/legacy/build/pdf.mjs') as never };

const codeOf = async (action: () => Promise<unknown>) => {
  try {
    await action();
  } catch (error) {
    return error instanceof ImportError ? error.code : 'otro';
  }
  return 'ok';
};

describe('texto de un PDF', () => {
  it('lee el texto de varias páginas con acentos y separa los párrafos', async () => {
    const pdf = buildPdf([
      ['La metformina es el tratamiento', 'de primera línea de la diabetes.'],
      ['La dosis inicial es de 500 mg (con alimentos).'],
    ]);
    const result = await extractPdfText(pdf, deps);
    expect(result.pages).toBe(2);
    expect(result.truncated).toBe(false);
    expect(result.text).toContain(
      'La metformina es el tratamiento\nde primera línea de la diabetes.',
    );
    expect(result.text).toContain('500 mg (con alimentos).');
    // Las páginas quedan separadas por una línea en blanco
    expect(result.text).toContain('diabetes.\n\nLa dosis');
  });

  it('un PDF dañado se rechaza como dañado', async () => {
    expect(await codeOf(() => extractPdfText(new Uint8Array(200).fill(7), deps))).toBe('corrupt');
    expect(await codeOf(() => extractPdfText(buildPdf([['x']]).subarray(0, 60), deps))).toBe(
      'corrupt',
    );
  });

  it('un PDF sin texto, como uno escaneado, se rechaza con su propio motivo', async () => {
    expect(await codeOf(() => extractPdfText(buildPdf([[]]), deps))).toBe('no_text');
  });

  it('respeta el tamaño, el número de páginas y el texto máximo', async () => {
    const pdf = buildPdf([
      ['Primera página con texto suficiente'],
      ['Segunda página con texto suficiente'],
    ]);
    expect(await codeOf(() => extractPdfText(pdf, deps, { ...PDF_LIMITS, maxBytes: 100 }))).toBe(
      'too_large',
    );
    expect(await codeOf(() => extractPdfText(pdf, deps, { ...PDF_LIMITS, maxPages: 1 }))).toBe(
      'too_large',
    );
    const cut = await extractPdfText(pdf, deps, { ...PDF_LIMITS, maxChars: 40 });
    expect(cut.truncated).toBe(true);
    expect(cut.text.length).toBeLessThanOrEqual(40);
  });
});
