// Suscripción simulada (pantalla 16). Planes con sus banderas de acceso, checkout simulado sin datos
// de tarjeta y recibos marcados como simulados (15.7). Nada se cobra (3.2).
import { Check, Minus, Receipt } from 'lucide-react';
import { useState } from 'react';
import { ScreenHeader } from '@/app/layout/ScreenHeader';
import { PLANS, type PlanAccess, type PlanKey } from '@/config/billing';
import { useDataApi } from '@/data/context';
import { useLiveData } from '@/data/hooks';
import { changePlan } from '@/data/usecases/subscription';
import { t } from '@/i18n/es-MX';
import { cn } from '@/ui/cn';
import { Badge } from '@/ui/components/badge';
import { Button } from '@/ui/components/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/ui/components/card';
import { RequireSession, type ReadySession } from '../shared/RequireSession';
import { useUserEvents } from '../shared/useUserEvents';

/** Funciones que todavía no existen. Se muestran como Próximamente para no prometer de más (D-076) */
const COMING_SOON: ReadonlySet<keyof PlanAccess> = new Set(['fullExam', 'aiTutor', 'importDecks']);

const ACCESS_KEYS: (keyof PlanAccess)[] = [
  'dailyQuestions',
  'fullExam',
  'aiTutor',
  'importDecks',
  'party',
];

export function SubscriptionScreen() {
  return (
    <RequireSession screen="subscription">
      {(session) => <Billing session={session} />}
    </RequireSession>
  );
}

function Billing({ session }: { session: ReadySession }) {
  const api = useDataApi();
  const { user } = session;
  const subscription = useLiveData(
    () => api.repos.subscriptions.get(user.id).then((value) => value ?? null),
    [api.repos, user.id],
  );
  const events = useUserEvents(user.id);
  const [checkout, setCheckout] = useState<PlanKey | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const current: PlanKey = subscription?.status === 'active' ? subscription.plan : 'free';
  const receipts = (events ?? []).flatMap((event) =>
    event.type === 'subscription_changed' && event.payload.receiptId
      ? [{ at: event.at, ...event.payload }]
      : [],
  );

  return (
    <>
      <ScreenHeader title={t.screens.subscription.title} description={t.billing.simulatedNotice} />
      <p className="font-medium">{t.billing.current(t.billing.plans[current])}</p>
      {checkout ? (
        <Card aria-labelledby="checkout-titulo">
          <CardHeader>
            <CardTitle id="checkout-titulo">{t.billing.checkoutTitle}</CardTitle>
            <CardDescription>
              {t.billing.checkoutSummary(
                t.billing.plans[checkout],
                t.billing.price(PLANS[checkout].priceMxn),
                t.billing.periods[checkout],
              )}
            </CardDescription>
          </CardHeader>
          <p className="mb-3 rounded-md bg-sim px-3 py-2 text-sm text-sim-fg">
            {t.billing.simulatedNotice}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={busy}
              onClick={() => {
                setBusy(true);
                void changePlan(api, user, checkout).then(() => {
                  setBusy(false);
                  setCheckout(null);
                  setMessage('');
                });
              }}
            >
              {busy ? t.billing.processing : t.billing.confirm}
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setCheckout(null);
              }}
            >
              {t.billing.back}
            </Button>
          </div>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
          {(Object.keys(PLANS) as PlanKey[]).map((key) => {
            const plan = PLANS[key];
            const isCurrent = key === current;
            return (
              <Card
                key={key}
                aria-labelledby={`plan-${key}`}
                className={cn(isCurrent && 'border-primary')}
              >
                <CardHeader>
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle id={`plan-${key}`}>{t.billing.plans[key]}</CardTitle>
                    {isCurrent ? <Badge variant="info">{t.billing.currentPlan}</Badge> : null}
                  </div>
                  <p>
                    <span className="text-2xl font-bold">{t.billing.price(plan.priceMxn)}</span>{' '}
                    <span className="text-sm text-fg-muted">{t.billing.periods[key]}</span>
                  </p>
                  {key === 'annual' ? (
                    <p className="text-sm font-semibold text-success">
                      {t.billing.savings(
                        Math.round(
                          (1 - PLANS.annual.priceMxn / (PLANS.monthly.priceMxn * 12)) * 100,
                        ),
                      )}
                    </p>
                  ) : null}
                </CardHeader>
                <ul className="mb-4 flex flex-col gap-2 text-sm">
                  {ACCESS_KEYS.map((access) => {
                    const value = plan.access[access];
                    const label =
                      access === 'dailyQuestions'
                        ? t.billing.access.dailyQuestions(plan.access.dailyQuestions)
                        : t.billing.access[access];
                    const included = access === 'dailyQuestions' ? true : Boolean(value);
                    return (
                      <li
                        key={access}
                        className={cn('flex items-center gap-2', !included && 'text-fg-muted')}
                      >
                        {included ? (
                          <Check aria-hidden className="size-4 text-success" />
                        ) : (
                          <Minus aria-hidden className="size-4" />
                        )}
                        <span>
                          {label}
                          {included && COMING_SOON.has(access) ? (
                            <Badge variant="neutral" className="ml-2">
                              {t.billing.comingSoon}
                            </Badge>
                          ) : null}
                          <span className="sr-only">
                            . {included ? t.billing.included : t.billing.notIncluded}
                          </span>
                        </span>
                      </li>
                    );
                  })}
                </ul>
                {isCurrent ? null : key === 'free' ? (
                  <Button
                    variant="secondary"
                    onClick={() => {
                      void changePlan(api, user, 'free').then(() => {
                        setMessage(t.billing.canceled);
                      });
                    }}
                  >
                    {t.billing.cancel}
                  </Button>
                ) : (
                  <Button
                    onClick={() => {
                      setCheckout(key);
                    }}
                  >
                    {t.billing.choose(t.billing.plans[key])}
                  </Button>
                )}
              </Card>
            );
          })}
        </div>
      )}
      <p role="status" className="text-sm text-fg-muted">
        {message}
      </p>
      <Card aria-labelledby="recibos-titulo">
        <CardHeader>
          <CardTitle id="recibos-titulo">{t.billing.receiptsTitle}</CardTitle>
        </CardHeader>
        {receipts.length === 0 ? (
          <p className="text-sm text-fg-muted">{t.billing.noReceipts}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {[...receipts].reverse().map((receipt) => (
              <li
                key={receipt.receiptId}
                className="flex items-start gap-3 rounded-md border border-line p-3"
              >
                <Receipt aria-hidden className="mt-0.5 size-5 text-fg-muted" />
                <div className="flex flex-col text-sm">
                  <span className="font-medium">{t.billing.receiptTitle}</span>
                  <span>
                    {t.billing.receiptLine(
                      t.billing.plans[receipt.plan],
                      t.billing.price(receipt.amountMxn),
                      new Date(receipt.at).toLocaleDateString('es-MX'),
                    )}
                  </span>
                  <span className="text-fg-muted">
                    {t.billing.receiptFolio(receipt.receiptId ?? '')}
                  </span>
                  <span className="font-semibold text-sim-fg">{t.billing.receiptSimulated}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
