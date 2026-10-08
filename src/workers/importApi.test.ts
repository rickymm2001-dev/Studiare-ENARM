import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { loadSqlForTests } from '@/data/import/testing/fixtures';
import { createImportApi } from './importApi';

const api = createImportApi({ loadSql: loadSqlForTests });

describe('API del worker del importador', () => {
  it('devuelve las notas leídas', async () => {
    const result = await api.parse('a.csv', strToU8('Frente,Reverso\nuno,dos\n'));
    expect(result.ok && result.parsed.notes).toHaveLength(1);
  });

  it('un error de importación llega como resultado con su código, no como excepción', async () => {
    expect(await api.parse('a.zip', zipSync({ 'x.txt': strToU8('x') }))).toEqual({
      ok: false,
      code: 'unsupported',
    });
    expect(await api.parse('a.csv', new Uint8Array())).toEqual({ ok: false, code: 'empty' });
    expect(await api.parse('../x', zipSync({ '../x': strToU8('x') }))).toEqual({
      ok: false,
      code: 'unsafe_path',
    });
  });
});
