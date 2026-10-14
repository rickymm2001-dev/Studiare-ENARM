// Páginas de la pasarela de pago y del portal de facturación de Stripe simulados que sirve el Supabase
// falso (tests/e2e/support/fakeSupabase.ts). Son HTML sin dependencias, en español y con la etiqueta de
// simulado a la vista. Desde B10 la pasarela muestra la prueba gratis, deja escribir un código de
// descuento y genera la ficha OXXO o los datos de SPEI de un pase. El portal cancela al final del
// periodo y cambia a Anual o a Mensual según la configuración del plan, como las dos de Stripe (2.3).
// Cada botón manda un formulario al mismo origen falso, que aplica lo que haría el aviso de Stripe con
// fakeBilling.ts y regresa a la app por la URL que pidió create-checkout o el portal.
import { PASS_PRICES_MXN, PLANS, regularPlanOf, type PaidPlanKey } from '@/config/billing';
import { t } from '@/i18n/es-MX';

export const GATEWAY_PAY_PATH = '/fake/pay';
export const GATEWAY_CANCEL_PATH = '/fake/cancel';
export const PORTAL_CANCEL_SUBSCRIPTION_PATH = '/fake/cancel-subscription';
export const PORTAL_CHANGE_PLAN_PATH = '/fake/change-plan';

/** Textos de las páginas simuladas. Viven aquí porque no son parte de la app */
export const gatewayText = {
  simulated: 'Pasarela de pago simulada. No se cobra dinero real.',
  title: 'Pagar a Studiare',
  summary: (plan: string, price: string, period: string) => `Plan ${plan} por ${price} ${period}.`,
  trialSummary: (days: number, price: string, period: string) =>
    `${String(days)} días gratis, hoy no se cobra nada. Después ${price} ${period}.`,
  passSummary: (length: string, price: string, method: string) =>
    `Pase de ${length} por ${price} con ${method}.`,
  code: 'Código de descuento',
  invalidCode: 'Este código no es válido.',
  pay: 'Pagar',
  startTrial: 'Empezar prueba',
  voucher: 'Generar ficha',
  transfer: 'Ver datos de transferencia',
  cancel: 'Cancelar y volver',
  portalTitle: 'Portal de facturación simulado',
  portalSummary: (plan: string) => `Tu suscripción al plan ${plan} está activa.`,
  portalCanceled: (plan: string) =>
    `Tu suscripción al plan ${plan} está cancelada al final del periodo.`,
  cancelSubscription: 'Cancelar suscripción',
  changeTo: (plan: string) => `Cambiar a ${plan}`,
  back: 'Volver a Studiare',
} as const;

const METHOD_NAMES = { oxxo: 'OXXO', spei: 'SPEI' } as const;
const PASS_LENGTH = { monthly: '1 mes', annual: '1 año' } as const;

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
  form { display: block; margin: 0.75rem 0 0; }
  label { display: block; font-weight: 600; margin-bottom: 0.25rem; }
  input[type=text] { font: inherit; padding: 0.5rem; border: 1px solid #a1a1aa; border-radius: 0.5rem; margin-bottom: 0.75rem; }
  .error { color: #991b1b; }
  button, a.button { font: inherit; padding: 0.75rem 1.25rem; border-radius: 0.5rem; border: 1px solid #a1a1aa; background: #fff; cursor: pointer; text-decoration: none; color: inherit; display: inline-block; }
  button.primary { background: #4f46e5; border-color: #4f46e5; color: #fff; }
`;

export function htmlDocument(title: string, body: string): string {
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

export interface GatewayPageInput {
  sessionId: string;
  plan: PaidPlanKey;
  mode: 'subscription' | 'pass';
  method: 'oxxo' | 'spei' | null;
  trial: boolean;
  trialDays: number;
  /** El código que se escribió y no vale */
  invalidCode?: boolean;
}

/** La página donde el alumno paga. El id de la sesión de pago viaja oculto en cada formulario */
export function gatewayPage(input: GatewayPageInput): string {
  const session = escapeHtml(input.sessionId);
  const regular = regularPlanOf(input.plan);
  const lines: string[] = [];
  let action: string = gatewayText.pay;
  if (input.mode === 'pass') {
    const method = input.method ?? 'oxxo';
    lines.push(
      gatewayText.passSummary(
        PASS_LENGTH[regular],
        t.billing.price(PASS_PRICES_MXN[regular]),
        METHOD_NAMES[method],
      ),
    );
    action = method === 'oxxo' ? gatewayText.voucher : gatewayText.transfer;
  } else {
    const price = t.billing.price(PLANS[input.plan].priceMxn);
    lines.push(
      gatewayText.summary(t.billing.plans[input.plan], price, t.billing.periods[input.plan]),
    );
    if (input.trial) {
      lines.push(gatewayText.trialSummary(input.trialDays, price, t.billing.periods[regular]));
      action = gatewayText.startTrial;
    }
  }
  return htmlDocument(
    gatewayText.title,
    `<p class="badge">${gatewayText.simulated}</p>
<h1>${gatewayText.title}</h1>
${lines.map((line) => `<p>${escapeHtml(line)}</p>`).join('\n')}
<form method="post" action="${GATEWAY_PAY_PATH}">
  <input type="hidden" name="session" value="${session}" />
  <label for="codigo">${gatewayText.code}</label>
  <input type="text" id="codigo" name="code" autocomplete="off" ${input.invalidCode ? 'aria-invalid="true" aria-describedby="codigo-error"' : ''} />
  ${input.invalidCode ? `<p id="codigo-error" class="error" role="alert">${gatewayText.invalidCode}</p>` : ''}
  <div><button type="submit" class="primary">${action}</button></div>
</form>
<form method="post" action="${GATEWAY_CANCEL_PATH}">
  <input type="hidden" name="session" value="${session}" />
  <button type="submit">${gatewayText.cancel}</button>
</form>`,
  );
}

/** El portal donde el alumno cancela al final del periodo, cambia de plan o vuelve a la app */
export function portalPage(input: {
  sessionId: string;
  plan: PaidPlanKey;
  canceled: boolean;
  /** El plan al que deja cambiar la configuración del portal, o null */
  changeTo: PaidPlanKey | null;
  returnUrl: string;
}): string {
  const session = escapeHtml(input.sessionId);
  const name = t.billing.plans[input.plan];
  return htmlDocument(
    gatewayText.portalTitle,
    `<p class="badge">${gatewayText.simulated}</p>
<h1>${gatewayText.portalTitle}</h1>
<p>${escapeHtml(input.canceled ? gatewayText.portalCanceled(name) : gatewayText.portalSummary(name))}</p>
${
  input.changeTo
    ? `<form method="post" action="${PORTAL_CHANGE_PLAN_PATH}">
  <input type="hidden" name="session" value="${session}" />
  <button type="submit" class="primary">${escapeHtml(gatewayText.changeTo(t.billing.plans[input.changeTo]))}</button>
</form>`
    : ''
}
${
  input.canceled
    ? ''
    : `<form method="post" action="${PORTAL_CANCEL_SUBSCRIPTION_PATH}">
  <input type="hidden" name="session" value="${session}" />
  <button type="submit">${gatewayText.cancelSubscription}</button>
</form>`
}
<p><a class="button" href="${escapeHtml(input.returnUrl)}">${gatewayText.back}</a></p>`,
  );
}
