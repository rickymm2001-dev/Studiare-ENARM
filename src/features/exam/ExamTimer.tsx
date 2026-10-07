// Reloj del examen. Tiene su propio segundo para que la pantalla no se vuelva a pintar completa cada
// vez que cambia. Pasa a ámbar con 10 minutos y a rojo con 1, y siempre dice el tiempo con texto.
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
        'flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-bold tabular-nums',
        remaining < 60_000
          ? 'border-danger bg-danger-soft text-danger'
          : remaining < 10 * 60_000
            ? 'border-warning bg-warning-soft text-warning'
            : 'border-line bg-surface text-fg',
      )}
    >
      <Timer aria-hidden className="size-4" />
      <span aria-hidden>{text}</span>
    </span>
  );
}
