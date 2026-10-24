// Reloj del examen. Tiene su propio segundo para que la pantalla no se vuelva a pintar completa cada
// vez que cambia. Píldora cielo con el tiempo en blanco y negritas de 19 px, como en la portada (D-150).
// Pasa al tinte de aviso con 10 minutos y al de peligro con 1, y siempre dice el tiempo con texto.
import { Timer } from 'lucide-react';
import { useEffect, useState } from 'react';
import { t } from '@/i18n/es-MX';
import { cn } from '@/ui/cn';
import { clock } from '../simulator/practice';
import { formatClock } from './clock';

export function ExamTimer({ startedAtMs, totalMs }: { startedAtMs: number; totalMs: number }) {
  const [now, setNow] = useState(() => clock());
  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(clock());
    }, 1000);
    return () => {
      window.clearInterval(timer);
    };
  }, []);
  const remaining = Math.max(0, startedAtMs + totalMs - now);
  const text = formatClock(remaining);
  return (
    <span
      role="timer"
      aria-label={t.exam.timeLeftValue(text)}
      className={cn(
        'inline-flex min-h-9 items-center gap-2 rounded-full border px-3.5 text-2xl leading-none font-bold tracking-tight tabular-nums',
        remaining < 60_000
          ? 'border-danger bg-danger-soft text-danger'
          : remaining < 10 * 60_000
            ? 'border-warning bg-warning-soft text-warning'
            : 'border-indicator bg-indicator text-white',
      )}
    >
      <Timer aria-hidden className="size-5" />
      <span aria-hidden>{text}</span>
    </span>
  );
}
