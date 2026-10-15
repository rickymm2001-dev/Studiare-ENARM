// Las celdas de los CSV del admin no se corren como fórmula al abrirlas (B6 de la revisión de B11)
import { describe, expect, it } from 'vitest';
import { csvCell } from './csvCell';

describe('celda de CSV', () => {
  it('pone un apóstrofo antes de lo que Excel tomaría como fórmula', () => {
    expect(csvCell('=HYPERLINK("http://x")')).toBe('"\'=HYPERLINK(""http://x"")"');
    expect(csvCell('+1')).toBe('"\'+1"');
    expect(csvCell('-2')).toBe('"\'-2"');
    expect(csvCell('@SUM(A1)')).toBe('"\'@SUM(A1)"');
    expect(csvCell('\tA')).toBe('"\'\tA"');
    expect(csvCell('\rA')).toBe('"\'\rA"');
  });

  it('deja igual el texto normal, los números y el vacío', () => {
    expect(csvCell('Ana')).toBe('"Ana"');
    expect(csvCell('a=b')).toBe('"a=b"');
    expect(csvCell(-150)).toBe('"-150"');
    expect(csvCell(null)).toBe('""');
  });
});
