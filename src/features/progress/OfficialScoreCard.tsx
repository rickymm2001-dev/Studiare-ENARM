// Puntaje oficial del ENARM, al final de Progreso (Fase E bloque E6, D-101, B3 del plan del cambio).
// El alumno lo guarda de forma voluntaria y solo con el permiso de mejora anónima, que se da o se
// retira en Configuración, Privacidad. Al retirarlo el puntaje se borra. Studiare no lo usa para
// predecir nada ni lo muestra a otras personas.
import { useState, type SyntheticEvent } from 'react';
import { Link } from 'react-router';
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
import { settingsPath } from '../settings/sections';
import type { ReadySession } from '../shared/RequireSession';

export function OfficialScoreCard({ session }: { session: ReadySession }) {
  const api = useDataApi();
  const { user } = session;
  const text = t.settings.privacy;
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
        setStatus(text.scoreSaved);
      },
      (failure: unknown) => {
        if (failure instanceof OfficialScoreError) {
          setError({
            field: failure.reason === 'invalid_year' ? 'year' : 'score',
            text: text.scoreErrors[failure.reason],
          });
        } else {
          setError({ field: 'score', text: text.consentError });
        }
      },
    );
  };

  return (
    <Card aria-labelledby="puntaje-titulo">
      <CardHeader>
        <CardTitle id="puntaje-titulo">{text.scoreTitle}</CardTitle>
        <CardDescription>{text.scoreDescription}</CardDescription>
      </CardHeader>
      <p className="text-sm">{saved ? text.current(saved.year, saved.score) : text.none}</p>
      {allowed ? (
        <form className="mt-3 flex flex-col gap-3" onSubmit={submit} noValidate>
          <div className="grid grid-cols-2 gap-3">
            <TextField
              label={text.year}
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
              label={text.score}
              hint={text.scoreHint}
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
            <Button type="submit">{text.saveScore}</Button>
            {saved ? (
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setError(null);
                  void removeOfficialScore(api, user.id).then(() => {
                    setStatus(text.scoreRemoved);
                  });
                }}
              >
                {text.removeScore}
              </Button>
            ) : null}
          </div>
        </form>
      ) : consents === undefined ? null : (
        // El permiso se da en Configuración, Privacidad. Sin caja gris dentro de la tarjeta (H06)
        <div className="mt-3 flex flex-col items-start gap-2">
          <p className="text-sm text-fg-muted">{text.scoreNeedsConsent}</p>
          <Button asChild variant="secondary" size="sm">
            <Link to={settingsPath('privacidad')}>{t.settingsPage.officialScore.turnOn}</Link>
          </Button>
        </div>
      )}
      <p role="status" className="text-sm text-fg-muted">
        {status}
      </p>
    </Card>
  );
}
