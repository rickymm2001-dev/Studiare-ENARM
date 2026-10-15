// La pantalla 22 con la nube, solo para el admin (B11, 4.2 del plan de B11). El archivo de la plantilla
// se convierte aquí con el convertidor del Sheet y sube al banco de la nube en borrador con
// admin_bank_import, que crea una corrida de importación con el mismo reporte de renglones que la
// sincronización. Lo ya editado en la app no se pisa, queda como conflicto en Banco y Sheet.
import { useState } from 'react';
import { Link } from 'react-router';
import { FileUp } from 'lucide-react';
import { ScreenHeader } from '@/app/layout/ScreenHeader';
import { SCREENS } from '@/app/screens';
import type { SyncRowPayload, SyncRowResult } from '@/data/bank/contracts';
import { BankFileError, readBankFile } from '@/data/content/bankFiles';
import { IMPORT_BATCH, importBankRows } from '@/data/cloud/bankAdmin';
import { errorCodeOf } from '@/data/editorial/editorialRepo';
import { bankAdminText } from '@/i18n/bankAdmin';
import { t } from '@/i18n/es-MX';
import { physicianText } from '@/i18n/physician';
import { Button } from '@/ui/components/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/ui/components/card';
import { FileChooser } from '@/ui/components/file-chooser';
import { LoadingState } from '@/ui/states/states';
import { bankErrorText } from '../admin/bankErrors';
import { rowLabel, rowMessages } from '../admin/syncReport';
import { requireCloud } from '../admin/useBankAdminQuery';
import { convertImportTable, importPayloads, previewRows } from './cloudImport';
import { incompleteText } from './reviewTexts';
import { askSecondFactor } from './secondFactor';

type Phase =
  | { kind: 'idle' }
  | { kind: 'reading'; fileName: string }
  | { kind: 'planned'; fileName: string; payloads: SyncRowPayload[]; preview: SyncRowResult[] }
  | { kind: 'uploading'; fileName: string }
  | { kind: 'done'; fileName: string; created: number; versioned: number; rejected: number };

export function CloudBankImport() {
  const text = physicianText.importScreen;
  const cloudText = physicianText.importCloud;
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [error, setError] = useState('');

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setError('');
    setPhase({ kind: 'reading', fileName: file.name });
    try {
      const converted = convertImportTable(await readBankFile(file));
      setPhase({
        kind: 'planned',
        fileName: file.name,
        payloads: await importPayloads(converted),
        preview: previewRows(converted),
      });
    } catch (caught) {
      setPhase({ kind: 'idle' });
      setError(
        caught instanceof BankFileError
          ? (text.errors[caught.code] ?? text.errors.other ?? '')
          : (text.errors.other ?? ''),
      );
    }
  };

  const upload = async (fileName: string, payloads: readonly SyncRowPayload[]) => {
    setError('');
    setPhase({ kind: 'uploading', fileName });
    const outcomes: string[] = [];
    try {
      const cloud = await requireCloud();
      for (let start = 0; start < payloads.length; start += IMPORT_BATCH) {
        const result = await importBankRows(
          cloud,
          payloads.slice(start, start + IMPORT_BATCH),
          askSecondFactor,
        );
        outcomes.push(...result.rows.map((row) => row.outcome));
      }
      const count = (outcome: string) => outcomes.filter((item) => item === outcome).length;
      setPhase({
        kind: 'done',
        fileName,
        created: count('created'),
        versioned: count('versioned'),
        rejected: count('rejected'),
      });
    } catch (caught) {
      setPhase({ kind: 'idle' });
      setError(errorCodeOf(caught) === 'sync_busy' ? cloudText.busy : bankErrorText(caught));
    }
  };

  const ready =
    phase.kind === 'planned'
      ? phase.payloads.filter((payload) => payload.decision !== 'rejected').length
      : 0;

  return (
    <>
      <ScreenHeader title={t.screens.bankImport.title} description={cloudText.adminHint} />
      <Card aria-labelledby="importar-nube">
        <CardHeader>
          <CardTitle id="importar-nube">{text.file.title}</CardTitle>
          <CardDescription>{text.file.hint}</CardDescription>
        </CardHeader>
        <div className="flex flex-col gap-2">
          <label id="archivo-nube-etiqueta" htmlFor="archivo-nube" className="font-medium">
            {text.file.label}
          </label>
          <FileChooser
            id="archivo-nube"
            labelledBy="archivo-nube-etiqueta"
            accept=".xlsx,.csv,.json,.txt"
            disabled={phase.kind === 'reading' || phase.kind === 'uploading'}
            fileName={phase.kind === 'idle' ? null : phase.fileName}
            chooseText={text.file.choose}
            emptyText={text.file.none}
            icon={<FileUp aria-hidden />}
            onChoose={pick}
          />
          {error ? (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          ) : null}
        </div>
      </Card>
      {phase.kind === 'reading' || phase.kind === 'uploading' ? (
        <LoadingState label={phase.kind === 'reading' ? text.file.reading : cloudText.uploading} />
      ) : null}
      {phase.kind === 'planned' ? (
        <Card aria-labelledby="importar-nube-resumen" className="flex flex-col gap-3">
          <CardHeader>
            <CardTitle id="importar-nube-resumen">{text.summary.title}</CardTitle>
            <CardDescription>{text.summary.draftNote}</CardDescription>
          </CardHeader>
          {phase.preview.length > 0 ? (
            <ul className="flex flex-col gap-1 text-sm">
              {phase.preview.flatMap((row) =>
                rowMessages(row, incompleteText).map((message, at) => (
                  <li key={`${String(row.rowNumber)}-${at}`}>
                    {bankAdminText.sync.rows.line(rowLabel(row), message)}
                  </li>
                )),
              )}
            </ul>
          ) : null}
          <div>
            <Button
              disabled={ready === 0}
              onClick={() => {
                void upload(phase.fileName, phase.payloads);
              }}
            >
              {ready === 0 ? text.run.nothing : cloudText.run(ready)}
            </Button>
          </div>
        </Card>
      ) : null}
      {phase.kind === 'done' ? (
        <Card aria-labelledby="importar-nube-listo" className="flex flex-col gap-3">
          <CardHeader>
            <CardTitle id="importar-nube-listo">{text.done.title}</CardTitle>
          </CardHeader>
          <p role="status" className="text-sm">
            {cloudText.done(phase.created, phase.versioned, phase.rejected)}
          </p>
          <div>
            <Button asChild variant="secondary">
              <Link to={SCREENS.bankAdmin.path}>{t.screens.bankAdmin.title}</Link>
            </Button>
          </div>
        </Card>
      ) : null}
    </>
  );
}
