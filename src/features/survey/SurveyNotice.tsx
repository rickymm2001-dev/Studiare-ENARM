// La franja que ofrece la encuesta de los primeros días (B18 del plan del cambio, 1.2 y 8.2 del diseño). Va arriba, junto
// a los demás avisos, con tres botones. Contestar abre la pantalla. Ahora no la esconde 2 días en este dispositivo y, tras
// tres veces, ya no sale sola. No quiero contestarla la esconde para siempre en este dispositivo. Quien la quiera después
// la encuentra en Configuración, Privacidad.
//
// Solo se ve si el servidor dice que le toca a esta cuenta (my_survey_status). La app no lo adivina. Nunca aparece
// dentro de una pregunta, un examen ni un repaso, y ahí ni siquiera se monta, así que no pide nada al servidor
// (SurveyNoticeLauncher). Con Medición de uso manda survey_shown una vez por carga y survey_dismissed con how igual a
// later o never. Nunca viaja una respuesta ni un comentario.
import { ClipboardList } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { screenPath } from '@/app/screens';
import { track } from '@/data/analytics/catalog';
import { surveyTexts } from '@/i18n/survey';
import { Button } from '@/ui/components/button';
import { isHiddenNow, markShown, neverAsk, readHiding, snooze, writeHiding } from './surveyState';
import { fetchSurveyStatus } from './surveyStatus';

export function SurveyNotice({ userId, className = '' }: { userId: string; className?: string }) {
  const text = surveyTexts.notice;
  // Si la persona la escondió en este dispositivo, no se le pide nada al servidor. El lanzador monta esta franja con la
  // cuenta como llave, así que otra cuenta la vuelve a leer
  const [hidden, setHidden] = useState(() => isHiddenNow(readHiding(userId), Date.now()));
  const [offered, setOffered] = useState(false);

  useEffect(() => {
    if (hidden) return;
    let stopped = false;
    void fetchSurveyStatus(userId).then((result) => {
      if (stopped) return;
      const show = result.ok && result.status.available;
      if (show && markShown(userId)) track('survey_shown', {});
      setOffered(show);
    });
    return () => {
      stopped = true;
    };
  }, [userId, hidden]);

  if (hidden || !offered) return null;

  const hide = (how: 'later' | 'never') => {
    const hiding = readHiding(userId);
    writeHiding(userId, how === 'later' ? snooze(hiding, Date.now()) : neverAsk(hiding));
    track('survey_dismissed', { how });
    setHidden(true);
    // El botón desaparece. El foco pasa al contenido para que teclado y lector de pantalla no se pierdan
    document.getElementById('contenido')?.focus();
  };

  return (
    <section
      aria-label={text.region}
      className={`flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line bg-muted px-4 py-3 text-sm text-fg ${className}`}
    >
      <ClipboardList aria-hidden className="size-5 shrink-0 text-fg-muted" />
      <div className="min-w-0 flex-1 basis-60">
        <p className="font-semibold">{text.title}</p>
        <p>{text.body}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button asChild>
          <Link to={screenPath('survey')}>{surveyTexts.actions.answer}</Link>
        </Button>
        <Button
          variant="secondary"
          aria-label={text.laterLabel}
          onClick={() => {
            hide('later');
          }}
        >
          {surveyTexts.actions.later}
        </Button>
        <Button
          variant="ghost"
          aria-label={text.neverLabel}
          onClick={() => {
            hide('never');
          }}
        >
          {surveyTexts.actions.never}
        </Button>
      </div>
    </section>
  );
}
