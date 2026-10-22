// Aviso de la mudanza de la demo de GitHub Pages (B17, 3.4). Dice a qué dirección se mueve Studiare y qué hacer
// antes, con cuenta y sin ella. Aparece solo si el build trae VITE_MOVED_TO y VITE_MOVED_ON, que solo pone el
// flujo de Pages catorce días antes de la mudanza. Se puede cerrar por el día. MovedNoticeLauncher lo carga con lazy
import { ArrowRightLeft } from 'lucide-react';
import { useState } from 'react';
import { movedTexts } from '@/i18n/moved';
import { Button } from '@/ui/components/button';
import { dayKey, dismissForToday, isDismissedToday, movedNoticeOf } from './movedNotice';

export function MovedNotice({ className = '' }: { className?: string }) {
  const [now] = useState(() => new Date());
  const today = dayKey(now);
  const [info] = useState(() => movedNoticeOf(import.meta.env, now));
  const [hidden, setHidden] = useState(() => isDismissedToday(today));
  if (info === null || hidden) return null;

  return (
    <section
      aria-label={movedTexts.title}
      className={`flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line bg-muted px-4 py-3 text-sm text-fg ${className}`}
    >
      <ArrowRightLeft aria-hidden className="size-5 shrink-0 text-fg-muted" />
      <div className="min-w-0 flex-1 basis-60">
        <p className="font-semibold">{movedTexts.title}</p>
        <p>
          {info.arrived
            ? movedTexts.after(info.host)
            : movedTexts.before(info.host, info.dateLabel)}
        </p>
      </div>
      <Button asChild size="sm" variant="secondary">
        <a href={info.url} rel="noopener">
          {movedTexts.go(info.host)}
        </a>
      </Button>
      <Button
        size="sm"
        variant="ghost"
        aria-label={movedTexts.dismissLabel}
        onClick={() => {
          dismissForToday(today);
          setHidden(true);
        }}
      >
        {movedTexts.dismiss}
      </Button>
    </section>
  );
}
