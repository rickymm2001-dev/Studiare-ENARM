// Lectura de texto de un PDF (D-085, D-086). La IA de tarjetas necesita el texto, y un PDF lo trae
// por renglones sueltos. Se arma de nuevo en párrafos con la posición de cada renglón. Un PDF
// escaneado, que es una foto sin texto, se rechaza con su propio mensaje, porque leerlo pide
// reconocimiento de caracteres y eso queda en IDEAS.md. pdf.js solo se carga cuando se elige un
// PDF y corre con su propio worker, así no pesa en el JavaScript inicial.
import { ImportError } from './types';

const MB = 1024 * 1024;

export interface PdfLimits {
  maxBytes: number;
  maxPages: number;
  /** Texto máximo que se conserva, para no mandar un libro entero al generador */
  maxChars: number;
}

export const PDF_LIMITS: PdfLimits = { maxBytes: 50 * MB, maxPages: 300, maxChars: 400_000 };

/** Lo mínimo de pdf.js que se usa. Así las pruebas y el navegador cargan versiones distintas */
interface PdfTextItem {
  str: string;
  hasEOL?: boolean;
  height?: number;
  transform?: number[];
}
interface PdfPageLike {
  getTextContent(): Promise<{ items: unknown[] }>;
  cleanup(): void;
}
interface PdfDocumentLike {
  numPages: number;
  getPage(number: number): Promise<PdfPageLike>;
}
interface PdfjsLike {
  getDocument(source: { data: Uint8Array; isEvalSupported: boolean }): {
    promise: Promise<PdfDocumentLike>;
    destroy(): Promise<void>;
  };
}

export interface PdfDeps {
  loadPdfjs: () => Promise<PdfjsLike>;
}

/** El navegador carga pdf.js con su worker, que vive en un archivo aparte */
export async function loadPdfjsInBrowser(): Promise<PdfjsLike> {
  const pdfjs = await import('pdfjs-dist');
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  return pdfjs;
}

const isTextItem = (item: unknown): item is PdfTextItem =>
  typeof item === 'object' && item !== null && typeof (item as { str?: unknown }).str === 'string';

/** Los renglones de una página como texto, con una línea en blanco donde hay un salto de párrafo */
function pageText(items: readonly PdfTextItem[]): string {
  const lines: { y: number; height: number; text: string }[] = [];
  for (const item of items) {
    const y = item.transform?.[5] ?? 0;
    const height = item.height ?? 10;
    const last = lines.at(-1);
    if (last && Math.abs(last.y - y) <= Math.max(2, height * 0.5)) last.text += item.str;
    else if (item.str.trim() !== '') lines.push({ y, height, text: item.str });
  }
  let out = '';
  lines.forEach((line, index) => {
    const previous = lines[index - 1];
    if (previous) {
      // Una separación mayor que un renglón y medio es un cambio de párrafo
      const gap = Math.abs(previous.y - line.y);
      out += gap > Math.max(previous.height, line.height) * 1.6 ? '\n\n' : '\n';
    }
    out += line.text.trim();
  });
  return out;
}

export async function extractPdfText(
  bytes: Uint8Array,
  deps: PdfDeps = { loadPdfjs: loadPdfjsInBrowser },
  limits: PdfLimits = PDF_LIMITS,
): Promise<{ text: string; pages: number; truncated: boolean }> {
  if (bytes.length > limits.maxBytes) throw new ImportError('too_large');
  const pdfjs = await deps.loadPdfjs();
  const task = pdfjs.getDocument({ data: new Uint8Array(bytes), isEvalSupported: false });
  let document: PdfDocumentLike;
  try {
    // pdf.js se queda con el arreglo, así que se le dio una copia
    document = await task.promise;
  } catch {
    await task.destroy();
    throw new ImportError('corrupt');
  }
  try {
    if (document.numPages > limits.maxPages) throw new ImportError('too_large');
    const pages: string[] = [];
    let chars = 0;
    let truncated = false;
    for (let number = 1; number <= document.numPages; number += 1) {
      const page = await document.getPage(number);
      const content = await page.getTextContent();
      page.cleanup();
      const text = pageText(content.items.filter(isTextItem));
      if (text === '') continue;
      pages.push(text);
      chars += text.length;
      if (chars > limits.maxChars) {
        truncated = true;
        break;
      }
    }
    const joined = pages.join('\n\n').slice(0, limits.maxChars);
    if (joined.replace(/\s+/g, '').length < 20) throw new ImportError('no_text');
    return { text: joined, pages: document.numPages, truncated };
  } catch (error) {
    throw error instanceof ImportError ? error : new ImportError('corrupt');
  } finally {
    await task.destroy();
  }
}
