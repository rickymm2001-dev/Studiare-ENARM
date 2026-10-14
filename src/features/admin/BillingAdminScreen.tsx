// Admin, Pagos (pantalla 34, B10 del plan del cambio, 3.3). Resumen de lugares Fundador, pruebas,
// pases, pagos por devolver y acciones fallidas, las solicitudes de factura, los códigos de influencer
// y los pagos recientes. Todo sale de funciones de la base que revisan is_admin, que con B9 también pide
// el segundo factor. Sin la cuenta de la nube no hay pagos que ver.
import { useCloud } from '@/app/cloudState';
import { ScreenHeader } from '@/app/layout/ScreenHeader';
import { readBillingSummary } from '@/data/cloud/adminBilling';
import { t } from '@/i18n/es-MX';
import { invoicesText } from '@/i18n/invoices';
import { Card, CardHeader, CardTitle } from '@/ui/components/card';
import { LoadingState } from '@/ui/states/states';
import { AdminQueryFailure } from './AdminQueryFailure';
import { InvoiceRequestsCard } from './InvoiceRequestsCard';
import { PromotionCodesCard } from './PromotionCodesCard';
import { RecentPaymentsCard } from './RecentPaymentsCard';
import { useAdminQuery } from './useAdminQuery';

const text = invoicesText.admin;

export function BillingAdminScreen() {
  const linked = useCloud((store) => store.state.status === 'linked');
  return (
    <>
      <ScreenHeader
        title={t.screens.adminBilling.title}
        description={t.screens.adminBilling.description}
      />
      {linked ? (
        <>
          <SummaryCard />
          <InvoiceRequestsCard />
          <PromotionCodesCard />
          <RecentPaymentsCard />
        </>
      ) : (
        <Card>
          <p className="text-sm text-fg-muted">{text.needsCloud}</p>
        </Card>
      )}
    </>
  );
}

function SummaryCard() {
  const { state, reload } = useAdminQuery(readBillingSummary);
  const summary = text.summary;
  return (
    <Card aria-labelledby="resumen-pagos-titulo" className="flex flex-col gap-3">
      <CardHeader>
        <CardTitle id="resumen-pagos-titulo">{summary.title}</CardTitle>
      </CardHeader>
      {state.status === 'loading' ? <LoadingState /> : null}
      {state.status === 'failed' ? (
        <AdminQueryFailure reason={state.reason} onRetry={reload} />
      ) : null}
      {state.status === 'ready' ? (
        <>
          <p className="text-sm">
            {summary.founderSeats(
              state.value.founder.held + state.value.founder.confirmed,
              state.value.founder.total,
              state.value.founder.held,
            )}
            {state.value.founder.open ? null : ` ${summary.founderClosed}`}
          </p>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {(
              [
                ['activeTrials', state.value.activeTrials],
                ['activePasses', state.value.activePasses],
                ['needsRefund', state.value.needsRefund],
                ['failedActions', state.value.failedActions],
                ['pendingInvoices', state.value.pendingInvoices],
              ] as const
            ).map(([key, value]) => (
              <div key={key} className="flex flex-col gap-1 rounded-md border border-line p-3">
                <dt className="text-xs leading-tight font-medium text-fg-muted">{summary[key]}</dt>
                <dd className="text-xl font-bold tabular-nums">{value.toLocaleString('es-MX')}</dd>
              </div>
            ))}
          </dl>
        </>
      ) : null}
    </Card>
  );
}
