// Pago real en modo prueba desde Suscripción, cuando la cuenta de la nube está conectada (Fase P
// bloque 5, D-096). El alumno elige la pasarela, la función del servidor crea el pago y el navegador
// lo abre. Al volver, la app revisa el plan con la nube hasta que el aviso del pago lo confirme.
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { getCloud } from '@/data/cloud/client';
import { PLANS, type PlanKey } from '@/config/billing';
import { useDataApi } from '@/data/context';
import { refreshCloudPlan } from '@/data/payments/cloudPlan';
import { startCheckout, type PaidPlanKey, type PaymentProvider } from '@/data/payments/checkout';
import { t } from '@/i18n/es-MX';
import { Button } from '@/ui/components/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/ui/components/card';
import { SelectField } from '@/ui/components/field';

const text = t.billing.cloud;
const PROVIDERS: PaymentProvider[] = ['stripe', 'mercadopago'];

/** Cuántas veces y cada cuánto se revisa el plan al volver de la pasarela */
export const RETURN_CHECKS = 10;
export const RETURN_CHECK_MS = 3000;

export function CloudCheckoutCard({
  plan,
  onBack,
  open = (url: string) => {
    window.location.assign(url);
  },
}: {
  plan: PaidPlanKey;
  onBack: () => void;
  /** Cómo se abre la pasarela. Se puede cambiar en las pruebas */
  open?: (url: string) => void;
}) {
  const [provider, setProvider] = useState<PaymentProvider>('stripe');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const go = async () => {
    const cloud = getCloud();
    if (!cloud) {
      setError(text.errors.failed);
      return;
    }
    setBusy(true);
    setError(null);
    const result = await startCheckout(cloud, { plan, provider });
    if (result.ok) {
      open(result.url);
      return;
    }
    setBusy(false);
    setError(text.errors[result.reason]);
  };

  return (
    <Card aria-labelledby="checkout-nube-titulo">
      <CardHeader>
        <CardTitle id="checkout-nube-titulo">{text.checkoutTitle}</CardTitle>
        <CardDescription>
          {t.billing.checkoutSummary(
            t.billing.plans[plan],
            t.billing.price(PLANS[plan].priceMxn),
            t.billing.periods[plan],
          )}
        </CardDescription>
      </CardHeader>
      <p className="mb-3 rounded-md bg-sim px-3 py-2 text-sm text-sim-fg">{text.testMode}</p>
      <SelectField
        label={text.provider}
        value={provider}
        onChange={(event) => {
          setProvider(event.target.value as PaymentProvider);
        }}
        options={PROVIDERS.map((value) => ({ value, label: text.providers[value] }))}
      />
      <p role="status" className="mt-2 min-h-5 text-sm text-fg-muted">
        {busy ? text.opening : error}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          disabled={busy}
          onClick={() => {
            void go();
          }}
        >
          {text.go}
        </Button>
        <Button variant="secondary" disabled={busy} onClick={onBack}>
          {text.back}
        </Button>
      </div>
    </Card>
  );
}

/**
 * Lo que se ve al volver de la pasarela con ?pago=ok o ?pago=cancelado. En el primer caso revisa el
 * plan en la nube cada pocos segundos hasta que cambie, porque el aviso del pago llega aparte
 */
export function PaymentReturnNotice({
  userId,
  current,
}: {
  userId: string;
  current: PlanKey | undefined;
}) {
  const [params] = useSearchParams();
  const result = params.get('pago');
  const api = useDataApi();
  const apiRef = useRef(api);
  useEffect(() => {
    apiRef.current = api;
  });
  const [state, setState] = useState<'checking' | 'confirmed' | 'slow'>('checking');
  // El plan con el que se volvió. Si cambia a uno de pago, el pago quedó confirmado
  const initial = useRef<PlanKey | undefined>(undefined);
  useEffect(() => {
    if (initial.current === undefined && current !== undefined) initial.current = current;
  }, [current]);

  useEffect(() => {
    if (result !== 'ok') return;
    const cloud = getCloud();
    if (!cloud) return;
    let stopped = false;
    let tries = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const check = async () => {
      tries += 1;
      const cloudPlan = await refreshCloudPlan(apiRef.current, cloud, userId);
      if (stopped) return;
      if (cloudPlan && cloudPlan.plan !== 'free' && cloudPlan.plan !== initial.current) {
        setState('confirmed');
        return;
      }
      if (tries >= RETURN_CHECKS) {
        setState('slow');
        return;
      }
      timer = setTimeout(() => {
        void check();
      }, RETURN_CHECK_MS);
    };
    void check();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [result, userId]);

  if (result === 'cancelado') {
    return (
      <p role="status" className="rounded-md bg-muted px-3 py-2 text-sm">
        {text.returning.canceled}
      </p>
    );
  }
  if (result !== 'ok') return null;
  return (
    <p role="status" className="rounded-md bg-muted px-3 py-2 text-sm">
      {state === 'confirmed'
        ? text.returning.confirmed
        : state === 'slow'
          ? text.returning.slow
          : text.returning.ok}
    </p>
  );
}
