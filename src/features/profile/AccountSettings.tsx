// Ajustes del alumno. La cuenta y la suscripción van en Perfil. Metas y repaso, estudio, Pomodoro,
// exportar y borrar datos van en las secciones de Configuración (D-065, D-078). Cada cambio queda
// como evento settings_changed.
import { CreditCard, Download, LogOut } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { pushAccountIfLinked, useCloud } from '@/app/cloudState';
import { usePreferences } from '@/app/preferences';
import { screenPath } from '@/app/screens';
import { getCloud } from '@/data/cloud/client';
import { useDataApi } from '@/data/context';
import { exportUserData } from '@/data/usecases/exportData';
import { updateProfile } from '@/data/usecases/profile';
import { WEEKDAY_KEYS } from '@/engines/easyDays';
import { clearExamState } from '../exam/examStorage';
import { fromOption, maxIntervalOptions, toOption } from '../review/intervalOptions';
import type { UserSettings } from '@/data/schemas/people';
import { t } from '@/i18n/es-MX';
import { Button } from '@/ui/components/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/ui/components/card';
import { Disclosure } from '@/ui/components/disclosure';
import { CheckboxField, SelectField, TextField } from '@/ui/components/field';
import { SaveBar } from '@/ui/components/save-bar';
import { PomodoroSettingsForm } from '../pomodoro/Pomodoro';
import { FeatureGate } from '../shared/FeatureGate';
import type { ReadySession } from '../shared/RequireSession';
import { DeleteAccountCard, DeleteDataCard } from './DeleteCards';
import { CardTimerFields, EasyDaysFields } from './StudyDailyFields';
import { SyncStatus } from './SyncStatus';

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

/** Perfil. Cuenta y suscripción */
export function AccountSection({ session }: { session: ReadySession }) {
  const signOut = usePreferences((state) => state.signOut);
  return (
    <>
      <AccountCard session={session} onSignOut={session.isDemo ? null : signOut} />
      <Section id="suscripcion-titulo" title={t.settings.subscriptionTitle}>
        <Button asChild variant="secondary" className="self-start">
          <Link to={screenPath('subscription')}>
            <CreditCard aria-hidden />
            {t.settings.subscriptionLink}
          </Link>
        </Button>
      </Section>
    </>
  );
}

/** Configuración, sección Estudio. Metas del día, opciones al estudiar y repaso avanzado */
export function StudySection({ session }: { session: ReadySession }) {
  const api = useDataApi();
  const { user, settings } = session;
  return (
    <Card aria-label={t.settings.sections.study}>
      <StudyForm
        userId={user.id}
        settings={settings}
        onSave={(patch) => updateProfile(api, user, { settings: patch })}
      />
    </Card>
  );
}

/** Configuración, sección Pomodoro */
export function PomodoroSection({ session }: { session: ReadySession }) {
  const api = useDataApi();
  const { user, settings } = session;
  return (
    <Card aria-label={t.settings.pomodoroTitle} className="lg:max-w-3xl">
      <PomodoroSettingsForm
        value={settings.pomodoro}
        onSave={async (pomodoro) => {
          await updateProfile(api, user, { settings: { pomodoro } });
        }}
      />
    </Card>
  );
}

/** Configuración, sección Cuenta. Exportar y borrar */
export function DataSection({ session }: { session: ReadySession }) {
  const api = useDataApi();
  const { deleteAllData } = api;
  const { user } = session;
  const signOut = usePreferences((state) => state.signOut);
  const cloud = getCloud();
  // El examen en curso vive en el navegador y no en la base, así que se borra aparte. Hay que leer
  // los perfiles antes, porque con la base borrada ya no se sabe de quién eran
  const wipeLocal = async () => {
    if (!deleteAllData) return;
    const users = await api.repos.users.list();
    await deleteAllData();
    for (const { id } of users) clearExamState(id);
  };
  return (
    <>
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
      {deleteAllData ? (
        <>
          <DeleteDataCard cloud={cloud} wipeLocal={wipeLocal} onDone={signOut} />
          <DeleteAccountCard cloud={cloud} wipeLocal={wipeLocal} onDone={signOut} />
        </>
      ) : null}
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
            void pushAccountIfLinked(api, user.id);
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
          <Button type="submit">{t.settings.saveChanges}</Button>
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
      {session.isDemo ? null : <CloudStatus />}
    </Section>
  );
}

const STUDY_KEYS = [
  'cardConfidenceStep',
  'negationHighlightPractice',
  'negationHighlightExam',
  'errorsToReview',
] as const;

const SPACING_OPTIONS = [50, 75, 100, 125, 150, 200];

const draftOf = (settings: UserSettings) => ({
  retention: String(Math.round(settings.desiredRetention * 100)),
  maxInterval: toOption(settings.maxIntervalDays),
  spacing: settings.spacing,
  newCards: String(settings.newCardsPerDay),
  unlimitedNewCards: settings.unlimitedNewCards,
  cardTimer: settings.cardTimer,
  easyDays: settings.easyDays,
  reviews: String(settings.reviewsPerDay),
  metric: settings.dailyGoal.metric,
  goal: String(settings.dailyGoal.value),
  cardConfidenceStep: settings.cardConfidenceStep,
  negationHighlightPractice: settings.negationHighlightPractice,
  negationHighlightExam: settings.negationHighlightExam,
  errorsToReview: settings.errorsToReview,
  optionsShown: settings.optionsShown,
  practiceFeedback: settings.practiceFeedback,
});
type StudyDraft = ReturnType<typeof draftOf>;

const clamp = (value: string, min: number, max: number) =>
  Math.min(max, Math.max(min, Number(value) || min));

/** Lo que se guarda a partir del borrador, ya con los límites de cada campo */
const patchOf = (draft: StudyDraft) => ({
  desiredRetention: clamp(draft.retention, 80, 97) / 100,
  maxIntervalDays: fromOption(draft.maxInterval),
  spacing: draft.spacing,
  newCardsPerDay: clamp(draft.newCards, 0, 500),
  unlimitedNewCards: draft.unlimitedNewCards,
  cardTimer: draft.cardTimer,
  easyDays: draft.easyDays,
  reviewsPerDay: clamp(draft.reviews, 0, 5000),
  dailyGoal: { metric: draft.metric, value: clamp(draft.goal, 1, 1000) },
  cardConfidenceStep: draft.cardConfidenceStep,
  negationHighlightPractice: draft.negationHighlightPractice,
  negationHighlightExam: draft.negationHighlightExam,
  errorsToReview: draft.errorsToReview,
  optionsShown: draft.optionsShown,
  practiceFeedback: draft.practiceFeedback,
});

/** Hay cambios si algún valor que se guardaría es distinto del guardado */
function differs(patch: ReturnType<typeof patchOf>, settings: UserSettings) {
  return (
    patch.desiredRetention !== settings.desiredRetention ||
    patch.maxIntervalDays !== settings.maxIntervalDays ||
    (['hard', 'good', 'easy'] as const).some(
      (rating) => patch.spacing[rating] !== settings.spacing[rating],
    ) ||
    patch.newCardsPerDay !== settings.newCardsPerDay ||
    patch.unlimitedNewCards !== settings.unlimitedNewCards ||
    patch.cardTimer.enabled !== settings.cardTimer.enabled ||
    patch.cardTimer.seconds !== settings.cardTimer.seconds ||
    patch.cardTimer.autoReveal !== settings.cardTimer.autoReveal ||
    WEEKDAY_KEYS.some((day) => patch.easyDays[day] !== settings.easyDays[day]) ||
    patch.reviewsPerDay !== settings.reviewsPerDay ||
    patch.dailyGoal.metric !== settings.dailyGoal.metric ||
    patch.dailyGoal.value !== settings.dailyGoal.value ||
    STUDY_KEYS.some((key) => patch[key] !== settings[key]) ||
    patch.optionsShown !== settings.optionsShown ||
    patch.practiceFeedback !== settings.practiceFeedback
  );
}

/**
 * Metas, opciones al estudiar y repaso avanzado en un solo formulario con una sola barra de
 * guardar que aparece al haber cambios (D-078). Retención, tope e intervalos por botón quedan
 * plegados porque casi nadie los cambia
 */
function StudyForm({
  userId,
  settings,
  onSave,
}: {
  userId: string;
  settings: UserSettings;
  onSave: (patch: Partial<UserSettings>) => Promise<unknown>;
}) {
  const [draft, setDraft] = useState(() => draftOf(settings));
  const [status, setStatus] = useState('');
  const change = (patch: Partial<StudyDraft>) => {
    setDraft((current) => ({ ...current, ...patch }));
    setStatus('');
  };
  const patch = patchOf(draft);
  const dirty = differs(patch, settings);
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        void onSave(patch).then(() => {
          setStatus(t.settings.saved);
        });
      }}
    >
      <fieldset>
        <legend className="eyebrow mb-2 text-fg-muted">{t.settings.dailyTitle}</legend>
        <div className="grid grid-cols-2 items-end gap-3 lg:grid-cols-4">
          <TextField
            label={t.settings.newCardsPerDay}
            type="number"
            inputMode="numeric"
            min={0}
            max={500}
            value={draft.newCards}
            disabled={draft.unlimitedNewCards}
            onChange={(event) => {
              change({ newCards: event.target.value });
            }}
          />
          <TextField
            label={t.settings.reviewsPerDay}
            type="number"
            inputMode="numeric"
            min={0}
            max={5000}
            value={draft.reviews}
            onChange={(event) => {
              change({ reviews: event.target.value });
            }}
          />
          <SelectField
            label={t.onboarding.goalMetric}
            value={draft.metric}
            options={(['cards', 'questions', 'focusMinutes'] as const).map((value) => ({
              value,
              label: t.onboarding.goalMetrics[value],
            }))}
            onChange={(event) => {
              change({ metric: event.target.value as UserSettings['dailyGoal']['metric'] });
            }}
          />
          <TextField
            label={t.onboarding.goalValue}
            type="number"
            inputMode="numeric"
            min={1}
            max={1000}
            value={draft.goal}
            onChange={(event) => {
              change({ goal: event.target.value });
            }}
          />
        </div>
        <CheckboxField
          className="mt-3"
          label={t.settings.unlimitedNewCards}
          hint={t.settings.unlimitedNewCardsHint}
          checked={draft.unlimitedNewCards}
          onChange={(event) => {
            change({ unlimitedNewCards: event.target.checked });
          }}
        />
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="eyebrow mb-1 text-fg-muted">{t.settings.studyOptionsTitle}</legend>
        {STUDY_KEYS.map((key) => (
          <CheckboxField
            key={key}
            label={t.settings[key]}
            hint={key === 'cardConfidenceStep' ? t.settings.cardConfidenceStepHint : undefined}
            checked={draft[key]}
            onChange={(event) => {
              change({ [key]: event.target.checked });
            }}
          />
        ))}
        <SelectField
          className="max-w-72"
          label={t.settings.practiceFeedback}
          value={draft.practiceFeedback}
          options={(['end', 'each'] as const).map((value) => ({
            value,
            label: t.settings.practiceFeedbackOptions[value],
          }))}
          onChange={(event) => {
            change({ practiceFeedback: event.target.value as UserSettings['practiceFeedback'] });
          }}
        />
        <SelectField
          className="max-w-56"
          label={t.settings.optionsShown}
          value={String(draft.optionsShown)}
          options={[4, 5, 6].map((n) => ({ value: String(n), label: String(n) }))}
          onChange={(event) => {
            change({ optionsShown: Number(event.target.value) });
          }}
        />
      </fieldset>

      <FeatureGate userId={userId} feature="cardTimer">
        <CardTimerFields
          value={draft.cardTimer}
          onChange={(cardTimer) => {
            change({ cardTimer });
          }}
        />
      </FeatureGate>

      <FeatureGate userId={userId} feature="easyDays">
        <Disclosure
          title={t.settings.easyDaysTitle}
          summary={t.settings.easyDaysSummary(
            WEEKDAY_KEYS.filter((day) => draft.easyDays[day] !== 'normal').length,
          )}
        >
          <EasyDaysFields
            value={draft.easyDays}
            onChange={(easyDays) => {
              change({ easyDays });
            }}
          />
        </Disclosure>
      </FeatureGate>

      <Disclosure
        title={t.settings.advanced}
        summary={t.settings.advancedSummary(
          Math.round(patch.desiredRetention * 100),
          patch.maxIntervalDays,
        )}
      >
        <TextField
          label={t.settings.retention}
          hint={t.settings.retentionHint}
          type="number"
          min={80}
          max={97}
          value={draft.retention}
          onChange={(event) => {
            change({ retention: event.target.value });
          }}
        />
        <SelectField
          label={t.settings.maxInterval}
          hint={t.settings.maxIntervalHint}
          value={draft.maxInterval}
          options={maxIntervalOptions(draft.maxInterval).map((value) => ({
            value,
            label: t.settings.maxIntervalOption(fromOption(value)),
          }))}
          onChange={(event) => {
            change({ maxInterval: event.target.value });
          }}
        />
        <fieldset className="flex flex-col gap-2 rounded-lg bg-muted p-3">
          <legend className="eyebrow text-fg-muted">{t.settings.spacingTitle}</legend>
          <p className="text-sm text-fg-muted">{t.settings.spacingHint}</p>
          <div className="grid gap-3 sm:grid-cols-3">
            {(['hard', 'good', 'easy'] as const).map((rating) => (
              <SelectField
                key={rating}
                label={t.settings.spacingLabels[rating]}
                value={String(Math.round(draft.spacing[rating] * 100))}
                options={SPACING_OPTIONS.map((percent) => ({
                  value: String(percent),
                  label: t.settings.spacingOption(percent),
                }))}
                onChange={(event) => {
                  change({
                    spacing: { ...draft.spacing, [rating]: Number(event.target.value) / 100 },
                  });
                }}
              />
            ))}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="self-start"
            onClick={() => {
              change({
                spacing: { hard: 1, good: 1, easy: 1 },
                maxInterval: '21',
                retention: '90',
              });
            }}
          >
            {t.settings.resetRecommended}
          </Button>
        </fieldset>
      </Disclosure>

      <SaveBar
        dirty={dirty}
        status={status}
        onDiscard={() => {
          setDraft(draftOf(settings));
          setStatus(t.settings.discarded);
        }}
      />
    </form>
  );
}

/** Estado de la cuenta en la nube. Solo aparece si Supabase está configurado (D-075) */
function CloudStatus() {
  const state = useCloud((store) => store.state);
  if (state.status === 'off') return null;
  const text =
    state.status === 'linked'
      ? t.cloud.linked(state.identity.email)
      : state.status === 'checking'
        ? t.cloud.checking
        : state.status === 'error'
          ? t.cloud.error
          : t.cloud.notLinked;
  return (
    <>
      <div className="mt-3 rounded-md bg-muted p-3 text-sm">
        <p className="font-semibold">{t.cloud.statusTitle}</p>
        <p className="text-fg-muted">{text}</p>
      </div>
      {state.status === 'linked' ? <SyncStatus /> : null}
    </>
  );
}
