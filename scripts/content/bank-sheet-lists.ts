// La pestaña Listas del Google Sheet del banco (B11, guion de la sección 8 del plan de B11, paso 6).
// Un rango con nombre por rama (SUB_<rama>, sus subespecialidades) y por subespecialidad
// (TEMA_<rama>__<subespecialidad>, sus subtemas), más dos tablas para pasar de nombre a código. Con
// ellas la validación de Subespecialidad y de Subtema puede depender de la rama elegida
//   Subespecialidad  =INDIRECTO("SUB_"&BUSCARV($B2; Listas!$A$2:$B$9; 2; FALSO))
//   Subtema          =INDIRECTO("TEMA_"&BUSCARV($B2&"|"&$C2; Listas!$C$2:$D$78; 2; FALSO))
// Las listas dependientes con INDIRECTO en un desplegable no están en la documentación de Google, solo
// en guías de terceros (8.34). Por eso se prueban primero en el Sheet de prueba (npm run bank:sheet-test)
// y, si fallan, queda la lista completa con el formato condicional. Todo sale de las taxonomías de
// src/demo/content, sin escribir nada de medicina. La lista Licencia del texto (LISTA_LICENCIAS) es la de
// las columnas de la fuente de los casos de lectura en inglés de B13 (docs/INGLES_MEDICO.md).
// Uso: npm run bank:sheet-lists             escribe content-drafts/bank-sheet/Studiare-banco-listas.xlsx
//      npm run bank:sheet-lists -- otra.xlsx
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import ExcelJS from 'exceljs';
import { LICENSE_LABELS, PASSAGE_LICENSES } from '../../src/data/content/passageSource.ts';
import {
  KIND_LABELS,
  LANGUAGE_LABELS,
  NO_BIAS_LABEL,
  POLARITY_LABELS,
  SHEET_STATUS_LABELS,
  TASK_LABELS,
  loadTaxonomies,
  type ContentTaxonomies,
} from './bankColumns.ts';

export const LISTS_TAB = 'Listas';

/** Código de una clave de la taxonomía para un rango con nombre. Solo letras, números y guion bajo */
export const listCode = (key: string) => key.toUpperCase().replace(/[^A-Z0-9]/g, '_');

/** Una columna de la pestaña Listas, con su rango con nombre si lo lleva */
export interface ListColumn {
  header: string;
  values: string[];
  name?: string;
}

/** Lo que necesitan las validaciones del Sheet de prueba para depender de la rama */
export interface ListsLayout {
  columns: ListColumn[];
  /** Rango de Rama troncal y su código, para BUSCARV */
  branchLookup: string;
  /** Rango de Rama troncal|Subespecialidad y su código, para BUSCARV */
  topicLookup: string;
}

/** La letra de una columna, 1 es A y 27 es AA */
export function columnLetter(column: number): string {
  let letters = '';
  let rest = column;
  while (rest > 0) {
    const index = (rest - 1) % 26;
    letters = String.fromCharCode(65 + index) + letters;
    rest = Math.floor((rest - 1) / 26);
  }
  return letters;
}

/** El rango absoluto de una columna de la pestaña, desde el renglón 2 */
export function listRange(column: number, length: number): string {
  const letter = columnLetter(column);
  return `${LISTS_TAB}!$${letter}$2:$${letter}$${Math.max(length, 1) + 1}`;
}

/** Las columnas de la pestaña Listas. Es pura, de las taxonomías */
export function buildListsLayout(data: ContentTaxonomies): ListsLayout {
  const branchNames = data.branches.map((branch) => branch.name);
  const topicPairs = data.branches.flatMap((branch) =>
    branch.topics.map((topic) => ({
      label: `${branch.name}|${topic.name}`,
      code: `${listCode(branch.key)}__${listCode(topic.key)}`,
    })),
  );
  const columns: ListColumn[] = [
    { header: 'Rama troncal', values: branchNames, name: 'RAMAS' },
    { header: 'Código de rama', values: data.branches.map((branch) => listCode(branch.key)) },
    { header: 'Rama troncal|Subespecialidad', values: topicPairs.map((pair) => pair.label) },
    { header: 'Código de subespecialidad', values: topicPairs.map((pair) => pair.code) },
    ...data.branches.map((branch) => ({
      header: branch.name,
      values: branch.topics.map((topic) => topic.name),
      name: `SUB_${listCode(branch.key)}`,
    })),
    ...data.branches.flatMap((branch) =>
      branch.topics.map((topic) => ({
        header: `${branch.name}, ${topic.name}`,
        values: topic.subtopics.map((subtopic) => subtopic.name),
        name: `TEMA_${listCode(branch.key)}__${listCode(topic.key)}`,
      })),
    ),
    { header: 'Tipo de reactivo', values: Object.values(KIND_LABELS), name: 'LISTA_TIPOS' },
    { header: 'Tarea', values: Object.values(TASK_LABELS), name: 'LISTA_TAREAS' },
    { header: 'Polaridad', values: Object.values(POLARITY_LABELS), name: 'LISTA_POLARIDAD' },
    {
      header: 'Sesgo',
      values: [
        ...data.biases.filter((bias) => bias.taggable).map((bias) => bias.name),
        NO_BIAS_LABEL,
      ],
      name: 'LISTA_SESGOS',
    },
    { header: 'Estado', values: Object.values(SHEET_STATUS_LABELS), name: 'LISTA_ESTADOS' },
    { header: 'Idioma', values: Object.values(LANGUAGE_LABELS), name: 'LISTA_IDIOMAS' },
    // Las licencias que acepta Studiare para el texto de un caso de lectura en inglés (B13, 1.4)
    {
      header: 'Licencia del texto',
      values: PASSAGE_LICENSES.map((license) => LICENSE_LABELS[license]),
      name: 'LISTA_LICENCIAS',
    },
  ];
  return {
    columns,
    branchLookup: `${LISTS_TAB}!$A$2:$B$${branchNames.length + 1}`,
    topicLookup: `${LISTS_TAB}!$C$2:$D$${topicPairs.length + 1}`,
  };
}

/** Agrega la pestaña Listas con sus rangos con nombre a un libro */
export function addListsSheet(book: ExcelJS.Workbook, data: ContentTaxonomies): ListsLayout {
  const layout = buildListsLayout(data);
  const sheet = book.addWorksheet(LISTS_TAB);
  layout.columns.forEach((column, index) => {
    sheet.getColumn(index + 1).width = Math.min(Math.max(column.header.length, 14), 40);
    const header = sheet.getCell(1, index + 1);
    header.value = column.header;
    header.font = { bold: true };
    column.values.forEach((value, position) => {
      sheet.getCell(position + 2, index + 1).value = value;
    });
    if (column.name) book.definedNames.add(listRange(index + 1, column.values.length), column.name);
  });
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  return layout;
}

/** Un libro con solo la pestaña Listas, para copiarla al Sheet del banco */
export function buildListsWorkbook(data: ContentTaxonomies): ExcelJS.Workbook {
  const book = new ExcelJS.Workbook();
  book.creator = 'Studiare';
  addListsSheet(book, data);
  return book;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  const root = resolve(import.meta.dirname, '..', '..');
  const output = resolve(
    process.argv[2] ?? resolve(root, 'content-drafts/bank-sheet/Studiare-banco-listas.xlsx'),
  );
  mkdirSync(dirname(output), { recursive: true });
  await buildListsWorkbook(loadTaxonomies(root)).xlsx.writeFile(output);
  console.log(`Pestaña Listas en ${output}. No la subas al repo`);
}
