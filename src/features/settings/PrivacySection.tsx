// Configuración, sección Privacidad (Fase E bloque E6, D-101, B3 del plan del cambio). El alumno da
// o retira cada consentimiento por separado cuando quiera, lee el aviso de privacidad, exporta sus
// datos y borra sus datos o su cuenta. La captura del puntaje oficial pasó a Progreso y su permiso,
// la mejora anónima, se queda aquí.
import { useState } from 'react';
import { Link } from 'react-router';
import { screenPath } from '@/app/screens';
import { useDataApi } from '@/data/context';
import { useLiveData } from '@/data/hooks';
import type { ConsentPurposeSchema } from '@/data/schemas/common';
import { changeConsent } from '@/data/usecases/privacy';
import { currentConsents } from '@/data/usecases/profile';
import { t } from '@/i18n/es-MX';
import { legalText } from '@/i18n/legal';
import { Card, CardDescription, CardHeader, CardTitle } from '@/ui/components/card';
import { CheckboxField } from '@/ui/components/field';
import { afterPartyConsentChange } from '../party/cloudConsent';
import type { ReadySession } from '../shared/RequireSession';
import { DataSection } from './DataSection';
import type { z } from 'zod';

type Purpose = z.infer<typeof ConsentPurposeSchema>;
const PURPOSES: readonly Purpose[] = ['party', 'ai_analysis', 'anonymized_improvement'];

export function PrivacySection({ session }: { session: ReadySession }) {
  return (
    <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-2">
      <ConsentsCard session={session} />
      <DataSection session={session} />
    </div>
  );
}

function ConsentsCard({ session }: { session: ReadySession }) {
  const api = useDataApi();
  const { user } = session;
  const consents = useLiveData(() => currentConsents(api, user.id), [api.repos, user.id]);
  const [status, setStatus] = useState('');
  // Lo que el alumno acaba de pedir se muestra de inmediato y vale mientras la lectura de la base sea
  // la misma de antes del cambio. Cuando la base responde, la lectura es otra y manda ella
  const [asked, setAsked] = useState<{
    purpose: Purpose;
    granted: boolean;
    base: typeof consents;
  } | null>(null);
  const shown = (purpose: Purpose) =>
    asked?.purpose === purpose && asked.base === consents ? asked.granted : consents?.[purpose];
  return (
    <Card aria-labelledby="consentimientos-titulo">
      <CardHeader>
        <CardTitle as="h3" id="consentimientos-titulo">
          {t.settings.privacy.consentsTitle}
        </CardTitle>
        <CardDescription>{t.settings.privacy.consentsDescription}</CardDescription>
      </CardHeader>
      <fieldset className="flex flex-col gap-3">
        <legend className="sr-only">{t.settings.privacy.consentsTitle}</legend>
        {PURPOSES.map((purpose) => {
          const [label, hint] = t.onboarding.consents[purpose];
          return (
            <CheckboxField
              key={purpose}
              label={label}
              hint={
                purpose === 'anonymized_improvement'
                  ? `${hint} ${t.settings.privacy.revokeScoreWarning}`
                  : hint
              }
              checked={shown(purpose) ?? false}
              disabled={consents === undefined}
              onChange={(event) => {
                const granted = event.target.checked;
                setStatus('');
                setAsked({ purpose, granted, base: consents });
                changeConsent(api, user, purpose, granted).then(
                  async () => {
                    // Retirar el permiso de Party saca de los grupos de la nube (B7)
                    if (purpose === 'party') await afterPartyConsentChange(granted);
                    setStatus(t.settings.privacy.consentSaved);
                  },
                  () => {
                    setAsked(null);
                    setStatus(t.settings.privacy.consentError);
                  },
                );
              }}
            />
          );
        })}
      </fieldset>
      <p role="status" className="text-sm text-fg-muted">
        {status}
      </p>
      <p className="text-sm text-fg-muted">
        {t.settingsPage.privacy.scoreInProgress}{' '}
        <Link
          to={screenPath('progress')}
          className="font-semibold text-primary-ink underline underline-offset-2"
        >
          {t.settingsPage.privacy.goToProgress}
        </Link>
      </p>
      <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        <Link to={screenPath('privacyNotice')} className="underline underline-offset-4">
          {legalText.links.privacy}
        </Link>
        <Link to={screenPath('terms')} className="underline underline-offset-4">
          {legalText.links.terms}
        </Link>
      </p>
    </Card>
  );
}
