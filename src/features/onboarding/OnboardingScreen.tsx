// Bienvenida (pantalla 1). Página aparte, sin navegación. Entrar con un perfil de este dispositivo
// o crear uno con alias, meta diaria y un solo aviso de privacidad (D-059).
import { LogIn, UserPlus } from 'lucide-react';
import { useState, type SyntheticEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { ScreenHeader } from '@/app/layout/ScreenHeader';
import { usePreferences } from '@/app/preferences';
import { screenPath } from '@/app/screens';
import { useDataApi } from '@/data/context';
import { useLiveData } from '@/data/hooks';
import { createProfile } from '@/data/usecases/profile';
import { t } from '@/i18n/es-MX';
import { Button } from '@/ui/components/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/ui/components/card';
import { CheckboxField, SelectField, TextField } from '@/ui/components/field';

type GoalMetric = 'cards' | 'questions' | 'focusMinutes';
const GOAL_DEFAULTS: Record<GoalMetric, number> = { cards: 20, questions: 10, focusMinutes: 15 };

export function OnboardingScreen() {
  const api = useDataApi();
  const navigate = useNavigate();
  const signIn = usePreferences((state) => state.signIn);
  const profiles = useLiveData(() => api.repos.users.list(), [api.repos]);

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

  return (
    <>
      <ScreenHeader title={t.screens.onboarding.title} description={t.session.simulatedLogin} />
      {profiles && profiles.length > 0 ? (
        <Card aria-labelledby="entrar-titulo">
          <CardHeader>
            <CardTitle id="entrar-titulo">{t.onboarding.signInTitle}</CardTitle>
            <CardDescription>{t.onboarding.signInDescription}</CardDescription>
          </CardHeader>
          <ul className="flex flex-col gap-2">
            {profiles.map((profile) => (
              <li key={profile.id}>
                <Button
                  variant="secondary"
                  className="w-full justify-start"
                  onClick={() => {
                    signIn(profile.id);
                    void navigate(screenPath('home'));
                  }}
                >
                  <LogIn aria-hidden />
                  <span>{t.onboarding.signInAs(profile.alias)}</span>
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
      <CreateProfileForm
        onCreated={(userId) => {
          signIn(userId);
          void navigate(screenPath('home'));
        }}
        create={(input) => createProfile(api, input)}
      />
    </>
  );
}

function CreateProfileForm({
  create,
  onCreated,
}: {
  create: (input: Parameters<typeof createProfile>[1]) => Promise<{ id: string }>;
  onCreated: (userId: string) => void;
}) {
  const [alias, setAlias] = useState('');
  const [goalMetric, setGoalMetric] = useState<GoalMetric>('cards');
  const [goalValue, setGoalValue] = useState(String(GOAL_DEFAULTS.cards));
  const [privacy, setPrivacy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);

  const aliasError =
    alias.trim().length < 1 || alias.trim().length > 40 ? t.onboarding.aliasError : null;
  const privacyError = privacy ? null : t.onboarding.privacyError;

  const onSubmit = async (event: SyntheticEvent) => {
    event.preventDefault();
    setSubmitted(true);
    if (aliasError || privacyError) return;
    setBusy(true);
    try {
      const user = await create({
        alias: alias.trim(),
        dailyGoal: { metric: goalMetric, value: Math.max(1, Number(goalValue) || 1) },
      });
      onCreated(user.id);
    } finally {
      setBusy(false);
    }
  };

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
        <CardContent>
          <Button type="submit" disabled={busy}>
            <UserPlus aria-hidden />
            {busy ? t.onboarding.creating : t.onboarding.create}
          </Button>
        </CardContent>
      </form>
    </Card>
  );
}
