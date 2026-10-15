// Estado del plan en Suscripción con la nube (B10 del plan del cambio, 3.1.3). La línea que corresponde
// según my_plan v2, la prueba con su fecha de fin, la renovación, la cancelación, el cobro fallido, el
// pase o el mes por referido, más el cambio programado, la garantía y el aviso de un pago que se
// canceló. Qué línea toca lo decide planStateOf. Son avisos fijos que acompañan al plan, y solo el aviso
// de un pago cancelado se anuncia como cambio.
import { readSupportEmail } from '@/config/support';
import type { Subscription } from '@/data/schemas/people';
import { billingCloudText } from '@/i18n/billingCloud';
import { planStateLine } from './planLines';
import { longDate, planStateOf } from './planState';

const text = billingCloudText.status;

export function PlanStatus({
  subscription,
  supportEmail = readSupportEmail(),
}: {
  subscription: Subscription | null | undefined;
  /** El correo de ayuda para pedir la garantía. Se puede cambiar en las pruebas */
  supportEmail?: string | null;
}) {
  const state = planStateOf(subscription);
  const lines: string[] = [];
  if (state) lines.push(planStateLine(state));
  const periodEnd = subscription?.periodEnd ?? null;
  if (state && subscription?.scheduledChange && periodEnd) {
    lines.push(text.scheduled(longDate(periodEnd)));
  }
  const guarantee = state ? (subscription?.guaranteeUntil ?? null) : null;
  if (guarantee) {
    lines.push(
      supportEmail
        ? text.guarantee(longDate(guarantee), supportEmail)
        : text.guaranteeNoEmail(longDate(guarantee)),
    );
  }
  const issue = subscription?.issue;
  const issueText = issue && issue !== 'voucher_expired' ? text.issues[issue] : null;
  if (lines.length === 0 && !issueText) return null;
  return (
    <div className="flex flex-col gap-2">
      {lines.length > 0 ? (
        <div className="flex flex-col gap-1 rounded-md bg-muted px-3 py-2 text-sm">
          {lines.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
      ) : null}
      {issueText ? (
        <p role="status" className="rounded-md bg-warning-soft px-3 py-2 text-sm text-fg">
          {issueText}
        </p>
      ) : null}
    </div>
  );
}
