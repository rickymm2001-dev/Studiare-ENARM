// Configuración, sección Privacidad (Fase E bloque E6, D-101). El alumno da o retira cada
// consentimiento cuando quiera, y guarda de forma voluntaria su puntaje oficial del ENARM, que solo
// se admite con el permiso de mejora anónima y se borra al retirarlo.
import { useState, type SyntheticEvent } from 'react';
import { useDataApi } from '@/data/context';
import { useLiveData } from '@/data/hooks';
import type { ConsentPurposeSchema } from '@/data/schemas/common';
import {
  OfficialScoreError,
  changeConsent,
  removeOfficialScore,
  submitOfficialScore,
} from '@/data/usecases/privacy';
import { currentConsents } from '@/data/usecases/profile';
import { t } from '@/i18n/es-MX';
import { Button } from '@/ui/components/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/ui/components/card';
import { CheckboxField, TextField } from '@/ui/components/field';
import type { ReadySession } from '../shared/RequireSession';
import type { z } from 'zod';

type Purpose = z.infer<typeof ConsentPurposeSchema>;
const PURPOSES: readonly Purpose[] = ['party', 'ai_analysis', 'anonymized_improvement'];

export function PrivacySection({ session }: { session: ReadySession }) {
  return (
    <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-2">
      <ConsentsCard session={session} />
      <OfficialScoreCard session={session} />
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
        <CardTitle id="consentimientos-titulo">{t.settings.privacy.consentsTitle}</CardTitle>
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
                  () => {
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
    </Card>
  );
}

function OfficialScoreCard({ session }: { session: ReadySession }) {
  const api = useDataApi();
  const { user } = session;
  const consents = useLiveData(() => currentConsents(api, user.id), [api.repos, user.id]);
  // null cuando no hay puntaje guardado. undefined mientras carga
  const saved = useLiveData(
    async () => (await api.repos.officialScores.get(user.id)) ?? null,
    [api.repos, user.id],
  );
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [score, setScore] = useState('');
  // Dónde mostrar el error, junto al campo que lo causó
  const [error, setError] = useState<{ field: 'year' | 'score'; text: string } | null>(null);
  const [status, setStatus] = useState('');
  const allowed = consents?.anonymized_improvement === true;

  const submit = (event: SyntheticEvent) => {
    event.preventDefault();
    setError(null);
    setStatus('');
    // Un campo vacío no es cero. Number('') da 0 y se guardaría un puntaje que nadie escribió
    const input = {
      year: year.trim() === '' ? Number.NaN : Number(year),
      score: score.trim() === '' ? Number.NaN : Number(score),
    };
    submitOfficialScore(api, user, input).then(
      () => {
        setScore('');
        setStatus(t.settings.privacy.scoreSaved);
      },
      (failure: unknown) => {
        if (failure instanceof OfficialScoreError) {
          setError({
            field: failure.reason === 'invalid_year' ? 'year' : 'score',
            text: t.settings.privacy.scoreErrors[failure.reason],
          });
        } else {
          setError({ field: 'score', text: t.settings.privacy.consentError });
        }
      },
    );
  };

  return (
    <Card aria-labelledby="puntaje-titulo">
      <CardHeader>
        <CardTitle id="puntaje-titulo">{t.settings.privacy.scoreTitle}</CardTitle>
        <CardDescription>{t.settings.privacy.scoreDescription}</CardDescription>
      </CardHeader>
      <p className="text-sm">
        {saved ? t.settings.privacy.current(saved.year, saved.score) : t.settings.privacy.none}
      </p>
      {allowed ? (
        <form className="flex flex-col gap-3" onSubmit={submit} noValidate>
          <div className="grid grid-cols-2 gap-3">
            <TextField
              label={t.settings.privacy.year}
              type="number"
              inputMode="numeric"
              min={2000}
              max={2100}
              required
              value={year}
              error={error?.field === 'year' ? error.text : null}
              onChange={(event) => {
                setYear(event.target.value);
              }}
            />
            <TextField
              label={t.settings.privacy.score}
              hint={t.settings.privacy.scoreHint}
              type="number"
              inputMode="decimal"
              min={0}
              max={100}
              step="0.01"
              required
              value={score}
              error={error?.field === 'score' ? error.text : null}
              onChange={(event) => {
                setScore(event.target.value);
              }}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="submit">{t.settings.privacy.saveScore}</Button>
            {saved ? (
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setError(null);
                  void removeOfficialScore(api, user.id).then(() => {
                    setStatus(t.settings.privacy.scoreRemoved);
                  });
                }}
              >
                {t.settings.privacy.removeScore}
              </Button>
            ) : null}
          </div>
        </form>
      ) : consents === undefined ? null : (
        <p className="rounded-md bg-muted p-3 text-sm text-fg-muted">
          {t.settings.privacy.scoreNeedsConsent}
        </p>
      )}
      <p role="status" className="text-sm text-fg-muted">
        {status}
      </p>
    </Card>
  );
}
