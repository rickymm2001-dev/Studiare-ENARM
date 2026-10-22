// Los botones de Apple Pay y Google Pay dentro de Suscripción (B17, 6.5). Se carga con lazy desde
// CheckoutOptions, solo con la bandera expressWallets, la llave publicable de Stripe y la forma de pago
// Tarjeta elegida, y es lo único que descarga Stripe.js (stripeJs.ts), así que ni el JavaScript inicial ni
// ninguna otra pantalla lo ven.
//
// Cómo funciona. Pide al servidor una sola vez por plan (create-checkout con ui wallet) la sesión de Stripe con
// ui_mode elements, inicia el SDK de Checkout con su secreto, crea el elemento de pago exprés solo con Apple
// Pay y Google Pay (Link, PayPal, Klarna y Amazon Pay apagados) y lo monta. Al estar listo lee qué
// billeteras tiene este aparato. Si no hay ninguna lo dice y deja el botón de pagar con tarjeta. Al autorizar el
// pago en la hoja de la billetera confirma con redirect if_required y avisa a quien lo montó, que manda a
// Suscripción a confirmar el plan igual que cuando se regresa de la página hospedada. Un segundo toque mientras
// confirma no hace nada, y el aviso de pago de Stripe, que es idempotente, protege de un doble cobro.
//
// El aviso del cobro automático de la prueba lo da el resumen de CheckoutOptions, que está arriba de los
// botones, porque ui_mode elements no admite custom_text. Aquí solo se dice que usar la billetera lo acepta.
// Los botones son marcos de Stripe y su accesibilidad es de Stripe, por eso Pagar con tarjeta sigue a la mano.
import type {
  StripeCheckoutExpressCheckoutElement,
  StripeCheckoutLoadActionsSuccess,
  StripeExpressCheckoutElementConfirmEvent,
} from '@stripe/stripe-js';
import { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router';
import { screenPath } from '@/app/screens';
import type { PaidPlanKey } from '@/config/billing';
import { loadCloud } from '@/data/cloud/client';
import {
  startCheckout,
  trackCheckoutStarted,
  walletCheckoutRequestFor,
  type CheckoutFailureResult,
} from '@/data/payments/checkout';
import { billingCloudText } from '@/i18n/billingCloud';
import { walletTexts, type WalletProblem } from '@/i18n/wallet';
import { cn } from '@/ui/cn';
import { loadWalletStripe, type LoadWalletStripe } from './stripeJs';
import { failSheet, problemOf, walletElementOptions } from './walletElement';

/** preparing, mientras llega la sesión y Stripe.js. ready, con al menos una billetera. none y unavailable, sin botones */
type Phase = 'preparing' | 'ready' | 'none' | 'unavailable' | 'blocked';

export interface WalletPayProps {
  /** pk_test_ o pk_live_, ya validada por readWalletSetup */
  publishableKey: string;
  /** El plan que se cobra con tarjeta. Fundador mientras dure la promoción */
  plan: PaidPlanKey;
  /** Si el servidor da la prueba gratis, según my_plan */
  trialAvailable: boolean;
  /** El pago se confirmó en Stripe. Quien lo montó lleva a Suscripción a ver el plan */
  onPaid: () => void;
  /** El servidor no dejó abrir el pago (plan vigente, Fundador, prueba que cambió, no configurado...) */
  onFailure: (failure: CheckoutFailureResult) => void;
  /** Cómo se descarga Stripe.js. Se cambia en las pruebas */
  loadStripeJs?: LoadWalletStripe;
}

export default function WalletPay({
  publishableKey,
  plan,
  trialAvailable,
  onPaid,
  onFailure,
  loadStripeJs = loadWalletStripe,
}: WalletPayProps) {
  const titleId = useId();
  const host = useRef<HTMLDivElement>(null);
  const alert = useRef<HTMLParagraphElement>(null);
  const [phase, setPhase] = useState<Phase>('preparing');
  const [confirming, setConfirming] = useState(false);
  const [problem, setProblem] = useState<WalletProblem | null>(null);
  // Los avisos a quien montó el componente cambian en cada render y no deben reiniciar la sesión de pago
  const callbacks = useRef({ onPaid, onFailure, loadStripeJs });
  useEffect(() => {
    callbacks.current = { onPaid, onFailure, loadStripeJs };
  });

  useEffect(() => {
    let cancelled = false;
    // Una función y no la variable: así TypeScript no da por hecho que sigue en false después de cada await
    const stopped = () => cancelled;
    let element: StripeCheckoutExpressCheckoutElement | null = null;
    let busy = false;
    const request = walletCheckoutRequestFor(plan, trialAvailable);

    const pay = async (
      event: StripeExpressCheckoutElementConfirmEvent,
      actions: StripeCheckoutLoadActionsSuccess,
    ) => {
      // Un segundo toque mientras confirma no hace nada
      if (busy) return;
      busy = true;
      setConfirming(true);
      setProblem(null);
      // Stripe no avisa el toque del botón (el elemento de Checkout no tiene click), así que el embudo se mide
      // cuando el alumno autoriza el pago en la hoja de su billetera
      trackCheckoutStarted(request);
      try {
        const result = await actions.confirm({
          expressCheckoutConfirmEvent: event,
          redirect: 'if_required',
        });
        if (result.type === 'error') {
          failSheet(event);
          if (!stopped()) setProblem(problemOf(result.error));
          return;
        }
        callbacks.current.onPaid();
      } catch {
        failSheet(event);
        if (!stopped()) setProblem('unknown');
      } finally {
        busy = false;
        if (!stopped()) setConfirming(false);
      }
    };

    const prepare = async () => {
      const cloud = await loadCloud();
      if (stopped()) return;
      if (!cloud) {
        setPhase('unavailable');
        return;
      }
      // La sesión y Stripe.js se piden a la vez. Que Stripe.js no cargue (sin red, o bloqueado) no tumba al
      // servidor: sin él solo se quedan sin botones
      const [stripe, session] = await Promise.all([
        callbacks.current.loadStripeJs(publishableKey).catch(() => null),
        startCheckout(cloud, request),
      ]);
      if (stopped()) return;
      if (!session.ok) {
        setPhase('blocked');
        callbacks.current.onFailure(session);
        return;
      }
      if (!stripe) {
        setPhase('unavailable');
        return;
      }
      const checkout = stripe.initCheckoutElementsSdk({ clientSecret: session.clientSecret });
      // Las acciones se piden antes de mostrar los botones, para confirmar en cuanto el alumno autorice
      const loaded = await checkout.loadActions();
      if (stopped()) return;
      if (loaded.type !== 'success') {
        setPhase('unavailable');
        return;
      }
      const mount = host.current;
      if (!mount) return;
      const created = checkout.createExpressCheckoutElement(
        walletElementOptions(document.documentElement.classList.contains('dark')),
      );
      element = created;
      created.on('ready', (ready) => {
        const methods = ready.availablePaymentMethods;
        setPhase(methods && (methods.applePay || methods.googlePay) ? 'ready' : 'none');
      });
      created.on('loaderror', () => {
        setPhase('unavailable');
      });
      created.on('confirm', (event) => {
        void pay(event, loaded.actions);
      });
      created.mount(mount);
    };

    void prepare().catch(() => {
      if (!stopped()) setPhase('unavailable');
    });
    return () => {
      cancelled = true;
      try {
        element?.destroy();
      } catch {
        // Ya estaba destruido
      }
    };
  }, [publishableKey, plan, trialAvailable]);

  // Un error se anuncia y lleva el foco, para quien no ve la pantalla
  useEffect(() => {
    if (problem) alert.current?.focus();
  }, [problem]);

  if (phase === 'blocked') return null;
  const empty = phase === 'none' || phase === 'unavailable';
  return (
    <section
      aria-labelledby={titleId}
      aria-busy={phase === 'preparing' || confirming}
      className="flex flex-col gap-2 rounded-md border border-line p-3"
    >
      <h3 id={titleId} className="text-sm font-semibold">
        {walletTexts.title}
      </h3>
      {empty ? (
        <p role="status" className="text-sm text-fg-muted">
          {phase === 'none' ? walletTexts.noWallet : walletTexts.unavailable}
        </p>
      ) : (
        <>
          <p className="text-sm text-fg-muted">{walletTexts.intro}</p>
          <p className="text-sm">
            {trialAvailable ? walletTexts.consentTrial : walletTexts.consentCharge}{' '}
            <Link to={screenPath('terms')} className="underline underline-offset-4">
              {billingCloudText.summary.terms}
            </Link>
          </p>
          <p className="text-sm text-fg-muted">{walletTexts.noCode}</p>
          {phase === 'preparing' ? (
            <p role="status" className="text-sm text-fg-muted">
              {walletTexts.preparing}
            </p>
          ) : null}
        </>
      )}
      {/* Aquí monta Stripe sus botones. Se queda en el árbol aunque no haya billeteras, vacío, para no
          perder el lugar donde se montó */}
      <div
        ref={host}
        hidden={empty}
        className={cn('min-h-0', confirming && 'pointer-events-none opacity-60')}
      />
      <p role="status" className="min-h-0 text-sm text-fg-muted">
        {confirming ? walletTexts.confirming : null}
      </p>
      {problem ? (
        <p
          ref={alert}
          role="alert"
          tabIndex={-1}
          className="rounded-md bg-muted px-3 py-2 text-sm outline-none"
        >
          {walletTexts.errors[problem]}
        </p>
      ) : null}
    </section>
  );
}
