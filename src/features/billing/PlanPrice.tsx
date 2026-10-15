// Precio de un plan visible. Con la promoción Fundador el mensual y el anual muestran el precio regular
// tachado y el de Fundador (D-114 y B10), y el anual dice cuánto ahorra. Los de pago dicen IVA
// incluido (respuesta 13). Lo usan Suscripción y la portada, para que el precio se vea igual en las dos.
import {
  FOUNDER_PROMO_ACTIVE,
  FOUNDER_SEATS,
  PLANS,
  annualSavingsPercent,
  checkoutPlanFor,
  type PlanKey,
} from '@/config/billing';
import { t } from '@/i18n/es-MX';

export function PlanPrice({
  plan,
  promo = FOUNDER_PROMO_ACTIVE,
  trial = false,
}: {
  plan: PlanKey;
  /** Si se ofrece la promoción Fundador. Se puede cambiar en las pruebas */
  promo?: boolean;
  /** Si el lugar Fundador se aparta al empezar la prueba, o se confirma al pagar */
  trial?: boolean;
}) {
  const charged = checkoutPlanFor(plan, promo);
  const founder = charged !== plan;
  return (
    <>
      <p>
        {founder ? (
          <>
            <span className="sr-only">{t.billing.regularPrice} </span>
            <s className="mr-2 text-base text-fg-muted">{t.billing.price(PLANS[plan].priceMxn)}</s>
            <span className="sr-only">{t.billing.promoPrice} </span>
          </>
        ) : null}
        <span className="text-2xl font-bold">{t.billing.price(PLANS[charged].priceMxn)}</span>{' '}
        <span className="text-sm text-fg-muted">{t.billing.periods[plan]}</span>
      </p>
      {/* La promoción es texto de venta y no un estado, por eso no va en verde (H10 de B2) */}
      {founder && plan === 'monthly' ? (
        <p className="text-sm font-semibold text-fg">
          {trial
            ? t.billing.founderNote(FOUNDER_SEATS)
            : t.billing.founderNoteNoTrial(FOUNDER_SEATS)}
        </p>
      ) : null}
      {plan === 'annual' ? (
        <p className="text-sm font-semibold text-fg">
          {founder
            ? t.billing.founderSavings(annualSavingsPercent(PLANS, 'founder'))
            : t.billing.savings(annualSavingsPercent())}
        </p>
      ) : null}
      {plan === 'free' ? null : <p className="text-sm text-fg-muted">{t.billing.taxIncluded}</p>}
    </>
  );
}
