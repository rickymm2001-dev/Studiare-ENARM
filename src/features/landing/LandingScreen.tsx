// Portada de venta (D-060, D-068). Lo primero que ve quien no tiene sesión. Qué es Studiare, qué
// lo hace distinto, para quién es, precios y registro. Página aparte, sin navegación. Sobria, con
// un solo color de acción y sin degradados ni brillos (B2 del plan del cambio, D-121).
// Cada texto que escribe la agencia o el influencer lleva data-slot con el id de su lugar, solo para
// verlo al inspeccionar la página (el botón del cierre repite el de hero.cta y lleva data-slot-repeat, así
// ningún id sale dos veces), y los bloques del creador y de testimonios no se muestran mientras
// estén vacíos (B17, 5.2). El texto vive en src/i18n/landing.ts y sus reglas en slots.ts.
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
import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { screenPath } from '@/app/screens';
import {
  canUse,
  FOUNDER_PROMO_ACTIVE,
  PLAN_HIGHLIGHTS,
  PLANS,
  VISIBLE_PLANS,
} from '@/config/billing';
import { cloudConfigured } from '@/data/cloud/client';
import { PlanPrice } from '@/features/billing/PlanPrice';
import { trialAdvertised } from '@/features/shared/lockedCta';
import { t } from '@/i18n/es-MX';
import { billingCloudText } from '@/i18n/billingCloud';
import { legalText } from '@/i18n/legal';
import { cn } from '@/ui/cn';
import { Badge } from '@/ui/components/badge';
import { Button } from '@/ui/components/button';
import { Card } from '@/ui/components/card';
import { CreatorSection, TestimonialsSection } from './LandingBlocks';
import { hasLandingPreview } from './previewKey';
import { slotId } from './slotId';
import type { LandingBlocks } from './slots';

const FEATURES: { icon: ReactNode; key: keyof typeof t.landing.features }[] = [
  { icon: <Gauge />, key: 'technique' },
  { icon: <BookOpenCheck />, key: 'fsrs' },
  { icon: <Brain />, key: 'biases' },
  { icon: <Trophy />, key: 'game' },
  { icon: <FileUp />, key: 'decks' },
  { icon: <Stethoscope />, key: 'physicians' },
];

/**
 * Los bloques del creador y de testimonios. En producción, solo lo publicado en src/i18n/landing.ts. Fuera
 * de producción, si el navegador trae una vista previa (preview.ts), la pinta con su etiqueta de prueba.
 * Las reglas de esa vista previa se bajan aparte y solo entonces, y en producción Rollup quita la rama
 */
function useLandingBlocks(): LandingBlocks {
  const [preview, setPreview] = useState<LandingBlocks | null>(null);
  useEffect(() => {
    if (import.meta.env.VITE_APP_ENV === 'production' || !hasLandingPreview()) return;
    let current = true;
    void import('./preview').then((module) => {
      if (current) setPreview(module.readLandingPreview());
    });
    return () => {
      current = false;
    };
  }, []);
  return (
    preview ?? { creator: t.landing.creator, testimonials: t.landing.testimonials, sample: false }
  );
}

export function LandingScreen() {
  const text = t.landing;
  const offersTrial = trialAdvertised();
  const blocks = useLandingBlocks();
  return (
    <div className="flex flex-col gap-10 pb-6">
      <title>{t.app.documentTitle(text.documentTitle)}</title>
      {/* El título conserva 30 y 36 px, la única excepción a la escala (D-121). Todo el texto del
          héroe va en el ancho de lectura y con menos alto (H16 de la revisión de B2) */}
      <section className="animate-rise rounded-lg border border-line bg-surface px-5 py-10 sm:px-10">
        <div className="flex max-w-reading flex-col items-start">
          <Badge variant="neutral" className="mb-3" data-slot="hero.badge">
            <Sparkles aria-hidden className="size-3.5" />
            {text.badge}
          </Badge>
          <h1
            tabIndex={-1}
            className="text-3xl leading-tight font-bold outline-none sm:text-4xl"
            data-slot="hero.title"
          >
            {text.title}
          </h1>
          <p className="mt-4 max-w-xl text-lg text-fg-muted" data-slot="hero.subtitle">
            {text.subtitle}
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link to={screenPath('onboarding')} data-slot="hero.cta">
                {text.cta}
              </Link>
            </Button>
            <Button asChild size="lg" variant="secondary">
              <Link to={screenPath('onboarding')}>{text.login}</Link>
            </Button>
          </div>
          <p className="mt-4 text-sm text-fg-muted" data-slot="hero.trust">
            {text.trust}
          </p>
        </div>
      </section>

      <section aria-labelledby="diferente" className="flex flex-col gap-4">
        <h2 id="diferente" className="screen-title">
          {text.featuresTitle}
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature, index) => (
            <Card key={feature.key} className="flex flex-col gap-2">
              <span
                aria-hidden
                className="flex size-10 items-center justify-center rounded-md bg-muted text-fg-muted [&_svg]:size-5"
              >
                {feature.icon}
              </span>
              <h3 className="text-lg font-bold" data-slot={slotId('features.N.title', index + 1)}>
                {text.features[feature.key][0]}
              </h3>
              <p className="text-sm text-fg-muted" data-slot={slotId('features.N.text', index + 1)}>
                {text.features[feature.key][1]}
              </p>
            </Card>
          ))}
        </div>
      </section>

      <section aria-labelledby="para-ti" className="flex flex-col gap-4">
        <h2 id="para-ti" className="screen-title">
          {text.personasTitle}
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {text.personas.map(([who, what], index) => (
            <div key={who} className="flex gap-3 rounded-lg border border-line bg-surface p-4">
              <Users aria-hidden className="mt-0.5 size-5 shrink-0 text-fg-muted" />
              <p>
                <span className="font-bold">
                  <span data-slot={slotId('personas.N.who', index + 1)}>{who}</span>.
                </span>{' '}
                <span className="text-fg-muted" data-slot={slotId('personas.N.text', index + 1)}>
                  {what}
                </span>
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Vacíos no pintan nada. Con texto van entre las funciones y los planes */}
      <CreatorSection creator={blocks.creator} sample={blocks.sample} />
      <TestimonialsSection testimonials={blocks.testimonials} sample={blocks.sample} />

      <section aria-labelledby="precios" className="flex flex-col gap-4">
        <div>
          <h2 id="precios" className="screen-title">
            {text.pricingTitle}
          </h2>
          <p className="text-sm text-fg-muted">
            {cloudConfigured() ? billingCloudText.notice : t.billing.simulatedNotice}
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
                  highlighted && 'border-indicator ring-1 ring-indicator',
                )}
              >
                {highlighted ? (
                  <Badge variant="info" className="self-start">
                    {FOUNDER_PROMO_ACTIVE ? text.founderBadge : text.bestValue}
                  </Badge>
                ) : null}
                <h3 className="text-lg font-bold">{t.billing.plans[key]}</h3>
                {/* El ahorro del anual es texto de venta, no un estado. Va neutro y el plan destacado ya
                    lleva el borde (H10). La prueba se dice con la bandera freeTrial y la nube (B10) */}
                <PlanPrice plan={key} trial={offersTrial} />
                {offersTrial && key !== 'free' ? (
                  <p className="text-sm font-semibold text-fg">{t.billing.trialLine}</p>
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
        {text.faq.map(([question, answer], index) => (
          <details key={question} className="rounded-lg border border-line bg-surface p-4">
            <summary
              className="cursor-pointer font-semibold"
              data-slot={slotId('faq.N.question', index + 1)}
            >
              {question}
            </summary>
            <p className="mt-2 text-fg-muted" data-slot={slotId('faq.N.answer', index + 1)}>
              {answer}
            </p>
          </details>
        ))}
      </section>

      <section className="flex flex-col items-start gap-3 rounded-lg border border-line bg-surface p-6 sm:p-8">
        <h2 className="screen-title" data-slot="final.title">
          {text.finalTitle}
        </h2>
        <Button asChild size="lg">
          {/* Repite el texto de hero.cta. Lleva su propia marca para que cada data-slot salga una sola vez */}
          <Link to={screenPath('onboarding')} data-slot-repeat="hero.cta">
            {text.cta}
          </Link>
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
