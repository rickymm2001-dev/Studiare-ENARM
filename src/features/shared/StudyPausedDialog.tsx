// Aviso de estudio en pausa (D-063). Sale tras 2.5 minutos sin actividad. El tiempo en pausa no
// cuenta como estudio.
import { Coffee, Play, Square } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { t } from '@/i18n/es-MX';
import { Button } from '@/ui/components/button';

export function StudyPausedDialog({
  minutes,
  onResume,
  onFinish,
}: {
  minutes: number;
  onResume: () => void;
  onFinish: () => void;
}) {
  const resumeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    resumeRef.current?.focus();
  }, []);
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="pausa-titulo"
        aria-describedby="pausa-texto"
        className="animate-pop flex w-full max-w-sm flex-col items-center gap-4 rounded-xl border border-line bg-surface p-6 text-center shadow-raised"
      >
        <span className="flex size-14 items-center justify-center rounded-full bg-accent-soft text-accent">
          <Coffee aria-hidden className="size-7" />
        </span>
        <h2 id="pausa-titulo" className="text-xl font-extrabold">
          {t.studyPause.title}
        </h2>
        <p id="pausa-texto" className="text-fg-muted">
          {t.studyPause.body(Math.max(0, Math.round(minutes)))}
        </p>
        <div className="flex w-full flex-col gap-2">
          <Button ref={resumeRef} onClick={onResume}>
            <Play aria-hidden />
            {t.studyPause.resume}
          </Button>
          <Button variant="secondary" onClick={onFinish}>
            <Square aria-hidden />
            {t.studyPause.finish}
          </Button>
        </div>
      </div>
    </div>
  );
}
