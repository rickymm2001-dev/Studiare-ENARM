// La importación de la pantalla 22 con destino nube (B11, 4.2 del plan de B11). El admin sube el mismo
// archivo de la plantilla, que se convierte aquí con el convertidor del Sheet (convertSheetTable) y viaja
// a admin_bank_import como los renglones de la sincronización (SyncRowPayload). La base decide contra lo
// que ya hay y no pisa lo editado en la app. El ID de la importación no tiene que seguir el patrón del
// Sheet, solo ser una clave corta sin espacios. Sin React ni Dexie.
import type { SyncRowPayload, SyncRowResult } from '@/data/bank/contracts';
import {
  convertSheetTable,
  type BankTable,
  type SheetConvertResult,
} from '@/data/content/bankConvert';
import { canonicalFromSheet, contentHash, metaHash } from '@/data/content/contentHash';
import { biasTaxonomy, structureDictionary, topicTaxonomy } from '@/demo/content';
import { analyzeStructure } from '@/engines/structure';

/** La clave de un renglón importado. La base la guarda como import:<clave> */
export const IMPORT_ID_PATTERN = '^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$';

export function convertImportTable(table: BankTable): SheetConvertResult {
  return convertSheetTable(table, {
    data: { branches: topicTaxonomy.branches, biases: biasTaxonomy.biases },
    analyze: (question) => {
      const auto = analyzeStructure(question, structureDictionary);
      return { polarity: auto.polarity, task: auto.task };
    },
    idPattern: IMPORT_ID_PATTERN,
  });
}

/** Los renglones para admin_bank_import. La base vuelve a decidir crear, versión o conflicto */
export async function importPayloads(converted: SheetConvertResult): Promise<SyncRowPayload[]> {
  return Promise.all(
    converted.rows.map(async (row): Promise<SyncRowPayload> => {
      const accepted = row.question !== null && row.key !== null;
      return {
        rowNumber: row.rowNumber,
        key: row.key ?? '',
        rowHash: row.question ? await contentHash(canonicalFromSheet(row.question)) : '',
        metaHash: await metaHash(row.meta),
        decision: accepted ? 'create' : 'rejected',
        expectLatestVersionId: null,
        problems: row.problems,
        incomplete: row.incomplete,
        notices: row.notices,
        ...(accepted && row.question ? { question: row.question } : {}),
        meta: row.meta,
      };
    }),
  );
}

/** Lo que diría el reporte de renglones antes de subir, con la misma forma que el de la nube */
export function previewRows(converted: SheetConvertResult): SyncRowResult[] {
  return converted.rows
    .filter(
      (row) =>
        row.question === null ||
        row.problems.length > 0 ||
        row.incomplete.length > 0 ||
        row.notices.length > 0,
    )
    .map((row) => ({
      rowNumber: row.rowNumber,
      sheetKey: row.key,
      outcome: row.question === null ? 'rejected' : 'created',
      incomplete: row.incomplete,
      notices: row.notices,
      problems: row.problems,
      questionId: null,
    }));
}
