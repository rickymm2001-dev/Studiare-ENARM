import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { parseCsv } from './csv';
import { parseDocx } from './docx';
import { IMPORT_LIMITS } from './limits';
import { parseImportFile } from './parseFile';
import {
  buildDocx,
  buildLegacyApkg,
  buildXlsx,
  docxParagraph,
  docxTable,
  forgeZipSize,
  loadSqlForTests,
  standardModels,
} from './testing/fixtures';
import { ImportError } from './types';
import { parseXlsx } from './xlsx';

const csv = (text: string) => parseCsv(strToU8(text), 'prueba.csv');
const errorOf = (action: () => unknown) => {
  try {
    action();
  } catch (error) {
    return error instanceof ImportError ? error.code : 'otro';
  }
  return 'ok';
};

describe('CSV', () => {
  it('sin encabezado ni directivas, la columna 1 es el frente, la 2 el reverso y la 3 las etiquetas', () => {
    const parsed = csv(
      'Triada de Beck,"Hipotensión, yugulares y ruidos",cardio infarto\nMetformina,Biguanida\n',
    );
    expect(parsed.notes).toHaveLength(2);
    expect(parsed.notes[0]).toMatchObject({
      kind: 'basic',
      front: 'Triada de Beck',
      back: 'Hipotensión, yugulares y ruidos',
      html: false,
      tags: ['cardio', 'infarto'],
    });
    expect(parsed.notes[1]?.tags).toEqual([]);
  });

  it('entiende encabezados en español y en inglés, y la columna de tipo', () => {
    const parsed = csv(
      'Tipo;Mazo;Frente;Reverso;Etiquetas;ID\n' +
        'Cloze;Cardio::Arritmias;La {{c1::amiodarona}} alarga el QT;;cardio;a1\n' +
        'Inversa;Cardio;Metformina;Biguanida;;a2\n' +
        'Basic;;¿Qué?;Eso;urgencias, trauma;a3\n',
    );
    expect(parsed.errors).toEqual([]);
    expect(parsed.notes.map((note) => [note.kind, note.guid])).toEqual([
      ['cloze', 'a1'],
      ['basic_reverse', 'a2'],
      ['basic', 'a3'],
    ]);
    expect(parsed.notes[0]).toMatchObject({ deckPath: ['Cardio', 'Arritmias'], back: '' });
    expect(parsed.notes[2]?.tags).toEqual(['urgencias', 'trauma']);
  });

  it('Question y Answer en inglés también son un encabezado', () => {
    const parsed = csv('Question,Answer\nWhat,That\n');
    expect(parsed.notes[0]).toMatchObject({ front: 'What', back: 'That' });
  });

  it('lee las directivas de un CSV de Anki', () => {
    const parsed = csv(
      '#separator:tab\n#html:true\n#guid column:1\n#notetype column:2\n#deck column:3\n#tags column:6\n' +
        'g1\tBasic\tENARM::Cardio\tFrente <b>uno</b>\tReverso uno\tcardio\n' +
        'g2\tCloze\tENARM\tHueco {{c1::dos}}\tExtra\t\n',
    );
    expect(parsed.errors).toEqual([]);
    expect(parsed.notes).toHaveLength(2);
    expect(parsed.notes[0]).toMatchObject({
      guid: 'g1',
      kind: 'basic',
      html: true,
      deckPath: ['ENARM', 'Cardio'],
      front: 'Frente <b>uno</b>',
      tags: ['cardio'],
    });
    expect(parsed.notes[1]).toMatchObject({ guid: 'g2', kind: 'cloze', back: 'Extra' });
  });

  it('con #columns los nombres mandan y no hay fila de encabezado', () => {
    const parsed = csv('#separator:Comma\n#columns:Guid,Tipo,Front,Back\nx,Basic,Uno,Dos\n');
    expect(parsed.notes).toEqual([
      expect.objectContaining({ guid: 'x', kind: 'basic', front: 'Uno', back: 'Dos' }),
    ]);
  });

  it('una celda entre comillas puede traer comas, saltos de línea y comillas', () => {
    const parsed = csv('Frente,Reverso\n"Línea 1\nLínea 2","Dijo ""sí"", y siguió"\n');
    expect(parsed.notes[0]).toMatchObject({
      front: 'Línea 1\nLínea 2',
      back: 'Dijo "sí", y siguió',
    });
  });

  it('detecta tabulador, punto y coma y barra vertical', () => {
    for (const sep of ['\t', ';', '|']) {
      const parsed = csv(`Frente${sep}Reverso\nuno${sep}dos\n`);
      expect(parsed.notes[0]).toMatchObject({ front: 'uno', back: 'dos' });
    }
  });

  it('un archivo de Windows-1252, como el que guarda Excel, conserva los acentos', () => {
    const bytes = Uint8Array.from([
      ...strToU8('Frente,Reverso\nCoraz'),
      0xf3, // ó en Windows-1252
      ...strToU8('n,Músculo\n').map((byte) => byte),
    ]);
    const parsed = parseCsv(bytes, 'excel.csv');
    expect(parsed.notes[0]?.front).toBe('Corazón');
  });

  it('quita la marca de orden de bytes del inicio', () => {
    const parsed = parseCsv(strToU8('﻿Frente,Reverso\nuno,dos\n'), 'bom.csv');
    expect(parsed.notes[0]?.front).toBe('uno');
  });

  it('anota cada fila con problema y sigue con las demás', () => {
    const parsed = csv('Frente,Reverso\n,sin frente\nsin reverso,\nbien,bien\nCloze falso,x\n');
    expect(parsed.notes).toHaveLength(2);
    expect(parsed.errors).toEqual([
      { position: 2, code: 'empty_front' },
      { position: 3, code: 'empty_back' },
    ]);
    const typed = csv('Tipo,Frente,Reverso\nCloze,sin huecos,x\n');
    expect(typed.errors).toEqual([{ position: 2, code: 'cloze_without_holes' }]);
    expect(typed.notes).toEqual([]);
  });

  it('con directivas, la posición de una fila cuenta las líneas de directivas', () => {
    const parsed = csv('#separator:tab\n#html:false\n\tsin frente\n');
    expect(parsed.errors[0]).toEqual({ position: 3, code: 'empty_front' });
  });

  it('ignora filas vacías y avisa de las columnas que no usa', () => {
    const parsed = csv('Frente,Reverso,Capítulo\nuno,dos,3\n\n,,\ntres,cuatro,5\n');
    expect(parsed.notes).toHaveLength(2);
    expect(parsed.warnings).toEqual([{ code: 'extra_columns', count: 1 }]);
  });

  it('un archivo vacío o binario se rechaza', () => {
    expect(errorOf(() => csv(''))).toBe('empty');
    expect(errorOf(() => parseCsv(Uint8Array.from([80, 0, 1, 2, 0, 0]), 'x.xls'))).toBe(
      'unsupported',
    );
  });

  it('respeta el máximo de notas', () => {
    const rows = Array.from({ length: 6 }, (_, index) => `f${index},r${index}`).join('\n');
    const parsed = parseCsv(strToU8(`Frente,Reverso\n${rows}\n`), 'x.csv', {
      ...IMPORT_LIMITS,
      maxNotes: 4,
    });
    expect(parsed.notes).toHaveLength(4);
    expect(parsed.errors.at(-1)?.code).toBe('too_many_notes');
  });

  it('un archivo demasiado grande se rechaza', () => {
    expect(
      errorOf(() =>
        parseCsv(new Uint8Array(100), 'x.csv', { ...IMPORT_LIMITS, maxDocumentBytes: 50 }),
      ),
    ).toBe('too_large');
  });
});

describe('Excel', () => {
  it('lee la primera hoja con encabezados', async () => {
    const parsed = await parseXlsx(
      buildXlsx([
        ['Frente', 'Reverso', 'Etiquetas'],
        ['Triada de Beck', 'Hipotensión', 'cardio'],
        ['Metformina', 'Biguanida', ''],
        [3, 'número como frente', ''],
      ]),
      'tarjetas.xlsx',
    );
    expect(parsed.source).toBe('xlsx');
    expect(parsed.errors).toEqual([]);
    expect(parsed.notes.map((note) => [note.front, note.back, note.tags])).toEqual([
      ['Triada de Beck', 'Hipotensión', ['cardio']],
      ['Metformina', 'Biguanida', []],
      ['3', 'número como frente', []],
    ]);
  });

  it('una hoja vacía se rechaza y un zip que no es hoja también', async () => {
    await expect(parseXlsx(buildXlsx([]), 'x.xlsx')).rejects.toMatchObject({ code: 'empty' });
    await expect(parseXlsx(zipSync({ 'a.txt': strToU8('x') }), 'x.xlsx')).rejects.toBeInstanceOf(
      ImportError,
    );
  });

  it('una hoja que declara más de lo permitido se rechaza antes de abrirla', async () => {
    const forged = forgeZipSize(
      buildXlsx([['a', 'b']]),
      'xl/worksheets/sheet1.xml',
      800 * 1024 * 1024,
    );
    await expect(parseXlsx(forged, 'x.xlsx')).rejects.toMatchObject({ code: 'too_large' });
  });
});

describe('Word', () => {
  it('lee las tablas como tarjetas, con el título como etiqueta', () => {
    const parsed = parseDocx(
      buildDocx(
        docxParagraph('Cardiología', 'Heading1') +
          docxParagraph('Infarto', 'Heading2') +
          docxTable([
            ['Frente', 'Reverso'],
            ['Troponina', 'Sube a las 3 horas'],
            ['Tratamiento', 'Aspirina'],
          ]),
      ),
      'apuntes.docx',
    );
    expect(parsed.errors).toEqual([]);
    expect(parsed.notes.map((note) => [note.front, note.back, note.tags, note.html])).toEqual([
      ['Troponina', 'Sube a las 3 horas', ['Cardiología::Infarto'], true],
      ['Tratamiento', 'Aspirina', ['Cardiología::Infarto'], true],
    ]);
  });

  it('lee los párrafos con las marcas de Apuntes y entiende los títulos en español', () => {
    const parsed = parseDocx(
      buildDocx(
        docxParagraph('Nefrología', 'Ttulo1') +
          docxParagraph('Una idea suelta sin marca') +
          docxParagraph('Hiperpotasemia :: Gluconato de calcio #urgencias') +
          docxParagraph('Furosemida ;; Diurético de asa') +
          docxParagraph('La {{creatinina}} sube en la lesión renal') +
          docxParagraph('Pregunta sin respuesta ::') +
          docxParagraph('Otro tema', 'Ttulo1') +
          docxParagraph('Dato :: Valor'),
      ),
      'apuntes.docx',
    );
    // Las marcas son las de Apuntes. :: pide las dos direcciones y ;; solo la de ida
    expect(parsed.notes.map((note) => [note.kind, note.tags])).toEqual([
      ['basic_reverse', ['Nefrología', 'urgencias']],
      ['basic', ['Nefrología']],
      ['cloze', ['Nefrología']],
      ['basic_reverse', ['Otro_tema']],
    ]);
    expect(parsed.notes[2]?.front).toBe('La {{c1::creatinina}} sube en la lesión renal');
    // Una marca sin respuesta no es una tarjeta, así que se salta sin error
    expect(parsed.errors).toEqual([]);
  });

  it('conserva negritas y cursivas de las celdas y escapa el resto', () => {
    const body = `<w:tbl><w:tr><w:tc><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Dosis</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:rPr><w:i/><w:b w:val="0"/></w:rPr><w:t>&lt;script&gt;x&lt;/script&gt; y más</w:t></w:r></w:p></w:tc></w:tr></w:tbl>`;
    const parsed = parseDocx(buildDocx(body), 'x.docx');
    expect(parsed.notes[0]?.front).toBe('<b>Dosis</b>');
    expect(parsed.notes[0]?.back).toBe('<i>&lt;script&gt;x&lt;/script&gt; y más</i>');
  });

  it('un documento sin nada que importar se rechaza y uno dañado también', () => {
    expect(errorOf(() => parseDocx(buildDocx(docxParagraph('Solo un texto')), 'x.docx'))).toBe(
      'empty',
    );
    expect(errorOf(() => parseDocx(buildDocx(''), 'x.docx'))).toBe('empty');
    expect(errorOf(() => parseDocx(zipSync({ 'a.txt': strToU8('x') }), 'x.docx'))).toBe(
      'unsupported',
    );
  });

  it('un XML con una entidad externa no lee nada del sistema', () => {
    const evil = `<?xml version="1.0"?><!DOCTYPE d [<!ENTITY x SYSTEM "file:///etc/passwd">]><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:tbl><w:tr><w:tc><w:p><w:r><w:t>&x;</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>b</w:t></w:r></w:p></w:tc></w:tr></w:tbl></w:body></w:document>`;
    const zip = zipSync({ 'word/document.xml': strToU8(evil) });
    const parsed = parseDocx(zip, 'x.docx');
    expect(JSON.stringify(parsed)).not.toContain('root:');
  });
});

describe('punto de entrada', () => {
  const deps = { loadSql: loadSqlForTests };

  it('elige el lector por el contenido y no por el nombre', async () => {
    const apkg = await buildLegacyApkg({
      models: standardModels,
      notes: [{ guid: 'g', model: 'basic', fields: ['a', 'b'], deck: 'Default' }],
    });
    expect((await parseImportFile('mazo.txt', apkg, deps)).source).toBe('apkg');
    expect(
      (
        await parseImportFile(
          'hoja.csv',
          buildXlsx([
            ['Frente', 'Reverso'],
            ['a', 'b'],
          ]),
          deps,
        )
      ).source,
    ).toBe('xlsx');
    expect(
      (
        await parseImportFile(
          'doc.zip',
          buildDocx(
            docxTable([
              ['Frente', 'Reverso'],
              ['a', 'b'],
            ]),
          ),
          deps,
        )
      ).source,
    ).toBe('docx');
    expect((await parseImportFile('cualquiera', strToU8('a,b\nc,d\n'), deps)).source).toBe('csv');
  });

  it('un zip de otra cosa o un archivo vacío se rechazan con su motivo', async () => {
    await expect(
      parseImportFile('x.zip', zipSync({ 'a.txt': strToU8('x') }), deps),
    ).rejects.toMatchObject({ code: 'unsupported' });
    await expect(parseImportFile('x.csv', new Uint8Array(), deps)).rejects.toMatchObject({
      code: 'empty',
    });
  });

  it('el motor de SQLite solo se carga con un paquete de Anki', async () => {
    let loads = 0;
    const counting = {
      loadSql: () => {
        loads += 1;
        return loadSqlForTests();
      },
    };
    await parseImportFile('a.csv', strToU8('Frente,Reverso\na,b\n'), counting);
    await parseImportFile(
      'a.xlsx',
      buildXlsx([
        ['Frente', 'Reverso'],
        ['a', 'b'],
      ]),
      counting,
    );
    expect(loads).toBe(0);
    await parseImportFile(
      'a.apkg',
      await buildLegacyApkg({ models: standardModels, notes: [] }),
      counting,
    );
    expect(loads).toBe(1);
  });
});
