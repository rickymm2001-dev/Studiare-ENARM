// Bienvenida (pantalla 1, D-059, D-068). Página aparte, sin navegación. Crear cuenta con alias,
// correo, meta diaria, datos opcionales y un solo aviso de privacidad, o entrar con el correo.
// Con Supabase configurado la cuenta también se guarda en la nube y se entra con un enlace al
// correo, sin contraseña (D-075). Sin Supabase la cuenta vive solo en este navegador (D-060).
import { LogIn, MailCheck, UserPlus } from 'lucide-react';
import { useState, type SyntheticEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { ScreenHeader } from '@/app/layout/ScreenHeader';
import { usePreferences } from '@/app/preferences';
import { screenPath } from '@/app/screens';
import { requestEmailLink, type LinkResult } from '@/data/cloud/account';
import { cloudConfigured, loadCloud } from '@/data/cloud/client';
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
import { celebrate } from '@/ui/celebrate';
import { cn } from '@/ui/cn';
import { Button } from '@/ui/components/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/ui/components/card';
import { CheckboxField, SelectField, TextField } from '@/ui/components/field';
import { AccountDetailsFields } from '../profile/AccountDetailsFields';

type GoalMetric = 'cards' | 'questions' | 'focusMinutes';
const GOAL_DEFAULTS: Record<GoalMetric, number> = { cards: 20, questions: 10, focusMinutes: 15 };
const validEmail = (email: string) => AccountSchema.shape.email.safeParse(email.trim()).success;
/** A dónde regresa el enlace del correo. La raíz de la app, con o sin dominio propio */
const redirectTo = () => new URL(import.meta.env.BASE_URL, window.location.origin).toString();

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

  return (
    <>
      <ScreenHeader title={t.screens.onboarding.title} description={t.onboarding.intro} />
      <div
        role="tablist"
        aria-label={t.onboarding.tabs}
        className="flex gap-1 rounded-full bg-muted p-1"
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
            className={cn(
              'min-h-touch flex-1 rounded-full text-sm font-semibold transition-all',
              tab === value ? 'bg-surface text-fg shadow-card' : 'text-fg-muted',
            )}
          >
            {value === 'create' ? t.onboarding.createTab : t.onboarding.loginTab}
          </button>
        ))}
      </div>
      {tab === 'create' ? <CreateAccountForm onCreated={enter} /> : <LoginForm onFound={enter} />}
      <p className="text-center text-xs text-fg-muted">
        {cloudConfigured() ? t.cloud.loginNote : t.session.simulatedLogin}
      </p>
    </>
  );
}

function CreateAccountForm({ onCreated }: { onCreated: (userId: string) => void }) {
  const api = useDataApi();
  const [alias, setAlias] = useState('');
  const [email, setEmail] = useState('');
  const [goalMetric, setGoalMetric] = useState<GoalMetric>('cards');
  const [goalValue, setGoalValue] = useState(String(GOAL_DEFAULTS.cards));
  const [details, setDetails] = useState<AccountDetails>(EMPTY_DETAILS);
  const [privacy, setPrivacy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [taken, setTaken] = useState(false);
  const [sent, setSent] = useState<{ userId: string; result: LinkResult } | null>(null);

  const aliasError =
    alias.trim().length < 1 || alias.trim().length > 40 ? t.onboarding.aliasError : null;
  const emailError = taken ? t.account.emailTaken : validEmail(email) ? null : t.account.emailError;
  const privacyError = privacy ? null : t.onboarding.privacyError;

  const onSubmit = async (event: SyntheticEvent) => {
    event.preventDefault();
    setSubmitted(true);
    if (aliasError || emailError || privacyError) return;
    setBusy(true);
    try {
      const result = await registerAccount(api, {
        alias: alias.trim(),
        email,
        dailyGoal: { metric: goalMetric, value: Math.max(1, Number(goalValue) || 1) },
        details,
      });
      if (!result.ok) {
        setTaken(true);
        return;
      }
      const link = await sendLink(email, alias.trim());
      if (link) setSent({ userId: result.user.id, result: link });
      else onCreated(result.user.id);
    } finally {
      setBusy(false);
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
      />
    );
  }

  return (
    <Card aria-labelledby="crear-titulo">
      <CardHeader>
        <CardTitle id="crear-titulo">{t.onboarding.createTitle}</CardTitle>
        <CardDescription>{t.onboarding.createDescription}</CardDescription>
      </CardHeader>
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
        <TextField
          label={t.account.email}
          hint={t.account.emailHint}
          type="email"
          value={email}
          maxLength={254}
          autoComplete="email"
          inputMode="email"
          error={submitted ? emailError : null}
          onChange={(event) => {
            setEmail(event.target.value);
            setTaken(false);
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
        <details className="group rounded-lg border border-line p-3">
          <summary className="cursor-pointer font-semibold">
            {t.account.detailsTitle}
            <span className="ml-2 text-sm font-normal text-fg-muted">{t.account.detailsHint}</span>
          </summary>
          <div className="mt-3">
            <AccountDetailsFields value={details} onChange={setDetails} />
          </div>
        </details>
        <section
          aria-labelledby="aviso-titulo"
          className="flex flex-col gap-2 rounded-md bg-muted p-3"
        >
          <h3 id="aviso-titulo" className="font-semibold">
            {t.onboarding.privacyTitle}
          </h3>
          <p className="text-sm text-fg-muted">{t.onboarding.privacyBody}</p>
          <CheckboxField
            label={t.onboarding.privacyAccept}
            checked={privacy}
            onChange={(event) => {
              setPrivacy(event.target.checked);
            }}
          />
          {submitted && privacyError ? (
            <p className="text-sm text-danger" role="alert">
              {privacyError}
            </p>
          ) : null}
        </section>
        <Button type="submit" size="lg" disabled={busy}>
          <UserPlus aria-hidden />
          {busy ? t.onboarding.creating : t.onboarding.create}
        </Button>
      </form>
    </Card>
  );
}

function LoginForm({ onFound }: { onFound: (userId: string) => void }) {
  const api = useDataApi();
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [sent, setSent] = useState<LinkResult | null>(null);
  const cloud = cloudConfigured();
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
      setSent(await sendLink(email));
      return;
    }
    const account = await findAccountByEmail(api, email);
    if (account) onFound(account.userId);
    else setMessage(t.onboarding.noAccount);
  };

  if (sent) {
    return (
      <LinkSentCard
        email={email}
        result={sent}
        onRetry={() => {
          setSent(null);
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
}: {
  email: string;
  result: LinkResult;
  onContinue?: () => void;
  onRetry?: () => void;
}) {
  const ok = result.ok;
  return (
    <Card aria-labelledby="enlace-titulo">
      <CardHeader>
        <CardTitle id="enlace-titulo" className="flex items-center gap-2">
          <MailCheck aria-hidden className="text-primary" />
          {ok ? t.cloud.sentTitle : t.cloud.failedTitle}
        </CardTitle>
        <CardDescription role="status">
          {ok
            ? t.cloud.sentBody(email.trim().toLowerCase())
            : result.reason === 'rate_limited'
              ? t.cloud.rateLimited
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
    </Card>
  );
}
