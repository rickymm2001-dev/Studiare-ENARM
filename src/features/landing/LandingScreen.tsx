// Portada de venta (D-060, D-068). Lo primero que ve quien no tiene sesión. Qué es Studiare, qué
// lo hace distinto, para quién es, precios y registro. Página aparte, sin navegación. Sobria, con
// un solo color de acción y sin degradados ni brillos (B2 del plan del cambio, D-121).
import {
  BookOpenCheck,
  Brain,
  Check,
  FileUp,
  Gauge,
  Sparkles,
  Stethoscope,
  Trophy,
  Users,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { screenPath } from '@/app/screens';
import {
  annualSavingsPercent,
  canUse,
  FOUNDER_PROMO_ACTIVE,
  PLAN_HIGHLIGHTS,
  PLANS,
  VISIBLE_PLANS,
} from '@/config/billing';
import { cloudConfigured } from '@/data/cloud/client';
import { PlanPrice } from '@/features/billing/PlanPrice';
import { t } from '@/i18n/es-MX';
import { legalText } from '@/i18n/legal';
import { cn } from '@/ui/cn';
import { Badge } from '@/ui/components/badge';
import { Button } from '@/ui/components/button';
import { Card } from '@/ui/components/card';

const FEATURES: { icon: ReactNode; key: keyof typeof t.landing.features }[] = [
  { icon: <Gauge />, key: 'technique' },
  { icon: <BookOpenCheck />, key: 'fsrs' },
  { icon: <Brain />, key: 'biases' },
  { icon: <Trophy />, key: 'game' },
  { icon: <FileUp />, key: 'decks' },
  { icon: <Stethoscope />, key: 'physicians' },
];

export function LandingScreen() {
  const text = t.landing;
  return (
    <div className="flex flex-col gap-10 pb-6">
      <title>{t.app.documentTitle(text.documentTitle)}</title>
      {/* El título conserva 30 y 36 px, la única excepción a la escala (D-121). Todo el texto del
          héroe va en el ancho de lectura y con menos alto (H16 de la revisión de B2) */}
      <section className="animate-rise rounded-lg border border-line bg-surface px-5 py-10 sm:px-10">
        <div className="flex max-w-reading flex-col items-start">
          <Badge variant="neutral" className="mb-3">
            <Sparkles aria-hidden className="size-3.5" />
            {text.badge}
          </Badge>
          <h1 tabIndex={-1} className="text-3xl leading-tight font-bold outline-none sm:text-4xl">
            {text.title}
          </h1>
          <p className="mt-4 max-w-xl text-lg text-fg-muted">{text.subtitle}</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link to={screenPath('onboarding')}>{text.cta}</Link>
            </Button>
            <Button asChild size="lg" variant="secondary">
              <Link to={screenPath('onboarding')}>{text.login}</Link>
            </Button>
          </div>
          <p className="mt-4 text-sm text-fg-muted">{text.trust}</p>
        </div>
      </section>

      <section aria-labelledby="diferente" className="flex flex-col gap-4">
        <h2 id="diferente" className="screen-title">
          {text.featuresTitle}
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature) => (
            <Card key={feature.key} className="flex flex-col gap-2">
              <span
                aria-hidden
                className="flex size-10 items-center justify-center rounded-md bg-primary-soft text-primary-ink [&_svg]:size-5"
              >
                {feature.icon}
              </span>
              <h3 className="text-lg font-bold">{text.features[feature.key][0]}</h3>
              <p className="text-sm text-fg-muted">{text.features[feature.key][1]}</p>
            </Card>
          ))}
        </div>
      </section>

      <section aria-labelledby="para-ti" className="flex flex-col gap-4">
        <h2 id="para-ti" className="screen-title">
          {text.personasTitle}
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {text.personas.map(([who, what]) => (
            <div key={who} className="flex gap-3 rounded-lg border border-line bg-surface p-4">
              <Users aria-hidden className="mt-0.5 size-5 shrink-0 text-primary-ink" />
              <p>
                <span className="font-bold">{who}.</span>{' '}
                <span className="text-fg-muted">{what}</span>
              </p>
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="precios" className="flex flex-col gap-4">
        <div>
          <h2 id="precios" className="screen-title">
            {text.pricingTitle}
          </h2>
          <p className="text-sm text-fg-muted">
            {cloudConfigured() ? t.billing.cloud.notice : t.billing.simulatedNotice}
          </p>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {VISIBLE_PLANS.map((key) => {
            const plan = PLANS[key];
            // Durante la promoción Fundador el mensual a 79 sale más barato que el anual, así que se
            // destaca el mensual. Sin promoción, el anual es el mejor precio
            const highlighted = FOUNDER_PROMO_ACTIVE ? key === 'monthly' : key === 'annual';
            return (
              <Card
                key={key}
                className={cn(
                  'flex flex-col gap-3',
                  highlighted && 'border-primary ring-1 ring-primary',
                )}
              >
                {highlighted ? (
                  <Badge variant="info" className="self-start">
                    {FOUNDER_PROMO_ACTIVE ? text.founderBadge : text.bestValue}
                  </Badge>
                ) : null}
                <h3 className="text-lg font-bold">{t.billing.plans[key]}</h3>
                <PlanPrice plan={key} />
                {/* Texto de venta, no un estado. Va neutro y el plan destacado ya lleva el borde (H10) */}
                {key === 'annual' ? (
                  <p className="text-sm font-semibold text-fg">
                    {t.billing.savings(annualSavingsPercent())}
                  </p>
                ) : null}
                <ul className="flex flex-col gap-1 text-sm">
                  <li className="flex items-center gap-2">
                    <Check aria-hidden className="size-4 text-fg-muted" />
                    {t.billing.access.dailyQuestions(plan.access.dailyQuestions)}
                  </li>
                  {/* Lo que incluye cada plan, con lo que Gratis deja fuera (respuesta 20, 4.25, B8) */}
                  {PLAN_HIGHLIGHTS.filter((feature) => canUse(key, feature)).map((feature) => (
                    <li key={feature} className="flex items-center gap-2">
                      <Check aria-hidden className="size-4 text-fg-muted" />
                      {t.billing.access[feature]}
                    </li>
                  ))}
                </ul>
                <Button asChild variant={highlighted ? 'primary' : 'secondary'} className="mt-auto">
                  <Link to={screenPath('onboarding')}>{text.startWith(t.billing.plans[key])}</Link>
                </Button>
              </Card>
            );
          })}
        </div>
      </section>

      <section aria-labelledby="preguntas" className="flex flex-col gap-3">
        <h2 id="preguntas" className="screen-title">
          {text.faqTitle}
        </h2>
        {text.faq.map(([question, answer]) => (
          <details key={question} className="rounded-lg border border-line bg-surface p-4">
            <summary className="cursor-pointer font-semibold">{question}</summary>
            <p className="mt-2 text-fg-muted">{answer}</p>
          </details>
        ))}
      </section>

      <section className="flex flex-col items-start gap-3 rounded-lg border border-line bg-surface p-6 sm:p-8">
        <h2 className="screen-title">{text.finalTitle}</h2>
        <Button asChild size="lg">
          <Link to={screenPath('onboarding')}>{text.cta}</Link>
        </Button>
      </section>

      <footer className="flex flex-wrap justify-center gap-x-4 gap-y-1 pb-2 text-sm text-fg-muted">
        <Link to={screenPath('privacyNotice')} className="underline underline-offset-4">
          {legalText.links.privacy}
        </Link>
        <Link to={screenPath('terms')} className="underline underline-offset-4">
          {legalText.links.terms}
        </Link>
      </footer>
    </div>
  );
}
