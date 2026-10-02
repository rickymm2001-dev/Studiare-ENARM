// Ajustes del alumno en Perfil (pantalla 15). Cuenta, metas y repaso, estudio, Pomodoro, privacidad,
// suscripción, exportar y borrar datos. Cada cambio queda como evento settings_changed.
import { CreditCard, Download, LogOut, Trash2 } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { usePreferences } from '@/app/preferences';
import { screenPath } from '@/app/screens';
import { useDataApi } from '@/data/context';
import { exportUserData } from '@/data/usecases/exportData';
import { updateProfile } from '@/data/usecases/profile';
import type { UserSettings } from '@/data/schemas/people';
import { t } from '@/i18n/es-MX';
import { Button } from '@/ui/components/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/ui/components/card';
import { CheckboxField, SelectField, TextField } from '@/ui/components/field';
import { PomodoroSettingsForm } from '../pomodoro/Pomodoro';
import type { ReadySession } from '../shared/RequireSession';

function Section({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <Card aria-labelledby={id}>
      <CardHeader>
        <CardTitle id={id}>{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      {children}
    </Card>
  );
}

export function AccountSettings({ session }: { session: ReadySession }) {
  const api = useDataApi();
  const { user, settings } = session;
  const signOut = usePreferences((state) => state.signOut);
  const saveSettings = (patch: Partial<UserSettings>) =>
    updateProfile(api, user, { settings: patch });

  return (
    <>
      <AccountCard session={session} onSignOut={session.isDemo ? null : signOut} />
      <Section id="metas-titulo" title={t.settings.goalsTitle}>
        <GoalsForm settings={settings} onSave={saveSettings} />
      </Section>
      <Section id="estudio-titulo" title={t.settings.studyTitle}>
        <div className="flex flex-col gap-3">
          {(
            [
              'cardConfidenceStep',
              'negationHighlightPractice',
              'negationHighlightExam',
              'errorsToReview',
            ] as const
          ).map((key) => (
            <CheckboxField
              key={key}
              label={t.settings[key]}
              checked={settings[key]}
              onChange={(event) => {
                void saveSettings({ [key]: event.target.checked });
              }}
            />
          ))}
          <SelectField
            label={t.settings.optionsShown}
            value={String(settings.optionsShown)}
            options={[4, 5, 6].map((n) => ({ value: String(n), label: String(n) }))}
            onChange={(event) => {
              void saveSettings({ optionsShown: Number(event.target.value) });
            }}
          />
        </div>
      </Section>
      <Section id="pomodoro-ajustes" title={t.settings.pomodoroTitle}>
        <PomodoroSettingsForm
          value={settings.pomodoro}
          onSave={async (pomodoro) => {
            await saveSettings({ pomodoro });
          }}
        />
      </Section>
      <Section id="suscripcion-titulo" title={t.settings.subscriptionTitle}>
        <Button asChild variant="secondary" className="self-start">
          <Link to={screenPath('subscription')}>
            <CreditCard aria-hidden />
            {t.settings.subscriptionLink}
          </Link>
        </Button>
      </Section>
      <Section
        id="exportar-titulo"
        title={t.settings.exportTitle}
        description={t.settings.exportDescription}
      >
        <Button
          variant="secondary"
          className="self-start"
          onClick={() => {
            void exportUserData(api.repos, user.id).then((data) => {
              const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
              const url = URL.createObjectURL(blob);
              const link = document.createElement('a');
              link.href = url;
              link.download = `mis-datos-${user.alias}.json`;
              link.click();
              URL.revokeObjectURL(url);
            });
          }}
        >
          <Download aria-hidden />
          {t.settings.export}
        </Button>
      </Section>
      {api.deleteAllData ? <DeleteCard onDelete={api.deleteAllData} onDeleted={signOut} /> : null}
    </>
  );
}

function AccountCard({
  session,
  onSignOut,
}: {
  session: ReadySession;
  onSignOut: (() => void) | null;
}) {
  const api = useDataApi();
  const { user } = session;
  const [alias, setAlias] = useState(user.alias);
  const [status, setStatus] = useState('');
  return (
    <Section
      id="cuenta-titulo"
      title={t.settings.accountTitle}
      description={t.settings.accountDescription(user.alias)}
    >
      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (!alias.trim()) return;
          void updateProfile(api, user, { alias: alias.trim() }).then(() => {
            setStatus(t.settings.saved);
          });
        }}
      >
        <TextField
          label={t.onboarding.alias}
          value={alias}
          maxLength={40}
          onChange={(event) => {
            setAlias(event.target.value);
          }}
        />
        <div className="flex flex-wrap gap-2">
          <Button type="submit">{t.settings.save}</Button>
          {onSignOut ? (
            <Button type="button" variant="secondary" onClick={onSignOut}>
              <LogOut aria-hidden />
              {t.session.signOut}
            </Button>
          ) : null}
        </div>
        <p role="status" className="text-sm text-fg-muted">
          {status}
        </p>
      </form>
    </Section>
  );
}

function GoalsForm({
  settings,
  onSave,
}: {
  settings: UserSettings;
  onSave: (patch: Partial<UserSettings>) => Promise<unknown>;
}) {
  const [retention, setRetention] = useState(String(Math.round(settings.desiredRetention * 100)));
  const [newCards, setNewCards] = useState(String(settings.newCardsPerDay));
  const [reviews, setReviews] = useState(String(settings.reviewsPerDay));
  const [metric, setMetric] = useState(settings.dailyGoal.metric);
  const [goal, setGoal] = useState(String(settings.dailyGoal.value));
  const [status, setStatus] = useState('');
  const clamp = (value: string, min: number, max: number) =>
    Math.min(max, Math.max(min, Number(value) || min));
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        void onSave({
          desiredRetention: clamp(retention, 80, 97) / 100,
          newCardsPerDay: clamp(newCards, 0, 500),
          reviewsPerDay: clamp(reviews, 0, 5000),
          dailyGoal: { metric, value: clamp(goal, 1, 1000) },
        }).then(() => {
          setStatus(t.settings.saved);
        });
      }}
    >
      <TextField
        label={t.settings.retention}
        hint={t.settings.retentionHint}
        type="number"
        min={80}
        max={97}
        value={retention}
        onChange={(event) => {
          setRetention(event.target.value);
        }}
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField
          label={t.settings.newCardsPerDay}
          type="number"
          min={0}
          max={500}
          value={newCards}
          onChange={(event) => {
            setNewCards(event.target.value);
          }}
        />
        <TextField
          label={t.settings.reviewsPerDay}
          type="number"
          min={0}
          max={5000}
          value={reviews}
          onChange={(event) => {
            setReviews(event.target.value);
          }}
        />
        <SelectField
          label={t.onboarding.goalMetric}
          value={metric}
          options={(['cards', 'questions', 'focusMinutes'] as const).map((value) => ({
            value,
            label: t.onboarding.goalMetrics[value],
          }))}
          onChange={(event) => {
            setMetric(event.target.value as UserSettings['dailyGoal']['metric']);
          }}
        />
        <TextField
          label={t.onboarding.goalValue}
          type="number"
          min={1}
          max={1000}
          value={goal}
          onChange={(event) => {
            setGoal(event.target.value);
          }}
        />
      </div>
      <Button type="submit" className="self-start">
        {t.settings.save}
      </Button>
      <p role="status" className="text-sm text-fg-muted">
        {status}
      </p>
    </form>
  );
}

function DeleteCard({
  onDelete,
  onDeleted,
}: {
  onDelete: () => Promise<void>;
  onDeleted: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  return (
    <Section
      id="borrar-titulo"
      title={t.settings.deleteTitle}
      description={t.settings.deleteDescription}
    >
      {confirming ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm">{t.settings.deleteConfirmText}</p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="danger"
              onClick={() => {
                void onDelete().then(onDeleted);
              }}
            >
              {t.settings.deleteConfirm}
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setConfirming(false);
              }}
            >
              {t.settings.cancel}
            </Button>
          </div>
        </div>
      ) : (
        <Button
          variant="danger"
          className="self-start"
          onClick={() => {
            setConfirming(true);
          }}
        >
          <Trash2 aria-hidden />
          {t.settings.delete}
        </Button>
      )}
    </Section>
  );
}
