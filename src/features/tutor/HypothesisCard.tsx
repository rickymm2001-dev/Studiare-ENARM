// Tarjeta de una hipótesis del tutor (8.2). Dice qué cree, con su confianza, deja ver la evidencia,
// ofrece las acciones que la app sabe ejecutar y guarda si le sirvió al alumno. Nunca afirma, solo
// propone, y cada línea de evidencia es un error real del alumno.
import { GraduationCap, ThumbsDown, ThumbsUp } from 'lucide-react';
import { Link } from 'react-router';
import { screenPath } from '@/app/screens';
import { t } from '@/i18n/es-MX';
import { Badge } from '@/ui/components/badge';
import { Button } from '@/ui/components/button';
import { Card } from '@/ui/components/card';
import { Disclosure } from '@/ui/components/disclosure';
import { TOPIC_NAMES } from '../shared/topics';
import type { Hypothesis, TutorAction } from './tutorModel';

const dayFormat = new Intl.DateTimeFormat('es-MX', {
  day: 'numeric',
  month: 'short',
  timeZone: 'America/Merida',
});

export interface EvidenceLookup {
  /** Texto con el que se nombra una pregunta o tarjeta. undefined si ya no está */
  labelOf: (kind: 'question' | 'card', itemId: string) => string | undefined;
}

export type ArtifactStatus = 'draft' | 'approved' | 'edited' | 'rejected';

export function HypothesisCard({
  hypothesis,
  status,
  lookup,
  baseTopic,
  message,
  busy,
  compact = false,
  onAction,
  onRespond,
}: {
  hypothesis: Hypothesis;
  /** Lo que respondió el alumno. undefined si todavía no responde */
  status: ArtifactStatus | undefined;
  lookup: EvidenceLookup;
  /** Tema base, si la regla es brecha de base */
  baseTopic: string | undefined;
  /** Resultado de la última acción que aplicó */
  message: string | undefined;
  busy: boolean;
  /** Sin el marco de tarjeta, para las hipótesis que van dentro de una fila que se abre */
  compact?: boolean;
  onAction: (action: TutorAction) => void;
  onRespond: (helpful: boolean) => void;
}) {
  const text = t.tutor;
  const rule = text.rules[hypothesis.rule as keyof typeof text.rules];
  const areaName = TOPIC_NAMES.get(hypothesis.area) ?? hypothesis.area;
  const practiceTopic =
    hypothesis.rule === 'foundation_gap' && baseTopic ? baseTopic : hypothesis.area;
  const id = `hipotesis-${hypothesis.key.replace(/[^a-z0-9]+/gi, '-')}`;

  const Frame = compact ? 'section' : Card;
  return (
    <Frame
      aria-labelledby={id}
      className={compact ? 'flex flex-col' : 'border-l-4 border-l-primary'}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="info">
          <GraduationCap aria-hidden className="size-3.5" />
          {text.confirmedBadge}
        </Badge>
        <Badge variant="neutral">{text.confidence[hypothesis.confidence]}</Badge>
        <span className="text-sm text-fg-muted">{text.findings(hypothesis.recentFindings)}</span>
      </div>
      <h3 id={id} className="mt-2 text-lg font-bold">
        {rule.title}
      </h3>
      <p className="mt-1">{rule.hypothesis(areaName)}</p>
      <p className="mt-2 text-sm text-fg-muted">{rule.message}</p>
      {hypothesis.causeMismatches > 0 ? (
        <p className="mt-2 text-sm text-fg-muted">
          {text.causeMismatch(hypothesis.causeMismatches, hypothesis.causesReported)}
        </p>
      ) : null}

      <Disclosure
        className="mt-3"
        title={text.showEvidence}
        summary={text.findings(hypothesis.items.length)}
      >
        <p className="text-sm font-medium">{text.evidenceTitle}</p>
        <ul className="flex flex-col gap-1.5 text-sm">
          {hypothesis.items.map((item) => {
            const label = lookup.labelOf(item.kind, item.itemId);
            const other = item.confusedWithItemId
              ? lookup.labelOf('question', item.confusedWithItemId)
              : undefined;
            return (
              <li key={item.eventId} className="flex flex-col rounded-md bg-muted px-2 py-1.5">
                <span className="text-xs text-fg-muted">
                  {text.evidenceKind[item.kind]} · {dayFormat.format(new Date(item.at))}
                </span>
                <span>{label ?? text.evidenceMissing}</span>
                {other ? (
                  <span className="text-fg-muted">{text.evidenceConfused(other)}</span>
                ) : null}
              </li>
            );
          })}
        </ul>
      </Disclosure>

      {status === 'approved' || status === 'rejected' ? null : (
        <>
          <p className="mt-3 text-sm font-medium">{text.actionsTitle}</p>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {hypothesis.actions.map((action) => (
              <ActionButton
                key={action}
                action={action}
                topic={action === 'subtopic_simulator' ? practiceTopic : hypothesis.area}
                practiceBase={hypothesis.rule === 'foundation_gap'}
                busy={busy}
                onAction={onAction}
              />
            ))}
          </div>
        </>
      )}
      {message ? (
        <p role="status" className="mt-2 text-sm font-medium text-success">
          {message}
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
        {status === 'approved' ? (
          <p role="status" className="text-sm text-fg-muted">
            {text.answered.approved}
          </p>
        ) : (
          <>
            <Button
              size="sm"
              variant="secondary"
              disabled={busy}
              onClick={() => {
                onRespond(true);
              }}
            >
              <ThumbsUp aria-hidden />
              {text.helpful}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => {
                onRespond(false);
              }}
            >
              <ThumbsDown aria-hidden />
              {text.notHelpful}
            </Button>
          </>
        )}
      </div>
    </Frame>
  );
}

/** Las acciones que llevan a otra pantalla son enlaces y las que cambian algo son botones */
function ActionButton({
  action,
  topic,
  practiceBase,
  busy,
  onAction,
}: {
  action: TutorAction;
  topic: string;
  practiceBase: boolean;
  busy: boolean;
  onAction: (action: TutorAction) => void;
}) {
  const label =
    action === 'subtopic_simulator' && practiceBase
      ? t.tutor.practiceBase
      : t.tutor.actions[action];
  const to =
    action === 'review_explanation'
      ? screenPath('review')
      : action === 'split_card'
        ? screenPath('decks')
        : action === 'subtopic_simulator'
          ? `${screenPath('simulatorSetup')}?topic=${encodeURIComponent(topic)}`
          : null;
  if (to) {
    return (
      <Button asChild size="sm" variant="secondary">
        <Link
          to={to}
          onClick={() => {
            onAction(action);
          }}
        >
          {label}
        </Link>
      </Button>
    );
  }
  return (
    <Button
      size="sm"
      variant="secondary"
      disabled={busy}
      onClick={() => {
        onAction(action);
      }}
    >
      {label}
    </Button>
  );
}
