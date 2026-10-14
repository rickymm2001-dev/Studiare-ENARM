// Bienvenida (pantalla 1, D-059, D-068). Página aparte, sin navegación. Crear cuenta con alias,
// correo, meta diaria, especialidad, datos opcionales, permisos opcionales, la edad mínima y un solo
// aviso de privacidad, o entrar con el correo. Con Supabase configurado la cuenta también se guarda en
// la nube y se entra con un enlace al correo, sin contraseña (D-075), o con Google cuando la bandera
// googleSignIn está prendida (B9). Mientras el registro esté cerrado solo entran los correos
// invitados, y lo decide el servidor. Sin Supabase la cuenta vive solo en este navegador (D-060).
import { LogIn, MailCheck, UserPlus } from 'lucide-react';
import { useEffect, useRef, useState, type SyntheticEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { useCloud } from '@/app/cloudState';
import { ScreenHeader } from '@/app/layout/ScreenHeader';
import { usePreferences } from '@/app/preferences';
import { screenPath } from '@/app/screens';
import { isFeatureEnabled } from '@/config/featureFlags';
import { requestEmailLink, type LinkResult } from '@/data/cloud/account';
import { cloudConfigured, loadCloud } from '@/data/cloud/client';
import { readRegistrationOpen } from '@/data/cloud/invitations';
import { signInWithGoogle } from '@/data/cloud/oauth';
import { clearPendingSignup, savePendingSignup } from '@/data/cloud/pendingSignup';
import { useDataApi } from '@/data/context';
import { useLiveData } from '@/data/hooks';
import { AccountSchema } from '@/data/schemas/people';
import {
  EMPTY_DETAILS,
  findAccountByEmail,
  registerAccount,
  type AccountDetails,
} from '@/data/usecases/account';
import { t } from '@/i18n/es-MX';
import { legalText } from '@/i18n/legal';
import { celebrate } from '@/ui/celebrate';
import { cn } from '@/ui/cn';
import { Button } from '@/ui/components/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/ui/components/card';
import { CheckboxField, SelectField, TextField } from '@/ui/components/field';
import { segmentedItem, segmentedList } from '@/ui/components/segmented-classes';
import { AccountDetailsFields } from '../profile/AccountDetailsFields';
import { EmailCodeForm } from '../shared/EmailCodeForm';
import { GoogleSignInButton } from '../shared/GoogleSignInButton';
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

type GoalMetric = 'cards' | 'questions' | 'focusMinutes';
const GOAL_DEFAULTS: Record<GoalMetric, number> = { cards: 20, questions: 10, focusMinutes: 15 };
const validEmail = (email: string) => AccountSchema.shape.email.safeParse(email.trim()).success;
/** A dónde regresa el enlace del correo o Google. La raíz de la app, con o sin dominio propio */
const redirectTo = () => new URL(import.meta.env.BASE_URL, window.location.origin).toString();
/** Entrar con Google solo con la nube configurada y la bandera prendida (B9) */
const googleEnabled = () => cloudConfigured() && isFeatureEnabled('googleSignIn');

async function sendLink(email: string, alias?: string): Promise<LinkResult | null> {
  const cloud = await loadCloud();
  // null es que la nube no está configurada. Si lo está y el SDK no se pudo bajar, es una falla
  if (!cloud) return cloudConfigured() ? { ok: false, reason: 'failed' } : null;
  return requestEmailLink(cloud, {
    email: email.trim().toLowerCase(),
    ...(alias ? { alias } : {}),
    redirectTo: redirectTo(),
  });
}

/**
 * Sale a Google. Solo vuelve si no se pudo abrir. signInWithGoogle marca la salida en esta pestaña, así
 * un error al volver se lee como de Google y no como del enlace del correo
 */
async function goToGoogle(): Promise<boolean> {
  const cloud = await loadCloud();
  if (!cloud) return false;
  return (await signInWithGoogle(cloud, redirectTo())).ok;
}

/**
 * Si el registro está cerrado para quien no tiene invitación. null mientras no se sabe o sin la nube.
 * Solo sirve para avisarlo antes. Quien decide es el servidor
 */
function useRegistrationClosed(): boolean | null {
  const [closed, setClosed] = useState<boolean | null>(null);
  useEffect(() => {
    if (!cloudConfigured()) return;
    let stopped = false;
    void loadCloud()
      .then((cloud) => (cloud ? readRegistrationOpen(cloud) : null))
      .then((open) => {
        if (!stopped && open !== null) setClosed(!open);
      });
    return () => {
      stopped = true;
    };
  }, []);
  return closed;
}

export function OnboardingScreen() {
  const api = useDataApi();
  const navigate = useNavigate();
  const signIn = usePreferences((state) => state.signIn);
  const [tab, setTab] = useState<'create' | 'login'>('create');

  if (api.repos.kind === 'demo') {
    return (
      <>
        <ScreenHeader title={t.screens.onboarding.title} description={t.onboarding.demoNote} />
        <Button asChild className="self-start">
          <Link to={screenPath('home')}>{t.onboarding.goHome}</Link>
        </Button>
      </>
    );
  }

  const enter = (userId: string) => {
    signIn(userId);
    celebrate('small');
    void navigate(screenPath('home'));
  };
  // Con el código del correo, la sesión local la abre el puente de la nube al unir la cuenta
  const enterLinked = () => {
    celebrate('small');
    void navigate(screenPath('home'));
  };

  return (
    <>
      <ScreenHeader title={t.screens.onboarding.title} description={t.onboarding.intro} />
      {/* Mismas pestañas que el resto de la app (H01 de la revisión de B2), a todo lo ancho */}
      <div role="tablist" aria-label={t.onboarding.tabs} className={cn(segmentedList, 'flex')}>
        {(['create', 'login'] as const).map((value) => (
          <button
            key={value}
            role="tab"
            type="button"
            aria-selected={tab === value}
            onClick={() => {
              setTab(value);
            }}
            className={segmentedItem(tab === value, 'flex-1')}
          >
            {value === 'create' ? t.onboarding.createTab : t.onboarding.loginTab}
          </button>
        ))}
      </div>
      {tab === 'create' ? (
        <CreateAccountForm onCreated={enter} />
      ) : (
        <LoginForm onFound={enter} onLinked={enterLinked} />
      )}
      <p className="text-center text-xs text-fg-muted">
        {cloudConfigured() ? t.cloud.loginNote : t.session.simulatedLogin}
      </p>
    </>
  );
}

/** Separador entre el botón principal y el de Google */
function OrDivider() {
  return (
    <p className="flex items-center gap-3 text-sm text-fg-muted" aria-hidden>
      <span className="h-px flex-1 bg-line" />
      {t.accounts.signup.or}
      <span className="h-px flex-1 bg-line" />
    </p>
  );
}

function CreateAccountForm({ onCreated }: { onCreated: (userId: string) => void }) {
  const api = useDataApi();
  const [alias, setAlias] = useState('');
  const [email, setEmail] = useState('');
  const [goalMetric, setGoalMetric] = useState<GoalMetric>('cards');
  const [goalValue, setGoalValue] = useState(String(GOAL_DEFAULTS.cards));
  const [details, setDetails] = useState<AccountDetails>(EMPTY_DETAILS);
  const [heardFrom, setHeardFrom] = useState<HeardFromDraft>(EMPTY_HEARD_FROM);
  const [consents, setConsents] = useState(NO_CONSENTS);
  const [adult, setAdult] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  // Con qué botón intentó crear la cuenta. El correo solo se pide con el de correo
  const [submitted, setSubmitted] = useState<'email' | 'google' | null>(null);
  const [busy, setBusy] = useState<'email' | 'google' | null>(null);
  const [taken, setTaken] = useState(false);
  const [problem, setProblem] = useState<'invitation' | 'google' | null>(null);
  const [sent, setSent] = useState<{ userId: string; result: LinkResult } | null>(null);
  const registrationClosed = useRegistrationClosed();
  const google = googleEnabled();

  const aliasError =
    alias.trim().length < 1 || alias.trim().length > 40 ? t.onboarding.aliasError : null;
  const emailError = taken ? t.account.emailTaken : validEmail(email) ? null : t.account.emailError;
  const privacyError = privacy ? null : t.onboarding.privacyError;
  const answer = heardFromOf(heardFrom);
  // Lo que pide el registro con correo y con Google. El correo solo se pide para el primero
  const formReady = !aliasError && !privacyError && adult && answer !== 'invalid';
  const dailyGoal = { metric: goalMetric, value: Math.max(1, Number(goalValue) || 1) };
  const signupExtras = () => ({
    adultConfirmedAt: new Date().toISOString(),
    heardFrom: answer === 'invalid' ? null : answer,
    consents,
  });

  const showErrors = submitted !== null;

  const onSubmit = async (event: SyntheticEvent) => {
    event.preventDefault();
    setSubmitted('email');
    setProblem(null);
    if (!formReady || emailError) return;
    setBusy('email');
    try {
      if (await findAccountByEmail(api, email)) {
        setTaken(true);
        return;
      }
      // Primero el correo, porque sin invitación el servidor no crea la cuenta y tampoco se crea aquí
      const link = await sendLink(email, alias.trim());
      if (link && !link.ok && link.reason === 'invitation_required') {
        setProblem('invitation');
        return;
      }
      const result = await registerAccount(api, {
        alias: alias.trim(),
        email,
        dailyGoal,
        details,
        signup: signupExtras(),
      });
      if (!result.ok) {
        setTaken(true);
        return;
      }
      if (link) setSent({ userId: result.user.id, result: link });
      else onCreated(result.user.id);
    } finally {
      setBusy(null);
    }
  };

  const onGoogle = async () => {
    setSubmitted('google');
    setProblem(null);
    if (!formReady) return;
    setBusy('google');
    // Lo que llenó espera en esta pestaña mientras va a Google. Si el navegador no deja guardarlo, al
    // volver se le pide completar el registro
    savePendingSignup({
      alias: alias.trim(),
      dailyGoal,
      details: {
        birthYear: details.birthYear,
        sex: details.sex,
        state: details.state,
        situation: details.situation,
        attempt: details.attempt,
        targetSpecialty: details.targetSpecialty,
        avatar: details.avatar,
      },
      ...signupExtras(),
    });
    if (!(await goToGoogle())) {
      clearPendingSignup();
      setProblem('google');
      setBusy(null);
    }
  };

  if (sent) {
    return (
      <LinkSentCard
        email={email}
        result={sent.result}
        onContinue={() => {
          onCreated(sent.userId);
        }}
        onCode={() => {
          onCreated(sent.userId);
        }}
      />
    );
  }

  return (
    <Card aria-labelledby="crear-titulo">
      <CardHeader>
        <CardTitle id="crear-titulo">{t.onboarding.createTitle}</CardTitle>
        <CardDescription>{t.onboarding.createDescription}</CardDescription>
      </CardHeader>
      {registrationClosed ? (
        <p className="mb-4 rounded-md bg-muted p-3 text-sm">{t.accounts.signup.invitationOnly}</p>
      ) : null}
      <form className="flex flex-col gap-4" noValidate onSubmit={(event) => void onSubmit(event)}>
        <TextField
          label={t.onboarding.alias}
          hint={t.onboarding.aliasHint}
          value={alias}
          maxLength={40}
          autoComplete="nickname"
          error={showErrors ? aliasError : null}
          onChange={(event) => {
            setAlias(event.target.value);
          }}
        />
        <TextField
          label={t.account.email}
          hint={t.account.emailHint}
          type="email"
          value={email}
          maxLength={254}
          autoComplete="email"
          inputMode="email"
          error={submitted === 'email' ? emailError : null}
          onChange={(event) => {
            setEmail(event.target.value);
            setTaken(false);
            setProblem(null);
          }}
        />
        {/* La especialidad va a la vista, porque con ella se compara al alumno (B14) */}
        <TargetSpecialtyField
          value={details.targetSpecialty}
          onChange={(targetSpecialty) => {
            setDetails({ ...details, targetSpecialty });
          }}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <SelectField
            label={t.onboarding.goalMetric}
            value={goalMetric}
            options={(Object.keys(GOAL_DEFAULTS) as GoalMetric[]).map((metric) => ({
              value: metric,
              label: t.onboarding.goalMetrics[metric],
            }))}
            onChange={(event) => {
              const metric = event.target.value as GoalMetric;
              setGoalMetric(metric);
              setGoalValue(String(GOAL_DEFAULTS[metric]));
            }}
          />
          <TextField
            label={t.onboarding.goalValue}
            type="number"
            min={1}
            max={1000}
            inputMode="numeric"
            value={goalValue}
            onChange={(event) => {
              setGoalValue(event.target.value);
            }}
          />
        </div>
        <HeardFromFields value={heardFrom} onChange={setHeardFrom} showErrors={showErrors} />
        <details className="group rounded-lg border border-line p-3">
          <summary className="cursor-pointer font-semibold">
            {t.account.detailsTitle}
            <span className="ml-2 text-sm font-normal text-fg-muted">{t.account.detailsHint}</span>
          </summary>
          <div className="mt-3">
            <AccountDetailsFields value={details} onChange={setDetails} withSpecialty={false} />
          </div>
        </details>
        <OptionalConsentsFields value={consents} onChange={setConsents} />
        <section
          aria-labelledby="aviso-titulo"
          className="flex flex-col gap-2 rounded-md bg-muted p-3"
        >
          <h3 id="aviso-titulo" className="font-semibold">
            {t.onboarding.privacyTitle}
          </h3>
          <p className="text-sm text-fg-muted">{t.onboarding.privacyBody}</p>
          {/* Se abren en otra pestaña para no perder lo que ya escribió en el formulario */}
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
          <AdultConfirmField checked={adult} onChange={setAdult} showError={showErrors} />
          <CheckboxField
            label={t.onboarding.privacyAccept}
            checked={privacy}
            onChange={(event) => {
              setPrivacy(event.target.checked);
            }}
          />
          {showErrors && privacyError ? (
            <p className="text-sm text-danger" role="alert">
              {privacyError}
            </p>
          ) : null}
        </section>
        {problem === 'invitation' ? (
          <p role="alert" className="rounded-md bg-danger-soft p-3 text-sm text-danger">
            {t.accounts.signup.invitationRequired}
          </p>
        ) : null}
        <Button type="submit" size="lg" disabled={busy !== null}>
          <UserPlus aria-hidden />
          {busy === 'email' ? t.onboarding.creating : t.onboarding.create}
        </Button>
        {google ? (
          <>
            <OrDivider />
            <GoogleSignInButton busy={busy === 'google'} onClick={() => void onGoogle()} />
            <p className="text-sm text-fg-muted">{t.accounts.signup.googleCreateHint}</p>
            {problem === 'google' ? (
              <p role="alert" className="text-sm text-danger">
                {t.accounts.signup.googleFailed}
              </p>
            ) : null}
          </>
        ) : null}
      </form>
    </Card>
  );
}

function LoginForm({
  onFound,
  onLinked,
}: {
  onFound: (userId: string) => void;
  onLinked: () => void;
}) {
  const api = useDataApi();
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [sent, setSent] = useState<LinkResult | null>(null);
  const [verified, setVerified] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const linked = useCloud((store) => store.state.status === 'linked');
  const cloud = cloudConfigured();
  const google = googleEnabled();
  // El código abre la sesión de la nube. Se entra cuando el puente ya unió la cuenta con este navegador
  const entered = useRef(false);
  useEffect(() => {
    if (!verified || !linked || entered.current) return;
    entered.current = true;
    onLinked();
  }, [verified, linked, onLinked]);
  // Perfiles de este navegador creados antes de las cuentas con correo
  const legacy = useLiveData(async () => {
    const [users, accounts] = await Promise.all([
      api.repos.users.list(),
      api.repos.accounts.list(),
    ]);
    const withAccount = new Set(accounts.map((account) => account.userId));
    return users.filter((user) => !withAccount.has(user.id));
  }, [api.repos]);

  const onSubmit = async (event: SyntheticEvent) => {
    event.preventDefault();
    if (!validEmail(email)) {
      setMessage(t.account.emailError);
      return;
    }
    if (cloud) {
      const result = await sendLink(email);
      // Un correo sin cuenta ni invitación no entra. El servidor no crea la cuenta
      if (result && !result.ok && result.reason === 'invitation_required') {
        setMessage(t.accounts.signup.invitationRequired);
        return;
      }
      setSent(result);
      return;
    }
    const account = await findAccountByEmail(api, email);
    if (account) onFound(account.userId);
    else setMessage(t.onboarding.noAccount);
  };

  const onGoogle = async () => {
    setGoogleBusy(true);
    setMessage('');
    // Desde aquí no hay registro pendiente. Una cuenta nueva completa su registro al volver
    clearPendingSignup();
    if (!(await goToGoogle())) {
      setMessage(t.accounts.signup.googleFailed);
      setGoogleBusy(false);
    }
  };

  if (sent) {
    return (
      <LinkSentCard
        email={email}
        result={sent}
        onRetry={() => {
          setSent(null);
        }}
        onCode={() => {
          setVerified(true);
        }}
      />
    );
  }

  return (
    <Card aria-labelledby="entrar-titulo">
      <CardHeader>
        <CardTitle id="entrar-titulo">{t.onboarding.signInTitle}</CardTitle>
        <CardDescription>
          {cloud ? t.cloud.signInDescription : t.onboarding.signInDescription}
        </CardDescription>
      </CardHeader>
      <form className="flex flex-col gap-3" noValidate onSubmit={(event) => void onSubmit(event)}>
        <TextField
          label={t.account.email}
          type="email"
          value={email}
          autoComplete="email"
          inputMode="email"
          onChange={(event) => {
            setEmail(event.target.value);
            setMessage('');
          }}
        />
        <Button type="submit">
          <LogIn aria-hidden />
          {cloud ? t.cloud.sendLink : t.onboarding.signIn}
        </Button>
        {message ? (
          <p role="status" className="text-sm text-danger">
            {message}
          </p>
        ) : null}
      </form>
      {google ? (
        <div className="mt-3 flex flex-col gap-3">
          <OrDivider />
          <GoogleSignInButton busy={googleBusy} onClick={() => void onGoogle()} />
        </div>
      ) : null}
      {legacy && legacy.length > 0 ? (
        <div className="mt-4 flex flex-col gap-2 border-t border-line pt-4">
          <p className="text-sm font-semibold">{t.onboarding.legacyTitle}</p>
          {legacy.map((profile) => (
            <Button
              key={profile.id}
              variant="secondary"
              className="justify-start"
              onClick={() => {
                onFound(profile.id);
              }}
            >
              <LogIn aria-hidden />
              {t.onboarding.signInAs(profile.alias)}
            </Button>
          ))}
        </div>
      ) : null}
    </Card>
  );
}

function LinkSentCard({
  email,
  result,
  onContinue,
  onRetry,
  onCode,
}: {
  email: string;
  result: LinkResult;
  onContinue?: () => void;
  onRetry?: () => void;
  /** Se llama cuando el código del correo abrió la sesión */
  onCode: () => void;
}) {
  const ok = result.ok;
  return (
    <Card aria-labelledby="enlace-titulo">
      <CardHeader>
        <CardTitle id="enlace-titulo" className="flex items-center gap-2">
          <MailCheck aria-hidden className="text-fg-muted" />
          {ok ? t.cloud.sentTitle : t.cloud.failedTitle}
        </CardTitle>
        <CardDescription role="status">
          {ok
            ? t.cloud.sentBody(email.trim().toLowerCase())
            : result.reason === 'rate_limited'
              ? t.cloud.rateLimited
              : result.reason === 'invitation_required'
                ? t.accounts.signup.invitationRequired
                : t.cloud.failedBody}
        </CardDescription>
      </CardHeader>
      <div className="flex flex-wrap gap-2">
        {onContinue ? (
          <Button onClick={onContinue}>{ok ? t.cloud.continue : t.cloud.continueLocal}</Button>
        ) : null}
        {onRetry ? (
          <Button variant="secondary" onClick={onRetry}>
            {t.cloud.retry}
          </Button>
        ) : null}
      </div>
      {ok ? <EmailCodeForm email={email} onVerified={onCode} /> : null}
    </Card>
  );
}
