// Textos con licencia para los casos de lectura en inglés (B13, 5.3 del plan de B13). Corre el script con
// fixtures chicos, tests/fixtures/medlineplus/resumenes-muestra.xml y tests/fixtures/pmc, con textos
// inventados que dicen [Prueba] y no son contenido médico. Revisa la lista de los médicos, que el texto de
// MedlinePlus y el de PubMed Central salgan sin HTML, que la licencia se lea de los metadatos y nunca se
// suponga, que se descarte lo que no sirve diciendo por qué, que la fuente se lea con la misma función que
// usa el servidor y que el Excel que sale lo lea el convertidor del Sheet. Sin red, y la prueba de la red
// simula fetch
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import ExcelJS from 'exceljs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BankTable } from '@/data/content/bankConvert';
import {
  LICENSE_LABELS,
  composePassageSource,
  parsePassageSource,
} from '@/data/content/passageSource';
import {
  HEADERS,
  OPTION_LETTERS,
  SHEET_HEADERS,
  loadTaxonomies,
  optionHeaders,
} from '../../scripts/content/bankColumns.ts';
import { workbookTable } from '../../scripts/content/bankImport.ts';
import {
  EUTILS_PAUSE_MS,
  EUTILS_TOOL,
  buildPassagesWorkbook,
  citation,
  createPmcFetcher,
  efetchRequestUrl,
  efetchUrl,
  eutilsEmail,
  htmlToText,
  licenseFromCreativeCommons,
  main,
  medlineplusPassage,
  parseRequestList,
  pmcPassage,
  preparePassages,
  sheetHeaders,
  sheetRows,
  type MainOptions,
  type PassageProblem,
  type PassageRequest,
  type PassageSources,
  type PreparedPassage,
} from '../../scripts/content/english-passages.ts';
import { parseTopicsXml, type MplusTopic } from '../../scripts/content/english-vocabulary.ts';
import { convertBankTable } from '../../supabase/functions/_shared/bank/sync.ts';

const ROOT = resolve(import.meta.dirname, '../..');
const FIXTURES = resolve(import.meta.dirname, '../fixtures');
const SUMMARIES = join(FIXTURES, 'medlineplus/resumenes-muestra.xml');
const PMC_DIR = join(FIXTURES, 'pmc');
const ID_PATTERN = '^[A-Z]{2,4}-[0-9]{4,5}$';

const data = loadTaxonomies(ROOT);
const summaries = parseTopicsXml(readFileSync(SUMMARIES, 'utf8'), { summaries: true });
const pmcXml = (number: number) => readFileSync(join(PMC_DIR, `PMC990000${number}.xml`), 'utf8');

const request = (
  source: PassageRequest['source'],
  id: string,
  extra: Partial<PassageRequest> = {},
): PassageRequest => ({ source, id, subtopic: 'english_pediatrics', questions: 3, ...extra });

function passageOf(result: PreparedPassage | PassageProblem): PreparedPassage {
  if (!('text' in result)) throw new Error(`Debió ser un texto y fue ${result.code}`);
  return result;
}

function problemOf(result: PreparedPassage | PassageProblem): PassageProblem {
  if ('text' in result) throw new Error('Debió ser un problema y fue un texto');
  return result;
}

/** Un artículo JATS mínimo, para probar una forma de los metadatos a la vez */
function jats(parts: { license?: string; abstracts?: string; authors?: string }): string {
  const abstracts = parts.abstracts ?? '<abstract><p>[Prueba] Inline abstract.</p></abstract>';
  return `<?xml version="1.0"?>
<pmc-articleset>
  <article xmlns:ali="http://www.niso.org/schemas/ali/1.0/" xmlns:xlink="http://www.w3.org/1999/xlink">
    <front><article-meta>
      <title-group><article-title>[Prueba] Inline title</article-title></title-group>
      ${parts.authors ?? ''}
      <permissions>${parts.license ?? ''}</permissions>
      ${abstracts}
    </article-meta></front>
  </article>
</pmc-articleset>`;
}

/** Un tema de MedlinePlus ya leído, para probar lo que el XML de muestra no trae */
const topic = (extra: Partial<MplusTopic>): MplusTopic => ({
  id: '9801',
  language: 'English',
  title: '[Prueba] Tema suelto',
  url: 'https://medlineplus.gov/pruebasuelto.html',
  alsoCalled: [],
  groups: [],
  mapped: [],
  summaryHtml: '<p>[Prueba] Texto suelto.</p>',
  ...extra,
});

const files = new Map<string, string>([
  ['PMC9900001', pmcXml(1)],
  ['PMC9900002', pmcXml(2)],
  ['PMC9900003', pmcXml(3)],
  ['PMC9900004', pmcXml(4)],
  ['PMC9900005', pmcXml(5)],
]);
const sources = (overrides: Partial<PassageSources> = {}): PassageSources => ({
  medlineplus: summaries,
  pmc: (id) => Promise.resolve(files.get(id) ?? null),
  ...overrides,
});

/**
 * Lo que escriben los médicos en cada renglón para que la fila sea una pregunta completa. Es texto de
 * prueba y no medicina. Los distractores llevan un sesgo de la lista, y la fuente del texto cuenta como la
 * referencia, así que no se llena Referencias
 */
function completed(table: BankTable): BankTable {
  const column = (name: string) => table.headers.indexOf(name);
  const biases = ['Sesgo de anclaje', 'Cierre prematuro', 'Sesgo de encuadre'];
  return {
    ...table,
    rows: table.rows.map((row, index) => {
      const cells = Array.from(
        { length: table.headers.length },
        (_unused, at) => row.cells[at] ?? '',
      );
      const set = (name: string, value: string) => {
        cells[column(name)] = value;
      };
      set(HEADERS.id, `EN-${String(index + 1).padStart(4, '0')}`);
      set(HEADERS.difficulty, '3');
      set(HEADERS.prompt, '[Prueba] Which statement does the passage support?');
      set(HEADERS.correct, 'A');
      set(HEADERS.explanation, '[Prueba] Explicación simulada, no es contenido médico.');
      OPTION_LETTERS.slice(0, 4).forEach((letter, position) => {
        const names = optionHeaders(letter);
        set(names.text, `[Prueba] Option ${letter}`);
        set(names.rationale, `[Prueba] Justificación ${letter} simulada`);
        if (position > 0) set(names.bias, biases[position - 1] ?? '');
      });
      return { ...row, cells };
    }),
  };
}

const dirs: string[] = [];
const tmp = () => {
  const dir = mkdtempSync(join(tmpdir(), 'ingles-textos-'));
  dirs.push(dir);
  return dir;
};
// Las pruebas no dependen del correo de contacto que tenga quien las corre. Sin NCBI_EMAIL por omisión
beforeEach(() => {
  vi.stubEnv('NCBI_EMAIL', '');
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

async function run(
  args: string[],
  options?: MainOptions,
): Promise<{ code: number; out: string; err: string }> {
  const out: string[] = [];
  const err: string[] = [];
  vi.spyOn(console, 'log').mockImplementation(
    (...items: unknown[]) => void out.push(items.join(' ')),
  );
  vi.spyOn(console, 'error').mockImplementation(
    (...items: unknown[]) => void err.push(items.join(' ')),
  );
  const code = await main(args, options);
  return { code, out: out.join('\n'), err: err.join('\n') };
}

describe('la lista de los médicos', () => {
  it('lee las entradas buenas, completa el PMCID y pone tres preguntas si no se dice', () => {
    const { requests, problems } = parseRequestList({
      texts: [
        { source: 'medlineplus', id: '9501', subtopic: 'english_pediatrics', questions: 2 },
        { source: 'medlineplus', id: 9502, subtopic: ' english_public_health ' },
        { source: 'pmc', id: '9900001', subtopic: 'english_internal_medicine' },
        { source: 'pmc', id: 'pmc9900003', subtopic: 'english_family_medicine', questions: '5' },
        { source: 'pmc', id: 'PMC77', subtopic: '' },
      ],
    });
    expect(problems).toEqual([]);
    expect(requests).toEqual([
      { source: 'medlineplus', id: '9501', subtopic: 'english_pediatrics', questions: 2 },
      { source: 'medlineplus', id: '9502', subtopic: 'english_public_health', questions: 3 },
      { source: 'pmc', id: 'PMC9900001', subtopic: 'english_internal_medicine', questions: 3 },
      { source: 'pmc', id: 'PMC9900003', subtopic: 'english_family_medicine', questions: 5 },
      // El subtema vacío pasa aquí y se rechaza al preparar, donde está la taxonomía
      { source: 'pmc', id: 'PMC77', subtopic: '', questions: 3 },
    ]);
  });

  it.each([
    [{ source: 'otra', id: '1', subtopic: 'english_pediatrics' }, /fuente tiene que ser/],
    [{ id: '1', subtopic: 'english_pediatrics' }, /fuente tiene que ser/],
    [null, /fuente tiene que ser/],
    ['texto', /fuente tiene que ser/],
    [{ source: 'medlineplus', id: '', subtopic: 'x' }, /id falta/],
    [{ source: 'medlineplus', id: 'abc', subtopic: 'x' }, /abc no es válido/],
    [{ source: 'medlineplus', id: 'PMC12', subtopic: 'x' }, /PMC12 no es válido/],
    [{ source: 'pmc', id: 'PMCxyz', subtopic: 'x' }, /PMCxyz no es válido/],
    [{ source: 'pmc', id: 'PMC12', subtopic: 'x', questions: 0 }, /van de 1 a 5/],
    [{ source: 'pmc', id: 'PMC12', subtopic: 'x', questions: 6 }, /van de 1 a 5/],
    [{ source: 'pmc', id: 'PMC12', subtopic: 'x', questions: 2.5 }, /van de 1 a 5/],
    [{ source: 'pmc', id: 'PMC12', subtopic: 'x', questions: 'tres' }, /van de 1 a 5/],
  ])('rechaza la entrada %j con un mensaje claro', (entry, message) => {
    const { requests, problems } = parseRequestList({ texts: [entry] });
    expect(requests).toEqual([]);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({ code: 'invalid_entry', request: null });
    expect(problems[0]?.message).toMatch(/^Texto 1\. /);
    expect(problems[0]?.message).toMatch(message);
  });

  it('un texto repetido se rechaza la segunda vez, aunque venga con otra forma', () => {
    const { requests, problems } = parseRequestList({
      texts: [
        { source: 'pmc', id: 'PMC77', subtopic: 'english_pediatrics' },
        { source: 'medlineplus', id: '77', subtopic: 'english_pediatrics' },
        { source: 'pmc', id: '77', subtopic: 'english_pediatrics' },
        { source: 'medlineplus', id: '77', subtopic: 'english_pediatrics' },
      ],
    });
    expect(requests.map((item) => `${item.source}:${item.id}`)).toEqual([
      'pmc:PMC77',
      'medlineplus:77',
    ]);
    expect(problems.map((item) => item.message)).toEqual([
      'Texto 3. PMC77 está repetido en la lista.',
      'Texto 4. 77 está repetido en la lista.',
    ]);
  });

  it.each([
    [null],
    [undefined],
    [5],
    ['texto'],
    [[]],
    [{}],
    [{ texts: 'x' }],
    [{ texts: { a: 1 } }],
  ])('una lista con otra forma (%j) lo dice sin lanzar', (raw) => {
    const { requests, problems } = parseRequestList(raw);
    expect(requests).toEqual([]);
    expect(problems).toHaveLength(1);
    expect(problems[0]?.message).toContain('la clave texts');
  });

  it('una lista vacía es válida y no trae nada', () => {
    expect(parseRequestList({ texts: [] })).toEqual({ requests: [], problems: [] });
  });
});

describe('el texto de los temas de MedlinePlus', () => {
  it('quita el HTML, conserva los párrafos y las listas y decodifica las entidades', () => {
    const html = summaries.find((item) => item.id === '9501')?.summaryHtml ?? '';
    expect(htmlToText(html)).toBe(
      [
        '[Prueba] First paragraph & more.',
        '',
        '[Prueba] Second paragraph with a link and bold text.',
        '',
        '- [Prueba] Item one',
        '- [Prueba] Item two',
        '',
        '[Prueba] A heading',
        '',
        '[Prueba] Closing line.',
        '[Prueba] After a break.',
      ].join('\n'),
    );
  });

  it.each([
    ['', ''],
    ['   ', ''],
    ['<p>A &amp;amp; B</p><p>C<br/>D</p>', 'A & B\n\nC\nD'],
    ['<div>Uno</div><div>Dos</div>', 'Uno\n\nDos'],
    ['<p>Uno</p><p></p><p></p><p></p><p>Dos</p>', 'Uno\n\nDos'],
  ])('htmlToText(%j) da %j', (html, expected) => {
    expect(htmlToText(html)).toBe(expected);
  });

  it('un tema con resumen sale con su fuente de dominio público', () => {
    const passage = passageOf(medlineplusPassage(summaries, request('medlineplus', '9501')));
    expect(passage).toMatchObject({
      title: '[Prueba] Texto Con Formato',
      license: 'public_domain',
      sourceTitle: '[Prueba] Texto Con Formato, MedlinePlus.gov (NLM)',
      url: 'https://medlineplus.gov/pruebatextoformato.html',
    });
    expect(passage.text).not.toMatch(/[<>]/);
  });

  it('un tema que no está, sin resumen o solo en español dice por qué', () => {
    expect(problemOf(medlineplusPassage(summaries, request('medlineplus', '1')))).toMatchObject({
      code: 'not_found',
      request: { source: 'medlineplus', id: '1' },
    });
    expect(problemOf(medlineplusPassage(summaries, request('medlineplus', '9502')))).toMatchObject({
      code: 'no_text',
    });
    // Los temas en español son otros temas. Tienen el mismo número que su par y no se toman
    const spanish = [
      topic({ id: '9701', language: 'Spanish', url: 'https://medlineplus.gov/spanish/x.html' }),
    ];
    expect(problemOf(medlineplusPassage(spanish, request('medlineplus', '9701'))).code).toBe(
      'not_found',
    );
    expect(
      passageOf(medlineplusPassage([topic({ id: '9701' })], request('medlineplus', '9701'))),
    ).toBeTruthy();
  });

  it('un tema sin resumen cargado (no se pidió summaries) no entra', () => {
    const without = parseTopicsXml(readFileSync(SUMMARIES, 'utf8'));
    expect(problemOf(medlineplusPassage(without, request('medlineplus', '9501'))).code).toBe(
      'no_text',
    );
  });
});

describe('la licencia de Creative Commons', () => {
  it.each([
    ['https://creativecommons.org/licenses/by/4.0/', 'cc_by'],
    ['http://creativecommons.org/licenses/by/3.0', 'cc_by'],
    ['https://www.creativecommons.org/licenses/by/4.0/legalcode', 'cc_by'],
    ['  https://creativecommons.org/licenses/BY/4.0/  ', 'cc_by'],
    ['https://creativecommons.org/licenses/by-sa/4.0/', 'cc_by_sa'],
    ['https://creativecommons.org/publicdomain/zero/1.0/', 'cc0'],
    ['https://creativecommons.org/publicdomain/mark/1.0/', 'public_domain'],
    ['https://creativecommons.org/licenses/by-nc/4.0/', 'not_allowed'],
    ['https://creativecommons.org/licenses/by-nd/4.0/', 'not_allowed'],
    ['https://creativecommons.org/licenses/by-nc-sa/4.0/', 'not_allowed'],
    ['https://creativecommons.org/licenses/by-nc-nd/4.0/', 'not_allowed'],
    ['https://creativecommons.org/licenses/by-sa-algo/4.0/', 'not_allowed'],
    ['https://creativecommons.org/publicdomain/otra/1.0/', 'not_allowed'],
    ['https://example.org/licencia-propia', 'not_allowed'],
    ['CC BY 4.0', 'not_allowed'],
    ['', null],
    ['   ', null],
  ])('%j es %j', (url, expected) => {
    expect(licenseFromCreativeCommons(url)).toBe(expected);
  });
});

describe('la cita de un artículo', () => {
  it.each([
    [['Prueba A et al.', 'Título', 'Revista (PMC1)'], 'Prueba A et al. Título. Revista (PMC1)'],
    [['Prueba A', 'Título', 'Revista (PMC1)'], 'Prueba A. Título. Revista (PMC1)'],
    [['', 'Título', 'Revista'], 'Título. Revista'],
    [['A', 'Es útil?', 'Revista'], 'A. Es útil? Revista'],
    [['  A  ', ' T.  ', ''], 'A. T.'],
    [['', '', ''], ''],
    [[], ''],
  ])('%j da %j', (parts, expected) => {
    expect(citation(parts)).toBe(expected);
  });
});

describe('el resumen de un artículo de PubMed Central', () => {
  it('toma el resumen, su título, sus autores y su revista, y nunca el cuerpo del artículo', () => {
    const passage = passageOf(pmcPassage(pmcXml(1), request('pmc', 'PMC9900001')));
    expect(passage).toMatchObject({
      title: '[Prueba] A simulated & short title',
      license: 'cc_by',
      sourceTitle:
        'Prueba A et al. [Prueba] A simulated & short title. [Prueba] Journal of Simulated Things (PMC9900001)',
      url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC9900001/',
    });
    expect(passage.text).toBe(
      [
        'Background',
        '',
        '[Prueba] Simulated background with italic text.',
        '',
        'Methods',
        '',
        '[Prueba] Simulated methods & a second sentence.',
        '',
        '[Prueba] Another paragraph.',
      ].join('\n'),
    );
    expect(passage.text).not.toContain('must not be copied');
  });

  it('lee la licencia solo del texto de los metadatos y toma al único autor sin et al.', () => {
    const passage = passageOf(pmcPassage(pmcXml(3), request('pmc', 'PMC9900003')));
    expect(passage).toMatchObject({
      license: 'cc_by_sa',
      sourceTitle:
        'Prueba. [Prueba] Share alike article. [Prueba] Journal of Simulated Things (PMC9900003)',
      url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC9900003/',
    });
    expect(passage.text).toBe('[Prueba] Simulated abstract of the share alike article.');
  });

  it('una licencia que no permite el uso comercial se descarta y dice cuál era', () => {
    const problem = problemOf(pmcPassage(pmcXml(2), request('pmc', 'PMC9900002')));
    expect(problem.code).toBe('license_not_allowed');
    expect(problem.message).toContain('https://creativecommons.org/licenses/by-nc/4.0/');
    expect(problem.request).toEqual({ source: 'pmc', id: 'PMC9900002' });
  });

  it('sin licencia en los metadatos no supone ninguna', () => {
    const problem = problemOf(pmcPassage(pmcXml(4), request('pmc', 'PMC9900004')));
    expect(problem.code).toBe('no_license');
    expect(problem.message).toContain('No se supone ninguna');
  });

  it('sin resumen no entra, aunque la licencia sea buena', () => {
    expect(problemOf(pmcPassage(pmcXml(5), request('pmc', 'PMC9900005'))).code).toBe('no_text');
  });

  it('lo que no es un artículo no lanza y dice que no lo encontró', () => {
    expect(problemOf(pmcPassage(null, request('pmc', 'PMC1'))).code).toBe('not_found');
    expect(problemOf(pmcPassage('esto no es xml <', request('pmc', 'PMC1'))).code).toBe(
      'not_found',
    );
    expect(problemOf(pmcPassage('<otra-cosa/>', request('pmc', 'PMC1'))).code).toBe('not_found');
    expect(problemOf(pmcPassage('', request('pmc', 'PMC1'))).code).toBe('not_found');
  });

  it('prefiere el resumen principal a los resúmenes gráficos o de autor', () => {
    const xml = jats({
      license: '<license xlink:href="https://creativecommons.org/licenses/by/4.0/"/>',
      abstracts:
        '<abstract abstract-type="graphical"><p>[Prueba] Graphical one.</p></abstract>' +
        '<abstract abstract-type="summary"><p>[Prueba] Author summary.</p></abstract>' +
        '<abstract><p>[Prueba] The main abstract.</p></abstract>',
    });
    expect(passageOf(pmcPassage(xml, request('pmc', 'PMC5'))).text).toBe(
      '[Prueba] The main abstract.',
    );
    const onlyGraphical = jats({
      license: '<license xlink:href="https://creativecommons.org/licenses/by/4.0/"/>',
      abstracts: '<abstract abstract-type="graphical"><p>[Prueba] Graphical one.</p></abstract>',
    });
    expect(problemOf(pmcPassage(onlyGraphical, request('pmc', 'PMC5'))).code).toBe('no_text');
  });

  it.each([
    [
      'la dirección en ali:license_ref sin xlink:href',
      '<license><ali:license_ref>https://creativecommons.org/licenses/by/4.0/</ali:license_ref></license>',
      'cc_by',
    ],
    [
      'la dirección en xlink:href',
      '<license xlink:href="https://creativecommons.org/publicdomain/zero/1.0/"/>',
      'cc0',
    ],
    [
      'marca de dominio público',
      '<license xlink:href="http://creativecommons.org/publicdomain/mark/1.0/"/>',
      'public_domain',
    ],
    [
      'una segunda licencia cuando la primera no trae dirección',
      '<license><license-p>Todos los derechos reservados</license-p></license>' +
        '<license xlink:href="https://creativecommons.org/licenses/by/4.0/"/>',
      'cc_by',
    ],
  ])('lee la licencia con %s', (_name, license, expected) => {
    const passage = passageOf(pmcPassage(jats({ license }), request('pmc', 'PMC5')));
    expect(passage.license).toBe(expected);
  });

  it.each([
    ['sin permisos', ''],
    [
      'con una licencia propia',
      '<license><license-p>Todos los derechos reservados.</license-p></license>',
    ],
  ])('un artículo %s no dice su licencia y no entra', (_name, license) => {
    expect(problemOf(pmcPassage(jats({ license }), request('pmc', 'PMC5'))).code).toBe(
      'no_license',
    );
  });

  it('una licencia con otra dirección no se toma por buena', () => {
    const xml = jats({ license: '<license xlink:href="https://example.org/mi-licencia"/>' });
    expect(problemOf(pmcPassage(xml, request('pmc', 'PMC5'))).code).toBe('license_not_allowed');
  });

  it('un artículo sin autores ni revista queda con su título y su PMCID', () => {
    const xml = jats({
      license: '<license xlink:href="https://creativecommons.org/licenses/by/4.0/"/>',
    });
    expect(passageOf(pmcPassage(xml, request('pmc', 'PMC5'))).sourceTitle).toBe(
      '[Prueba] Inline title',
    );
    const empty = xml.replace('[Prueba] Inline title', '');
    expect(passageOf(pmcPassage(empty, request('pmc', 'PMC5'))).sourceTitle).toBe('PMC5');
  });
});

describe('preparar los textos de la lista', () => {
  it('deja pasar lo que sirve y descarta lo demás con su motivo, sin detenerse', async () => {
    const requests: PassageRequest[] = [
      request('medlineplus', '9501', { questions: 2 }),
      request('medlineplus', '9502'),
      request('medlineplus', '9503'),
      request('medlineplus', '1'),
      request('pmc', 'PMC9900001'),
      request('pmc', 'PMC9900002'),
      request('pmc', 'PMC9900003', { subtopic: 'english_public_health' }),
      request('pmc', 'PMC9900004'),
      request('pmc', 'PMC9900005'),
      request('pmc', 'PMC9900099'),
    ];
    const { passages, problems } = await preparePassages(requests, sources(), data);
    expect(passages.map((item) => item.request.id)).toEqual(['9501', 'PMC9900001', 'PMC9900003']);
    expect(problems.map((item) => [item.request?.id, item.code])).toEqual([
      ['9502', 'no_text'],
      ['9503', 'text_too_long'],
      ['1', 'not_found'],
      ['PMC9900002', 'license_not_allowed'],
      ['PMC9900004', 'no_license'],
      ['PMC9900005', 'no_text'],
      ['PMC9900099', 'not_found'],
    ]);
    const tooLong = problems.find((item) => item.code === 'text_too_long');
    expect(tooLong?.message).toMatch(/mide \d+ caracteres y el banco acepta 8000/);
    expect(tooLong?.message).toContain('no se recorta');
  });

  it('cada texto que pasa trae una fuente que lee la misma función del servidor', async () => {
    const { passages } = await preparePassages(
      [request('medlineplus', '9501'), request('pmc', 'PMC9900001'), request('pmc', 'PMC9900003')],
      sources(),
      data,
    );
    expect(passages).toHaveLength(3);
    for (const passage of passages) {
      const reference = composePassageSource({
        title: passage.sourceTitle,
        license: LICENSE_LABELS[passage.license],
        url: passage.url,
      });
      expect(reference?.startsWith('Fuente del texto. ')).toBe(true);
      expect((reference ?? '').length).toBeLessThanOrEqual(300);
      const parsed = parsePassageSource([{ title: reference ?? '' }]);
      expect(parsed).toMatchObject({
        ok: true,
        source: { license: passage.license, url: passage.url },
      });
    }
  });

  it('solo acepta los subtemas de Comprensión de lectura', async () => {
    const { passages, problems } = await preparePassages(
      [
        // El de vocabulario es un subtema de Inglés médico, pero ninguna pregunta lo usa
        request('medlineplus', '9501', { subtopic: 'english_terms' }),
        request('medlineplus', '9501', { subtopic: '' }),
        request('medlineplus', '9501', { subtopic: 'english_inexistente' }),
        request('medlineplus', '9501', { subtopic: 'pediatrics' }),
        request('medlineplus', '9501', { subtopic: 'english_emergency_medicine' }),
      ],
      sources(),
      data,
    );
    expect(passages.map((item) => item.request.subtopic)).toEqual(['english_emergency_medicine']);
    expect(problems.map((item) => item.code)).toEqual([
      'unknown_subtopic',
      'unknown_subtopic',
      'unknown_subtopic',
      'unknown_subtopic',
    ]);
    expect(problems[0]?.message).toContain('english_terms no es de Comprensión de lectura');
    expect(problems[1]?.message).toContain('(vacío)');
  });

  it('sin el archivo de MedlinePlus los temas de MedlinePlus no entran y dice cómo bajarlo', async () => {
    const { passages, problems } = await preparePassages(
      [request('medlineplus', '9501'), request('pmc', 'PMC9900001')],
      sources({ medlineplus: null }),
      data,
    );
    expect(passages.map((item) => item.request.id)).toEqual(['PMC9900001']);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({ code: 'unavailable' });
    expect(problems[0]?.message).toContain('https://medlineplus.gov/xml.html');
    expect(problems[0]?.message).toContain('--medlineplus');
  });

  it('un artículo que no se puede pedir queda como no disponible y los demás siguen', async () => {
    const { passages, problems } = await preparePassages(
      [request('pmc', 'PMC9900001'), request('pmc', 'PMC9900003'), request('pmc', 'PMC9900002')],
      sources({
        pmc: (id) =>
          id === 'PMC9900001'
            ? Promise.reject(new Error('La red no abre.'))
            : Promise.resolve(files.get(id) ?? null),
      }),
      data,
    );
    expect(passages.map((item) => item.request.id)).toEqual(['PMC9900003']);
    expect(problems.map((item) => [item.request?.id, item.code])).toEqual([
      ['PMC9900001', 'unavailable'],
      ['PMC9900002', 'license_not_allowed'],
    ]);
    expect(problems[0]?.message).toBe('PMC9900001. La red no abre.');
  });

  it('una fuente sin enlace https no se acepta, porque el servidor la dejaría incompleta', async () => {
    const topics = [
      topic({ id: '9801', url: '' }),
      topic({ id: '9802', url: 'http://medlineplus.gov/sin-https.html' }),
      topic({ id: '9803', url: 'medlineplus.gov/sin-esquema.html' }),
      topic({ id: '9804' }),
    ];
    const { passages, problems } = await preparePassages(
      ['9801', '9802', '9803', '9804'].map((id) => request('medlineplus', id)),
      sources({ medlineplus: topics }),
      data,
    );
    expect(passages.map((item) => item.request.id)).toEqual(['9804']);
    expect(problems.map((item) => item.code)).toEqual([
      'source_invalid',
      'source_invalid',
      'source_invalid',
    ]);
  });

  it('una fuente larga recorta su título y conserva el enlace', async () => {
    const long = '[Prueba] ' + 'Palabra '.repeat(80);
    const { passages, problems } = await preparePassages(
      [request('medlineplus', '9801')],
      sources({ medlineplus: [topic({ id: '9801', title: long })] }),
      data,
    );
    expect(problems).toEqual([]);
    const passage = passages[0];
    const reference = composePassageSource({
      title: passage?.sourceTitle ?? '',
      license: LICENSE_LABELS.public_domain,
      url: passage?.url ?? '',
    });
    expect(reference?.length).toBeLessThanOrEqual(300);
    expect(reference?.endsWith('https://medlineplus.gov/pruebasuelto.html')).toBe(true);
    expect(parsePassageSource([{ title: reference ?? '' }]).ok).toBe(true);
  });
});

describe('el Sheet de los textos', () => {
  const passages = async () =>
    (
      await preparePassages(
        [
          request('medlineplus', '9501', { questions: 3 }),
          request('pmc', 'PMC9900001', { questions: 2, subtopic: 'english_internal_medicine' }),
          request('pmc', 'PMC9900003', { questions: 1, subtopic: 'english_public_health' }),
        ],
        sources(),
        data,
      )
    ).passages;
  const cell = (row: readonly string[], name: string) => row[sheetHeaders().indexOf(name)];

  it('los encabezados son los que lee el convertidor, sin faltar ninguno', () => {
    const headers = sheetHeaders();
    expect(headers).toHaveLength(41);
    expect(new Set(headers).size).toBe(41);
    expect(headers.slice(-4)).toEqual([
      SHEET_HEADERS.language,
      SHEET_HEADERS.passageSource,
      SHEET_HEADERS.passageLicense,
      SHEET_HEADERS.passageUrl,
    ]);
    const table: BankTable = { name: 'Preguntas', headers, rows: [] };
    expect(convertBankTable(table, ID_PATTERN).missingColumns).toEqual([]);
  });

  it('un renglón por pregunta, con el texto y la fuente solo en el Orden 1', async () => {
    const rows = sheetRows(await passages(), data);
    expect(rows).toHaveLength(3 + 2 + 1);
    for (const row of rows) expect(row).toHaveLength(41);
    // Los tres renglones del primer texto son un caso seriado
    expect(
      rows.slice(0, 3).map((row) => [cell(row, 'Caso'), cell(row, 'Orden en el caso')]),
    ).toEqual([
      ['EN-C001', '1'],
      ['EN-C001', '2'],
      ['EN-C001', '3'],
    ]);
    const [first, second, third, fourth, fifth, single] = rows;
    expect(first && cell(first, 'Caso clínico')).toContain('[Prueba] First paragraph & more.');
    expect(first && cell(first, 'Fuente del texto')).toBe(
      '[Prueba] Texto Con Formato, MedlinePlus.gov (NLM)',
    );
    expect(first && cell(first, 'Licencia del texto')).toBe('Dominio público');
    expect(first && cell(first, 'Enlace del texto')).toBe(
      'https://medlineplus.gov/pruebatextoformato.html',
    );
    for (const row of [second, third, fifth]) {
      expect(row && cell(row, 'Caso clínico')).toBe('');
      expect(row && cell(row, 'Fuente del texto')).toBe('');
      expect(row && cell(row, 'Licencia del texto')).toBe('');
      expect(row && cell(row, 'Enlace del texto')).toBe('');
    }
    // El segundo texto sigue con otro número de caso y otro subtema
    expect(fourth && [cell(fourth, 'Caso'), cell(fourth, 'Orden en el caso')]).toEqual([
      'EN-C002',
      '1',
    ]);
    expect(fifth && [cell(fifth, 'Caso'), cell(fifth, 'Orden en el caso')]).toEqual([
      'EN-C002',
      '2',
    ]);
    expect(fourth && cell(fourth, 'Subtema')).toBe('Medicina interna');
    expect(fourth && cell(fourth, 'Licencia del texto')).toBe('CC BY');
    expect(fourth && cell(fourth, 'Enlace del texto')).toBe(
      'https://pmc.ncbi.nlm.nih.gov/articles/PMC9900001/',
    );
    // Un texto con una sola pregunta va suelto, sin Caso, y no gasta un número de caso
    expect(single && [cell(single, 'Caso'), cell(single, 'Orden en el caso')]).toEqual(['', '']);
    expect(single && cell(single, 'Subtema')).toBe('Salud pública');
    expect(single && cell(single, 'Licencia del texto')).toBe('CC BY-SA');
    expect(single && cell(single, 'Caso clínico')).toContain('share alike');
  });

  it('llena la rama, el idioma y el estado, y deja vacío todo lo que escriben los médicos', async () => {
    const rows = sheetRows(await passages(), data);
    const doctors = [
      HEADERS.id,
      HEADERS.difficulty,
      HEADERS.kind,
      HEADERS.task,
      HEADERS.polarity,
      HEADERS.prompt,
      HEADERS.correct,
      HEADERS.canonical,
      HEADERS.explanation,
      HEADERS.refs,
      SHEET_HEADERS.author,
      SHEET_HEADERS.reviewer,
      ...OPTION_LETTERS.slice(0, 6).flatMap((letter) => Object.values(optionHeaders(letter))),
    ];
    for (const row of rows) {
      expect(cell(row, HEADERS.branch)).toBe('Inglés médico');
      expect(cell(row, HEADERS.topic)).toBe('Comprensión de lectura');
      expect(cell(row, SHEET_HEADERS.language)).toBe('Inglés');
      expect(cell(row, HEADERS.status)).toBe('Borrador');
      for (const name of doctors) expect(cell(row, name), name).toBe('');
    }
  });

  it('el prefijo y el número del primer caso se pueden elegir', async () => {
    const rows = sheetRows(await passages(), data, { casePrefix: 'LEC-', firstCase: 12 });
    expect(rows.map((row) => cell(row, 'Caso'))).toEqual([
      'LEC-012',
      'LEC-012',
      'LEC-012',
      'LEC-013',
      'LEC-013',
      '',
    ]);
  });

  it('el libro trae las instrucciones, las preguntas y las listas, sin una pregunta escrita', async () => {
    const book = buildPassagesWorkbook(await passages(), data);
    expect(book.worksheets.map((sheet) => sheet.name)).toEqual([
      'Instrucciones',
      'Preguntas',
      'Listas',
    ]);
    const intro = book.getWorksheet('Instrucciones');
    const lines: string[] = [];
    intro?.eachRow((row) => void lines.push(row.getCell(1).text));
    expect(lines.join('\n')).toContain('No lo resumas ni lo traduzcas');
    expect(lines.join('\n')).toContain('Las preguntas y su revisión son de los médicos');
    const sheet = book.getWorksheet('Preguntas');
    expect(sheet?.rowCount).toBe(1 + 6);
    expect(sheet?.getRow(1).values).toEqual([undefined, ...sheetHeaders()]);
  });

  it('el Excel se relee con el convertidor del Sheet y, ya completado, entra sin pendientes', async () => {
    const book = buildPassagesWorkbook(await passages(), data);
    const reloaded = new ExcelJS.Workbook();
    await reloaded.xlsx.load(await book.xlsx.writeBuffer());
    const table = workbookTable(reloaded);
    expect(table).not.toBeNull();
    if (!table) return;
    expect(table.headers).toEqual(sheetHeaders());
    expect(table.rows).toHaveLength(6);

    // Tal como sale, solo faltan las celdas de los médicos. No hay rechazos de estructura ni de rama
    const raw = convertBankTable(table, ID_PATTERN);
    expect(raw.missingColumns).toEqual([]);
    const rawCodes = new Set(raw.rows.flatMap((row) => row.problems.map((item) => item.code)));
    for (const code of [
      'case_inconsistent',
      'language_branch_mismatch',
      'branch_unknown',
      'topic_unknown',
      'subtopic_unknown',
      'subtopic_is_topic',
      'kind_unknown',
      'task_unknown',
      'polarity_invalid',
    ])
      expect(rawCodes, code).not.toContain(code);

    // Con lo que escriben los médicos, los seis renglones entran, completos y con la fuente en la referencia
    const done = convertBankTable(completed(table), ID_PATTERN);
    expect(done.missingColumns).toEqual([]);
    expect(done.rows).toHaveLength(6);
    for (const row of done.rows) {
      expect(row.problems, `renglón ${row.rowNumber}`).toEqual([]);
      expect(row.incomplete, `renglón ${row.rowNumber}`).toEqual([]);
      expect(row.question?.language).toBe('en');
    }
    const questions = done.rows.map((row) => row.question);
    const [one, two, three, four] = questions;
    // Los tres renglones del primer caso heredan la misma fuente
    expect(one?.refs[0]).toBe(
      'Fuente del texto. [Prueba] Texto Con Formato, MedlinePlus.gov (NLM). Dominio público. https://medlineplus.gov/pruebatextoformato.html',
    );
    expect(two?.refs[0]).toBe(one?.refs[0]);
    expect(three?.refs[0]).toBe(one?.refs[0]);
    // El texto del Orden 1 es la viñeta de todo el caso, y los demás renglones no lo repiten
    expect(one?.caseVignette).toContain('[Prueba] First paragraph & more.');
    expect(two?.caseVignette).toBe(one?.caseVignette);
    expect(three?.caseVignette).toBe(one?.caseVignette);
    expect(two?.vignette).toBe('');
    expect(three?.caseOrder).toBe(3);
    expect(four?.refs[0]).toContain('Fuente del texto. Prueba A et al.');
    expect(four?.refs[0]).toMatch(
      /\. CC BY\. https:\/\/pmc\.ncbi\.nlm\.nih\.gov\/articles\/PMC9900001\/$/,
    );
    for (const question of questions) {
      const parsed = parsePassageSource((question?.refs ?? []).map((title) => ({ title })));
      expect(parsed.ok).toBe(true);
    }
  });
});

describe('la línea de comandos', () => {
  const list = (texts: unknown[]) => {
    const dir = tmp();
    const path = join(dir, 'textos.json');
    writeFileSync(path, JSON.stringify({ texts }));
    return { dir, path };
  };

  it('--ayuda cuenta las opciones y termina bien', async () => {
    const { code, out } = await run(['--ayuda']);
    expect(code).toBe(0);
    expect(out).toContain('--list');
    expect(out).toContain('--medlineplus');
    expect(out).toContain('--pmc-dir');
    expect(out).toContain('--first-case');
    // También dice de dónde sale el correo de contacto que pide NCBI
    expect(out).toContain('NCBI_EMAIL');
  });

  it('sin la lista de los médicos termina con 2 y enseña la forma que debe tener', async () => {
    const { code, out } = await run(['--list', join(tmp(), 'no-existe.json')]);
    expect(code).toBe(2);
    expect(out).toContain('No encontré la lista de textos');
    expect(out).toContain('content-drafts/ingles/textos.json');
    expect(out).toContain('"texts"');
    expect(out).toContain('"source": "medlineplus"');
  });

  it('una lista que no es JSON termina con 1 y no escribe nada', async () => {
    const dir = tmp();
    const path = join(dir, 'roto.json');
    writeFileSync(path, '{ "texts": [');
    const outFile = join(dir, 'salida.xlsx');
    const { code, err } = await run(['--list', path, '--out', outFile]);
    expect(code).toBe(1);
    expect(err).toContain('no es un JSON válido');
    expect(existsSync(outFile)).toBe(false);
  });

  it('un archivo de MedlinePlus que no existe termina con 2 y dice dónde bajarlo', async () => {
    const { path } = list([{ source: 'medlineplus', id: '9501', subtopic: 'english_pediatrics' }]);
    const { code, out } = await run(['--list', path, '--medlineplus', join(tmp(), 'no-hay.xml')]);
    expect(code).toBe(2);
    expect(out).toContain('https://medlineplus.gov/xml.html');
    expect(out).toContain('esta sesión no abre medlineplus.gov');
  });

  it('prepara los textos buenos, cuenta los renglones y dice por qué descartó el resto', async () => {
    const { dir, path } = list([
      { source: 'medlineplus', id: '9501', subtopic: 'english_pediatrics', questions: 3 },
      { source: 'pmc', id: 'PMC9900001', subtopic: 'english_internal_medicine', questions: 2 },
      { source: 'pmc', id: 9900003, subtopic: 'english_public_health', questions: 1 },
      { source: 'pmc', id: 'PMC9900002', subtopic: 'english_pediatrics' },
      { source: 'medlineplus', id: '9503', subtopic: 'english_pediatrics' },
      { source: 'medlineplus', id: '9502', subtopic: 'english_pediatrics' },
      { source: 'otra', id: '1', subtopic: 'english_pediatrics' },
    ]);
    const outFile = join(dir, 'nueva/carpeta/salida.xlsx');
    const { code, out } = await run([
      '--list',
      path,
      '--medlineplus',
      SUMMARIES,
      '--pmc-dir',
      PMC_DIR,
      '--out',
      outFile,
      '--first-case',
      '7',
      '--case-prefix',
      'LEC-',
    ]);
    expect(code).toBe(0);
    expect(out).toContain('3 textos y 6 renglones por escribir');
    expect(out).toContain('No lo subas al repo');
    expect(out.match(/^No entra\. /gm)).toHaveLength(4);
    expect(out).toContain(
      'PMC9900002 tiene la licencia https://creativecommons.org/licenses/by-nc/4.0/',
    );
    expect(out).toContain('9503 ([Prueba] Texto Larguísimo). El texto mide');
    expect(out).toContain('El tema 9502 ([Prueba] Texto Sin Resumen) no trae resumen');
    expect(out).toContain('La fuente tiene que ser medlineplus o pmc');
    const book = new ExcelJS.Workbook();
    await book.xlsx.readFile(outFile);
    const table = workbookTable(book);
    expect(table?.rows).toHaveLength(6);
    const caseColumn = sheetHeaders().indexOf('Caso');
    expect(table?.rows.map((row) => row.cells[caseColumn])).toEqual([
      'LEC-007',
      'LEC-007',
      'LEC-007',
      'LEC-008',
      'LEC-008',
      '',
    ]);
  });

  it('un primer caso que no es un entero positivo vuelve a 1', async () => {
    const { dir, path } = list([
      { source: 'pmc', id: 'PMC9900001', subtopic: 'english_internal_medicine', questions: 2 },
    ]);
    for (const value of ['0', '-3', 'abc', '2.5']) {
      const outFile = join(dir, `salida-${value}.xlsx`);
      const { code } = await run([
        '--list',
        path,
        '--pmc-dir',
        PMC_DIR,
        '--out',
        outFile,
        '--first-case',
        value,
      ]);
      expect(code).toBe(0);
      const book = new ExcelJS.Workbook();
      await book.xlsx.readFile(outFile);
      expect(workbookTable(book)?.rows[0]?.cells[sheetHeaders().indexOf('Caso')]).toBe('EN-C001');
    }
  });

  it('si ningún texto sirve termina con 1 y no escribe el Excel', async () => {
    const { dir, path } = list([
      { source: 'pmc', id: 'PMC9900002', subtopic: 'english_pediatrics' },
      { source: 'pmc', id: 'PMC9900004', subtopic: 'english_pediatrics' },
      { source: 'pmc', id: 'PMC9900099', subtopic: 'english_pediatrics' },
    ]);
    const outFile = join(dir, 'salida.xlsx');
    const { code, out, err } = await run(['--list', path, '--pmc-dir', PMC_DIR, '--out', outFile]);
    expect(code).toBe(1);
    expect(out.match(/^No entra\. /gm)).toHaveLength(3);
    expect(err).toContain('No quedó ningún texto para escribir preguntas');
    expect(existsSync(outFile)).toBe(false);
  });

  it('un texto de MedlinePlus sin el archivo no se inventa, se descarta con el aviso', async () => {
    const { dir, path } = list([
      { source: 'medlineplus', id: '9501', subtopic: 'english_pediatrics' },
      { source: 'pmc', id: 'PMC9900001', subtopic: 'english_pediatrics', questions: 2 },
    ]);
    const outFile = join(dir, 'salida.xlsx');
    const { code, out } = await run(['--list', path, '--pmc-dir', PMC_DIR, '--out', outFile]);
    expect(code).toBe(0);
    expect(out).toContain('Falta el archivo de MedlinePlus');
    expect(out).toContain('1 textos y 2 renglones por escribir');
  });

  describe('sin carpeta de artículos pide a E-utilities, y si la red no abre lo dice', () => {
    const one = () =>
      list([{ source: 'pmc', id: 'PMC9900001', subtopic: 'english_pediatrics', questions: 2 }]);

    it('con la red cerrada dice qué dominios abrir y cómo bajar el XML a mano', async () => {
      const calls: string[] = [];
      vi.stubGlobal('fetch', (url: string) => {
        calls.push(url);
        return Promise.reject(new TypeError('fetch failed'));
      });
      const { dir, path } = one();
      const { code, out, err } = await run(['--list', path, '--out', join(dir, 'salida.xlsx')]);
      expect(code).toBe(1);
      // El pedido del script dice quién lo hace con tool (B13, hallazgo 13 de la revisión independiente)
      expect(calls).toEqual([
        'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pmc&id=PMC9900001&retmode=xml&tool=studiare-english-passages',
      ]);
      for (const host of [
        'medlineplus.gov',
        'www.ncbi.nlm.nih.gov',
        'pmc.ncbi.nlm.nih.gov',
        'eutils.ncbi.nlm.nih.gov',
      ])
        expect(out).toContain(host);
      expect(out).toContain('PMC9900001.xml');
      expect(out).toContain('--pmc-dir');
      // La dirección para bajarlo a mano es la que se abre en el navegador, sin tool
      expect(out).toContain(
        'a mano de https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pmc&id=PMC9900001&retmode=xml y guárdalo',
      );
      expect(err).toContain('No quedó ningún texto');
    });

    it('un 404 es un artículo que no existe y otro código es un fallo del servicio', async () => {
      const { dir, path } = one();
      vi.stubGlobal('fetch', () => Promise.resolve(new Response('', { status: 404 })));
      const missing = await run(['--list', path, '--out', join(dir, 'a.xlsx')]);
      expect(missing.code).toBe(1);
      expect(missing.out).toContain('No encontré el artículo PMC9900001');
      vi.stubGlobal('fetch', () => Promise.resolve(new Response('', { status: 503 })));
      const broken = await run(['--list', path, '--out', join(dir, 'b.xlsx')]);
      expect(broken.code).toBe(1);
      expect(broken.out).toContain('contestó 503 al pedir PMC9900001');
    });

    it('con la respuesta buena prepara el texto como si viniera de la carpeta', async () => {
      const { dir, path } = one();
      vi.stubGlobal('fetch', () => Promise.resolve(new Response(pmcXml(1), { status: 200 })));
      const outFile = join(dir, 'salida.xlsx');
      const { code, out } = await run(['--list', path, '--out', outFile]);
      expect(code).toBe(0);
      expect(out).toContain('1 textos y 2 renglones por escribir');
      expect(existsSync(outFile)).toBe(true);
    });
  });

  describe('el pedido a E-utilities dice quién es, espera entre pedidos y no escribe ningún correo', () => {
    // Un correo de mentira armado aquí, para que ninguno quede escrito en el repo
    const EMAIL = ['revisor.b13', 'prueba.invalid'].join('@');
    const noWait = () => Promise.resolve();
    const TOOL = `tool=${EUTILS_TOOL}`;

    /** fetch simulado. Contesta con el XML de la muestra del artículo que se pide, y 404 si no hay */
    function eutils(log: string[], failing: readonly string[] = []) {
      const articles: Record<string, string> = {
        PMC9900001: pmcXml(1),
        PMC9900003: pmcXml(3),
      };
      return (url: string) => {
        const pmcid = /[?&]id=(PMC\d+)/.exec(url)?.[1] ?? '';
        log.push(url);
        if (failing.includes(pmcid)) return Promise.resolve(new Response('', { status: 503 }));
        const xml = articles[pmcid];
        return Promise.resolve(
          xml === undefined
            ? new Response('', { status: 404 })
            : new Response(xml, { status: 200 }),
        );
      };
    }
    const one = () =>
      list([{ source: 'pmc', id: 'PMC9900001', subtopic: 'english_pediatrics', questions: 2 }]);
    const three = () =>
      list([
        { source: 'pmc', id: 'PMC9900001', subtopic: 'english_pediatrics', questions: 2 },
        { source: 'pmc', id: 'PMC9900003', subtopic: 'english_public_health', questions: 1 },
        { source: 'pmc', id: 'PMC9900099', subtopic: 'english_pediatrics' },
      ]);
    /** Todo el texto de las celdas de un Excel */
    async function cellsOf(file: string): Promise<string[]> {
      const book = new ExcelJS.Workbook();
      await book.xlsx.readFile(file);
      const cells: string[] = [];
      for (const sheet of book.worksheets) {
        sheet.eachRow((row) => {
          row.eachCell((cell) => {
            cells.push(cell.text);
          });
        });
      }
      return cells;
    }

    it('los pedidos se presentan con tool, y la dirección de bajarlo a mano no lleva ni tool ni correo', () => {
      expect(efetchUrl('PMC9900001')).toBe(
        'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pmc&id=PMC9900001&retmode=xml',
      );
      expect(efetchRequestUrl('PMC9900001')).toBe(`${efetchUrl('PMC9900001')}&${TOOL}`);
      expect(EUTILS_TOOL).toBe('studiare-english-passages');
      // Con correo, va codificado para que un + o un & no rompan la dirección
      const tricky = ['a+b&c', 'x.invalid'].join('@');
      const url = efetchRequestUrl('PMC9900001', tricky);
      expect(url).toBe(`${efetchUrl('PMC9900001')}&${TOOL}&email=a%2Bb%26c%40x.invalid`);
      expect(new URL(url).searchParams.get('email')).toBe(tricky);
    });

    it('el correo sale solo de la variable NCBI_EMAIL, sin espacios, y vacía o ausente es que falta', () => {
      expect(eutilsEmail({ NCBI_EMAIL: `  ${EMAIL}\n` })).toBe(EMAIL);
      expect(eutilsEmail({ NCBI_EMAIL: '' })).toBeUndefined();
      expect(eutilsEmail({ NCBI_EMAIL: '   \t' })).toBeUndefined();
      expect(eutilsEmail({})).toBeUndefined();
      // Otra variable no cuenta, ni siquiera una parecida
      expect(eutilsEmail({ EMAIL, NCBI_API_KEY: EMAIL, ncbi_email: EMAIL })).toBeUndefined();
    });

    it('sin NCBI_EMAIL los pedidos salen sin email, avisa una sola vez que NCBI lo pide y sigue', async () => {
      const calls: string[] = [];
      vi.stubGlobal('fetch', eutils(calls));
      const { dir, path } = three();
      const outFile = join(dir, 'salida.xlsx');
      const { code, out } = await run(['--list', path, '--out', outFile], {
        env: {},
        sleep: noWait,
      });
      expect(calls).toHaveLength(3);
      for (const url of calls) {
        expect(url).toContain(`&${TOOL}`);
        expect(url).not.toContain('email');
      }
      expect(out.match(/NCBI pide/g)).toHaveLength(1);
      expect(out).toContain('NCBI_EMAIL');
      expect(out).toContain('sin escribirlo en ningún archivo del repo');
      // El aviso no detiene el trabajo
      expect(code).toBe(0);
      expect(out).toContain('2 textos y 3 renglones por escribir');
      expect(existsSync(outFile)).toBe(true);
    });

    it('una variable vacía o de solo espacios se trata como que falta', async () => {
      for (const value of ['', '   ']) {
        const calls: string[] = [];
        vi.stubGlobal('fetch', eutils(calls));
        const { dir, path } = three();
        const { out } = await run(['--list', path, '--out', join(dir, 'salida.xlsx')], {
          env: { NCBI_EMAIL: value },
          sleep: noWait,
        });
        expect(out, JSON.stringify(value)).toContain('NCBI pide');
        for (const url of calls) expect(url).not.toContain('email');
      }
    });

    it('con NCBI_EMAIL los pedidos llevan tool y email, no avisa y el correo no sale en ningún lado', async () => {
      const calls: string[] = [];
      vi.stubGlobal('fetch', eutils(calls));
      const { dir, path } = three();
      const outFile = join(dir, 'salida.xlsx');
      const { code, out, err } = await run(['--list', path, '--out', outFile], {
        env: { NCBI_EMAIL: ` ${EMAIL} ` },
        sleep: noWait,
      });
      expect(code).toBe(0);
      expect(calls).toHaveLength(3);
      for (const url of calls) {
        expect(url).toContain(`&${TOOL}&email=${encodeURIComponent(EMAIL)}`);
        expect(url).toContain('%40');
      }
      expect(out).not.toContain('NCBI pide');
      // Ni en pantalla ni en el Excel que suben los médicos
      expect(out + err).not.toContain(EMAIL);
      expect((await cellsOf(outFile)).filter((cell) => cell.includes(EMAIL))).toEqual([]);
    });

    it('si la red no abre, lo que dice para bajarlo a mano no repite el correo', async () => {
      vi.stubGlobal('fetch', () => Promise.reject(new TypeError('fetch failed')));
      const { dir, path } = three();
      const { out, err } = await run(['--list', path, '--out', join(dir, 'salida.xlsx')], {
        env: { NCBI_EMAIL: EMAIL },
        sleep: noWait,
      });
      expect(out).toContain('No pude abrir eutils.ncbi.nlm.nih.gov');
      expect(out + err).not.toContain(EMAIL);
      expect(out).not.toContain('email=');
    });

    it('sin que se le pase el entorno lee NCBI_EMAIL de las variables del proceso', async () => {
      const calls: string[] = [];
      vi.stubGlobal('fetch', eutils(calls));
      vi.stubEnv('NCBI_EMAIL', EMAIL);
      const { dir, path } = one();
      const { out } = await run(['--list', path, '--out', join(dir, 'salida.xlsx')]);
      expect(calls).toEqual([
        `${efetchUrl('PMC9900001')}&${TOOL}&email=${encodeURIComponent(EMAIL)}`,
      ]);
      expect(out).not.toContain('NCBI pide');
    });

    it('con la carpeta de artículos, o sin textos de PubMed Central, no pide nada y no avisa del correo', async () => {
      const calls: string[] = [];
      vi.stubGlobal('fetch', eutils(calls));
      const { dir, path } = three();
      const withDir = await run(
        ['--list', path, '--pmc-dir', PMC_DIR, '--out', join(dir, 'a.xlsx')],
        { env: {}, sleep: noWait },
      );
      expect(withDir.code).toBe(0);
      expect(withDir.out).not.toContain('NCBI pide');
      const medline = list([{ source: 'medlineplus', id: '9501', subtopic: 'english_pediatrics' }]);
      const onlyMedline = await run(
        ['--list', medline.path, '--medlineplus', SUMMARIES, '--out', join(dir, 'b.xlsx')],
        { env: {}, sleep: noWait },
      );
      expect(onlyMedline.code).toBe(0);
      expect(onlyMedline.out).not.toContain('NCBI pide');
      expect(calls).toEqual([]);
    });

    it('espera entre un pedido y el siguiente, no antes del primero ni después del último', async () => {
      const events: string[] = [];
      const calls: string[] = [];
      const answer = eutils(calls);
      vi.stubGlobal('fetch', (url: string) => {
        events.push(`pide ${/id=(PMC\d+)/.exec(url)?.[1] ?? '?'}`);
        return answer(url);
      });
      const sleep = (ms: number) => {
        events.push(`espera ${String(ms)}`);
        return Promise.resolve();
      };
      const { dir, path } = three();
      const { code } = await run(['--list', path, '--out', join(dir, 'salida.xlsx')], {
        env: { NCBI_EMAIL: EMAIL },
        sleep,
      });
      expect(code).toBe(0);
      expect(events).toEqual([
        'pide PMC9900001',
        'espera 350',
        'pide PMC9900003',
        'espera 350',
        'pide PMC9900099',
      ]);
    });

    it('también espera después de un pedido que falló, y lo que no sale a la red no gasta pausa', async () => {
      const events: string[] = [];
      const answer = eutils([], ['PMC9900001']);
      vi.stubGlobal('fetch', (url: string) => {
        events.push(`pide ${/id=(PMC\d+)/.exec(url)?.[1] ?? '?'}`);
        return answer(url);
      });
      const sleep = (ms: number) => {
        events.push(`espera ${String(ms)}`);
        return Promise.resolve();
      };
      const { dir, path } = list([
        { source: 'medlineplus', id: '9501', subtopic: 'english_pediatrics' },
        { source: 'pmc', id: 'PMC9900001', subtopic: 'english_pediatrics' },
        { source: 'pmc', id: 'PMC9900002', subtopic: 'no_existe' },
        { source: 'pmc', id: 'PMC9900003', subtopic: 'english_public_health' },
      ]);
      const { out } = await run(
        ['--list', path, '--medlineplus', SUMMARIES, '--out', join(dir, 'salida.xlsx')],
        { env: { NCBI_EMAIL: EMAIL }, sleep },
      );
      expect(out).toContain('contestó 503 al pedir PMC9900001');
      // Un solo salto entre los dos pedidos de PubMed Central. MedlinePlus y el subtema malo no salen a la red
      expect(events).toEqual(['pide PMC9900001', 'espera 350', 'pide PMC9900003']);
    });

    it('la pausa deja menos de 3 pedidos por segundo, que es lo que NCBI permite sin clave', () => {
      expect(EUTILS_PAUSE_MS).toBe(350);
      expect(1000 / EUTILS_PAUSE_MS).toBeLessThan(3);
    });

    it('sin otra forma de esperar, la pausa es de 350 ms de reloj', async () => {
      vi.useFakeTimers();
      try {
        const calls: string[] = [];
        vi.stubGlobal('fetch', eutils(calls));
        const fetchPmc = createPmcFetcher({ email: EMAIL });
        expect(await fetchPmc('PMC9900001')).toContain('<article');
        expect(calls).toHaveLength(1);
        const second = fetchPmc('PMC9900003');
        await vi.advanceTimersByTimeAsync(EUTILS_PAUSE_MS - 1);
        expect(calls).toHaveLength(1);
        await vi.advanceTimersByTimeAsync(1);
        expect(await second).toContain('<article');
        expect(calls).toHaveLength(2);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  it('el archivo de la carpeta se lee por el PMCID, aunque la lista lo escriba sin PMC', async () => {
    const dir = tmp();
    writeFileSync(join(dir, 'PMC9900001.xml'), pmcXml(1));
    const { path } = list([
      { source: 'pmc', id: '9900001', subtopic: 'english_pediatrics', questions: 2 },
    ]);
    const outFile = join(dir, 'salida.xlsx');
    const { code } = await run(['--list', path, '--pmc-dir', dir, '--out', outFile]);
    expect(code).toBe(0);
    const book = new ExcelJS.Workbook();
    await book.xlsx.readFile(outFile);
    expect(workbookTable(book)?.rows).toHaveLength(2);
  });
});
