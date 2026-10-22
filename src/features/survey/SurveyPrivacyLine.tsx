// La línea de la encuesta en Configuración, Privacidad (B18 del plan del cambio, 1.6 y 2.5 del diseño). Es donde la
// encuentra quien escondió la franja, y donde se borra la respuesta. Con Contestar si está disponible, con Borrar mi
// respuesta si ya la contestó, y sin la línea si la encuesta está apagada o no le toca. La lee de my_survey_status, que
// decide el servidor. Borrar mi respuesta usa su propia función (delete_my_survey_response) y no Borrar mis datos: el aviso
// de privacidad lo dice. Eliminar la cuenta sí la borra, en cascada.
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useCloud } from '@/app/cloudState';
import { screenPath } from '@/app/screens';
import { loadCloud } from '@/data/cloud/client';
import { deleteMySurveyResponse } from '@/data/cloud/survey';
import { surveyTexts } from '@/i18n/survey';
import { Button } from '@/ui/components/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/ui/components/card';
import { clearDraft } from './surveyState';
import { fetchSurveyStatus, forgetSurveyStatus } from './surveyStatus';

type View = 'hidden' | 'available' | 'answered';

export function SurveyPrivacyLine() {
  const text = surveyTexts;
  const cloud = useCloud((store) => store.state);
  const userId =
    cloud.status === 'linked' && cloud.identity.role === 'student' ? cloud.identity.authId : null;
  const [view, setView] = useState<View>('hidden');
  const [confirming, setConfirming] = useState(false);
  const [erasing, setErasing] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (userId === null) return;
    let stopped = false;
    void fetchSurveyStatus(userId, { fresh: true }).then((result) => {
      if (stopped) return;
      if (!result.ok) setView('hidden');
      else
        setView(
          result.status.answered ? 'answered' : result.status.available ? 'available' : 'hidden',
        );
    });
    return () => {
      stopped = true;
    };
  }, [userId, reload]);

  if (userId === null || (view === 'hidden' && message === null)) return null;

  const erase = async () => {
    setErasing(true);
    setMessage(null);
    const cloudClient = await loadCloud();
    const result = cloudClient
      ? await deleteMySurveyResponse(cloudClient)
      : ({ ok: false, reason: 'network' } as const);
    setErasing(false);
    setConfirming(false);
    if (!result.ok) {
      setMessage({ kind: 'error', text: text.states.eraseFailed });
      return;
    }
    clearDraft(userId);
    forgetSurveyStatus(userId);
    setMessage({
      kind: 'ok',
      text: result.deleted ? text.states.erased : text.states.nothingToErase,
    });
    setReload((value) => value + 1);
  };

  return (
    <Card aria-labelledby="encuesta-privacidad-titulo" className="lg:col-span-2">
      <CardHeader>
        <CardTitle as="h3" id="encuesta-privacidad-titulo">
          {text.privacyLine.title}
        </CardTitle>
        {view !== 'hidden' ? (
          <CardDescription>
            {view === 'answered' ? text.privacyLine.answered : text.privacyLine.available}
          </CardDescription>
        ) : null}
      </CardHeader>
      {view === 'available' ? (
        <Button asChild className="self-start">
          <Link to={screenPath('survey')}>{text.actions.answer}</Link>
        </Button>
      ) : null}
      {view === 'answered' && !confirming ? (
        <Button
          variant="secondary"
          className="self-start"
          onClick={() => {
            setMessage(null);
            setConfirming(true);
          }}
        >
          {text.actions.erase}
        </Button>
      ) : null}
      {view === 'answered' && confirming ? (
        <div role="group" aria-label={text.privacyLine.confirm} className="flex flex-col gap-2">
          <p className="text-sm">{text.privacyLine.confirm}</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="danger" disabled={erasing} onClick={() => void erase()}>
              {text.actions.confirmErase}
            </Button>
            <Button
              variant="secondary"
              disabled={erasing}
              onClick={() => {
                setConfirming(false);
              }}
            >
              {text.actions.cancel}
            </Button>
          </div>
        </div>
      ) : null}
      {message ? (
        <p
          role={message.kind === 'error' ? 'alert' : 'status'}
          className={message.kind === 'error' ? 'mt-2 text-sm text-danger' : 'mt-2 text-sm'}
        >
          {message.text}
        </p>
      ) : null}
    </Card>
  );
}
