// Darte de baja de los recordatorios por correo (B15, 3.6). Pantalla pública, sin sesión, a la que lleva el enlace
// del pie del correo (/correo/baja?t=ficha). Pregunta antes de hacer nada y solo da de baja cuando se toca el
// botón. Así los revisores de enlaces de los correos, que abren cada enlace con GET, no dan de baja a nadie. La
// ficha de 144 bits al azar identifica al alumno y es lo único que viaja, en el cuerpo de un POST a la función
// email-unsubscribe, que se llama con la dirección de funciones de VITE_SUPABASE_URL (ya está en la CSP).
// Contesta done, already o invalid. Una ficha con otra forma ni se manda. Al terminar quita la ficha de la
// dirección, para que no se quede en el historial ni en un enlace copiado
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { ScreenHeader } from '@/app/layout/ScreenHeader';
import { reviewSettingsPath } from '@/features/review/settings/panelParam';
import { screenPath } from '@/app/screens';
import { UNSUBSCRIBE_TOKEN } from '@/data/cloud/engagementContracts';
import { engagementTexts } from '@/i18n/engagement';
import { t } from '@/i18n/es-MX';
import { Button } from '@/ui/components/button';
import { Card, CardHeader, CardTitle } from '@/ui/components/card';
import { requestUnsubscribe, type UnsubscribeOutcome } from './requestUnsubscribe';

const text = engagementTexts.unsubscribe;

type Step = 'ask' | 'working' | UnsubscribeOutcome;

export function UnsubscribeScreen() {
  const [params, setParams] = useSearchParams();
  const token = params.get('t') ?? '';
  // Una ficha con otra forma no sirve y se dice desde el principio, sin pedir nada al servidor
  const [step, setStep] = useState<Step>(UNSUBSCRIBE_TOKEN.test(token) ? 'ask' : 'invalid');

  const confirm = async () => {
    setStep('working');
    const outcome = await requestUnsubscribe(token);
    setStep(outcome);
    // Hecho, o la ficha no sirve: se quita de la dirección. Si falló se conserva, para reintentar
    if (outcome !== 'failed') {
      setParams(
        (current) => {
          const copy = new URLSearchParams(current);
          copy.delete('t');
          return copy;
        },
        { replace: true },
      );
    }
  };

  return (
    <>
      <ScreenHeader title={t.screens.unsubscribe.title} description={text.description} />
      <Card aria-labelledby="baja-titulo" className="max-w-reading">
        {step === 'ask' || step === 'working' || step === 'failed' ? (
          <>
            <CardHeader>
              <CardTitle id="baja-titulo">{text.question}</CardTitle>
            </CardHeader>
            {step === 'failed' ? (
              <p role="alert" className="text-sm text-danger">
                {text.failed}
              </p>
            ) : null}
            <Button
              type="button"
              className="self-start"
              disabled={step === 'working'}
              onClick={() => void confirm()}
            >
              {step === 'working' ? text.working : text.confirm}
            </Button>
          </>
        ) : (
          <>
            <CardHeader>
              <CardTitle id="baja-titulo">{text.title}</CardTitle>
            </CardHeader>
            <p role="status">
              {step === 'done' ? text.done : step === 'already' ? text.already : text.invalid}
            </p>
            <Button asChild variant="secondary" className="self-start">
              {step === 'invalid' ? (
                <Link to={reviewSettingsPath('reminders')}>{text.goToSettings}</Link>
              ) : (
                <Link to={screenPath('home')}>{text.goToApp}</Link>
              )}
            </Button>
          </>
        )}
      </Card>
    </>
  );
}
