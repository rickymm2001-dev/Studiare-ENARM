// Esta sesión, al lado de la tarjeta de repaso (D-150). Tres cifras en celdas crema, las hechas, las que
// recordaste y las que fallaste, la frase del ritmo con los minutos activos reales y, cuando ya hay
// con qué, cuánto falta a ese ritmo. Debajo siguen los tres contadores de Anki, que dicen qué queda de
// la sesión, y el XP que acaba de ganar. Nada se inventa, todo sale de la propia sesión.
import { useEffect, useState, type ReactNode } from 'react';
import type { CounterKind, DailyCounters } from '@/engines/counters';
import { t } from '@/i18n/es-MX';
import { cn } from '@/ui/cn';
import { Card, CardTitle } from '@/ui/components/card';
import { ReviewCounters } from './ReviewCounters';
import { estimateRemainingMinutes } from './sessionPace';

/** Cada cuánto se refrescan los minutos de la frase del ritmo */
const TICK_MS = 30_000;

/** Una cifra grande sobre crema con su nombre debajo, como las celdas del diseño */
export function CreamStat({
  value,
  label,
  tone = 'text-heading',
  className,
}: {
  value: ReactNode;
  label: string;
  /** Clase del color de la cifra. Marino por omisión, verde para lo bien y rojo para lo fallado */
  tone?: string;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col gap-0.5 rounded-[0.875rem] bg-cream p-3', className)}>
      <span
        className={cn('text-2xl leading-none font-extrabold tracking-tight tabular-nums', tone)}
      >
        {value}
      </span>
      <span className="text-xs text-fg-muted">{label}</span>
    </div>
  );
}

export function SessionStatsCard({
  done,
  good,
  again,
  counters,
  current,
  activeMs,
  xpText,
}: {
  /** Tarjetas calificadas en esta sesión */
  done: number;
  /** Las que recordaste, Bien o Fácil */
  good: number;
  /** Las que marcaste Otra vez */
  again: number;
  /** Lo que falta de la sesión, con la tarjeta de ahora incluida */
  counters: DailyCounters;
  current: CounterKind | null;
  /** Milisegundos activos de estudio hasta ahora. Se lee al pintar y cada medio minuto */
  activeMs: () => number;
  /** El XP que acaba de ganar, o vacío. Se anuncia al lector de pantalla */
  xpText: string;
}) {
  // Los minutos cambian aunque el alumno no califique, así que se refrescan solos de vez en cuando
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => {
      setTick((value) => value + 1);
    }, TICK_MS);
    return () => {
      window.clearInterval(timer);
    };
  }, []);
  const elapsed = activeMs();
  const remaining = counters.new + counters.learning + counters.review;
  const estimate = estimateRemainingMinutes({ activeMs: elapsed, reviewed: done, remaining });
  const text = t.review.sessionStats;
  return (
    <Card aria-labelledby="esta-sesion" className="flex flex-col gap-3">
      <CardTitle id="esta-sesion">{text.title}</CardTitle>
      <div className="grid grid-cols-3 gap-2.5">
        <CreamStat value={done.toLocaleString('es-MX')} label={text.done} />
        <CreamStat value={good.toLocaleString('es-MX')} label={text.good} tone="text-success" />
        <CreamStat value={again.toLocaleString('es-MX')} label={text.again} tone="text-danger" />
      </div>
      <p className="text-sm leading-relaxed text-fg-muted">
        {text.elapsed(Math.floor(elapsed / 60000))}
        {estimate !== null && remaining > 0 ? ` ${text.estimate(estimate)}` : ''}
      </p>
      <ReviewCounters counters={counters} current={current} />
      {/* El XP va en el acento cálido (D-128). El verde queda para lo correcto */}
      <span aria-live="polite" className="text-sm font-semibold text-accent-ink">
        {xpText}
      </span>
    </Card>
  );
}
