// Captura del puntaje oficial del ENARM (D-119 B3, Fases E y P).
// Se movió de Configuración/Privacidad a Progreso (comentario 5 y 4.12).
// El permiso (anonymized_improvement) se queda en Privacidad.
import { useState, type SyntheticEvent } from 'react';
import { useDataApi } from '@/data/context';
import { useLiveData } from '@/data/hooks';
import {
  OfficialScoreError,
  removeOfficialScore,
  submitOfficialScore,
} from '@/data/usecases/privacy';
import { currentConsents } from '@/data/usecases/profile';
import { t } from '@/i18n/es-MX';
import { Button } from '@/ui/components/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/ui/components/card';
import { TextField } from '@/ui/components/field';
import type { ReadySession } from '../shared/RequireSession';

export function OfficialScoreCard({ session }: { session: ReadySession }) {
  const api = useDataApi();
  const { user } = session;
  const consents = useLiveData(() => currentConsents(api, user.id), [api.repos, user.id]);
  const saved = useLiveData(
    async () => (await api.repos.officialScores.get(user.id)) ?? null,
    [api.repos, user.id],
  );
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [score, setScore] = useState('');
  const [error, setError] = useState<{ field: 'year' | 'score'; text: string } | null>(null);
  const [status, setStatus] = useState('');
  const allowed = consents?.anonymized_improvement === true;

  const submit = (event: SyntheticEvent) => {
    event.preventDefault();
    setError(null);
    setStatus('');
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
