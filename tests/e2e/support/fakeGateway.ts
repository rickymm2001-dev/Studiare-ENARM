// Páginas de la pasarela de pago y del portal de facturación simulados que sirve el Supabase falso
// (tests/e2e/support/fakeSupabase.ts). Son HTML sin dependencias, en español y con la etiqueta de
// simulado a la vista. El botón Pagar manda un formulario al mismo origen falso, que activa el plan y
// regresa a la app por la URL de éxito que pidió create-checkout, igual que haría Stripe.
import { PLANS, type PlanKey } from '@/config/billing';
import { t } from '@/i18n/es-MX';

export const GATEWAY_PAY_PATH = '/fake/pay';
export const GATEWAY_CANCEL_PATH = '/fake/cancel';
export const PORTAL_CANCEL_SUBSCRIPTION_PATH = '/fake/cancel-subscription';

/** Textos de las páginas simuladas. Viven aquí porque no son parte de la app */
export const gatewayText = {
  simulated: 'Pasarela de pago simulada. No se cobra dinero real.',
  title: 'Pagar a Studiare',
  summary: (plan: string, price: string, period: string) => `Plan ${plan} por ${price} ${period}.`,
  pay: 'Pagar',
  cancel: 'Cancelar y volver',
  portalTitle: 'Portal de facturación simulado',
  portalSummary: (plan: string) => `Tu suscripción al plan ${plan} está activa.`,
  cancelSubscription: 'Cancelar suscripción',
  back: 'Volver a Studiare',
} as const;

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

const STYLE = `
  body { font-family: system-ui, sans-serif; margin: 0; background: #f4f4f5; color: #18181b; }
  main { max-width: 32rem; margin: 3rem auto; padding: 1.5rem; background: #fff; border-radius: 0.75rem; }
  .badge { display: inline-block; padding: 0.25rem 0.75rem; border-radius: 999px; background: #fef3c7; color: #78350f; font-weight: 600; }
  form { display: inline-block; margin: 0.5rem 0.5rem 0 0; }
  button, a.button { font: inherit; padding: 0.75rem 1.25rem; border-radius: 0.5rem; border: 1px solid #a1a1aa; background: #fff; cursor: pointer; text-decoration: none; color: inherit; display: inline-block; }
  button.primary { background: #4f46e5; border-color: #4f46e5; color: #fff; }
`;

function document(title: string, body: string): string {
  return `<!doctype html>
<html lang="es-MX">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)}</title>
<style>${STYLE}</style>
</head>
<body><main>${body}</main></body>
</html>`;
}

/** La página donde el alumno paga. El id de la sesión de pago viaja oculto en cada formulario */
export function gatewayPage(input: { sessionId: string; plan: Exclude<PlanKey, 'free'> }): string {
  const plan = PLANS[input.plan];
  const session = escapeHtml(input.sessionId);
  return document(
    gatewayText.title,
    `<p class="badge">${gatewayText.simulated}</p>
<h1>${gatewayText.title}</h1>
<p>${escapeHtml(
      gatewayText.summary(
        t.billing.plans[input.plan],
        t.billing.price(plan.priceMxn),
        t.billing.periods[input.plan],
      ),
    )}</p>
<form method="post" action="${GATEWAY_PAY_PATH}">
  <input type="hidden" name="session" value="${session}" />
  <button type="submit" class="primary">${gatewayText.pay}</button>
</form>
<form method="post" action="${GATEWAY_CANCEL_PATH}">
  <input type="hidden" name="session" value="${session}" />
  <button type="submit">${gatewayText.cancel}</button>
</form>`,
  );
}

/** El portal donde el alumno cancela su suscripción o vuelve a la app */
export function portalPage(input: {
  sessionId: string;
  plan: Exclude<PlanKey, 'free'>;
  returnUrl: string;
}): string {
  return document(
    gatewayText.portalTitle,
    `<p class="badge">${gatewayText.simulated}</p>
<h1>${gatewayText.portalTitle}</h1>
<p>${escapeHtml(gatewayText.portalSummary(t.billing.plans[input.plan]))}</p>
<form method="post" action="${PORTAL_CANCEL_SUBSCRIPTION_PATH}">
  <input type="hidden" name="session" value="${escapeHtml(input.sessionId)}" />
  <button type="submit">${gatewayText.cancelSubscription}</button>
</form>
<a class="button" href="${escapeHtml(input.returnUrl)}">${gatewayText.back}</a>`,
  );
}
