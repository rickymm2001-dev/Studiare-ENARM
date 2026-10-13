// Precio de un plan visible. El mensual muestra la promoción Fundador con el precio regular tachado
// (D-114). Lo usan Suscripción y la portada, para que el precio se vea igual en las dos.
import { FOUNDER_PROMO_ACTIVE, FOUNDER_SEATS, PLANS, type PlanKey } from '@/config/billing';
import { t } from '@/i18n/es-MX';

export function PlanPrice({
  plan,
  promo = FOUNDER_PROMO_ACTIVE,
}: {
  plan: PlanKey;
  /** Si se ofrece la promoción Fundador. Se puede cambiar en las pruebas */
  promo?: boolean;
}) {
  const founder = plan === 'monthly' && promo;
  return (
    <>
      <p>
        {founder ? (
          <>
            <span className="sr-only">{t.billing.regularPrice} </span>
            <s className="mr-2 text-base text-fg-muted">
              {t.billing.price(PLANS.monthly.priceMxn)}
            </s>
            <span className="sr-only">{t.billing.promoPrice} </span>
          </>
        ) : null}
        <span className="text-2xl font-bold">
          {t.billing.price(founder ? PLANS.founder.priceMxn : PLANS[plan].priceMxn)}
        </span>{' '}
        <span className="text-sm text-fg-muted">{t.billing.periods[plan]}</span>
      </p>
      {/* La promoción es texto de venta y no un estado, por eso no va en verde (H10 de B2) */}
      {founder ? (
        <p className="text-sm font-semibold text-fg">{t.billing.founderNote(FOUNDER_SEATS)}</p>
      ) : null}
    </>
  );
}
