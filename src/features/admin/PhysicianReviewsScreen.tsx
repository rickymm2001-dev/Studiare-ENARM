// Revisiones de médicos (pantalla 36, 4.5 del plan de B11, respuesta 58). Una tabla por médico y por mes
// de Mérida con aprobadas, cambios pedidos, rechazadas, las preguntas revisadas, los distractores
// atendidos y el monto si Ricardo puso tarifa. Se paga por pregunta revisada, así varias rondas sobre la
// misma pregunta en el mes cuentan una vez. Se baja como CSV del resumen y del detalle, que cuadran con
// las decisiones de la base. Sin correos, solo alias y clave del Sheet.
import { useState } from 'react';
import { useCloud } from '@/app/cloudState';
import { ScreenHeader } from '@/app/layout/ScreenHeader';
import type { ReviewReportRow } from '@/data/bank/contracts';
import { readBankSettings, readReviewReport, readReviewReportDetail } from '@/data/cloud/bankAdmin';
import { bankAdminText } from '@/i18n/bankAdmin';
import { t } from '@/i18n/es-MX';
import { Button } from '@/ui/components/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/ui/components/card';
import { TextField } from '@/ui/components/field';
import { ErrorState, LoadingState } from '@/ui/states/states';
import { downloadText } from '../physician/bankTemplates';
import { meridaMonthsBack } from '../physician/meridaMonth';
import { askSecondFactor } from '../physician/secondFactor';
import { bankCodeText, bankErrorText } from './bankErrors';
import { reviewDetailCsv, reviewSummaryCsv, reviewTotals } from './reviewReportCsv';
import { requireCloud, useBankAdminQuery } from './useBankAdminQuery';

const text = bankAdminText.reviews;
const num = (value: number) => value.toLocaleString('es-MX');
const money = (value: number | null) =>
  value === null ? '—' : value.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export function PhysicianReviewsScreen() {
  const linked = useCloud((store) => store.state.status === 'linked');
  return (
    <>
      <ScreenHeader
        title={t.screens.physicianReviews.title}
        description={bankAdminText.descriptions.physicianReviews}
      />
      {linked ? (
        <ReviewsReport />
      ) : (
        <Card>
          <p className="text-sm text-fg-muted">{bankAdminText.needsCloud}</p>
        </Card>
      )}
    </>
  );
}

function ReviewsReport() {
  const initial = meridaMonthsBack(new Date(), 2);
  const [draft, setDraft] = useState(initial);
  const [range, setRange] = useState(initial);
  const [error, setError] = useState('');
  const settings = useBankAdminQuery(
    (cloud, onForbidden) => readBankSettings(cloud, onForbidden),
    'settings',
  );
  const { state, reload } = useBankAdminQuery(
    (cloud, onForbidden) => readReviewReport(cloud, range, onForbidden),
    `${range.from}|${range.to}`,
  );
  const rate =
    settings.state.status === 'ready' ? (settings.state.value?.pay.perReviewMxn ?? null) : null;
  const valid = DAY.test(draft.from) && DAY.test(draft.to) && draft.from <= draft.to;

  const downloadDetail = async () => {
    setError('');
    try {
      const detail = await readReviewReportDetail(await requireCloud(), range, askSecondFactor);
      downloadText(
        text.detailFile(range.from, range.to),
        reviewDetailCsv(detail),
        'text/csv;charset=utf-8',
      );
    } catch (caught) {
      setError(bankErrorText(caught));
    }
  };

  return (
    <Card aria-labelledby="revisiones-tabla" className="flex flex-col gap-3">
      <CardHeader>
        <CardTitle id="revisiones-tabla">{t.screens.physicianReviews.title}</CardTitle>
        <CardDescription>{text.rule}</CardDescription>
      </CardHeader>
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (valid) setRange(draft);
        }}
      >
        <TextField
          label={text.from}
          type="date"
          value={draft.from}
          onChange={(event) => {
            setDraft({ ...draft, from: event.target.value });
          }}
        />
        <TextField
          label={text.to}
          type="date"
          value={draft.to}
          error={valid ? null : text.invalidRange}
          onChange={(event) => {
            setDraft({ ...draft, to: event.target.value });
          }}
        />
        <Button type="submit" disabled={!valid}>
          {text.show}
        </Button>
      </form>
      <p className="text-sm text-fg-muted">{text.rate(rate)}</p>
      {state.status === 'loading' ? <LoadingState /> : null}
      {state.status === 'failed' ? (
        <ErrorState description={bankCodeText(state.code)} onRetry={reload} />
      ) : null}
      {state.status === 'ready' ? (
        <>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={state.value.length === 0}
              onClick={() => {
                downloadText(
                  text.summaryFile(range.from, range.to),
                  reviewSummaryCsv(state.value, rate),
                  'text/csv;charset=utf-8',
                );
              }}
            >
              {text.summaryCsv}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={state.value.length === 0}
              onClick={() => {
                void downloadDetail();
              }}
            >
              {text.detailCsv}
            </Button>
          </div>
          {error ? (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          ) : null}
          {state.value.length === 0 ? (
            <p className="text-sm text-fg-muted">{text.none}</p>
          ) : (
            <ReportTable rows={state.value} />
          )}
        </>
      ) : null}
    </Card>
  );
}

function ReportTable({ rows }: { rows: readonly ReviewReportRow[] }) {
  const columns = text.columns;
  const totals = reviewTotals(rows);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-fg-muted">
            <th scope="col" className="py-1 pr-2">
              {columns.month}
            </th>
            <th scope="col" className="py-1 pr-2">
              {columns.physician}
            </th>
            <th scope="col" className="py-1 pr-2">
              {columns.code}
            </th>
            <th scope="col" className="py-1 pr-2 text-right">
              {columns.approved}
            </th>
            <th scope="col" className="py-1 pr-2 text-right">
              {columns.changesRequested}
            </th>
            <th scope="col" className="py-1 pr-2 text-right">
              {columns.rejected}
            </th>
            <th scope="col" className="py-1 pr-2 text-right">
              {columns.reviewed}
            </th>
            <th scope="col" className="py-1 pr-2 text-right">
              {columns.distractors}
            </th>
            <th scope="col" className="py-1 text-right">
              {columns.amount}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.month}-${row.physicianId}`} className="border-t border-line">
              <td className="py-1.5 pr-2">{row.month}</td>
              <th scope="row" className="py-1.5 pr-2 text-left font-medium">
                {row.alias}
              </th>
              <td className="py-1.5 pr-2">{row.code ?? '—'}</td>
              <td className="py-1.5 pr-2 text-right tabular-nums">{num(row.approved)}</td>
              <td className="py-1.5 pr-2 text-right tabular-nums">{num(row.changesRequested)}</td>
              <td className="py-1.5 pr-2 text-right tabular-nums">{num(row.rejected)}</td>
              <td className="py-1.5 pr-2 text-right tabular-nums">{num(row.reviewed)}</td>
              <td className="py-1.5 pr-2 text-right tabular-nums">
                {num(row.distractorsResolved)}
              </td>
              <td className="py-1.5 text-right tabular-nums">{money(row.amountMxn)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-line font-semibold">
            <th scope="row" colSpan={3} className="py-1.5 pr-2 text-left">
              {text.total}
            </th>
            <td className="py-1.5 pr-2 text-right tabular-nums">{num(totals.approved)}</td>
            <td className="py-1.5 pr-2 text-right tabular-nums">{num(totals.changesRequested)}</td>
            <td className="py-1.5 pr-2 text-right tabular-nums">{num(totals.rejected)}</td>
            <td className="py-1.5 pr-2 text-right tabular-nums">{num(totals.reviewed)}</td>
            <td className="py-1.5 pr-2 text-right tabular-nums">
              {num(totals.distractorsResolved)}
            </td>
            <td className="py-1.5 text-right tabular-nums">{money(totals.amountMxn)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
