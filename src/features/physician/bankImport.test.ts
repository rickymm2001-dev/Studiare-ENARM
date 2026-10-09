import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { HEADERS, optionHeaders } from '@/data/content/bankColumns';
import {
  bankTableFromCsv,
  bankTableFromJson,
  bankTableFromXlsx,
  readBankFile,
} from '@/data/content/bankFiles';
import { newId, testApi } from '@/data/testing/fixtures';
import { applyImport, importedQuestionId, planImport } from './bankImport';

const disposers: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  await Promise.all(disposers.splice(0).map((dispose) => dispose()));
});
const setup = () => {
  const api = testApi('real');
  disposers.push(api.dispose);
  return api;
};

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'] as const;
const COLUMNS = [
  ...Object.values(HEADERS),
  ...LETTERS.flatMap((letter) => Object.values(optionHeaders(letter))),
];

/** Una fila válida de la plantilla, con lo que se quiera cambiar */
function record(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    [HEADERS.id]: 'q-001',
    [HEADERS.branch]: 'Medicina interna',
    [HEADERS.topic]: 'Cardiología',
    [HEADERS.subtopic]: 'Hipertensión arterial sistémica',
    [HEADERS.difficulty]: '3',
    [HEADERS.vignette]: 'Hombre de 58 años con cefalea occipital y presión de 190/110 mmHg.',
    [HEADERS.prompt]: '¿Cuál es el diagnóstico más probable?',
    [HEADERS.correct]: 'A',
    [HEADERS.explanation]:
      'Una presión muy elevada sin daño a órgano blanco es una urgencia hipertensiva.',
    [HEADERS.refs]: 'GPC Hipertensión arterial',
    ...Object.fromEntries(
      ['A', 'B', 'C', 'D'].flatMap((letter, index) => [
        [optionHeaders(letter).text, `Opción de texto ${letter}`],
        [
          optionHeaders(letter).rationale,
          index === 0
            ? 'Es la correcta porque cumple el criterio.'
            : `Atrae porque se parece ${letter}.`,
        ],
        [
          optionHeaders(letter).bias,
          index === 0
            ? ''
            : (['anchoring', 'premature_closure', 'framing_effect'][index - 1] ?? ''),
        ],
      ]),
    ),
    ...overrides,
  };
}

const csvOf = (records: Record<string, string>[]) =>
  [COLUMNS, ...records.map((row) => COLUMNS.map((column) => JSON.stringify(row[column] ?? '')))]
    .map((line) => line.join(','))
    .join('\n');

const plan = (api: ReturnType<typeof setup>, records: Record<string, string>[]) =>
  planImport(api, bankTableFromCsv(csvOf(records), 'prueba.csv'), {
    prefix: 'prueba',
    newId,
  });

describe('importar el banco', () => {
  it('una fila válida entra como pregunta nueva, en borrador y no de demostración', async () => {
    const api = setup();
    const result = await plan(api, [record()]);
    expect(result.problems).toEqual([]);
    expect(result.planned).toHaveLength(1);
    const [item] = result.planned;
    expect(item).toMatchObject({ key: 'q-001', action: 'new', rowNumber: 2 });
    expect(item?.question).toMatchObject({
      questionId: importedQuestionId('q-001'),
      version: 1,
      editorialStatus: 'draft',
      isDemo: false,
      branch: 'internal_medicine',
      topic: 'cardiology',
      physicianDifficulty: 3,
    });
    expect(item?.options).toHaveLength(4);
    expect(item?.question?.canonicalOptionIds).toHaveLength(4);
    // Planear no guarda nada
    expect(await api.repos.questions.listLatest()).toHaveLength(0);
  });

  it('guarda y al volver a importar lo mismo no duplica nada', async () => {
    const api = setup();
    const first = await plan(api, [record()]);
    expect(await applyImport(api, first)).toEqual({
      created: 1,
      newVersions: 0,
      unchanged: 0,
      failed: 0,
    });
    const again = await plan(api, [record()]);
    expect(again.planned[0]?.action).toBe('unchanged');
    expect(await applyImport(api, again)).toMatchObject({ created: 0, unchanged: 1 });
    expect(await api.repos.questions.listVersions(importedQuestionId('q-001'))).toHaveLength(1);
  });

  it('si cambió la pregunta sale una versión nueva y la anterior queda', async () => {
    const api = setup();
    await applyImport(api, await plan(api, [record()]));
    const edited = await plan(api, [
      record({ [HEADERS.explanation]: 'Explicación corregida por el médico.' }),
    ]);
    expect(edited.planned[0]).toMatchObject({ action: 'new_version' });
    expect(await applyImport(api, edited)).toMatchObject({ newVersions: 1 });
    const versions = await api.repos.questions.listVersions(importedQuestionId('q-001'));
    expect(versions.map((version) => version.version)).toEqual([1, 2]);
    expect(versions[1]?.explanation).toBe('Explicación corregida por el médico.');
    // Las opciones conservan su ID estable entre versiones
    const before = await api.repos.options.listForQuestionVersion(versions[0]?.id ?? '');
    const after = await api.repos.options.listForQuestionVersion(versions[1]?.id ?? '');
    expect(after.map((option) => option.optionId).sort()).toEqual(
      before.map((option) => option.optionId).sort(),
    );
  });

  it('una fila con problemas se queda fuera y dice cuál fila y por qué, y las demás entran', async () => {
    const api = setup();
    const result = await plan(api, [
      record(),
      record({ [HEADERS.id]: 'q-002', [HEADERS.branch]: 'Brujería' }),
      record({ [HEADERS.id]: 'q-003', [optionHeaders('B').bias]: '' }),
    ]);
    expect(result.planned.map((item) => item.key)).toEqual(['q-001']);
    expect(result.problems.map(({ rowNumber, id }) => ({ rowNumber, id }))).toEqual([
      { rowNumber: 3, id: 'q-002' },
      { rowNumber: 4, id: 'q-003' },
    ]);
    expect(result.problems[0]?.message).toContain('Brujería');
    expect(result.problems[1]?.message).toContain('no tiene sesgo');
    expect(await applyImport(api, result)).toMatchObject({ created: 1 });
  });

  it('aplica las reglas del editor, como opciones repetidas', async () => {
    const api = setup();
    const result = await plan(api, [record({ [optionHeaders('C').text]: 'Opción de texto B' })]);
    expect(result.planned).toHaveLength(0);
    expect(result.problems[0]?.message).toContain('Opción 3');
  });

  it('omite la fila de ejemplo de la plantilla y avisa de columnas que faltan', async () => {
    const api = setup();
    const example = await plan(api, [
      record({ [HEADERS.id]: 'EJEMPLO, borra esta fila' }),
      record(),
    ]);
    expect(example.skippedExamples).toBe(1);
    expect(example.planned).toHaveLength(1);

    const table = bankTableFromCsv('ID,Pregunta\nq,¿Algo?', 'roto.csv');
    const broken = await planImport(api, table, { prefix: 'x', newId });
    expect(broken.planned).toHaveLength(0);
    expect(broken.problems[0]).toMatchObject({ rowNumber: 0 });
    expect(broken.problems.some((problem) => problem.message.includes('Falta la columna'))).toBe(
      true,
    );
  });

  it('la polaridad y la tarea que declara el médico quedan como suyas', async () => {
    const api = setup();
    const declared = await plan(api, [
      record({ [HEADERS.polarity]: 'Negativa', [HEADERS.task]: 'Diagnóstico' }),
    ]);
    expect(declared.planned[0]?.question?.structure).toMatchObject({
      polarity: 'negative',
      task: 'diagnosis',
      source: 'physician',
    });
    const auto = await plan(api, [record()]);
    expect(auto.planned[0]?.question?.structure.source).toBe('auto');
  });
});

describe('leer archivos', () => {
  it('el CSV acepta punto y coma, comillas y filas vacías', () => {
    const table = bankTableFromCsv('ID;Pregunta\n\n"a;b";"¿Qué?"\n', 'x.csv');
    expect(table.headers).toEqual(['ID', 'Pregunta']);
    expect(table.rows).toEqual([{ rowNumber: 2, cells: ['a;b', '¿Qué?'] }]);
  });

  it('el JSON es una lista de objetos con los encabezados como llaves', () => {
    const table = bankTableFromJson(
      JSON.stringify([
        { ID: 'a', Dificultad: 3, Referencias: ['GPC uno', 'GPC dos'] },
        { ID: 'b', Pregunta: '¿Qué?' },
      ]),
      'x.json',
    );
    expect(table.headers).toEqual(['ID', 'Dificultad', 'Referencias', 'Pregunta']);
    expect(table.rows[0]).toEqual({ rowNumber: 1, cells: ['a', '3', 'GPC uno\nGPC dos', ''] });
    expect(table.rows[1]?.cells).toEqual(['b', '', '', '¿Qué?']);
    expect(
      bankTableFromJson(JSON.stringify({ preguntas: [{ ID: 'a' }] }), 'x.json').rows,
    ).toHaveLength(1);
  });

  it('rechaza lo que no se puede leer', () => {
    expect(() => bankTableFromJson('{', 'x.json')).toThrow();
    expect(() => bankTableFromJson('[]', 'x.json')).toThrow();
    expect(() => bankTableFromJson('[1, 2]', 'x.json')).toThrow();
    expect(() => bankTableFromJson('"texto"', 'x.json')).toThrow();
    expect(() => bankTableFromCsv('', 'x.csv')).toThrow();
  });
});

describe('la plantilla de Excel', () => {
  const path = resolve(
    import.meta.dirname,
    '../../../content-drafts/bank-plantilla/Studiare-banco-plantilla.xlsx',
  );

  it('se lee, trae los encabezados y su fila de ejemplo se omite sin problemas', async () => {
    const api = setup();
    const bytes = new Uint8Array(readFileSync(path));
    const table = await bankTableFromXlsx(bytes, 'plantilla.xlsx');
    expect(table.headers).toEqual(expect.arrayContaining(Object.values(HEADERS)));
    const result = await planImport(api, table, { prefix: 'plantilla', newId });
    expect(result.skippedExamples).toBe(1);
    expect(result.planned).toHaveLength(0);
    expect(result.problems).toEqual([]);
  });

  it('readBankFile reconoce por la extensión y rechaza lo demás', async () => {
    const file = (name: string, content: string) => ({
      name,
      size: content.length,
      arrayBuffer: () => Promise.resolve(new TextEncoder().encode(content).buffer),
    });
    expect((await readBankFile(file('banco.csv', 'ID,Pregunta\na,b'))).rows).toHaveLength(1);
    expect((await readBankFile(file('banco.json', '[{"ID":"a"}]'))).rows).toHaveLength(1);
    await expect(readBankFile(file('banco.pdf', 'x'))).rejects.toMatchObject({
      code: 'unsupported',
    });
    await expect(
      readBankFile({
        name: 'grande.csv',
        size: 60 * 1024 * 1024,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
      }),
    ).rejects.toMatchObject({ code: 'too_large' });
    await expect(
      bankTableFromXlsx(new TextEncoder().encode('no es un zip'), 'x.xlsx'),
    ).rejects.toMatchObject({ code: 'corrupt' });
  });
});

describe('plantillas descargables', () => {
  it('el CSV y el JSON traen los mismos encabezados, se leen y su ejemplo se omite', async () => {
    const { BOM, csvTemplate, jsonTemplate, TEMPLATE_COLUMNS } = await import('./bankTemplates');
    const api = setup();
    const fromCsv = bankTableFromCsv(csvTemplate().replace(BOM, ''), 'plantilla.csv');
    const fromJson = bankTableFromJson(jsonTemplate(), 'plantilla.json');
    expect(fromCsv.headers).toEqual([...TEMPLATE_COLUMNS]);
    expect(fromJson.headers).toEqual([...TEMPLATE_COLUMNS]);
    for (const table of [fromCsv, fromJson]) {
      const result = await planImport(api, table, { prefix: 'plantilla', newId });
      expect(result.skippedExamples).toBe(1);
      expect(result.planned).toHaveLength(0);
      expect(result.problems).toEqual([]);
    }
  });
});
