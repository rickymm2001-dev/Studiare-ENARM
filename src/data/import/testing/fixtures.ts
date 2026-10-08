// Archivos de prueba del importador, armados con código y no guardados como binarios (Fase E).
// Paquetes .apkg en el formato viejo y el nuevo, hojas de Excel, documentos de Word y zips hechos
// a propósito para fallar. Solo los usan las pruebas.
import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js';
import { strToU8, zipSync } from 'fflate';

let sqlPromise: Promise<SqlJsStatic> | undefined;
export function loadSqlForTests(): Promise<SqlJsStatic> {
  sqlPromise ??= initSqlJs();
  return sqlPromise;
}

export interface FixtureNote {
  guid: string;
  /** Clave del tipo de nota en models */
  model: string;
  fields: string[];
  tags?: string;
  deck: string;
  /** Números de carta. Por defecto solo la 0 */
  ordinals?: number[];
}

export interface FixtureModel {
  name: string;
  cloze?: boolean;
  templates?: number;
}

export interface ApkgFixture {
  models: Record<string, FixtureModel>;
  notes: FixtureNote[];
  reviews?: number;
}

const BASIC: FixtureModel = { name: 'Basic' };

export const standardModels: Record<string, FixtureModel> = {
  basic: BASIC,
  reversed: { name: 'Basic (and reversed card)', templates: 2 },
  cloze: { name: 'Cloze', cloze: true },
};

function numericId(index: number, base: number): number {
  return base + index;
}

function createCommonTables(db: Database) {
  db.run(
    'create table notes (id integer primary key, guid text, mid integer, mod integer, usn integer, tags text, flds text, sfld text, csum integer, flags integer, data text)',
  );
  db.run(
    'create table cards (id integer primary key, nid integer, did integer, ord integer, mod integer, usn integer, type integer, queue integer, due integer, ivl integer, factor integer, reps integer, lapses integer, left integer, odue integer, odid integer, flags integer, data text)',
  );
  db.run(
    'create table revlog (id integer primary key, cid integer, usn integer, ease integer, ivl integer, lastIvl integer, factor integer, time integer, type integer)',
  );
}

function fillNotes(
  db: Database,
  fixture: ApkgFixture,
  modelIds: Map<string, number>,
  deckIds: Map<string, number>,
) {
  fixture.notes.forEach((note, index) => {
    const nid = numericId(index, 1_700_000_000_000);
    db.run('insert into notes values (?,?,?,?,?,?,?,?,?,?,?)', [
      nid,
      note.guid,
      modelIds.get(note.model) ?? 0,
      0,
      0,
      note.tags ? ` ${note.tags} ` : '',
      note.fields.join('\x1f'),
      note.fields[0] ?? '',
      0,
      0,
      '',
    ]);
    for (const ord of note.ordinals ?? [0]) {
      db.run('insert into cards values (?,?,?,?,0,0,0,0,0,0,0,0,0,0,0,0,0,?)', [
        nid * 10 + ord,
        nid,
        deckIds.get(note.deck) ?? 1,
        ord,
        '',
      ]);
    }
  });
  for (let review = 0; review < (fixture.reviews ?? 0); review += 1) {
    db.run('insert into revlog values (?,?,?,?,?,?,?,?,?)', [
      review + 1,
      1,
      0,
      3,
      1,
      0,
      2500,
      5000,
      1,
    ]);
  }
}

/** Un paquete en el formato viejo, con collection.anki21 y los tipos de nota como JSON en col */
export async function buildLegacyApkg(fixture: ApkgFixture): Promise<Uint8Array> {
  const SQL = await loadSqlForTests();
  const db = new SQL.Database();
  createCommonTables(db);
  db.run('create table col (id integer, models text, decks text)');
  const modelIds = new Map<string, number>();
  const models: Record<string, unknown> = {};
  Object.entries(fixture.models).forEach(([key, model], index) => {
    const id = numericId(index, 1_600_000_000_000);
    modelIds.set(key, id);
    models[String(id)] = {
      name: model.name,
      type: model.cloze ? 1 : 0,
      tmpls: Array.from({ length: model.templates ?? 1 }, (_, ord) => ({
        name: `Card ${ord + 1}`,
      })),
    };
  });
  const deckIds = new Map<string, number>();
  const decks: Record<string, unknown> = { '1': { name: 'Default' } };
  [...new Set(fixture.notes.map((note) => note.deck))].forEach((name, index) => {
    const id = numericId(index, 1_500_000_000_000);
    deckIds.set(name, id);
    decks[String(id)] = { name };
  });
  deckIds.set('Default', 1);
  db.run('insert into col values (1, ?, ?)', [JSON.stringify(models), JSON.stringify(decks)]);
  fillNotes(db, fixture, modelIds, deckIds);
  const collection = db.export();
  db.close();
  return zipSync({
    collection: strToU8('placeholder'),
    'collection.anki21': collection,
    media: strToU8('{}'),
  });
}

/** Un marco zstd con bloques sin comprimir. Es válido y evita depender de un compresor */
export function zstdStore(data: Uint8Array): Uint8Array {
  const BLOCK = 65_536;
  const blocks = Math.max(1, Math.ceil(data.length / BLOCK));
  const out = new Uint8Array(4 + 1 + 8 + blocks * 3 + data.length);
  out.set([0x28, 0xb5, 0x2f, 0xfd, 0xe0]);
  new DataView(out.buffer).setBigUint64(5, BigInt(data.length), true);
  let at = 13;
  for (let block = 0; block < blocks; block += 1) {
    const chunk = data.subarray(block * BLOCK, (block + 1) * BLOCK);
    const last = block === blocks - 1 ? 1 : 0;
    const header = last | (0 << 1) | (chunk.length << 3);
    out.set([header & 0xff, (header >> 8) & 0xff, (header >> 16) & 0xff], at);
    out.set(chunk, at + 3);
    at += 3 + chunk.length;
  }
  return out;
}

/** Un marco zstd sin tamaño declarado que se expande por bloques repetidos, una bomba de prueba */
export function zstdBomb(expandedBytes: number): Uint8Array {
  const BLOCK = 131_072;
  const blocks = Math.ceil(expandedBytes / BLOCK);
  const out = new Uint8Array(4 + 2 + blocks * 4);
  // Marco con ventana de 1 MB, sin tamaño declarado
  out.set([0x28, 0xb5, 0x2f, 0xfd, 0x00, 0x50]);
  let at = 6;
  for (let block = 0; block < blocks; block += 1) {
    const last = block === blocks - 1 ? 1 : 0;
    const header = last | (1 << 1) | (BLOCK << 3);
    out.set([header & 0xff, (header >> 8) & 0xff, (header >> 16) & 0xff, 0x41], at);
    at += 4;
  }
  return out;
}

/** Un paquete en el formato nuevo, con collection.anki21b comprimido y los tipos en tablas */
export async function buildModernApkg(fixture: ApkgFixture): Promise<Uint8Array> {
  const SQL = await loadSqlForTests();
  const db = new SQL.Database();
  createCommonTables(db);
  db.run(
    'create table notetypes (id integer primary key, name text, mtime_secs integer, usn integer, config blob)',
  );
  db.run('create table fields (ntid integer, ord integer, name text, config blob)');
  db.run(
    'create table templates (ntid integer, ord integer, name text, mtime_secs integer, usn integer, config blob)',
  );
  db.run(
    'create table decks (id integer primary key, name text, mtime_secs integer, usn integer, common blob, kind blob)',
  );
  const modelIds = new Map<string, number>();
  Object.entries(fixture.models).forEach(([key, model], index) => {
    const id = numericId(index, 1_600_000_000_000);
    modelIds.set(key, id);
    // Campo 1 de la configuración es el tipo, 0 normal y 1 cloze
    db.run('insert into notetypes values (?,?,0,0,?)', [
      id,
      model.name,
      new Uint8Array([0x08, model.cloze ? 1 : 0]),
    ]);
    for (let ord = 0; ord < (model.templates ?? 1); ord += 1) {
      db.run('insert into templates values (?,?,?,0,0,?)', [
        id,
        ord,
        `Card ${ord + 1}`,
        new Uint8Array(),
      ]);
    }
  });
  const deckIds = new Map<string, number>();
  [...new Set(fixture.notes.map((note) => note.deck))].forEach((name, index) => {
    const id = numericId(index, 1_500_000_000_000);
    deckIds.set(name, id);
    db.run('insert into decks values (?,?,0,0,?,?)', [
      id,
      name.split('::').join('\x1f'),
      new Uint8Array(),
      new Uint8Array(),
    ]);
  });
  fillNotes(db, fixture, modelIds, deckIds);
  const collection = db.export();
  db.close();
  return zipSync({
    'collection.anki2': strToU8('dummy'),
    'collection.anki21b': zstdStore(collection),
    media: zstdStore(new Uint8Array()),
    meta: new Uint8Array([0x08, 0x03]),
  });
}

const XML_HEADER = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const escapeXml = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Una hoja de Excel con las filas dadas, texto en la primera hoja */
export function buildXlsx(rows: readonly (readonly (string | number)[])[]): Uint8Array {
  const strings: string[] = [];
  const index = (text: string) => {
    const found = strings.indexOf(text);
    if (found >= 0) return found;
    strings.push(text);
    return strings.length - 1;
  };
  const columnName = (column: number) => String.fromCharCode(65 + column);
  const sheetRows = rows
    .map(
      (row, rowIndex) =>
        `<row r="${rowIndex + 1}">${row
          .map((value, column) => {
            const ref = `${columnName(column)}${rowIndex + 1}`;
            return typeof value === 'number'
              ? `<c r="${ref}"><v>${value}</v></c>`
              : `<c r="${ref}" t="s"><v>${index(value)}</v></c>`;
          })
          .join('')}</row>`,
    )
    .join('');
  return zipSync({
    '[Content_Types].xml': strToU8(
      `${XML_HEADER}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`,
    ),
    '_rels/.rels': strToU8(
      `${XML_HEADER}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    ),
    'xl/workbook.xml': strToU8(
      `${XML_HEADER}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Hoja1" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    ),
    'xl/_rels/workbook.xml.rels': strToU8(
      `${XML_HEADER}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    ),
    'xl/worksheets/sheet1.xml': strToU8(
      `${XML_HEADER}<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheetRows}</sheetData></worksheet>`,
    ),
    'xl/sharedStrings.xml': strToU8(
      `${XML_HEADER}<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${strings.length}" uniqueCount="${strings.length}">${strings
        .map((text) => `<si><t xml:space="preserve">${escapeXml(text)}</t></si>`)
        .join('')}</sst>`,
    ),
    'xl/styles.xml': strToU8(
      `${XML_HEADER}<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="1"><font><sz val="11"/></font></fonts><fills count="1"><fill><patternFill patternType="none"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="1"><xf/></cellXfs></styleSheet>`,
    ),
  });
}

/** Un documento de Word con el cuerpo en XML de WordprocessingML */
export function buildDocx(bodyXml: string): Uint8Array {
  return zipSync({
    '[Content_Types].xml': strToU8(
      `${XML_HEADER}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`,
    ),
    '_rels/.rels': strToU8(
      `${XML_HEADER}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
    ),
    'word/document.xml': strToU8(
      `${XML_HEADER}<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${bodyXml}</w:body></w:document>`,
    ),
  });
}

/** Un párrafo de Word. Los runs llevan su formato opcional */
export function docxParagraph(
  runs: string | readonly { text: string; bold?: boolean; italic?: boolean }[],
  style?: string,
): string {
  const list = typeof runs === 'string' ? [{ text: runs }] : runs;
  const body = list
    .map((run) => {
      const props = `${'bold' in run && run.bold ? '<w:b/>' : ''}${'italic' in run && run.italic ? '<w:i/>' : ''}`;
      return `<w:r>${props ? `<w:rPr>${props}</w:rPr>` : ''}<w:t xml:space="preserve">${escapeXml(run.text)}</w:t></w:r>`;
    })
    .join('');
  return `<w:p>${style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : ''}${body}</w:p>`;
}

export function docxTable(rows: readonly (readonly string[])[]): string {
  return `<w:tbl>${rows
    .map(
      (row) => `<w:tr>${row.map((cell) => `<w:tc>${docxParagraph(cell)}</w:tc>`).join('')}</w:tr>`,
    )
    .join('')}</w:tbl>`;
}

/**
 * Cambia el tamaño sin comprimir que declara un zip, en el directorio central y en el encabezado
 * local, para simular una bomba o un archivo que miente sobre su tamaño
 */
export function forgeZipSize(zip: Uint8Array, entryName: string, declared: number): Uint8Array {
  const out = new Uint8Array(zip);
  const view = new DataView(out.buffer);
  const name = strToU8(entryName);
  const matches = (offset: number, nameOffset: number, nameLength: number) =>
    nameLength === name.length && name.every((byte, i) => out[offset + nameOffset + i] === byte);
  for (let at = 0; at < out.length - 46; at += 1) {
    // Directorio central, 0x02014b50. El tamaño sin comprimir está 24 bytes después
    if (view.getUint32(at, true) === 0x02014b50 && matches(at, 46, view.getUint16(at + 28, true))) {
      view.setUint32(at + 24, declared, true);
    }
    // Encabezado local, 0x04034b50. El tamaño sin comprimir está 22 bytes después
    if (view.getUint32(at, true) === 0x04034b50 && matches(at, 30, view.getUint16(at + 26, true))) {
      view.setUint32(at + 22, declared, true);
    }
  }
  return out;
}
