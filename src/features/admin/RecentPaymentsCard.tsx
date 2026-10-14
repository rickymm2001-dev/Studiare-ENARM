// Pagos recientes en Admin, Pagos (B10 del plan del cambio, 3.3). Los últimos 50 cobros con su método,
// su monto, el descuento con su código y su estado. Un pago en OXXO no se reembolsa en Stripe, así que
// la garantía se devuelve por transferencia y aquí se marca como devuelto con una nota, lo que quita el
// pase o el plan (8.7, admin_mark_payment_refunded).
import { useState } from 'react';
import {
  listRecentPayments,
  markPaymentRefunded,
  type AdminPayment,
} from '@/data/cloud/adminBilling';
import { loadCloud } from '@/data/cloud/client';
import { longDate } from '@/features/billing/planState';
import { t } from '@/i18n/es-MX';
import { invoicesText } from '@/i18n/invoices';
import { Button } from '@/ui/components/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/ui/components/card';
import { TextField } from '@/ui/components/field';
import { LoadingState } from '@/ui/states/states';
import { AdminQueryFailure } from './AdminQueryFailure';
import { useAdminQuery } from './useAdminQuery';

const text = invoicesText.admin.payments;

/** Concepto del cobro, como Suscripción, Mensual Fundador, Tarjeta */
function conceptOf(payment: AdminPayment): string {
  const purpose = payment.purpose === 'pass' ? text.purposes.pass : text.purposes.subscription;
  const plan = payment.plan
    ? (t.billing.plans[payment.plan as keyof typeof t.billing.plans] as string | undefined)
    : undefined;
  const method = payment.method
    ? (text.methods[payment.method as keyof typeof text.methods] as string | undefined)
    : undefined;
  return [purpose, plan, method].filter(Boolean).join(', ');
}

export function RecentPaymentsCard() {
  const { state, reload } = useAdminQuery((cloud) => listRecentPayments(cloud));
  const [refunding, setRefunding] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [noteError, setNoteError] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const refund = async (payment: AdminPayment) => {
    const clean = note.trim();
    if (clean === '' || clean.length > 500) {
      setNoteError(text.noteNeeded);
      return;
    }
    setBusy(true);
    const cloud = await loadCloud();
    const result = cloud
      ? await markPaymentRefunded(cloud, payment.id, clean)
      : ({ ok: false, reason: 'network' } as const);
    setBusy(false);
    if (!result.ok) {
      if (result.reason === 'invalid') setNoteError(text.noteNeeded);
      else setMessage(text.refundFailed);
      return;
    }
    setRefunding(null);
    setNote('');
    setMessage(result.value === 'refunded' ? text.refunded : text.alreadyRefunded);
    reload();
  };

  return (
    <Card aria-labelledby="pagos-recientes-titulo" className="flex flex-col gap-3">
      <CardHeader>
        <CardTitle id="pagos-recientes-titulo">{text.title}</CardTitle>
        <CardDescription>{text.description}</CardDescription>
      </CardHeader>
      <p role="status" className="text-sm text-fg-muted empty:hidden">
        {message}
      </p>
      {state.status === 'loading' ? <LoadingState /> : null}
      {state.status === 'failed' ? (
        <AdminQueryFailure reason={state.reason} onRetry={reload} />
      ) : null}
      {state.status === 'ready' && state.value.payments.length === 0 ? (
        <p className="text-sm text-fg-muted">{text.empty}</p>
      ) : null}
      {state.status === 'ready' && state.value.payments.length > 0 ? (
        <ul
          aria-label={text.title}
          className="flex flex-col divide-y divide-line border-y border-line"
        >
          {state.value.payments.map((payment) => {
            const refundable =
              payment.method === 'oxxo' &&
              (payment.status === 'paid' || payment.status === 'needs_refund');
            return (
              <li
                key={payment.id}
                className="flex flex-col gap-2 py-3 text-sm lg:flex-row lg:items-start lg:justify-between"
              >
                <div className="flex min-w-0 flex-col gap-0.5">
                  <p className="font-semibold">
                    {payment.alias ?? invoicesText.admin.invoices.noAlias},{' '}
                    {t.billing.price(payment.amountMxn)}
                  </p>
                  <p className="text-fg-muted">
                    {longDate(payment.paidAt ?? payment.createdAt)}. {conceptOf(payment)}.
                  </p>
                  {payment.discountMxn !== null && payment.discountMxn > 0 ? (
                    <p className="text-fg-muted">
                      {text.columns.discount}{' '}
                      {text.discount(t.billing.price(payment.discountMxn), payment.promotionCode)}
                    </p>
                  ) : payment.promotionCode ? (
                    <p className="text-fg-muted">{payment.promotionCode}</p>
                  ) : null}
                  <p>{text.statuses[payment.status] ?? payment.status}</p>
                </div>
                {refundable ? (
                  refunding === payment.id ? (
                    <div className="flex flex-col gap-2 lg:w-80">
                      <TextField
                        label={text.refundNote}
                        hint={text.refundNoteHint}
                        value={note}
                        maxLength={500}
                        error={noteError}
                        onChange={(event) => {
                          setNote(event.target.value);
                          setNoteError(null);
                        }}
                      />
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="danger"
                          disabled={busy}
                          onClick={() => {
                            void refund(payment);
                          }}
                        >
                          {text.refundConfirm}
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={busy}
                          onClick={() => {
                            setRefunding(null);
                            setNote('');
                            setNoteError(null);
                          }}
                        >
                          {text.cancel}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button
                      size="sm"
                      variant="secondary"
                      className="self-start"
                      onClick={() => {
                        setRefunding(payment.id);
                        setNote('');
                        setNoteError(null);
                        setMessage('');
                      }}
                    >
                      {text.markRefunded}
                    </Button>
                  )
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </Card>
  );
}
