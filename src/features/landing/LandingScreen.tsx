// Portada de venta (D-060, D-068). Lo primero que ve quien no tiene sesión. Qué es Studiare, qué
// lo hace distinto, para quién es, precios y registro. Página aparte, sin navegación.
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
import { FOUNDER_SEATS, PLANS, type PlanKey } from '@/config/billing';
import { t } from '@/i18n/es-MX';
import { cn } from '@/ui/cn';
import { Button } from '@/ui/components/button';
import { Card } from '@/ui/components/card';

const FEATURES: { icon: ReactNode; tone: string; key: keyof typeof t.landing.features }[] = [
  { icon: <Gauge />, tone: 'bg-mi text-white', key: 'technique' },
  { icon: <BookOpenCheck />, tone: 'bg-ped text-white', key: 'fsrs' },
  { icon: <Brain />, tone: 'bg-gyo text-white', key: 'biases' },
  { icon: <Trophy />, tone: 'bg-gold text-accent-fg', key: 'game' },
  { icon: <FileUp />, tone: 'bg-cir text-white', key: 'decks' },
  { icon: <Stethoscope />, tone: 'bg-fam text-white', key: 'physicians' },
];

export function LandingScreen() {
  const text = t.landing;
  return (
    <div className="flex flex-col gap-10 pb-6">
      <title>{t.app.documentTitle(text.documentTitle)}</title>
      <section className="bg-hero animate-rise relative overflow-hidden rounded-xl px-5 py-10 text-white shadow-raised sm:px-10 sm:py-14">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-20 -right-20 size-72 rounded-full bg-white/10 blur-2xl"
        />
        <p className="mb-3 inline-flex items-center gap-1 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold">
          <Sparkles aria-hidden className="size-3.5" />
          {text.badge}
        </p>
        <h1
          tabIndex={-1}
          className="max-w-2xl text-4xl leading-tight font-extrabold outline-none sm:text-5xl"
        >
          {text.title}
        </h1>
        <p className="mt-4 max-w-xl text-lg text-white/85">{text.subtitle}</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Button asChild variant="gold" size="lg">
            <Link to={screenPath('onboarding')}>{text.cta}</Link>
          </Button>
          <Button
            asChild
            size="lg"
            variant="ghost"
            className="border border-white/40 text-white hover:bg-white/10"
          >
            <Link to={screenPath('onboarding')}>{text.login}</Link>
          </Button>
        </div>
        <p className="mt-4 text-sm text-white/75">{text.trust}</p>
      </section>

      <section aria-labelledby="diferente" className="flex flex-col gap-4">
        <h2 id="diferente" className="text-2xl font-extrabold sm:text-3xl">
          {text.featuresTitle}
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature) => (
            <Card key={feature.key} className="flex flex-col gap-2">
              <span
                aria-hidden
                className={cn(
                  'flex size-11 items-center justify-center rounded-xl [&_svg]:size-5',
                  feature.tone,
                )}
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
        <h2 id="para-ti" className="text-2xl font-extrabold sm:text-3xl">
          {text.personasTitle}
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {text.personas.map(([who, what]) => (
            <div key={who} className="flex gap-3 rounded-xl border border-line bg-surface p-4">
              <Users aria-hidden className="mt-0.5 size-5 shrink-0 text-primary" />
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
          <h2 id="precios" className="text-2xl font-extrabold sm:text-3xl">
            {text.pricingTitle}
          </h2>
          <p className="text-sm text-fg-muted">{t.billing.simulatedNotice}</p>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          {(Object.keys(PLANS) as PlanKey[]).map((key) => {
            const plan = PLANS[key];
            const highlighted = key === 'annual';
            return (
              <Card
                key={key}
                className={cn('flex flex-col gap-3', highlighted && 'ring-2 ring-accent')}
              >
                {highlighted ? (
                  <span className="bg-gold self-start rounded-full px-2.5 py-0.5 text-xs font-bold text-accent-fg">
                    {text.bestValue}
                  </span>
                ) : null}
                <h3 className="text-lg font-bold">{t.billing.plans[key]}</h3>
                <p>
                  <span className="font-display text-3xl font-extrabold">
                    {t.billing.price(plan.priceMxn)}
                  </span>{' '}
                  <span className="text-sm text-fg-muted">{t.billing.periods[key]}</span>
                </p>
                {key === 'founder' ? (
                  <p className="text-sm font-semibold text-success">
                    {t.billing.founderNote(FOUNDER_SEATS)}
                  </p>
                ) : null}
                <ul className="flex flex-col gap-1 text-sm">
                  <li className="flex items-center gap-2">
                    <Check aria-hidden className="size-4 text-success" />
                    {t.billing.access.dailyQuestions(plan.access.dailyQuestions)}
                  </li>
                  {(['fullExam', 'aiTutor', 'importDecks', 'party'] as const)
                    .filter((feature) => plan.access[feature])
                    .map((feature) => (
                      <li key={feature} className="flex items-center gap-2">
                        <Check aria-hidden className="size-4 text-success" />
                        {t.billing.access[feature]}
                        {feature !== 'party' ? (
                          <span className="text-xs text-fg-muted">({t.billing.comingSoon})</span>
                        ) : null}
                      </li>
                    ))}
                </ul>
                <Button asChild variant={highlighted ? 'gold' : 'secondary'} className="mt-auto">
                  <Link to={screenPath('onboarding')}>{text.startWith(t.billing.plans[key])}</Link>
                </Button>
              </Card>
            );
          })}
        </div>
      </section>

      <section aria-labelledby="preguntas" className="flex flex-col gap-3">
        <h2 id="preguntas" className="text-2xl font-extrabold sm:text-3xl">
          {text.faqTitle}
        </h2>
        {text.faq.map(([question, answer]) => (
          <details key={question} className="rounded-xl border border-line bg-surface p-4">
            <summary className="cursor-pointer font-semibold">{question}</summary>
            <p className="mt-2 text-fg-muted">{answer}</p>
          </details>
        ))}
      </section>

      <section className="flex flex-col items-center gap-3 rounded-xl bg-accent-soft p-8 text-center">
        <h2 className="text-2xl font-extrabold">{text.finalTitle}</h2>
        <Button asChild variant="gold" size="lg">
          <Link to={screenPath('onboarding')}>{text.cta}</Link>
        </Button>
      </section>
    </div>
  );
}
