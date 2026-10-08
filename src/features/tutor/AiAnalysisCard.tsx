// Análisis con IA del tutor (8.1). Dice en qué estado está, con texto y no solo con color. Apagado por
// omisión, porque exige el consentimiento de análisis con IA, y solo en los planes que lo incluyen.
// Encenderlo guarda el consentimiento con su evento, igual que en Perfil.
import { Sparkles } from 'lucide-react';
import { Link } from 'react-router';
import { AiModeBadge } from '@/ai/AiModeBadge';
import { screenPath } from '@/app/screens';
import { t } from '@/i18n/es-MX';
import { Button } from '@/ui/components/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/ui/components/card';
import type { TutorAiState } from './useTutorAi';

export function AiAnalysisCard({
  state,
  busy,
  onTurnOn,
}: {
  state: TutorAiState;
  busy: boolean;
  onTurnOn: () => void;
}) {
  const text = t.tutor.ai;
  if (state.access === 'loading') return null;
  return (
    <Card aria-labelledby="analisis-ia">
      <CardHeader className="mb-2">
        <CardTitle id="analisis-ia" className="flex flex-wrap items-center gap-2 [&_svg]:size-5">
          <Sparkles aria-hidden className="text-primary" />
          {text.title}
          {state.access === 'on' ? <AiModeBadge status={state.status} /> : null}
        </CardTitle>
        <CardDescription>
          {state.access === 'free-plan'
            ? text.freePlan
            : state.access === 'off'
              ? text.off
              : text.on}
        </CardDescription>
      </CardHeader>
      {state.access === 'free-plan' ? (
        <Button asChild size="sm" variant="secondary">
          <Link to={screenPath('subscription')}>{text.seePlans}</Link>
        </Button>
      ) : null}
      {state.access === 'off' ? (
        <Button size="sm" disabled={busy} onClick={onTurnOn}>
          {busy ? text.turningOn : text.turnOn}
        </Button>
      ) : null}
      {state.access === 'on' && state.status.kind === 'offline' ? (
        <p role="status" className="text-sm text-fg-muted">
          {text.offline}
        </p>
      ) : null}
      {state.access === 'on' && state.working ? (
        <p role="status" className="text-sm text-fg-muted">
          {text.working}
        </p>
      ) : null}
      {state.notice ? (
        <p role="status" className="mt-1 text-sm text-warning">
          {text.notice(state.notice)}
        </p>
      ) : null}
    </Card>
  );
}
