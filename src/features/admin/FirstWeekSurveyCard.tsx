// La encuesta de los primeros días en Usuarios (B18 del plan del cambio, 2.1 y 2.4 del diseño). Solo la ven el dueño y los
// admins, y la base no deja pasar a nadie más. Trae el interruptor con los días de espera y la fecha límite de las
// cuentas, los conteos (cuántas cuentas cumplen el ajuste y cuántas contestaron), una tabla por pregunta con su mediana,
// la lista de respuestas por código con su comentario, y Exportar CSV. Nada de lo que llega dice de quién es una
// respuesta: ni correo, ni nombre, ni alias, ni fecha, ni los días que llevaba la cuenta. Con menos de 3 respuestas dice
// que cualquiera puede deducir quién escribió qué y no muestra medianas.
//
// Que la sesión que mantiene el proyecto no lea los comentarios es una regla de conducta (D-139) y no un control técnico:
// esta tarjeta los pinta para quien la abre con su sesión de dueño o admin, y una conexión a la base como postgres podría
// leer la tabla. A la sesión solo se le pasa el resumen por conteos (admin_survey_summary), nunca esta lista.
import { Download } from 'lucide-react';
import { useEffect, useState, type SyntheticEvent } from 'react';
import { loadCloud } from '@/data/cloud/client';
import {
  MAX_DELAY_DAYS,
  isCalendarDate,
  readSurveyResponses,
  readSurveySetting,
  readSurveySummary,
  writeSurveySetting,
  type SurveyFailure,
  type SurveyResponseRow,
  type SurveySetting,
  type SurveySummary,
} from '@/data/cloud/survey';
import { surveyAdminTexts } from '@/i18n/survey';
import { Button } from '@/ui/components/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/ui/components/card';
import { CheckboxField, TextField } from '@/ui/components/field';
import { DESKTOP_QUERY, useMediaQuery } from '@/ui/hooks/use-media-query';
import { LoadingState } from '@/ui/states/states';
import { downloadText } from '../physician/bankTemplates';
import { answerLine, surveyCsv } from './surveyCsv';
import { MIN_ANSWERS_FOR_MEDIAN, questionViews } from './surveyView';

const text = surveyAdminTexts.card;

/**
 * El comentario es texto libre de hasta 500 caracteres y puede venir sin un espacio (una dirección larga pegada). break-words
 * no basta en una celda de tabla, porque no baja el ancho mínimo de la columna y la página se estira (más de 3,600 px
 * en una pantalla de 1280). overflow-wrap anywhere sí lo baja y parte la palabra donde haga falta. No se junta con
 * break-words, que pone overflow-wrap break-word y, según el orden del CSS, le gana
 */
const WRAP_FREE_TEXT = '[overflow-wrap:anywhere]';

type State =
  | { status: 'loading' }
  | { status: 'failed'; reason: SurveyFailure }
  | {
      status: 'ready';
      setting: SurveySetting;
      summary: SurveySummary;
      rows: SurveyResponseRow[];
    };

export function FirstWeekSurveyCard() {
  const [state, setState] = useState<State>({ status: 'loading' });
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let stopped = false;
    void loadCloud().then(async (cloud) => {
      if (!cloud) {
        if (!stopped) setState({ status: 'failed', reason: 'network' });
        return;
      }
      const [setting, summary, responses] = await Promise.all([
        readSurveySetting(cloud),
        readSurveySummary(cloud),
        readSurveyResponses(cloud),
      ]);
      if (stopped) return;
      if (!summary.ok) setState({ status: 'failed', reason: summary.reason });
      else if (!responses.ok) setState({ status: 'failed', reason: responses.reason });
      else if (setting === null) setState({ status: 'failed', reason: 'network' });
      else {
        setState({ status: 'ready', setting, summary: summary.summary, rows: responses.rows });
      }
    });
    return () => {
      stopped = true;
    };
  }, [reload]);

  return (
    <Card aria-labelledby="encuesta-admin-titulo">
      <CardHeader>
        <CardTitle id="encuesta-admin-titulo">{text.title}</CardTitle>
        <CardDescription>{text.description}</CardDescription>
      </CardHeader>
      {state.status === 'loading' ? <LoadingState label={text.loading} /> : null}
      {state.status === 'failed' ? (
        <div className="flex flex-col items-start gap-2">
          <p role="alert" className="rounded-md bg-danger-soft p-3 text-sm text-danger">
            {state.reason === 'not_admin' ? text.notAdmin : text.failed}
          </p>
          {state.reason === 'not_admin' ? null : (
            <Button
              variant="secondary"
              onClick={() => {
                setState({ status: 'loading' });
                setReload((value) => value + 1);
              }}
            >
              {text.retry}
            </Button>
          )}
        </div>
      ) : null}
      {state.status === 'ready' ? (
        <div className="flex flex-col gap-6">
          <SettingForm
            setting={state.setting}
            onSaved={() => {
              setReload((value) => value + 1);
            }}
          />
          <Counts summary={state.summary} />
          <ByQuestion summary={state.summary} />
          <Responses rows={state.rows} />
        </div>
      ) : null}
    </Card>
  );
}

// ===================================================================== El ajuste

function SettingForm({ setting, onSaved }: { setting: SurveySetting; onSaved: () => void }) {
  const form = text.settings;
  const [enabled, setEnabled] = useState(setting.enabled);
  const [delay, setDelay] = useState(String(setting.delayDays));
  const [until, setUntil] = useState(setting.accountsUntil ?? '');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  const delayValue = /^\d{1,2}$/.test(delay.trim()) ? Number(delay.trim()) : null;
  const delayError = delayValue === null || delayValue > MAX_DELAY_DAYS ? form.invalidDelay : null;
  const untilError = until.trim() === '' || isCalendarDate(until.trim()) ? null : form.invalidUntil;

  const save = async (event: SyntheticEvent) => {
    event.preventDefault();
    if (saving || delayError !== null || untilError !== null || delayValue === null) return;
    setSaving(true);
    setMessage(null);
    const cloud = await loadCloud();
    const saved = cloud
      ? await writeSurveySetting(cloud, {
          enabled,
          id: setting.id,
          delayDays: delayValue,
          accountsUntil: until.trim() === '' ? null : until.trim(),
        })
      : false;
    setSaving(false);
    setMessage(saved ? { kind: 'ok', text: form.saved } : { kind: 'error', text: form.saveFailed });
    if (saved) onSaved();
  };

  return (
    <form noValidate className="flex flex-col gap-3" onSubmit={(event) => void save(event)}>
      <fieldset className="m-0 flex min-w-0 flex-col gap-3 border-0 p-0">
        <legend className="mb-1 p-0 text-sm font-semibold">{form.legend}</legend>
        <CheckboxField
          label={form.enabled}
          hint={form.enabledHint}
          checked={enabled}
          onChange={(event) => {
            setEnabled(event.target.checked);
            setMessage(null);
          }}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField
            label={form.delay}
            hint={form.delayHint}
            error={delayError}
            type="number"
            inputMode="numeric"
            min={0}
            max={MAX_DELAY_DAYS}
            value={delay}
            onChange={(event) => {
              setDelay(event.target.value);
              setMessage(null);
            }}
          />
          <TextField
            label={form.until}
            hint={form.untilHint}
            error={untilError}
            type="date"
            value={until}
            onChange={(event) => {
              setUntil(event.target.value);
              setMessage(null);
            }}
          />
        </div>
      </fieldset>
      <Button
        type="submit"
        className="self-start"
        disabled={saving || delayError !== null || untilError !== null}
      >
        {saving ? form.saving : form.save}
      </Button>
      {message ? (
        <p
          role={message.kind === 'error' ? 'alert' : 'status'}
          className={
            message.kind === 'error'
              ? 'rounded-md bg-danger-soft p-3 text-sm text-danger'
              : 'rounded-md bg-muted p-3 text-sm'
          }
        >
          {message.text}
        </p>
      ) : null}
    </form>
  );
}

// ===================================================================== Conteos

function Counts({ summary }: { summary: SurveySummary }) {
  const few = summary.answered > 0 && summary.answered < MIN_ANSWERS_FOR_MEDIAN;
  return (
    <section
      aria-label={text.counts.region}
      className="flex flex-col gap-2 border-t border-line pt-4"
    >
      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {(
          [
            [text.counts.eligible, summary.eligible],
            [text.counts.answered, summary.answered],
            [text.counts.comments, summary.comments],
          ] as const
        ).map(([label, value]) => (
          <div key={label} className="flex flex-col">
            <dt className="text-sm text-fg-muted">{label}</dt>
            <dd className="text-2xl font-semibold tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
      {summary.answered === 0 ? <p className="text-sm text-fg-muted">{text.empty}</p> : null}
      {few ? (
        <p role="note" className="rounded-md bg-warning-soft p-3 text-sm text-fg">
          {text.few(summary.answered)}
        </p>
      ) : null}
      <p className="text-sm text-fg-muted">{text.pseudonym}</p>
    </section>
  );
}

// ===================================================================== Por pregunta

function ByQuestion({ summary }: { summary: SurveySummary }) {
  if (summary.answered === 0) return null;
  return (
    <section aria-label={text.byQuestion} className="flex flex-col gap-4 border-t border-line pt-4">
      <h3 className="text-sm font-semibold">{text.byQuestion}</h3>
      <div className="grid items-start gap-4 md:grid-cols-2">
        {questionViews(summary).map((view) => (
          <table key={view.id} className="w-full text-sm">
            <caption className="pb-1 text-left font-medium">{view.label}</caption>
            <tbody className="divide-y divide-line">
              {view.options.map((option) => (
                <tr key={option.value}>
                  <th scope="row" className="py-1.5 text-left font-normal">
                    {option.label}
                  </th>
                  <td className="py-1.5 pl-2 text-right font-semibold whitespace-nowrap tabular-nums">
                    {text.people(option.count)}
                  </td>
                </tr>
              ))}
              {view.isScale ? (
                <tr>
                  <th scope="row" className="py-1.5 text-left font-semibold">
                    {view.median === null ? text.notEnough : text.median(view.median)}
                  </th>
                  <td />
                </tr>
              ) : null}
            </tbody>
          </table>
        ))}
      </div>
    </section>
  );
}

// ===================================================================== Respuestas

function Responses({ rows }: { rows: SurveyResponseRow[] }) {
  const desktop = useMediaQuery(DESKTOP_QUERY);
  if (rows.length === 0) return null;
  return (
    <section
      aria-label={text.responses}
      className="flex min-w-0 flex-col gap-3 border-t border-line pt-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">{text.responses}</h3>
          <p className="text-sm text-fg-muted">{text.responsesNote}</p>
        </div>
        <Button
          variant="secondary"
          onClick={() => {
            downloadText(text.csv.fileName, surveyCsv(rows), 'text/csv;charset=utf-8');
          }}
        >
          <Download aria-hidden />
          {text.exportCsv}
        </Button>
      </div>
      <p className="text-sm text-fg-muted">{text.exportNote}</p>
      {desktop ? (
        <table className="w-full text-sm">
          <caption className="sr-only">{text.responses}</caption>
          <thead>
            <tr className="text-left text-fg-muted">
              <th scope="col" className="py-1.5 pr-3 font-medium">
                {text.column.code}
              </th>
              <th scope="col" className="py-1.5 pr-3 font-medium">
                {text.column.answers}
              </th>
              <th scope="col" className="py-1.5 font-medium">
                {text.column.comment}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line align-top">
            {rows.map((row) => (
              <tr key={row.code}>
                <th scope="row" className="py-2 pr-3 text-left font-mono font-semibold">
                  {row.code}
                </th>
                <td className="py-2 pr-3">{answerLine(row.answers)}</td>
                <td className={`py-2 ${WRAP_FREE_TEXT}`}>
                  {row.comment ?? <span className="text-fg-muted">{text.noComment}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <ul className="flex flex-col divide-y divide-line">
          {rows.map((row) => (
            <li key={row.code} className="flex min-w-0 flex-col gap-1 py-3">
              <p>
                <span className="font-mono font-semibold">{row.code}</span>
              </p>
              <p className="text-sm">{answerLine(row.answers)}</p>
              <p className={`text-sm ${WRAP_FREE_TEXT}`}>
                {row.comment ?? <span className="text-fg-muted">{text.noComment}</span>}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
