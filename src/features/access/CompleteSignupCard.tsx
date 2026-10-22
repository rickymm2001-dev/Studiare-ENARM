// Completa tu registro (B9 del plan del cambio). Un perfil que nació sin formulario, por ejemplo al entrar
// por primera vez desde Ya tengo cuenta con el correo o con Google, todavía no confirmó su edad ni aceptó
// el aviso. Antes de seguir lo hace aquí, con su alias, la especialidad que busca, cómo nos conoció y los
// permisos opcionales, igual que en el registro. Hasta guardar no se sube nada a la nube. Si no quiere,
// sale.
import { LogOut, UserCheck } from 'lucide-react';
import { useState, type SyntheticEvent } from 'react';
import { Link } from 'react-router';
import { useAccess } from '@/app/accessState';
import { useCloud } from '@/app/cloudState';
import { ScreenHeader } from '@/app/layout/ScreenHeader';
import { usePreferences } from '@/app/preferences';
import { screenPath } from '@/app/screens';
import { PRIVACY_NOTICE_VERSION } from '@/config/legal';
import { trackSignupCompleted } from '@/data/analytics/control';
import { recordPrivacyAcceptance } from '@/data/cloud/account';
import { loadCloud } from '@/data/cloud/client';
import { useDataApi } from '@/data/context';
import { useLiveData } from '@/data/hooks';
import type { Account, User } from '@/data/schemas/people';
import { completeSignup } from '@/data/usecases/account';
import { PLACEHOLDER_ALIAS } from '@/data/usecases/cloudLink';
import { decideAllConsents, updateProfile } from '@/data/usecases/profile';
import { markTourPending } from '@/features/tour/steps';
import { t } from '@/i18n/es-MX';
import { legalText } from '@/i18n/legal';
import { Button } from '@/ui/components/button';
import { Card } from '@/ui/components/card';
import { CheckboxField, TextField } from '@/ui/components/field';
import { LoadingState } from '@/ui/states/states';
import {
  AdultConfirmField,
  HeardFromFields,
  OptionalConsentsFields,
  TargetSpecialtyField,
} from '../shared/SignupFields';
import {
  EMPTY_HEARD_FROM,
  NO_CONSENTS,
  heardFromOf,
  type HeardFromDraft,
} from '../shared/signupDraft';

export function CompleteSignupCard({ userId }: { userId: string }) {
  const api = useDataApi();
  const data = useLiveData(async () => {
    const [user, account] = await Promise.all([
      api.repos.users.get(userId),
      api.repos.accounts.get(userId),
    ]);
    return user && account ? { user, account } : null;
  }, [api.repos, userId]);
  if (data === null) return null;
  if (data === undefined) return <LoadingState />;
  // El formulario empieza con la especialidad que ya tiene el perfil y con el alias solo si el alumno
  // ya eligió uno, por ejemplo en Crear cuenta en otro dispositivo. El de relleno no se muestra
  return <CompleteSignupForm user={data.user} account={data.account} />;
}

function CompleteSignupForm({ user, account }: { user: User; account: Account }) {
  const api = useDataApi();
  const text = t.accounts.completeSignup;
  const signIn = usePreferences((state) => state.signIn);
  const signOut = usePreferences((state) => state.signOut);
  const finishSignup = useAccess((store) => store.finishSignup);
  const cloudState = useCloud((store) => store.state);
  const [alias, setAlias] = useState(user.alias === PLACEHOLDER_ALIAS ? '' : user.alias);
  const [specialty, setSpecialty] = useState(account.targetSpecialty);
  const [heardFrom, setHeardFrom] = useState<HeardFromDraft>(EMPTY_HEARD_FROM);
  const [consents, setConsents] = useState(NO_CONSENTS);
  const [adult, setAdult] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [status, setStatus] = useState<'idle' | 'saving' | 'failed'>('idle');

  const aliasError =
    alias.trim().length < 1 || alias.trim().length > 40 ? t.onboarding.aliasError : null;
  const answer = heardFromOf(heardFrom);

  const onSubmit = async (event: SyntheticEvent) => {
    event.preventDefault();
    setSubmitted(true);
    if (aliasError || !adult || !privacy || answer === 'invalid' || status === 'saving') return;
    setStatus('saving');
    try {
      if (alias.trim() !== user.alias) await updateProfile(api, user, { alias: alias.trim() });
      // La especialidad entra como la del registro, sin fecha, y no pisa la de la nube (H29)
      await completeSignup(api, account, {
        adultConfirmedAt: new Date().toISOString(),
        heardFrom: answer,
        targetSpecialty: specialty,
      });
      // Aquí acepta el aviso. Cada finalidad queda bajo esta versión, prendida solo si la marcó (4.27)
      await decideAllConsents(api, user, consents);
      // La aceptación del aviso queda también en la nube, como al registrarse. Si la red falla, el
      // puente la registra al subir la cuenta, con la versión que quedó en este perfil
      if (cloudState.status === 'linked') {
        try {
          const cloud = await loadCloud();
          if (cloud) {
            await recordPrivacyAcceptance(
              cloud,
              cloudState.identity.authId,
              PRIVACY_NOTICE_VERSION,
            );
          }
        } catch {
          // Sigue. Lo de este navegador ya quedó guardado
        }
      }
      // Una cuenta nueva que acaba de completar su registro (B15, 1.5 y 4.1). Sin cómo nos conoció (D-132)
      trackSignupCompleted(consents.product_analytics, {
        method:
          cloudState.status === 'linked' && cloudState.identity.provider === 'google'
            ? 'google'
            : 'email',
        target_specialty_set: Boolean(specialty),
      });
      markTourPending(user.id);
      // Ya con su registro, este navegador abre su perfil y el puente sube la cuenta y sincroniza
      signIn(user.id);
      finishSignup();
    } catch {
      setStatus('failed');
    }
  };

  return (
    <>
      <ScreenHeader title={text.title} description={text.description} />
      <Card aria-label={text.title} className="max-w-reading">
        <form className="flex flex-col gap-4" noValidate onSubmit={(event) => void onSubmit(event)}>
          <TextField
            label={t.onboarding.alias}
            hint={t.onboarding.aliasHint}
            value={alias}
            maxLength={40}
            autoComplete="nickname"
            error={submitted ? aliasError : null}
            onChange={(event) => {
              setAlias(event.target.value);
            }}
          />
          <TargetSpecialtyField value={specialty} onChange={setSpecialty} />
          <HeardFromFields value={heardFrom} onChange={setHeardFrom} showErrors={submitted} />
          <OptionalConsentsFields value={consents} onChange={setConsents} />
          <section
            aria-labelledby="completa-aviso"
            className="flex flex-col gap-2 rounded-md bg-muted p-3"
          >
            <h2 id="completa-aviso" className="font-semibold">
              {t.onboarding.privacyTitle}
            </h2>
            <p className="text-sm text-fg-muted">{t.onboarding.privacyBody}</p>
            <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
              <Link
                to={screenPath('privacyNotice')}
                target="_blank"
                rel="noopener"
                className="underline underline-offset-4"
              >
                {legalText.onboarding.read}
                <span className="sr-only"> ({legalText.onboarding.newTab})</span>
              </Link>
              <Link
                to={screenPath('terms')}
                target="_blank"
                rel="noopener"
                className="underline underline-offset-4"
              >
                {legalText.onboarding.readTerms}
                <span className="sr-only"> ({legalText.onboarding.newTab})</span>
              </Link>
            </p>
            <AdultConfirmField checked={adult} onChange={setAdult} showError={submitted} />
            <CheckboxField
              label={t.onboarding.privacyAccept}
              checked={privacy}
              onChange={(event) => {
                setPrivacy(event.target.checked);
              }}
            />
            {submitted && !privacy ? (
              <p className="text-sm text-danger" role="alert">
                {t.onboarding.privacyError}
              </p>
            ) : null}
          </section>
          {status === 'failed' ? (
            <p role="alert" className="text-sm text-danger">
              {text.failed}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={status === 'saving'}>
              <UserCheck aria-hidden />
              {status === 'saving' ? text.saving : text.save}
            </Button>
            <Button type="button" variant="secondary" onClick={signOut}>
              <LogOut aria-hidden />
              {text.signOut}
            </Button>
          </div>
        </form>
      </Card>
    </>
  );
}
