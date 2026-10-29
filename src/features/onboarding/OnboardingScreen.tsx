// Bienvenida (pantalla 1, D-059, D-068, D-150). Página aparte, sin navegación, al estilo de la
// portada. A la izquierda un panel marino con el kicker, el título en dos líneas, la frase en cursiva,
// los beneficios y la nota de privacidad. En Ya tengo cuenta el panel dice Sigue donde te quedaste con
// dos cifras reales de este navegador, si hay datos. A la derecha las pestañas en píldora y el
// formulario en una tarjeta blanca. Crear cuenta con alias, correo, meta diaria, especialidad, datos
// opcionales, permisos opcionales, la edad mínima y un solo aviso de privacidad, o entrar con el
// correo. Con Supabase configurado la cuenta también se guarda en la nube y se entra con un enlace al
// correo, sin contraseña (D-075), o con Google cuando la bandera googleSignIn está prendida (B9).
// Mientras el registro esté cerrado solo entran los correos invitados, y lo decide el servidor. Sin
// Supabase la cuenta vive solo en este navegador (D-060).
import { ArrowRight, Check, ChevronLeft, Info, Lock, MailCheck, TriangleAlert } from 'lucide-react';
import { useEffect, useRef, useState, type SyntheticEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { useCloud } from '@/app/cloudState';
import { ScreenHeader } from '@/app/layout/ScreenHeader';
import { usePreferences } from '@/app/preferences';
import { screenPath } from '@/app/screens';
import { ENARM_EXAM, examDateFor } from '@/config/exam';
import { isFeatureEnabled } from '@/config/featureFlags';
import { trackSignupCompleted } from '@/data/analytics/control';
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
import { daysBetween, studyDayOf } from '@/engines/studyDay';
import { markTourPending } from '@/features/tour/steps';
import { t } from '@/i18n/es-MX';
import { legalText } from '@/i18n/legal';
import { celebrate } from '@/ui/celebrate';
import { cn } from '@/ui/cn';
import { Avatar } from '@/ui/components/avatar';
import { Button } from '@/ui/components/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/ui/components/card';
import { CheckboxField, SelectField, TextField } from '@/ui/components/field';
import { segmentedItem, segmentedList } from '@/ui/components/segmented-classes';
import { AccountDetailsFields } from '../profile/AccountDetailsFields';
import { buildDueSnapshot } from '../review/dueSnapshot';
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
import { ReferralInvite } from './ReferralInvite';

type GoalMetric = 'cards' | 'questions' | 'focusMinutes';
type Tab = 'create' | 'login';
const GOAL_DEFAULTS: Record<GoalMetric, number> = { cards: 20, questions: 10, focusMinutes: 15 };
const validEmail = (email: string) => AccountSchema.shape.email.safeParse(email.trim()).success;
/** A dónde regresa el enlace del correo o Google. La raíz de la app, con o sin dominio propio */
const redirectTo = () => new URL(import.meta.env.BASE_URL, window.location.origin).toString();
/** Entrar con Google solo con la nube configurada y la bandera prendida (B9) */
const googleEnabled = () => cloudConfigured() && isFeatureEnabled('googleSignIn');
/** El año del ENARM que ya tiene la plataforma (D-059), para el título del panel */
const examYear = () => new Date(`${ENARM_EXAM.date}T12:00:00`).getFullYear();
/** Una fecha AAAA-MM-DD en palabras */
const longDate = (date: string) =>
  new Date(`${date}T12:00:00`).toLocaleDateString('es-MX', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

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
  const [tab, setTab] = useState<Tab>('create');

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
      {/* El título de la pestaña del navegador. El h1 vive en el panel marino */}
      <title>{t.app.documentTitle(t.screens.onboarding.title)}</title>
      {/* El marco solo pinta la barra con el logo, así que el camino de vuelta a la portada va aquí */}
      <div className="flex justify-end">
        <Link
          to={screenPath('home')}
          className="inline-flex min-h-touch items-center gap-1.5 text-sm font-semibold text-primary-ink underline-offset-4 hover:underline"
        >
          <ChevronLeft aria-hidden className="size-4" />
          {t.onboarding.backToLanding}
        </Link>
      </div>
      {/* Dos columnas que se acomodan solas, el panel marino y el formulario (D-150) */}
      <div className="flex flex-wrap items-start gap-8">
        <WelcomePanel tab={tab} />
        <div className="flex min-w-0 flex-[999_1_30rem] flex-col gap-5">
          {/* Quien llega con el enlace de un compañero guarda su código para canjearlo al entrar (B7) */}
          <ReferralInvite />
          {/* Mismas pestañas que el resto de la app (H01 de la revisión de B2), en píldora */}
          <div
            role="tablist"
            aria-label={t.onboarding.tabs}
            className={cn(segmentedList, 'self-start')}
          >
            {(['create', 'login'] as const).map((value) => (
              <button
                key={value}
                role="tab"
                type="button"
                aria-selected={tab === value}
                onClick={() => {
                  setTab(value);
                }}
                className={segmentedItem(tab === value, 'min-h-touch px-6 text-base')}
              >
                {value === 'create' ? t.onboarding.createTab : t.onboarding.loginTab}
              </button>
            ))}
          </div>
          {tab === 'create' ? (
            <CreateAccountForm
              onCreated={enter}
              onSwitchToLogin={() => {
                setTab('login');
              }}
            />
          ) : (
            <LoginForm
              onFound={enter}
              onLinked={enterLinked}
              onSwitchToCreate={() => {
                setTab('create');
              }}
            />
          )}
          <p className="text-center text-xs text-fg-muted">
            {cloudConfigured() ? t.cloud.loginNote : t.session.simulatedLogin}
          </p>
        </div>
      </div>
    </>
  );
}

/**
 * El panel marino de la izquierda (D-150). En Crear cuenta presenta Studiare con el año del ENARM que
 * ya tiene la plataforma. En Ya tengo cuenta dice Sigue donde te quedaste con dos cifras reales de
 * este navegador, si hay un perfil guardado. Lleva el h1 de la pantalla
 */
function WelcomePanel({ tab }: { tab: Tab }) {
  const create = t.onboarding.panel;
  const login = t.onboarding.loginPanel;
  const isCreate = tab === 'create';
  return (
    <Card
      tone="navy"
      lift={false}
      aria-labelledby="bienvenida-titulo"
      className="flex max-w-md flex-[1_1_21rem] flex-col gap-6 rounded-xl p-8 sm:p-10"
    >
      <span className="text-xs font-bold tracking-[0.12em] text-primary-fg/80 uppercase">
        {isCreate ? create.kicker : login.kicker}
      </span>
      <h1
        id="bienvenida-titulo"
        tabIndex={-1}
        className="flex flex-col leading-[1.08] outline-none"
      >
        <span className="text-2xl font-bold sm:text-3xl">
          {isCreate ? create.titleLead : login.titleLead}
        </span>
        {/* La segunda línea en cielo. Es texto grande, así que el cielo pasa el contraste sobre marino */}
        <span className="text-4xl font-extrabold text-indicator sm:text-5xl">
          {isCreate ? create.titleExam(examYear()) : login.titleTail}
        </span>
      </h1>
      <hr className="h-px w-full border-0 bg-primary-fg/35" />
      <p className="text-lg leading-snug italic">{isCreate ? create.lead : login.lead}</p>
      {isCreate ? (
        <ul className="flex flex-col gap-3 text-base leading-relaxed text-primary-fg/90">
          {create.benefits.map((benefit) => (
            <li key={benefit} className="flex gap-2.5">
              <Check aria-hidden className="mt-0.5 size-5 shrink-0 text-indicator" />
              {benefit}
            </li>
          ))}
        </ul>
      ) : (
        <LoginFigures />
      )}
      <p className="flex items-center gap-3 rounded-lg bg-primary-fg/10 p-3.5 text-sm leading-relaxed text-primary-fg/90">
        <Lock aria-hidden className="size-5 shrink-0 text-indicator" />
        {isCreate ? create.privacy : login.privacy}
      </p>
    </Card>
  );
}

/**
 * Dos cifras reales del perfil más reciente de este navegador, los días que faltan para el ENARM y los
 * repasos que le esperan hoy, con la misma cuenta que Repasar. Sin perfiles no pinta nada
 */
function LoginFigures() {
  const api = useDataApi();
  const text = t.onboarding.loginPanel;
  const figures = useLiveData(async () => {
    const users = await api.repos.users.list();
    const latest = [...users].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    if (!latest) return null;
    const today = studyDayOf(new Date(), latest.timeZone);
    const snapshot = await buildDueSnapshot(api, latest.id, latest.timeZone);
    return {
      daysToExam: daysBetween(today, examDateFor(latest)),
      dueToday: snapshot?.days[0]?.due ?? 0,
    };
  }, [api]);
  if (!figures) return null;
  const rows = [
    // Con el examen ya pasado la cuenta regresiva no dice nada útil
    ...(figures.daysToExam >= 0
      ? [{ label: text.daysToExam, value: text.days(figures.daysToExam) }]
      : []),
    { label: text.dueToday, value: figures.dueToday.toLocaleString('es-MX') },
  ];
  return (
    <dl className="flex flex-col gap-2.5">
      {rows.map((row) => (
        <div
          key={row.label}
          className="flex items-center justify-between gap-3 rounded-lg bg-primary-fg/10 px-4 py-3 text-sm"
        >
          <dt className="text-primary-fg/80">{row.label}</dt>
          <dd className="font-bold">{row.value}</dd>
        </div>
      ))}
    </dl>
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

/** La tarjeta blanca del formulario, de 24 px con sombra suave (D-150) */
const formCard = 'rounded-xl p-6 shadow-raised sm:p-9';

function CreateAccountForm({
  onCreated,
  onSwitchToLogin,
}: {
  onCreated: (userId: string) => void;
  onSwitchToLogin: () => void;
}) {
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
      // Medición de uso (B15, 1.5). Solo si marcó la casilla del registro, y sin cómo nos conoció (D-132)
      trackSignupCompleted(consents.product_analytics, {
        method: 'email',
        target_specialty_set: Boolean(details.targetSpecialty),
      });
      // Cuenta nueva en este navegador. El recorrido guiado aparece al llegar a Inicio (B15, 4.1). Se marca
      // aquí y no al entrar, para que también cuente cuando el alumno abre el enlace del correo. Es la única
      // llamada de este camino, porque onCreated ya no marca
      markTourPending(result.user.id);
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
    <Card aria-labelledby="crear-titulo" lift={false} className={formCard}>
      <CardHeader className="mb-5 gap-1.5">
        <CardTitle id="crear-titulo" className="text-2xl text-heading">
          {t.onboarding.createTitle}
        </CardTitle>
        <CardDescription>{t.onboarding.createDescription}</CardDescription>
      </CardHeader>
      {registrationClosed ? (
        // El aviso de invitación en banda cielo suave con ícono (D-150)
        <p className="mb-5 flex items-start gap-3 rounded-lg bg-primary-soft p-3.5 text-sm leading-relaxed text-primary-ink">
          <Info aria-hidden className="mt-0.5 size-5 shrink-0" />
          <span>{t.accounts.signup.invitationOnly}</span>
        </p>
      ) : null}
      <form className="flex flex-col gap-5" noValidate onSubmit={(event) => void onSubmit(event)}>
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
        <div className="grid gap-4 sm:grid-cols-2">
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
        <details className="group rounded-lg border border-line p-4">
          <summary className="cursor-pointer font-semibold">
            {t.account.detailsTitle}
            <span className="ml-2 text-sm font-normal text-fg-muted">{t.account.detailsHint}</span>
          </summary>
          <div className="mt-4">
            <AccountDetailsFields value={details} onChange={setDetails} withSpecialty={false} />
          </div>
        </details>
        <OptionalConsentsFields value={consents} onChange={setConsents} />
        {/* La aceptación del aviso en una banda crema con sus casillas (D-150) */}
        <section
          aria-labelledby="aviso-titulo"
          className="flex flex-col gap-2 rounded-lg bg-cream p-4"
        >
          <h3 id="aviso-titulo" className="font-semibold">
            {t.onboarding.privacyTitle}
          </h3>
          <p className="text-sm leading-relaxed text-fg-muted">{t.onboarding.privacyBody}</p>
          {/* Se abren en otra pestaña para no perder lo que ya escribió en el formulario */}
          <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            <Link
              to={screenPath('privacyNotice')}
              target="_blank"
              rel="noopener"
              className="font-bold text-primary-ink underline underline-offset-4"
            >
              {legalText.onboarding.read}
              <span className="sr-only"> ({legalText.onboarding.newTab})</span>
            </Link>
            <Link
              to={screenPath('terms')}
              target="_blank"
              rel="noopener"
              className="font-bold text-primary-ink underline underline-offset-4"
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
          <p role="alert" className="rounded-lg bg-danger-soft p-3.5 text-sm text-danger">
            {t.accounts.signup.invitationRequired}
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-4">
          <Button type="submit" size="lg" disabled={busy !== null}>
            {busy === 'email' ? t.onboarding.creating : t.onboarding.create}
            <ArrowRight aria-hidden />
          </Button>
          <p className="text-sm text-fg-muted">
            {t.onboarding.haveAccount}{' '}
            <button
              type="button"
              onClick={onSwitchToLogin}
              className="font-bold text-primary-ink underline-offset-4 hover:underline"
            >
              {t.onboarding.enterHere}
            </button>
          </p>
        </div>
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
  onSwitchToCreate,
}: {
  onFound: (userId: string) => void;
  onLinked: () => void;
  onSwitchToCreate: () => void;
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
    <>
      <Card aria-labelledby="entrar-titulo" lift={false} className={formCard}>
        <CardHeader className="mb-5 gap-1.5">
          <CardTitle id="entrar-titulo" className="text-2xl text-heading">
            {t.onboarding.signInTitle}
          </CardTitle>
          <CardDescription>
            {cloud ? t.cloud.signInDescription : t.onboarding.signInDescription}
          </CardDescription>
        </CardHeader>
        <form className="flex flex-col gap-5" noValidate onSubmit={(event) => void onSubmit(event)}>
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
          <Button type="submit" size="lg">
            {cloud ? t.cloud.sendLink : t.onboarding.signIn}
            <ArrowRight aria-hidden />
          </Button>
          {message ? (
            // El aviso en banda de advertencia con ícono (D-150). Sin cuenta en este navegador ofrece crearla
            <p
              role="status"
              className="flex items-start gap-3 rounded-lg bg-warning-soft p-3.5 text-sm leading-relaxed text-warning"
            >
              <TriangleAlert aria-hidden className="mt-0.5 size-5 shrink-0" />
              <span>{message}</span>
              {message === t.onboarding.noAccount ? (
                <button
                  type="button"
                  onClick={onSwitchToCreate}
                  className="font-bold underline underline-offset-4"
                >
                  {t.onboarding.noAccountCreate}
                </button>
              ) : null}
            </p>
          ) : null}
        </form>
        {google ? (
          <div className="mt-5 flex flex-col gap-4">
            <OrDivider />
            <GoogleSignInButton busy={googleBusy} onClick={() => void onGoogle()} />
          </div>
        ) : null}
      </Card>
      {legacy && legacy.length > 0 ? (
        // Los perfiles de antes como tarjetas con su avatar, en crema (D-150)
        <Card tone="cream" lift={false} aria-labelledby="perfiles-titulo">
          <h3 id="perfiles-titulo" className="mb-3 text-base font-bold">
            {t.onboarding.legacyTitle}
          </h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {legacy.map((profile) => (
              <button
                key={profile.id}
                type="button"
                className="card-lift flex min-h-touch items-center gap-3 rounded-lg border-[1.5px] border-line bg-surface px-3.5 py-3 text-left text-fg"
                onClick={() => {
                  onFound(profile.id);
                }}
              >
                <Avatar
                  name={profile.alias}
                  className="size-10 shrink-0 bg-primary text-sm font-extrabold text-primary-fg ring-0"
                />
                <span className="flex min-w-0 flex-col gap-0.5">
                  <strong className="text-sm">{t.onboarding.signInAs(profile.alias)}</strong>
                  <span className="text-xs text-fg-muted">
                    {profile.examDate
                      ? t.onboarding.examOn(longDate(profile.examDate))
                      : t.onboarding.noExamDate}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </Card>
      ) : null}
    </>
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
    <Card aria-labelledby="enlace-titulo" lift={false} className={formCard}>
      <CardHeader>
        <CardTitle id="enlace-titulo" className="flex items-center gap-2 text-2xl text-heading">
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
