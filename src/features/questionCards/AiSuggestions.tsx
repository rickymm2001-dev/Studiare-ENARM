// Sugerir con IA (B5, comentario 1). El motor de tarjetas (8.4) propone tarjetas con la explicación
// de la pregunta, que es texto del banco. Cada propuesta cita la frase literal que la respalda y el
// validador descarta la que no la cite tal cual. Es borrador sin validar por un médico. El alumno
// elige una y la revisa antes de guardarla. Cuenta contra las generaciones del día de su plan, y en
// Gratis ni siquiera se monta, porque FeatureGate lo cierra.
import { Sparkles } from 'lucide-react';
import { useState } from 'react';
import {
  generateFlashcards,
  generatorFor,
  type FlashcardProposal,
  type GenerationResult,
} from '@/ai/flashcards';
import { useAiStatus } from '@/ai/useAiStatus';
import { PLANS } from '@/config/billing';
import { useDataApi } from '@/data/context';
import { useLiveData } from '@/data/hooks';
import {
  controversyOf,
  GenerationLimitError,
  generationsLeft,
  recordGeneration,
} from '@/data/usecases/aiCards';
import type { NoteDraft } from '@/data/usecases/manualDecks';
import type { QuestionCardSource } from '@/data/usecases/questionCards';
import { t } from '@/i18n/es-MX';
import { Badge } from '@/ui/components/badge';
import { Button } from '@/ui/components/button';
import { ControversySignal } from '../shared/ControversySignal';
import type { ReadySession } from '../shared/RequireSession';
import { TOPIC_NAMES } from '../shared/topics';
import { useActivePlan } from '../shared/useActivePlan';
import type { QuestionBundle } from '../simulator/useQuestion';

type Step =
  | { name: 'idle' }
  | { name: 'generating' }
  | { name: 'results'; result: GenerationResult; artifactId: string; sourceTitle: string };

/** La propuesta como tarjeta editable. El reverso de una con huecos es su nota extra */
function draftOf(proposal: FlashcardProposal): NoteDraft {
  return proposal.kind === 'cloze'
    ? { kind: 'cloze', text: proposal.front, extra: proposal.back }
    : { kind: 'basic', front: proposal.front, back: proposal.back };
}

export function AiSuggestions({
  session,
  bundle,
  onUse,
}: {
  session: ReadySession;
  bundle: QuestionBundle;
  /**
   * El alumno eligió una propuesta. sourceText es la explicación tal como la leyó el generador, ya
   * sin datos personales, para revisar la tarjeta contra su cita si el alumno la edita
   */
  onUse: (
    draft: NoteDraft,
    source: Extract<QuestionCardSource, { kind: 'ai' }>,
    sourceText: string,
  ) => void;
}) {
  const api = useDataApi();
  const status = useAiStatus();
  const plan = useActivePlan(session.user.id);
  const text = t.examReview.ai;
  const [step, setStep] = useState<Step>({ name: 'idle' });
  const [problem, setProblem] = useState<string | null>(null);
  const left = useLiveData(
    async () => (plan ? generationsLeft(api, session.user, plan) : null),
    [api.repos, plan, session.user],
  );
  // Solo la explicación del banco. Sin ella la IA no tiene de dónde citar y no propone nada (8.4)
  const explanation = bundle.question.explanation.trim();

  const generate = async () => {
    if (plan === undefined || step.name === 'generating') return;
    setProblem(null);
    setStep({ name: 'generating' });
    try {
      const names = [session.user.alias];
      const notes = await api.repos.notes.list();
      const result = await generateFlashcards({
        text: explanation,
        names,
        existing: notes.map((note) =>
          note.kind === 'cloze'
            ? { id: note.id, kind: 'cloze' as const, text: note.text }
            : { id: note.id, kind: note.kind, front: note.front },
        ),
        // A la IA solo viajan el ID seudónimo y el texto del banco
        generator: generatorFor(status, { studentRef: session.user.id, names }),
      });
      const topic = TOPIC_NAMES.get(bundle.question.topic) ?? bundle.question.topic;
      const sourceTitle = text.sourceTitle(topic);
      const recorded = await recordGeneration(api, session.user, plan, result, sourceTitle);
      setStep({ name: 'results', result, artifactId: recorded.artifactId, sourceTitle });
    } catch (error) {
      setProblem(error instanceof GenerationLimitError ? t.aiCards.limitReached : text.error);
      setStep({ name: 'idle' });
    }
  };

  if (explanation === '') return <p className="text-sm text-fg-muted">{text.noExplanation}</p>;

  const perDay = plan ? PLANS[plan].aiCardsPerDay : 0;
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-fg-muted">{text.hint}</p>
      <p className="text-sm text-fg-muted">
        {t.aiCards.modes[status.kind === 'real' ? 'real' : 'template']}
      </p>
      {left !== undefined && left !== null ? (
        <p className="text-sm font-medium">{t.aiCards.left(left, perDay)}</p>
      ) : null}
      <Button
        type="button"
        variant="secondary"
        className="self-start"
        disabled={step.name === 'generating' || left === 0 || plan === undefined}
        onClick={() => {
          void generate();
        }}
      >
        <Sparkles aria-hidden />
        {step.name === 'generating' ? text.generating : text.button}
      </Button>
      {problem ? (
        <p role="alert" className="text-sm font-medium text-danger">
          {problem}
        </p>
      ) : null}
      {step.name === 'results' ? (
        step.result.proposals.length === 0 ? (
          <p role="status" className="text-sm">
            {text.nothing}
          </p>
        ) : (
          <ul aria-label={text.proposalsTitle} className="flex flex-col gap-3">
            {step.result.proposals.map((proposal, index) => (
              <li
                key={proposal.id}
                className="flex flex-col gap-2 rounded-lg border border-line bg-surface p-3"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="neutral">{t.aiCards.kinds[proposal.kind]}</Badge>
                  <Badge variant="warning">{t.aiCards.draftLabel}</Badge>
                </div>
                <p className="font-medium whitespace-pre-line">{proposal.front}</p>
                {proposal.back !== '' ? (
                  <p className="whitespace-pre-line">{proposal.back}</p>
                ) : null}
                <blockquote className="border-l-2 border-line-strong pl-3 text-sm text-fg-muted">
                  <span className="block text-xs font-semibold">{text.quote}</span>
                  {proposal.quote}
                </blockquote>
                {proposal.duplicate ? (
                  <p className="text-sm text-warning">{t.aiCards.duplicate}</p>
                ) : null}
                {proposal.controversy ? (
                  <ControversySignal
                    controversy={{
                      ...proposal.controversy,
                      simulated: step.result.mode !== 'real',
                    }}
                  />
                ) : null}
                <Button
                  type="button"
                  size="sm"
                  className="self-start"
                  aria-label={text.useLabel(index + 1)}
                  onClick={() => {
                    onUse(
                      draftOf(proposal),
                      {
                        kind: 'ai',
                        quote: proposal.quote,
                        sourceTitle: step.sourceTitle,
                        artifactId: step.artifactId,
                        controversy: controversyOf(
                          proposal,
                          step.result.mode !== 'real',
                          new Date().toISOString(),
                        ),
                      },
                      step.result.processedText,
                    );
                  }}
                >
                  {text.use}
                </Button>
              </li>
            ))}
          </ul>
        )
      ) : null}
    </div>
  );
}
