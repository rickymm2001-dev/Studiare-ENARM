// Códigos de influencer en Admin, Pagos (B10 del plan del cambio, respuesta 21, 3.3). Por código, los
// registros de Cómo nos conociste (B9), las pruebas, los pagos y los ingresos. Los registros solo
// salen si la función de B9 existe.
import { readPromotionCodeStats } from '@/data/cloud/adminBilling';
import { t } from '@/i18n/es-MX';
import { invoicesText } from '@/i18n/invoices';
import { Card, CardDescription, CardHeader, CardTitle } from '@/ui/components/card';
import { LoadingState } from '@/ui/states/states';
import { AdminQueryFailure } from './AdminQueryFailure';
import { useAdminQuery } from './useAdminQuery';

const text = invoicesText.admin.codes;

export function PromotionCodesCard() {
  const { state, reload } = useAdminQuery(readPromotionCodeStats);
  return (
    <Card aria-labelledby="codigos-titulo" className="flex flex-col gap-3">
      <CardHeader>
        <CardTitle id="codigos-titulo">{text.title}</CardTitle>
        <CardDescription>{text.description}</CardDescription>
      </CardHeader>
      {state.status === 'loading' ? <LoadingState /> : null}
      {state.status === 'failed' ? (
        <AdminQueryFailure reason={state.reason} onRetry={reload} />
      ) : null}
      {state.status === 'ready' && state.value.codes.length === 0 ? (
        <p className="text-sm text-fg-muted">{text.empty}</p>
      ) : null}
      {state.status === 'ready' && state.value.codes.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <caption className="sr-only">{text.title}</caption>
            <thead>
              <tr className="border-b border-line-strong text-xs text-fg-muted">
                <th scope="col" className="py-2 pr-3 font-semibold">
                  {text.columns.code}
                </th>
                {state.value.withSignups ? (
                  <th scope="col" className="py-2 pr-3 text-right font-semibold">
                    {text.columns.signups}
                  </th>
                ) : null}
                <th scope="col" className="py-2 pr-3 text-right font-semibold">
                  {text.columns.trials}
                </th>
                <th scope="col" className="py-2 pr-3 text-right font-semibold">
                  {text.columns.payments}
                </th>
                <th scope="col" className="py-2 text-right font-semibold">
                  {text.columns.revenue}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {state.value.codes.map((row) => (
                <tr key={row.code}>
                  <th scope="row" className="py-1.5 pr-3 font-semibold">
                    {row.code}
                  </th>
                  {state.value.withSignups ? (
                    <td className="py-1.5 pr-3 text-right tabular-nums">
                      {(row.signups ?? 0).toLocaleString('es-MX')}
                    </td>
                  ) : null}
                  <td className="py-1.5 pr-3 text-right tabular-nums">
                    {row.trials.toLocaleString('es-MX')}
                  </td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">
                    {row.payments.toLocaleString('es-MX')}
                  </td>
                  <td className="py-1.5 text-right tabular-nums">
                    {t.billing.price(row.revenueMxn)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </Card>
  );
}
