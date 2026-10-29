// Pago real en modo prueba desde Suscripción, cuando la cuenta de la nube está conectada (Fase P
// bloque 5, D-096, y B10 del plan del cambio). La forma de pago vive en CheckoutOptions.tsx. Aquí quedan
// Administrar suscripción, con el portal de Stripe o la cancelación de Mercado Pago, que no tiene
// portal y confirma en CancelSubscriptionDialog, la tarjeta de quien no tiene sesión en este navegador
// y el aviso al volver de la pasarela, que revisa el plan con la nube hasta que el aviso del pago lo
// confirme.
import type { SupabaseClient } from '@supabase/supabase-js';
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useCloud } from '@/app/cloudState';
import { planOf } from '@/config/billing';
import { requestEmailLink } from '@/data/cloud/account';
import { loadCloud } from '@/data/cloud/client';
import { useDataApi } from '@/data/context';
import { useLiveData } from '@/data/hooks';
import { cancelMercadoPagoSubscription } from '@/data/payments/cancel';
import { refreshCloudPlan, type CloudPlan } from '@/data/payments/cloudPlan';
import type { Subscription } from '@/data/schemas/people';
import { t } from '@/i18n/es-MX';
import { billingCloudText } from '@/i18n/billingCloud';
import { Button } from '@/ui/components/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/ui/components/card';
import { EmailCodeForm } from '../shared/EmailCodeForm';
import { CancelSubscriptionDialog } from './CancelSubscriptionDialog';
import { longDate } from './planState';
import { usePortal } from './usePortal';

const text = billingCloudText;

/** Cuántas veces y cada cuánto se revisa el plan al volver de la pasarela */
export const RETURN_CHECKS = 10;
export const RETURN_CHECK_MS = 3000;

const assign = (url: string) => {
  window.location.assign(url);
};

/**
 * Para quien paga con Stripe. Abre el portal, donde cambia de plan, cancela, cambia su tarjeta o ve sus
 * facturas. Lo que haga llega al servidor como un aviso de Stripe, y el plan cambia con él (D-106)
 */
export function BillingPortalCard({
  open = assign,
}: {
  /** Cómo se abre el portal. Se puede cambiar en las pruebas */
  open?: (url: string) => void;
}) {
  const portal = text.portal;
  const { busy, error, go } = usePortal(open);
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

/**
 * Para quien paga con Mercado Pago, que no tiene portal (B10, 2.5). Cancela con cancel-subscription,
 * solo después de confirmar en el diálogo que dice lo que se pierde y hasta cuándo sigue el plan
 * (V5-B0). El plan vale hasta el fin de lo pagado y la app vuelve a leerlo
 */
export function MercadoPagoManageCard({
  subscription,
  onChanged,
}: {
  subscription: Subscription;
  /** Se canceló. Quien llama vuelve a leer el plan */
  onChanged?: () => void;
}) {
  const mp = text.mercadoPago;
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  // Ya se canceló en esta tarjeta, aunque la nube todavía no lo refleje
  const [done, setDone] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const until = subscription.periodEnd ? longDate(subscription.periodEnd) : null;
  const canceled =
    done || subscription.cancelAtPeriodEnd === true || subscription.cloudStatus === 'canceled';

  const cancel = async () => {
    setBusy(true);
    setMessage(null);
    const cloud = await loadCloud();
    const result = cloud
      ? await cancelMercadoPagoSubscription(cloud)
      : ({ ok: false, reason: 'failed' } as const);
    setBusy(false);
    if (!result.ok) {
      setMessage(mp.errors[result.reason]);
      return;
    }
    const end = result.periodEnd ?? subscription.periodEnd ?? null;
    setMessage(end ? mp.done(longDate(end)) : mp.doneNoDate);
    setDone(true);
    onChanged?.();
  };

  return (
    <Card aria-labelledby="mercadopago-titulo">
      <CardHeader>
        <CardTitle id="mercadopago-titulo">{mp.title}</CardTitle>
        <CardDescription>{mp.description}</CardDescription>
      </CardHeader>
      <p role="status" className="mb-2 min-h-5 text-sm text-fg-muted">
        {busy ? mp.canceling : (message ?? (canceled ? mp.already : null))}
      </p>
      {canceled ? null : (
        <div>
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => {
              setMessage(null);
              setOpen(true);
            }}
          >
            {mp.cancel}
          </Button>
        </div>
      )}
      <CancelSubscriptionDialog
        open={open}
        plan={planOf(subscription)}
        description={until ? mp.confirm(until) : mp.confirmNoDate}
        onKeep={() => {
          setOpen(false);
        }}
        onConfirm={() => {
          setOpen(false);
          void cancel();
        }}
      />
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
            : result.reason === 'invitation_required'
              ? t.accounts.signup.invitationRequired
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

/** Lo que cambia cuando un pago se confirma, para saber si el aviso ya llegó */
function signatureOf(
  plan: string,
  periodEnd: string | null | undefined,
  passEnd: string | null | undefined,
  status: string | null | undefined,
): string {
  return [plan, periodEnd ?? '', passEnd ?? '', status ?? ''].join('|');
}

const signatureOfCloud = (cloudPlan: CloudPlan) =>
  signatureOf(cloudPlan.plan, cloudPlan.periodEnd, cloudPlan.passEnd, cloudPlan.status);

const signatureOfLocal = (subscription: Subscription | null) =>
  signatureOf(
    planOf(subscription),
    subscription?.periodEnd,
    subscription?.passEnd,
    subscription?.cloudStatus,
  );

const PENDING_METHODS = ['oxxo', 'spei', 'mercadopago'] as const;
type PendingMethod = (typeof PENDING_METHODS)[number];

/**
 * Lo que se ve al volver de la pasarela con ?pago=ok, ?pago=cancelado o ?pago=pendiente&metodo=. Con ok
 * revisa el plan en la nube cada pocos segundos hasta que cambie, porque el aviso del pago llega aparte.
 * Con pendiente dice enseguida que el pago está en camino y revisa hasta que la nube tenga el pendiente,
 * que desde ahí lo muestra PendingPaymentNotice con su monto y su fecha
 */
export function PaymentReturnNotice({
  userId,
  subscription,
}: {
  userId: string;
  /** La suscripción reflejada en este navegador. undefined mientras carga */
  subscription: Subscription | null | undefined;
}) {
  const [params] = useSearchParams();
  const result = params.get('pago');
  const rawMethod = params.get('metodo');
  const method: PendingMethod | null = (PENDING_METHODS as readonly string[]).includes(
    rawMethod ?? '',
  )
    ? (rawMethod as PendingMethod)
    : null;
  const api = useDataApi();
  const apiRef = useRef(api);
  useEffect(() => {
    apiRef.current = api;
  });
  const [state, setState] = useState<'checking' | 'confirmed' | 'trial' | 'slow'>('checking');
  // Cómo estaba el plan al volver. Si cambia a uno de pago, el pago quedó confirmado
  const initial = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (initial.current === undefined && subscription !== undefined) {
      initial.current = signatureOfLocal(subscription);
    }
  }, [subscription]);

  useEffect(() => {
    if (result !== 'ok' && !(result === 'pendiente' && method !== null)) return;
    let stopped = false;
    let tries = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const check = async (cloud: SupabaseClient) => {
      tries += 1;
      const cloudPlan = await refreshCloudPlan(apiRef.current, cloud, userId);
      if (stopped) return;
      if (result === 'ok' && cloudPlan && cloudPlan.plan !== 'free') {
        if (initial.current !== undefined && signatureOfCloud(cloudPlan) !== initial.current) {
          setState(cloudPlan.status === 'trialing' ? 'trial' : 'confirmed');
          return;
        }
      }
      // El pendiente ya está en la nube, o el pago ya se confirmó
      if (
        result === 'pendiente' &&
        cloudPlan &&
        (cloudPlan.pendingPayment || cloudPlan.plan !== 'free')
      ) {
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
  }, [result, method, userId]);

  if (result === 'cancelado') {
    return (
      <p role="status" className="rounded-md bg-muted px-3 py-2 text-sm">
        {text.returning.canceled}
      </p>
    );
  }
  if (result === 'pendiente' && method !== null) {
    // Cuando la nube ya tiene el pendiente, PendingPaymentNotice lo dice con su monto y su fecha
    if (state === 'confirmed' || subscription?.pendingPayment?.method === method) return null;
    return (
      <p role="status" className="rounded-md bg-muted px-3 py-2 text-sm">
        {text.returning.pending[method]}
      </p>
    );
  }
  if (result !== 'ok') return null;
  return (
    <p role="status" className="rounded-md bg-muted px-3 py-2 text-sm">
      {state === 'confirmed'
        ? text.returning.confirmed
        : state === 'trial'
          ? text.returning.trialStarted
          : state === 'slow'
            ? text.returning.slow
            : text.returning.ok}
    </p>
  );
}
