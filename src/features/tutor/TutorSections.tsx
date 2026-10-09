// Secciones del tutor que no son hipótesis. Posibles patrones que todavía calibran, informe semanal
// con plantilla, consejos por sesgo y el espacio de las tarjetas en borrador que llena la Fase D.
import { Lightbulb, Play, Target } from 'lucide-react';
import { Link } from 'react-router';
import { screenPath } from '@/app/screens';
import { t } from '@/i18n/es-MX';
import { Badge } from '@/ui/components/badge';
import { Button } from '@/ui/components/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/ui/components/card';
import { ProgressBar } from '@/ui/components/progress-bar';
import { CalibratingNote } from '@/ui/states/states';
import { INSIGHT_MINIMUMS } from '@/engines/insights';
import { DraftBadge } from '../shared/DraftBadge';
import { TOPIC_NAMES } from '../shared/topics';
import type { Vocabulary } from '@/i18n/vocabulary';
import type { BiasTipAi, ReportAi } from './aiContent';
import { reportRefOf } from './aiInputs';
import { AiWritten } from './AiWritten';
import type { BiasTip } from './tutorView';
import type { Hypothesis } from './tutorModel';
import type { ReportLine, WeeklyReport } from './weeklyReport';

const FINDINGS_FOR_PATTERN = 5;

/** Patrones que todavía no llegan a 5 hallazgos. Se muestran calibrando con cuánto falta */
export function FormingPatterns({ forming }: { forming: readonly Hypothesis[] }) {
  const text = t.tutor;
  if (forming.length === 0) return null;
  return (
    <Card aria-labelledby="patrones-formando">
      <CardHeader className="mb-3">
        <CardTitle id="patrones-formando">{text.formingTitle}</CardTitle>
        <CardDescription>{text.formingHint}</CardDescription>
      </CardHeader>
      <ul className="flex flex-col gap-3">
        {forming.slice(0, 6).map((pattern) => {
          const title = text.rules[pattern.rule as keyof typeof text.rules].title;
          const area = TOPIC_NAMES.get(pattern.area) ?? pattern.area;
          const label = text.formingRow(title, area, pattern.recentFindings, FINDINGS_FOR_PATTERN);
          return (
            <li key={pattern.key} className="flex flex-col gap-1">
              <span className="text-sm">{label}</span>
              <ProgressBar
                value={pattern.recentFindings}
                max={FINDINGS_FOR_PATTERN}
                label={label}
                className="h-2"
              />
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function LineLink({ line, label }: { line: ReportLine; label: string }) {
  return (
    <Button asChild size="sm" variant="secondary" className="shrink-0">
      <Link to={line.to}>
        <Play aria-hidden />
        {label}
        <span className="sr-only">. {line.title}</span>
      </Link>
    </Button>
  );
}

/** Informe de la semana. Tres prioridades, un hábito y un reto, sin lo que sigue calibrando */
export function WeeklyReportCard({
  report,
  ai,
}: {
  report: WeeklyReport;
  /** Lo que redactó la IA para la semana. undefined si todavía no hay */
  ai?: ReportAi | undefined;
}) {
  const text = t.tutor.report;
  const aiText = new Map((ai?.priorities ?? []).map((line) => [line.ref, line.text]));
  return (
    <Card aria-labelledby="informe-semana">
      <CardHeader className="mb-3">
        <CardTitle id="informe-semana" className="flex items-center gap-2 [&_svg]:size-5">
          <Target aria-hidden className="text-primary" />
          {text.title}
        </CardTitle>
        <CardDescription>{text.hint}</CardDescription>
      </CardHeader>
      {report.ready ? (
        <div className="flex flex-col gap-4">
          {ai ? (
            <div className="flex flex-col gap-1.5">
              <p>{ai.summary}</p>
              <AiWritten mode={ai.mode} />
            </div>
          ) : null}
          <section aria-labelledby="informe-prioridades">
            <h3
              id="informe-prioridades"
              className="mb-1.5 text-sm font-bold text-fg-muted uppercase"
            >
              {text.priorities}
            </h3>
            {report.priorities.length === 0 ? (
              <p className="text-sm text-fg-muted">{text.noPriorities}</p>
            ) : (
              <ol className="flex flex-col gap-2">
                {report.priorities.map((item, index) => (
                  <li key={item.key} className="flex items-start gap-3">
                    <span
                      aria-hidden
                      className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-primary-soft text-xs font-bold text-primary"
                    >
                      {index + 1}
                    </span>
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="leading-snug font-semibold">{item.title}</span>
                      <span className="text-sm text-fg-muted">
                        {aiText.get(reportRefOf(item.key)) ?? item.action}
                      </span>
                      {item.draft ? <DraftBadge className="mt-1 self-start" /> : null}
                    </div>
                    <LineLink line={{ ...item, text: item.action }} label={text.go} />
                  </li>
                ))}
              </ol>
            )}
          </section>
          {report.habit ? (
            <section aria-labelledby="informe-habito">
              <h3 id="informe-habito" className="mb-1.5 text-sm font-bold text-fg-muted uppercase">
                {text.habit}
              </h3>
              <div className="flex items-start gap-3">
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="leading-snug font-semibold">{report.habit.title}</span>
                  <span className="text-sm text-fg-muted">{ai?.habit ?? report.habit.text}</span>
                </div>
                <LineLink line={report.habit} label={text.go} />
              </div>
            </section>
          ) : null}
          {report.challenge ? (
            <section aria-labelledby="informe-reto">
              <h3 id="informe-reto" className="mb-1.5 text-sm font-bold text-fg-muted uppercase">
                {text.challenge}
              </h3>
              <div className="flex items-start gap-3">
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="leading-snug font-semibold">{report.challenge.title}</span>
                  <span className="text-sm text-fg-muted">
                    {ai?.challenge ?? report.challenge.text}
                  </span>
                </div>
                <LineLink line={report.challenge} label={text.go} />
              </div>
            </section>
          ) : null}
        </div>
      ) : (
        <CalibratingNote
          current={report.have}
          target={Math.max(report.need, INSIGHT_MINIMUMS.answers)}
          unit={text.unit}
        />
      )}
    </Card>
  );
}

/**
 * Consejos por sesgo. Solo de las trampas que ya se repiten en los errores del alumno y solo cuando
 * ya hay errores con trampa etiquetada suficientes. Antes dice cuántos lleva y cuántos pide (4.3)
 */
export function BiasTipsCard({
  tips,
  calibration,
  ai,
  vocabulary = 'trap',
}: {
  /** Habla de sesgos solo cuando los médicos coinciden al etiquetar (4.4) */
  vocabulary?: Vocabulary;
  tips: readonly BiasTip[];
  /** Lo que redactó la IA por trampa. Falta la que todavía no se pide */
  ai?: ReadonlyMap<string, BiasTipAi> | undefined;
  /** Errores con trampa etiquetada que lleva y que pide el motor. null si ya no calibra */
  calibration: { have: number; need: number } | null;
}) {
  const text = t.tutor.biasTips;
  return (
    <Card aria-labelledby="consejos-sesgo">
      <CardHeader className="mb-3">
        <CardTitle id="consejos-sesgo" className="flex items-center gap-2 [&_svg]:size-5">
          <Lightbulb aria-hidden className="text-accent" />
          {t.vocabulary[vocabulary].biasTipsTitle}
        </CardTitle>
        <CardDescription>{text.hint}</CardDescription>
      </CardHeader>
      {calibration ? (
        <CalibratingNote current={calibration.have} target={calibration.need} unit={text.unit} />
      ) : tips.length === 0 ? (
        <p className="text-sm text-fg-muted">{text.none}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {tips.map((tip) => (
            <li key={tip.tag} className="flex flex-col gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{tip.name}</span>
                {tip.reviewed ? (
                  <Badge variant="success">{text.reviewedLabel}</Badge>
                ) : ai?.has(tip.tag) ? null : (
                  <DraftBadge />
                )}
              </div>
              <p className="text-sm">{ai?.get(tip.tag)?.tip ?? tip.tip}</p>
              {ai?.has(tip.tag) ? <AiWritten mode={ai.get(tip.tag)?.mode ?? 'mock'} /> : null}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/** El lugar de las tarjetas que propondrá la IA. Mientras tanto Mis errores ya hace ese trabajo */
export function DraftCardsCard({ errorCards }: { errorCards: number }) {
  const text = t.tutor.drafts;
  return (
    <Card aria-labelledby="tarjetas-borrador">
      <CardHeader className="mb-2">
        <CardTitle id="tarjetas-borrador">{text.title}</CardTitle>
        <CardDescription>{text.body}</CardDescription>
      </CardHeader>
      <p className="text-sm text-fg-muted">{text.meanwhile}</p>
      {errorCards > 0 ? (
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <span className="text-sm font-medium">{text.mine(errorCards)}</span>
          <Button asChild size="sm" variant="secondary">
            <Link to={screenPath('review')}>{text.go}</Link>
          </Button>
        </div>
      ) : null}
    </Card>
  );
}
