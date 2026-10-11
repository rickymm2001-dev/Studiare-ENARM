// Pago real en modo prueba desde Suscripción, cuando la cuenta de la nube está conectada (Fase P
// bloque 5, D-096). El alumno elige la pasarela, la función del servidor crea el pago y el navegador
// lo abre. Al volver, la app revisa el plan con la nube hasta que el aviso del pago lo confirme.
import type { SupabaseClient } from '@supabase/supabase-js';
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useCloud } from '@/app/cloudState';
import { requestEmailLink } from '@/data/cloud/account';
import { loadCloud } from '@/data/cloud/client';
import { PAYMENT_PROVIDERS, PLANS, type PlanKey } from '@/config/billing';
import { useDataApi } from '@/data/context';
import { useLiveData } from '@/data/hooks';
import { refreshCloudPlan } from '@/data/payments/cloudPlan';
import {
  startCheckout,
  type CheckoutResult,
  type PaidPlanKey,
  type PaymentProvider,
} from '@/data/payments/checkout';
import { openBillingPortal } from '@/data/payments/portal';
import { t } from '@/i18n/es-MX';
import { Button } from '@/ui/components/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/ui/components/card';
import { SelectField } from '@/ui/components/field';
import { EmailCodeForm } from '../shared/EmailCodeForm';

const text = t.billing.cloud;
type CheckoutError = Extract<CheckoutResult, { ok: false }>['reason'];

/** Cuántas veces y cada cuánto se revisa el plan al volver de la pasarela */
export const RETURN_CHECKS = 10;
export const RETURN_CHECK_MS = 3000;

export function CloudCheckoutCard({
  plan: requested,
  onBack,
  open = (url: string) => {
    window.location.assign(url);
  },
  providers = PAYMENT_PROVIDERS,
}: {
  plan: PaidPlanKey;
  onBack: () => void;
  /** Cómo se abre la pasarela. Se puede cambiar en las pruebas */
  open?: (url: string) => void;
  /** Pasarelas que se ofrecen. Con una sola no se pide elegir */
  providers?: readonly PaymentProvider[];
}) {
  // Si el cupo Fundador se llenó, el alumno puede seguir con el mensual al precio regular
  const [plan, setPlan] = useState<PaidPlanKey>(requested);
  const [provider, setProvider] = useState<PaymentProvider>(providers[0] ?? 'stripe');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<CheckoutError | null>(null);

  const go = async (target: PaidPlanKey = plan) => {
    const cloud = await loadCloud();
    if (!cloud) {
      setError('failed');
      return;
    }
    setBusy(true);
    setError(null);
    const result = await startCheckout(cloud, { plan: target, provider });
    if (result.ok) {
      open(result.url);
      return;
    }
    setBusy(false);
    setError(result.reason);
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
      {providers.length > 1 ? (
        <SelectField
          label={text.provider}
          value={provider}
          onChange={(event) => {
            setProvider(event.target.value as PaymentProvider);
          }}
          options={providers.map((value) => ({ value, label: text.providers[value] }))}
        />
      ) : (
        <p className="text-sm text-fg-muted">{text.singleProvider}</p>
      )}
      <p role="status" className="mt-2 min-h-5 text-sm text-fg-muted">
        {busy ? text.opening : error ? text.errors[error] : null}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {error === 'founder_full' && plan === 'founder' ? (
          <Button
            disabled={busy}
            onClick={() => {
              setPlan('monthly');
              void go('monthly');
            }}
          >
            {text.regularInstead(
              `${t.billing.price(PLANS.monthly.priceMxn)} ${t.billing.periods.monthly}`,
            )}
          </Button>
        ) : (
          <Button
            disabled={busy}
            onClick={() => {
              void go();
            }}
          >
            {text.go}
          </Button>
        )}
        <Button variant="secondary" disabled={busy} onClick={onBack}>
          {text.back}
        </Button>
      </div>
    </Card>
  );
}

/**
 * Para quien ya paga. Abre el portal de Stripe, donde cancela, cambia su tarjeta o ve sus facturas.
 * La cancelación llega al servidor como un aviso de Stripe, y el plan cambia con él (D-106)
 */
export function BillingPortalCard({
  open = (url: string) => {
    window.location.assign(url);
  },
}: {
  /** Cómo se abre el portal. Se puede cambiar en las pruebas */
  open?: (url: string) => void;
}) {
  const portal = text.portal;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const go = async () => {
    setError(null);
    setBusy(true);
    const cloud = await loadCloud();
    if (!cloud) {
      setBusy(false);
      setError(portal.errors.failed);
      return;
    }
    const result = await openBillingPortal(cloud);
    if (result.ok) {
      open(result.url);
      return;
    }
    setBusy(false);
    setError(portal.errors[result.reason]);
  };

  return (
    <Card aria-labelledby="portal-titulo">
      <CardHeader>
        <CardTitle id="portal-titulo">{portal.title}</CardTitle>
        <CardDescription>{portal.description}</CardDescription>
      </CardHeader>
      <p role="status" className="mb-2 min-h-5 text-sm text-fg-muted">
        {busy ? portal.opening : error}
      </p>
      <div>
        <Button
          variant="secondary"
          disabled={busy}
          onClick={() => {
            void go();
          }}
        >
          {portal.go}
        </Button>
      </div>
    </Card>
  );
}

/** A dónde regresa el enlace del correo. La raíz de la app, con o sin dominio propio */
const redirectTo = () => new URL(import.meta.env.BASE_URL, window.location.origin).toString();

/**
 * Para quien tiene la nube configurada pero este navegador todavía no está conectado a su cuenta.
 * Sin esa sesión el servidor no sabe quién paga, así que no se ofrece ningún pago. Tampoco el
 * simulado, que no cobraría nada pero haría creer que sí. Se explica qué falta y se deja pedir un
 * correo nuevo o entrar con el código que trae, por si el correo se abre en otro dispositivo (D-115)
 */
export function CloudRequiredCard({ userId }: { userId: string }) {
  const api = useDataApi();
  const state = useCloud((store) => store.state);
  const account = useLiveData(
    () => api.repos.accounts.get(userId).then((value) => value ?? null),
    [api.repos, userId],
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const need = text.needLink;
  const email = account?.email.trim().toLowerCase() ?? null;

  const body =
    state.status === 'checking'
      ? t.cloud.checking
      : state.status === 'error'
        ? t.cloud.error
        : state.status === 'signed-out' && state.reason === 'other_device'
          ? need.otherDevice
          : need.body;
  // Mientras se revisa o falla la conexión, un correo nuevo no arregla nada
  const canSend = state.status === 'signed-out';

  const send = async () => {
    if (!email) {
      setMessage(need.noAccount);
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const cloud = await loadCloud();
      if (!cloud) {
        setMessage(t.cloud.failedBody);
        return;
      }
      const result = await requestEmailLink(cloud, { email, redirectTo: redirectTo() });
      setMessage(
        result.ok
          ? need.sent(email)
          : result.reason === 'rate_limited'
            ? t.cloud.rateLimited
            : t.cloud.failedBody,
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card aria-labelledby="nube-requerida-titulo">
      <CardHeader>
        <CardTitle id="nube-requerida-titulo">{need.title}</CardTitle>
        <CardDescription>{body}</CardDescription>
      </CardHeader>
      <p role="status" className="mb-2 min-h-5 text-sm text-fg-muted">
        {busy ? need.sending : message}
      </p>
      {canSend ? (
        <div>
          <Button
            disabled={busy || account === undefined}
            onClick={() => {
              void send();
            }}
          >
            {need.send}
          </Button>
        </div>
      ) : null}
      {/* Al abrirse la sesión, el puente une la cuenta y esta tarjeta deja su lugar a los planes */}
      {canSend && email ? <EmailCodeForm email={email} /> : null}
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
    let stopped = false;
    let tries = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const check = async (cloud: SupabaseClient) => {
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
        void check(cloud);
      }, RETURN_CHECK_MS);
    };
    // Al volver de la pasarela la página recién abre y el SDK puede estar bajándose todavía
    void loadCloud().then((cloud) => {
      if (cloud && !stopped) void check(cloud);
    });
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
