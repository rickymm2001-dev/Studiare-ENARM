// Tu suscripción con el pago simulado (V5-B0, defecto importante 2 de docs/DIAGNOSTICO_BETA.md).
// Cancelar vive aquí y nunca en la tarjeta del plan Gratis, pide confirmar en un diálogo con lo que se
// pierde y la fecha, y el plan sigue hasta el fin de su periodo simulado, como con la nube. No cobra
// nada (3.2).
import { useState } from 'react';
import { planOf } from '@/config/billing';
import { useDataApi } from '@/data/context';
import type { Subscription, User } from '@/data/schemas/people';
import { cancelSimulatedPlan } from '@/data/usecases/subscription';
import { t } from '@/i18n/es-MX';
import { billingCloudText } from '@/i18n/billingCloud';
import { Button } from '@/ui/components/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/ui/components/card';
import { CancelSubscriptionDialog } from './CancelSubscriptionDialog';
import { longDate } from './planState';

const dialog = billingCloudText.cancelDialog;

export function SimulatedManageCard({
  subscription,
  user,
}: {
  subscription: Subscription;
  user: User;
}) {
  const api = useDataApi();
  const text = t.billing.manage;
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const until = subscription.periodEnd ? longDate(subscription.periodEnd) : null;
  const canceled = subscription.cancelAtPeriodEnd === true;

  const confirm = async () => {
    setOpen(false);
    setBusy(true);
    try {
      await cancelSimulatedPlan(api, user);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card aria-labelledby="suscripcion-titulo">
      <CardHeader>
        <CardTitle id="suscripcion-titulo">{text.title}</CardTitle>
        <CardDescription>{text.simulated}</CardDescription>
      </CardHeader>
      <p role="status" className="mb-2 min-h-5 text-sm text-fg-muted">
        {busy
          ? dialog.canceling
          : canceled && until
            ? billingCloudText.status.canceled(until)
            : null}
      </p>
      {canceled ? null : (
        <div>
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => {
              setOpen(true);
            }}
          >
            {t.billing.cancel}
          </Button>
        </div>
      )}
      <CancelSubscriptionDialog
        open={open}
        plan={planOf(subscription)}
        description={until ? dialog.until(until) : dialog.untilNoDate}
        onKeep={() => {
          setOpen(false);
        }}
        onConfirm={() => {
          void confirm();
        }}
      />
    </Card>
  );
}
