// Portada de venta (D-060, D-068, D-148). Lo primero que ve quien no tiene sesión. Sigue el boceto de
// Ricardo, con una barra pizarra fija que lleva a las secciones de la misma página y a la entrada, el
// héroe en marino y azul cielo con la foto fundida al borde, y Nuestro método con sus seis pasos. El
// resto toma del formato de referencia la forma de los bloques, con esquinas grandes, bandas de color
// y tarjetas que se encienden. Es la única pantalla con degradados y movimiento largo; sus estilos
// viven en landing.css y la app por dentro sigue el sistema sobrio (D-121).
// Cada texto que escribe la agencia o el influencer lleva data-slot con el id de su lugar, solo para
// verlo al inspeccionar la página (el botón del cierre repite el de hero.cta y lleva data-slot-repeat, así
// ningún id sale dos veces), y los bloques del creador y de testimonios no se muestran mientras
// estén vacíos (B17, 5.2). El texto vive en src/i18n/landing.ts y sus reglas en slots.ts.
import {
  ArrowRight,
  BookOpenCheck,
  Brain,
  Check,
  ChevronDown,
  Clock,
  FileUp,
  Gauge,
  Moon,
  RotateCcw,
  Sparkles,
  Stethoscope,
  Target,
  Trophy,
  Users,
} from 'lucide-react';
import { Fragment, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Link } from 'react-router';
import { screenPath } from '@/app/screens';
import logoDarkUrl from '@/assets/brand/studiare-logo-dark.png';
import logoUrl from '@/assets/brand/studiare-logo.png';
import {
  canUse,
  FOUNDER_PROMO_ACTIVE,
  PLAN_HIGHLIGHTS,
  PLANS,
  VISIBLE_PLANS,
} from '@/config/billing';
import { BRAND } from '@/config/brand';
import { cloudConfigured } from '@/data/cloud/client';
import { PlanPrice } from '@/features/billing/PlanPrice';
import { trialAdvertised } from '@/features/shared/lockedCta';
import { t } from '@/i18n/es-MX';
import { billingCloudText } from '@/i18n/billingCloud';
import { branchNames } from '@/i18n/features';
import { legalText } from '@/i18n/legal';
import { branchTone, TONE_CLASSES } from '@/ui/branches';
import { cn } from '@/ui/cn';
import { Badge } from '@/ui/components/badge';
import { HeroVisual } from './HeroVisual';
import { CreatorSection, TestimonialsSection } from './LandingBlocks';
import { MethodTabs } from './MethodTabs';
import { hasLandingPreview } from './previewKey';
import { slotId } from './slotId';
import type { LandingBlocks } from './slots';
import { useActiveSection, useReveal } from './useReveal';
import './landing.css';

const FEATURES: { icon: ReactNode; key: keyof typeof t.landing.features }[] = [
  { icon: <Gauge />, key: 'technique' },
  { icon: <BookOpenCheck />, key: 'fsrs' },
  { icon: <Brain />, key: 'biases' },
  { icon: <Trophy />, key: 'game' },
  { icon: <FileUp />, key: 'decks' },
  { icon: <Stethoscope />, key: 'physicians' },
];

/** Un ícono fijo por perfil, en el orden de la lista (docs/PORTADA.md) */
const PERSONA_ICONS: ReactNode[] = [
  <Clock key="clock" />,
  <Target key="target" />,
  <Sparkles key="sparkles" />,
  <Moon key="moon" />,
  <RotateCcw key="again" />,
  <Users key="users" />,
];

/** Dos tintes alternados para la rejilla de perfiles */
const PERSONA_TINTS = ['ld-persona--peach', '', 'ld-persona--panel', '', 'ld-persona--panel', ''];

/** Las secciones a las que lleva la barra, en su orden */
const SECTION_IDS = ['inicio', 'conocenos', 'metodo', 'planes'] as const;

const style = (vars: Record<string, string | number>) => vars as CSSProperties;

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

/** El texto con las frases dadas en cursiva azul. El texto completo sigue igual, solo cambia el envoltorio */
function Highlighted({ text, phrases }: { text: string; phrases: readonly string[] }) {
  const parts: ReactNode[] = [];
  let rest = text;
  let key = 0;
  while (rest.length > 0) {
    let first: { index: number; phrase: string } | null = null;
    for (const phrase of phrases) {
      const index = rest.indexOf(phrase);
      if (index >= 0 && (first === null || index < first.index)) first = { index, phrase };
    }
    if (first === null) {
      parts.push(<Fragment key={key}>{rest}</Fragment>);
      break;
    }
    if (first.index > 0) parts.push(<Fragment key={key++}>{rest.slice(0, first.index)}</Fragment>);
    parts.push(
      <em key={key++} className="ld-hl">
        {first.phrase}
      </em>,
    );
    rest = rest.slice(first.index + first.phrase.length);
  }
  return <>{parts}</>;
}

export function LandingScreen() {
  const text = t.landing;
  const offersTrial = trialAdvertised();
  const blocks = useLandingBlocks();
  const root = useRef<HTMLDivElement>(null);
  useReveal(root);
  const activeSection = useActiveSection(SECTION_IDS);
  const navItems: { id: (typeof SECTION_IDS)[number]; label: string }[] = [
    { id: 'inicio', label: text.nav.home },
    { id: 'conocenos', label: text.nav.about },
    { id: 'metodo', label: text.nav.method },
    { id: 'planes', label: text.nav.plans },
  ];
  const markLight = style({ backgroundImage: `url(${logoDarkUrl})` });
  const markInk = style({ backgroundImage: `url(${logoUrl})` });

  return (
    <div ref={root} className="ld">
      <title>{t.app.documentTitle(text.documentTitle)}</title>

      <header className="ld-topbar glass">
        <div className="ld-container ld-topbar__row">
          <a href="#inicio" className="ld-topbar__home" aria-label={BRAND.name}>
            <span className="ld-mark" style={markLight} aria-hidden />
          </a>
          <nav aria-label={text.nav.label} className="ld-nav">
            {navItems.map((item) => (
              <a
                key={item.id}
                href={`#${item.id}`}
                aria-current={activeSection === item.id ? 'true' : undefined}
              >
                {item.label}
              </a>
            ))}
          </nav>
          <Link to={screenPath('onboarding')} className="ld-btn ld-btn--white">
            {text.nav.login}
          </Link>
        </div>
      </header>

      <section id="inicio" aria-labelledby="hero-title" className="ld-hero">
        <div className="ld-blob ld-blob--a" aria-hidden />
        <div className="ld-blob ld-blob--b" aria-hidden />
        <div className="ld-hero__grid">
          <div className="ld-hero__copy">
            <p className="ld-eyebrow ld-enter" data-slot="hero.badge">
              <span>Propiedad de </span>
              <span className="ld-mark ld-mark--sm" style={markInk} aria-hidden />
              <span className="ld-eyebrow__brand">Studiare</span>
            </p>
            <h1
              id="hero-title"
              tabIndex={-1}
              className="ld-hero__title ld-enter outline-none"
              style={style({ '--d': '80ms' })}
              data-slot="hero.title"
            >
              <span className="ld-hero__title-top">Prepárate para el</span>{' '}
              <span className="ld-hero__title-year">ENARM 2027</span>
            </h1>
            <hr className="ld-hero__rule ld-enter" style={style({ '--d': '160ms' })} />
            <p
              className="ld-hero__tagline ld-enter"
              style={style({ '--d': '220ms' })}
              data-slot="hero.tagline"
            >
              {text.tagline}
            </p>
            <p
              className="ld-hero__subtitle ld-enter"
              style={style({ '--d': '280ms' })}
              data-slot="hero.subtitle"
            >
              {text.subtitle}
            </p>
            <div className="ld-hero__actions ld-enter" style={style({ '--d': '360ms' })}>
              <Link
                to={screenPath('onboarding')}
                className="ld-btn ld-btn--sky ld-btn--lg"
                data-slot="hero.cta"
              >
                {text.cta}
              </Link>
              <Link to={screenPath('onboarding')} className="ld-btn ld-btn--navy ld-btn--lg">
                {text.login}
              </Link>
            </div>
          </div>
          <HeroVisual trust={text.trust} />
        </div>
      </section>

      <section id="conocenos" aria-labelledby="diferente" className="ld-section">
        <div className="ld-container">
          <div className="grid gap-10 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:gap-14">
            <div data-reveal="">
              <span className="ld-kicker">{text.nav.about}</span>
              <h2 id="diferente" className="ld-title">
                {text.featuresTitle}
              </h2>
              <p className="ld-lead ld-muted" data-slot="features.intro">
                {text.featuresIntro}
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {FEATURES.map((feature, index) => (
                <article
                  key={feature.key}
                  className="ld-feature"
                  data-reveal=""
                  style={style({ '--i': index })}
                >
                  <span aria-hidden className="ld-icon">
                    {feature.icon}
                  </span>
                  <h3 data-slot={slotId('features.N.title', index + 1)}>
                    {text.features[feature.key][0]}
                  </h3>
                  <p data-slot={slotId('features.N.text', index + 1)}>
                    {text.features[feature.key][1]}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="metodo" aria-labelledby="metodo-titulo" className="ld-section pt-0">
        <div className="ld-container">
          <div data-reveal="">
            <h2 id="metodo-titulo" className="ld-title">
              {text.methodTitle}
            </h2>
            <p className="ld-lead" data-slot="method.intro">
              <Highlighted text={text.methodIntro} phrases={text.methodHighlights} />
            </p>
          </div>
          <MethodTabs items={text.method} />
        </div>
      </section>

      <section aria-labelledby="para-ti" className="ld-section ld-section--sage">
        <div className="ld-container">
          <div data-reveal="">
            <h2 id="para-ti" className="ld-title">
              {text.personasTitle}
            </h2>
          </div>
          <div className="ld-bento">
            {text.personas.map(([who, what], index) => (
              <article
                key={who}
                className={cn('ld-persona', PERSONA_TINTS[index])}
                data-reveal=""
                style={style({ '--i': index })}
              >
                <span aria-hidden className="ld-icon">
                  {PERSONA_ICONS[index]}
                </span>
                <h3 data-slot={slotId('personas.N.who', index + 1)}>{who}</h3>
                <p data-slot={slotId('personas.N.text', index + 1)}>{what}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section aria-labelledby="ramas" className="ld-section">
        <div className="ld-container" data-reveal="">
          <h2 id="ramas" className="ld-title">
            {text.branchesTitle}
          </h2>
          <p className="ld-lead ld-muted">{text.branchesNote}</p>
          <ul className="ld-branches m-0 list-none p-0">
            {Object.entries(branchNames).map(([key, name]) => {
              const tone = TONE_CLASSES[branchTone(key)];
              return (
                <li key={key} className={cn('ld-branch', tone.chip)}>
                  <span aria-hidden className={cn('ld-branch__dot', tone.bar)} />
                  {name}
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      {/* Vacíos no pintan nada. Con texto van entre los perfiles y los planes */}
      <CreatorSection creator={blocks.creator} sample={blocks.sample} />
      <TestimonialsSection testimonials={blocks.testimonials} sample={blocks.sample} />

      <section id="planes" aria-labelledby="precios" className="ld-section pt-0">
        <div className="ld-container">
          <div data-reveal="">
            <span className="ld-kicker">{text.nav.plans}</span>
            <h2 id="precios" className="ld-title">
              {text.pricingTitle}
            </h2>
            <p className="ld-lead ld-muted text-base">
              {cloudConfigured() ? billingCloudText.notice : t.billing.simulatedNotice}
            </p>
          </div>
          <div className="ld-plans">
            {VISIBLE_PLANS.map((key, index) => {
              const plan = PLANS[key];
              // Durante la promoción Fundador el mensual a 79 sale más barato que el anual, así que se
              // destaca el mensual. Sin promoción, el anual es el mejor precio
              const highlighted = FOUNDER_PROMO_ACTIVE ? key === 'monthly' : key === 'annual';
              return (
                <section
                  key={key}
                  className={cn('ld-plan', highlighted && 'ld-plan--featured')}
                  data-reveal=""
                  style={style({ '--i': index })}
                >
                  {highlighted ? (
                    <Badge variant="info" className="self-start">
                      {FOUNDER_PROMO_ACTIVE ? text.founderBadge : text.bestValue}
                    </Badge>
                  ) : null}
                  <h3>{t.billing.plans[key]}</h3>
                  {/* El ahorro del anual es texto de venta, no un estado. Va neutro y el plan destacado ya
                      lleva el fondo (H10). La prueba se dice con la bandera freeTrial y la nube (B10) */}
                  <PlanPrice plan={key} trial={offersTrial} />
                  {offersTrial && key !== 'free' ? (
                    <p className="text-sm font-semibold text-fg">{t.billing.trialLine}</p>
                  ) : null}
                  <ul>
                    <li>
                      <Check aria-hidden className="size-4" />
                      {t.billing.access.dailyQuestions(plan.access.dailyQuestions)}
                    </li>
                    {/* Lo que incluye cada plan, con lo que Gratis deja fuera (respuesta 20, 4.25, B8) */}
                    {PLAN_HIGHLIGHTS.filter((feature) => canUse(key, feature)).map((feature) => (
                      <li key={feature}>
                        <Check aria-hidden className="size-4" />
                        {t.billing.access[feature]}
                      </li>
                    ))}
                  </ul>
                  <Link
                    to={screenPath('onboarding')}
                    className={cn(
                      'ld-btn mt-auto',
                      highlighted ? 'ld-btn--white' : 'ld-btn--outline',
                    )}
                  >
                    {text.startWith(t.billing.plans[key])}
                  </Link>
                </section>
              );
            })}
          </div>
        </div>
      </section>

      <section aria-labelledby="preguntas" className="ld-section pt-0">
        <div className="ld-container">
          <div data-reveal="">
            <h2 id="preguntas" className="ld-title">
              {text.faqTitle}
            </h2>
          </div>
          <div className="mt-8 flex flex-col gap-3">
            {text.faq.map(([question, answer], index) => (
              <details
                key={question}
                className="ld-faq"
                data-reveal=""
                style={style({ '--i': index })}
              >
                <summary>
                  <span data-slot={slotId('faq.N.question', index + 1)}>{question}</span>
                  <ChevronDown aria-hidden className="ld-faq__chev" />
                </summary>
                <p className="ld-faq__answer" data-slot={slotId('faq.N.answer', index + 1)}>
                  {answer}
                </p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section aria-labelledby="final-titulo" className="ld-section pt-0">
        <div className="ld-container">
          <div className="ld-final" data-reveal="">
            <div className="ld-final__light ld-final__light--sky" aria-hidden />
            <div className="ld-final__light ld-final__light--peach" aria-hidden />
            <h2 id="final-titulo" data-slot="final.title">
              {text.finalTitle}
            </h2>
            <div className="mt-8 flex flex-wrap justify-center gap-4">
              {/* Repite el texto de hero.cta. Lleva su propia marca para que cada data-slot salga una sola vez */}
              <Link
                to={screenPath('onboarding')}
                className="ld-btn ld-btn--white ld-btn--lg"
                data-slot-repeat="hero.cta"
              >
                {text.cta}
                <ArrowRight aria-hidden className="size-5" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      <footer className="ld-footer">
        <div className="ld-container">
          <div className="ld-footer__grid">
            <div className="flex flex-col gap-4">
              <img
                src={logoDarkUrl}
                alt={BRAND.name}
                className="ld-footer__logo"
                width={297}
                height={64}
              />
              <p className="m-0 max-w-sm text-sm leading-relaxed">{BRAND.description}</p>
            </div>
            <div>
              <h2>{text.footer.sections}</h2>
              <ul>
                {navItems.map((item) => (
                  <li key={item.id}>
                    <a href={`#${item.id}`}>{item.label}</a>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h2>{text.footer.account}</h2>
              <ul>
                <li>
                  <Link to={screenPath('onboarding')}>{text.cta}</Link>
                </li>
                <li>
                  <Link to={screenPath('onboarding')}>{text.nav.login}</Link>
                </li>
              </ul>
            </div>
            <div>
              <h2>{text.footer.legal}</h2>
              <ul>
                <li>
                  <Link to={screenPath('privacyNotice')}>{legalText.links.privacy}</Link>
                </li>
                <li>
                  <Link to={screenPath('terms')}>{legalText.links.terms}</Link>
                </li>
              </ul>
            </div>
          </div>
          <div className="ld-footer__bottom">
            <span>{BRAND.name}</span>
            <span>{text.documentTitle}</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
