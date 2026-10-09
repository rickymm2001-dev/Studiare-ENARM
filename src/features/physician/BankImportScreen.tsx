// Importador del banco (pantalla 22, 10.2). El médico sube el Excel, el CSV o el JSON que llenó con la
// plantilla. Antes de guardar nada ve cuántas filas entran, cuáles no y por qué, con el número de fila.
// Lo que entra queda en borrador (4.2) y un ID por fila evita duplicados si vuelve a subir el archivo.
import { useState, type ChangeEvent } from 'react';
import { Link } from 'react-router';
import { CheckCircle2, Download, FileSpreadsheet, ListChecks, TriangleAlert } from 'lucide-react';
import { ScreenHeader } from '@/app/layout/ScreenHeader';
import { SCREENS } from '@/app/screens';
import { useDataApi } from '@/data/context';
import { BankFileError, readBankFile } from '@/data/content/bankFiles';
import { newId } from '@/data/ids';
import { t } from '@/i18n/es-MX';
import { physicianText } from '@/i18n/physician';
import { Badge } from '@/ui/components/badge';
import { Button } from '@/ui/components/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/ui/components/card';
import { StatCell, StatPanel } from '@/ui/components/stat-panel';
import { LoadingState } from '@/ui/states/states';
import {
  applyImport,
  planImport,
  type ImportOutcome,
  type ImportPlan,
  type RowProblem,
} from './bankImport';
import { BOM, csvTemplate, downloadText, EXCEL_TEMPLATE_FILE, jsonTemplate } from './bankTemplates';

const PAGE = 50;
const csvCell = (value: string) => `"${value.replace(/"/g, '""')}"`;

type Phase =
  | { kind: 'idle' }
  | { kind: 'reading' }
  | { kind: 'planned'; fileName: string; plan: ImportPlan }
  | { kind: 'importing'; fileName: string; plan: ImportPlan; done: number }
  | { kind: 'done'; fileName: string; outcome: ImportOutcome };

/** Nombre del archivo sin extensión, para las claves de las filas sin ID */
const prefixOf = (fileName: string) =>
  fileName
    .replace(/\.[^.]+$/, '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'banco';

export function BankImportScreen() {
  const text = physicianText.importScreen;
  const api = useDataApi();
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [error, setError] = useState('');
  const [shown, setShown] = useState(PAGE);

  const pick = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setError('');
    setShown(PAGE);
    setPhase({ kind: 'reading' });
    try {
      const table = await readBankFile(file);
      const plan = await planImport(api, table, { prefix: prefixOf(file.name), newId });
      setPhase({ kind: 'planned', fileName: file.name, plan });
    } catch (caught) {
      setPhase({ kind: 'idle' });
      setError(
        caught instanceof BankFileError
          ? (text.errors[caught.code] ?? text.errors.other ?? '')
          : (text.errors.other ?? ''),
      );
    }
  };

  const run = async (fileName: string, plan: ImportPlan) => {
    setPhase({ kind: 'importing', fileName, plan, done: 0 });
    const outcome = await applyImport(api, plan, (done) => {
      setPhase({ kind: 'importing', fileName, plan, done });
    });
    setPhase({ kind: 'done', fileName, outcome });
  };

  const downloadReport = (problems: readonly RowProblem[]) => {
    const [rowName, idName, messageName] = text.problems.reportColumns;
    const lines = [
      [rowName, idName, messageName].map(csvCell).join(','),
      ...problems.map((problem) =>
        [
          problem.rowNumber === 0 ? text.problems.table : String(problem.rowNumber),
          problem.id,
          problem.message,
        ]
          .map(csvCell)
          .join(','),
      ),
    ];
    downloadText(
      text.problems.reportFile,
      `${BOM}${lines.join('\r\n')}\r\n`,
      'text/csv;charset=utf-8',
    );
  };

  return (
    <>
      <ScreenHeader title={t.screens.bankImport.title} description={text.hint} />

      <Card aria-labelledby="importar-plantilla">
        <CardHeader>
          <CardTitle id="importar-plantilla">{text.template.title}</CardTitle>
          <CardDescription>{text.template.hint}</CardDescription>
        </CardHeader>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="secondary">
            <a href={`${import.meta.env.BASE_URL}${EXCEL_TEMPLATE_FILE}`} download>
              <FileSpreadsheet aria-hidden />
              {text.template.excel}
            </a>
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              downloadText('Studiare-banco-plantilla.csv', csvTemplate(), 'text/csv;charset=utf-8');
            }}
          >
            <Download aria-hidden />
            {text.template.csv}
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              downloadText(
                'Studiare-banco-plantilla.json',
                jsonTemplate(),
                'application/json;charset=utf-8',
              );
            }}
          >
            <Download aria-hidden />
            {text.template.json}
          </Button>
        </div>
        <p className="mt-2 text-sm text-fg-muted">{text.template.guide}</p>
      </Card>

      <Card aria-labelledby="importar-archivo">
        <CardHeader>
          <CardTitle id="importar-archivo">{text.file.title}</CardTitle>
          <CardDescription>{text.file.hint}</CardDescription>
        </CardHeader>
        <div className="flex flex-col gap-2">
          <label htmlFor="archivo-banco" className="font-medium">
            {text.file.label}
          </label>
          <input
            id="archivo-banco"
            type="file"
            accept=".xlsx,.csv,.json,.txt"
            className="block w-full text-sm file:mr-3 file:min-h-touch file:rounded-full file:border file:border-line file:bg-surface file:px-4 file:font-semibold"
            disabled={phase.kind === 'reading' || phase.kind === 'importing'}
            onChange={(event) => {
              void pick(event);
            }}
          />
          {error ? (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          ) : null}
        </div>
      </Card>

      {phase.kind === 'reading' ? <LoadingState label={text.file.reading} /> : null}

      {phase.kind === 'planned' || phase.kind === 'importing' ? (
        <Review
          plan={phase.plan}
          shown={shown}
          onShowMore={() => {
            setShown(shown + PAGE);
          }}
          busy={phase.kind === 'importing'}
          done={phase.kind === 'importing' ? phase.done : 0}
          onRun={() => {
            void run(phase.fileName, phase.plan);
          }}
          onReport={downloadReport}
          onAgain={() => {
            setPhase({ kind: 'idle' });
          }}
        />
      ) : null}

      {phase.kind === 'done' ? (
        <Card aria-labelledby="importar-listo">
          <CardHeader>
            <CardTitle id="importar-listo" className="flex items-center gap-2">
              <CheckCircle2 aria-hidden className="text-success" />
              {text.done.title}
            </CardTitle>
          </CardHeader>
          <ul className="mb-3 list-disc pl-5 text-sm" role="status">
            <li>{text.done.created(phase.outcome.created)}</li>
            <li>{text.done.newVersions(phase.outcome.newVersions)}</li>
            <li>{text.done.unchanged(phase.outcome.unchanged)}</li>
            {phase.outcome.failed > 0 ? <li>{text.done.failed(phase.outcome.failed)}</li> : null}
          </ul>
          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <Link to={SCREENS.questionBank.path}>{text.done.goBank}</Link>
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setPhase({ kind: 'idle' });
              }}
            >
              {text.run.again}
            </Button>
          </div>
        </Card>
      ) : null}
    </>
  );
}

function Review({
  plan,
  shown,
  onShowMore,
  busy,
  done,
  onRun,
  onReport,
  onAgain,
}: {
  plan: ImportPlan;
  shown: number;
  onShowMore: () => void;
  busy: boolean;
  done: number;
  onRun: () => void;
  onReport: (problems: readonly RowProblem[]) => void;
  onAgain: () => void;
}) {
  const text = physicianText.importScreen;
  const created = plan.planned.filter((item) => item.action === 'new').length;
  const versions = plan.planned.filter((item) => item.action === 'new_version').length;
  const unchanged = plan.planned.filter((item) => item.action === 'unchanged').length;
  const writable = created + versions;
  const rowsWithProblems = new Set(plan.problems.map((problem) => problem.rowNumber)).size;
  return (
    <>
      <StatPanel label={text.summary.label}>
        <StatCell
          icon={<ListChecks />}
          label={text.summary.rows}
          value={plan.rows.toLocaleString('es-MX')}
        />
        <StatCell
          icon={<CheckCircle2 />}
          label={text.summary.ready}
          value={plan.planned.length.toLocaleString('es-MX')}
        />
        <StatCell
          icon={<TriangleAlert />}
          label={text.summary.problems}
          value={rowsWithProblems.toLocaleString('es-MX')}
        />
      </StatPanel>
      <Card aria-labelledby="importar-resumen">
        <CardHeader>
          <CardTitle id="importar-resumen">{text.summary.title}</CardTitle>
          <CardDescription>{text.summary.draftNote}</CardDescription>
        </CardHeader>
        <ul className="mb-3 list-disc pl-5 text-sm">
          <li>{text.summary.newQuestions(created)}</li>
          <li>{text.summary.newVersions(versions)}</li>
          {unchanged > 0 ? <li>{text.summary.unchangedDetail(unchanged)}</li> : null}
          {plan.skippedExamples > 0 ? <li>{text.summary.examples(plan.skippedExamples)}</li> : null}
        </ul>
        <div className="flex flex-wrap items-center gap-2">
          <Button disabled={writable === 0 || busy} onClick={onRun}>
            {text.run.import(writable)}
          </Button>
          <Button variant="secondary" disabled={busy} onClick={onAgain}>
            {text.run.again}
          </Button>
          {writable === 0 ? <p className="text-sm text-fg-muted">{text.run.nothing}</p> : null}
          {busy ? (
            <p role="status" className="text-sm font-medium">
              {text.run.importing(done, plan.planned.length)}
            </p>
          ) : null}
        </div>
      </Card>

      {plan.problems.length > 0 ? (
        <Card aria-labelledby="importar-problemas">
          <CardHeader>
            <CardTitle id="importar-problemas" className="flex flex-wrap items-center gap-2">
              {text.problems.title}
              <Badge variant="danger">{plan.problems.length.toLocaleString('es-MX')}</Badge>
            </CardTitle>
            <CardDescription>{text.problems.hint}</CardDescription>
          </CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-line">
                  <th scope="col" className="py-1.5 pr-3">
                    {text.problems.reportColumns[0]}
                  </th>
                  <th scope="col" className="py-1.5 pr-3">
                    {text.problems.id}
                  </th>
                  <th scope="col" className="py-1.5">
                    {text.problems.message}
                  </th>
                </tr>
              </thead>
              <tbody>
                {plan.problems.slice(0, shown).map((problem, index) => (
                  <tr key={index} className="border-b border-line align-top">
                    <td className="py-1.5 pr-3 whitespace-nowrap">
                      {problem.rowNumber === 0 ? text.problems.table : problem.rowNumber}
                    </td>
                    <td className="py-1.5 pr-3">{problem.id}</td>
                    <td className="py-1.5">{problem.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {plan.problems.length > shown ? (
              <Button variant="secondary" onClick={onShowMore}>
                {text.problems.showMore(Math.min(PAGE, plan.problems.length - shown))}
              </Button>
            ) : null}
            <Button
              variant="secondary"
              onClick={() => {
                onReport(plan.problems);
              }}
            >
              <Download aria-hidden />
              {text.problems.download}
            </Button>
          </div>
        </Card>
      ) : null}
    </>
  );
}
