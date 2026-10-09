// Un PDF mínimo con texto, armado con código, para probar la lectura de PDF (D-085). Una página
// por cada grupo de líneas. Escribe en WinAnsi, así que los acentos del español salen bien. Solo lo
// usan las pruebas.

function escapePdf(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

/** Cada página es una lista de líneas. Las líneas se separan 14 puntos hacia abajo */
export function buildPdf(pages: readonly (readonly string[])[]): Uint8Array {
  const objects: string[] = [];
  const pageCount = pages.length;
  // 1 catálogo, 2 páginas, 3 fuente, luego una pareja de página y contenido por cada página
  objects.push('<< /Type /Catalog /Pages 2 0 R >>');
  const kids = pages.map((_, index) => `${4 + index * 2} 0 R`).join(' ');
  objects.push(`<< /Type /Pages /Kids [${kids}] /Count ${pageCount} >>`);
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  pages.forEach((lines, index) => {
    const content = `BT /F1 11 Tf 56 760 Td 14 TL ${lines
      .map((line) => `(${escapePdf(line)}) Tj T*`)
      .join(' ')} ET`;
    const contentId = 5 + index * 2;
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${contentId} 0 R /Resources << /Font << /F1 3 0 R >> >> >>`,
    );
    objects.push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  });

  let body = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((object, index) => {
    offsets.push(body.length);
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) body += `${String(offset).padStart(10, '0')} 00000 n \n`;
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;

  // WinAnsi es Latin-1 para el español, un byte por carácter
  const bytes = new Uint8Array(body.length);
  for (let index = 0; index < body.length; index += 1) bytes[index] = body.charCodeAt(index) & 0xff;
  return bytes;
}
