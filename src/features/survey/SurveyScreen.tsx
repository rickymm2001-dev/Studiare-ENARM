// La encuesta de los primeros días (pantalla 41, B18 del plan del cambio, 1.1 a 1.6 del diseño). La abre un alumno con
// la cuenta de la nube desde la franja de arriba o desde Configuración, Privacidad. Quien decide si le toca es el
// servidor (my_survey_status), no la app. Es corta, opcional y se contesta una sola vez, y la pantalla dice que no depende
// de ningún permiso de Privacidad y que se guarda con un código y sin nombre ni correo. El formulario baja aparte, con lazy.
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { useCloud } from '@/app/cloudState';
import { ScreenHeader } from '@/app/layout/ScreenHeader';
import { screenPath } from '@/app/screens';
import { track } from '@/data/analytics/catalog';
import { surveyTexts } from '@/i18n/survey';
import { t } from '@/i18n/es-MX';
import { Button } from '@/ui/components/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/ui/components/card';
import { LoadingState } from '@/ui/states/states';
import { RequireSession } from '../shared/RequireSession';
import { markShown } from './surveyState';
import { fetchSurveyStatus } from './surveyStatus';
import type { SurveyOutcome } from './SurveyForm';

// El formulario baja aparte de la pantalla. Si su archivo no llega, como sin red antes de que el service worker lo guarde,
// la pantalla lo dice en lugar de quedarse en blanco
const SurveyForm = lazy(() =>
  import('./SurveyForm').then(
    (module) => ({ default: module.SurveyForm }),
    () => ({ default: FormNotLoaded }),
  ),
);

function FormNotLoaded() {
  return (
    <p role="alert" className="text-sm text-danger">
      {surveyTexts.states.formNotLoaded}
    </p>
  );
}

type View =
  'loading' | 'failed' | 'device' | 'form' | 'sent' | 'already' | 'unavailable' | 'closed';

export function SurveyScreen() {
  return <RequireSession screen="survey">{() => <SurveyBody />}</RequireSession>;
}

function SurveyBody() {
  const text = surveyTexts;
  const cloud = useCloud((store) => store.state);
  const userId = cloud.status === 'linked' ? cloud.identity.authId : null;
  const isStudent = cloud.status === 'linked' && cloud.identity.role === 'student';
  const [view, setView] = useState<View>('loading');
  const [attempt, setAttempt] = useState(0);
  const thanksRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (userId === null || !isStudent) return;
    let stopped = false;
    void fetchSurveyStatus(userId, { fresh: true }).then((result) => {
      if (stopped) return;
      if (!result.ok) {
        setView(
          result.reason === 'inactive_device' || result.reason === 'no_session'
            ? 'device'
            : 'failed',
        );
        return;
      }
      if (result.status.answered) setView('already');
      else if (result.status.available) {
        if (markShown(userId)) track('survey_shown', {});
        setView('form');
      } else setView('unavailable');
    });
    return () => {
      stopped = true;
    };
  }, [userId, isStudent, attempt]);

  // Al enviar, el foco pasa a la confirmación para que teclado y lector de pantalla no se pierdan
  useEffect(() => {
    if (view === 'sent') thanksRef.current?.focus();
  }, [view]);

  const done = useCallback((outcome: SurveyOutcome) => {
    setView(outcome === 'sent' ? 'sent' : outcome);
  }, []);

  const header = <ScreenHeader title={t.screens.survey.title} />;
  const home = (
    <Button asChild variant="secondary" className="self-start">
      <Link to={screenPath('home')}>{text.actions.backHome}</Link>
    </Button>
  );

  // Sin la cuenta de la nube, o con una cuenta del equipo, no hay encuesta que contestar
  if (userId === null || !isStudent) {
    const needsCloud = userId === null;
    return (
      <>
        {header}
        <Card aria-labelledby="encuesta-titulo" className="max-w-reading">
          <CardHeader>
            <CardTitle id="encuesta-titulo">
              {needsCloud ? text.states.needsCloud : text.states.unavailable}
            </CardTitle>
            <CardDescription>
              {needsCloud ? text.states.needsCloudBody : text.states.unavailableBody}
            </CardDescription>
          </CardHeader>
          {home}
        </Card>
      </>
    );
  }

  return (
    <>
      {header}
      <Card aria-labelledby="encuesta-titulo" className="max-w-reading">
        {view === 'loading' ? <LoadingState label={text.states.loading} /> : null}

        {view === 'failed' || view === 'device' ? (
          <>
            <CardHeader>
              <CardTitle id="encuesta-titulo">{text.title}</CardTitle>
            </CardHeader>
            <p role="alert" className="text-sm text-danger">
              {view === 'device' ? text.states.notActiveDevice : text.states.loadFailed}
            </p>
            {view === 'failed' ? (
              <Button
                variant="secondary"
                className="self-start"
                onClick={() => {
                  setView('loading');
                  setAttempt((value) => value + 1);
                }}
              >
                {text.actions.retry}
              </Button>
            ) : null}
          </>
        ) : null}

        {view === 'form' ? (
          <>
            <CardHeader>
              <CardTitle id="encuesta-titulo">{text.title}</CardTitle>
              <CardDescription>{text.intro}</CardDescription>
            </CardHeader>
            <div className="mb-5 flex flex-col gap-2 text-sm text-fg-muted">
              <p>{text.privacy}</p>
              <p>{text.independent}</p>
              <p>{text.erase}</p>
            </div>
            <Suspense fallback={<LoadingState label={text.states.loading} />}>
              <SurveyForm userId={userId} onDone={done} />
            </Suspense>
          </>
        ) : null}

        {view === 'sent' ? (
          <>
            <CardHeader>
              <CardTitle id="encuesta-titulo">
                <span ref={thanksRef} tabIndex={-1} className="outline-none">
                  {text.states.sent}
                </span>
              </CardTitle>
              <CardDescription role="status">{text.states.sentBody}</CardDescription>
            </CardHeader>
            {home}
          </>
        ) : null}

        {view === 'already' || view === 'unavailable' || view === 'closed' ? (
          <>
            <CardHeader>
              <CardTitle id="encuesta-titulo">{text.states[view]}</CardTitle>
              <CardDescription>{text.states[`${view}Body`]}</CardDescription>
            </CardHeader>
            {home}
          </>
        ) : null}
      </Card>
    </>
  );
}
