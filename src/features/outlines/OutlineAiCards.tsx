// Tarjetas con IA desde el apunte (B6 del plan del cambio, respuesta 74, D-085). Solo en los planes
// de pago. La IA lee las líneas que todavía no son tarjeta y propone tarjetas con el mismo generador
// y el mismo validador de Tarjetas con IA. Cada propuesta trae la frase literal de una línea del
// apunte que la respalda, con un botón para ir a esa línea, y llega como borrador sin validar por un
// médico. El alumno acepta, edita o descarta una por una. Lo que acepta va al mazo del apunte con la
// etiqueta de su tema, siempre en borrador. La IA nunca cambia el apunte ni corrige, solo señala.
import { Sparkles } from 'lucide-react';
import { useState } from 'react';
import { generatorFor } from '@/ai/flashcards';
import {
  generateOutlineCards,
  OUTLINE_AI_MIN_CHARS,
  type OutlineProposal,
} from '@/ai/outlineCards';
import { AiAccessNotice } from '@/ai/AiAccessNotice';
import { PLANS } from '@/config/billing';
import { useDataApi } from '@/data/context';
import { useLiveData } from '@/data/hooks';
import type { Outline } from '@/data/schemas/outlines';
import { GenerationLimitError, generationsLeft, recordGeneration } from '@/data/usecases/aiCards';
import { acceptOutlineProposal, discardOutlineProposal } from '@/data/usecases/outlineAi';
import { checkCard } from '@/engines/cardGen';
import type { OutlineNode } from '@/engines/outline';
import { outlineSource } from '@/engines/outlineSource';
import { t } from '@/i18n/es-MX';
import { Badge } from '@/ui/components/badge';
import { Button } from '@/ui/components/button';
import { TextAreaField } from '@/ui/components/field';
import { ControversySignal } from '../shared/ControversySignal';
import { FeatureGate } from '../shared/FeatureGate';
import type { ReadySession } from '../shared/RequireSession';
import { useActivePlan } from '../shared/useActivePlan';
import { cardsFailureText, logFailedGeneration, useCardsAi } from '../shared/useCardsAi';

interface AiProps {
  session: ReadySession;
  outline: Pick<Outline, 'id' | 'title'>;
  /** Las líneas como están en el editor, aunque falte guardarlas */
  nodes: readonly OutlineNode[];
  deckName: string;
  /** Lleva el cursor a la línea de la cita */
  onJump: (nodeId: string) => void;
}

export function OutlineAiCards(props: AiProps) {
  return (
    <section aria-labelledby="ia-del-apunte" className="flex flex-col gap-3">
      <h2 id="ia-del-apunte" className="flex items-center gap-2 text-base font-semibold">
        <Sparkles aria-hidden className="size-4 text-fg-muted" />
        {t.outlines.ai.title}
      </h2>
      <FeatureGate userId={props.session.user.id} feature="aiCards">
        <AiPanel {...props} />
      </FeatureGate>
    </section>
  );
}

interface Review {
  artifactId: string;
  simulated: boolean;
  processedText: string;
  /** Cuántas propuestas salieron, para distinguir ninguna de ya decididas */
  proposed: number;
  pending: OutlineProposal[];
  accepted: number;
  notices: string[];
}

/** La propuesta que se está editando, con su texto nuevo. El original no cambia hasta aceptar */
interface EditDraft {
  id: string;
  front: string;
  back: string;
}

function AiPanel({ session, outline, nodes, deckName, onJump }: AiProps) {
  const api = useDataApi();
  const { status, access, offered, canGenerate } = useCardsAi(session);
  const plan = useActivePlan(session.user.id);
  const text = t.outlines.ai;
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [review, setReview] = useState<Review | null>(null);
  const [draft, setDraft] = useState<EditDraft | null>(null);

  const left = useLiveData(
    async () => (plan ? generationsLeft(api, session.user, plan) : null),
    [api.repos, plan, session.user],
  );
  const perDay = plan ? PLANS[plan].aiCardsPerDay : 0;

  const generate = async () => {
    setProblem(null);
    if (outlineSource(nodes).text.length < OUTLINE_AI_MIN_CHARS) {
      setProblem(text.tooShort);
      return;
    }
    if (plan === undefined) return;
    setBusy(true);
    try {
      // Antes de gastar una llamada se revisa que todavía queden generaciones hoy
      if ((await generationsLeft(api, session.user, plan)) <= 0) throw new GenerationLimitError();
      const notes = await api.repos.notes.list();
      const { result, proposals } = await generateOutlineCards({
        nodes,
        names: [session.user.alias],
        existing: notes.map((note) =>
          note.kind === 'cloze'
            ? { id: note.id, kind: 'cloze' as const, text: note.text }
            : { id: note.id, kind: note.kind, front: note.front },
        ),
        // Al modelo solo viaja el ID seudónimo del alumno, nunca su nombre ni su correo
        generator: generatorFor(status, {
          studentRef: session.user.id,
          names: [session.user.alias],
        }),
      });
      const recorded = await recordGeneration(api, session.user, plan, result, outline.title);
      setDraft(null);
      setReview({
        artifactId: recorded.artifactId,
        simulated: result.mode !== 'real',
        processedText: result.processedText,
        proposed: proposals.length,
        pending: proposals,
        accepted: 0,
        notices: [
          ...(result.scrubbedTotal > 0 ? [t.aiCards.scrubbed(result.scrubbedTotal)] : []),
          ...(result.rejected > 0 ? [t.aiCards.rejected(result.rejected)] : []),
          ...(result.fellBack ? [t.aiCards.fellBack] : []),
          ...(result.stopped ? [result.stopped.message] : []),
        ],
      });
    } catch (error) {
      await logFailedGeneration(api, session.user, error);
      setProblem(cardsFailureText(error, t.aiCards.error));
    } finally {
      setBusy(false);
    }
  };

  const accept = async (proposal: OutlineProposal) => {
    if (!review) return;
    const chosen =
      draft?.id === proposal.id ? { ...proposal, front: draft.front, back: draft.back } : proposal;
    setProblem(null);
    setBusy(true);
    try {
      await acceptOutlineProposal(api, session.user, {
        outlineId: outline.id,
        proposal: chosen,
        artifactId: review.artifactId,
        simulated: review.simulated,
      });
      setDraft(null);
      setReview({
        ...review,
        pending: review.pending.filter((entry) => entry.id !== proposal.id),
        accepted: review.accepted + 1,
      });
    } catch {
      setProblem(text.acceptFailed);
    } finally {
      setBusy(false);
    }
  };

  const discard = async (proposal: OutlineProposal) => {
    if (!review) return;
    const pending = review.pending.filter((entry) => entry.id !== proposal.id);
    if (draft?.id === proposal.id) setDraft(null);
    setReview({ ...review, pending });
    // Descartar no guarda nada de la tarjeta. Solo se cuenta, y si no se aceptó ninguna y ya no
    // quedan, el artefacto queda rechazado
    await discardOutlineProposal(api, session.user, {
      artifactId: review.artifactId,
      pending: pending.length,
    }).catch(() => undefined);
  };

  // Con la compuerta cerrada o sin IA no se ofrece el botón y se ve el aviso
  if (!offered) return <AiAccessNotice access={access} gatedText={t.ai.access.gatedCards} />;
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-fg-muted">{text.intro}</p>
      <p className="text-sm text-fg-muted">
        {t.aiCards.modes[status.kind === 'real' ? 'real' : 'template']}
      </p>
      <AiAccessNotice access={access} gatedText={t.ai.access.gatedCards} />
      {review === null ? (
        <>
          {left !== undefined && left !== null ? (
            <p role="status" className="text-sm font-medium">
              {t.aiCards.left(left, perDay)}
            </p>
          ) : null}
          <Button
            type="button"
            className="self-start"
            disabled={busy || left === 0 || plan === undefined || !canGenerate}
            onClick={() => {
              void generate();
            }}
          >
            {busy ? text.generating : text.generate}
          </Button>
        </>
      ) : (
        <section aria-label={t.aiCards.resultTitle} className="flex flex-col gap-3">
          {review.notices.length > 0 ? (
            <ul className="flex flex-col gap-1 text-sm text-fg-muted">
              {review.notices.map((notice) => (
                <li key={notice}>{notice}</li>
              ))}
            </ul>
          ) : null}
          {review.accepted > 0 ? (
            <p role="status" className="text-sm font-medium">
              {text.accepted(review.accepted)}
            </p>
          ) : null}
          {review.pending.length === 0 ? (
            <p className="text-sm">{review.proposed === 0 ? text.none : text.done}</p>
          ) : (
            <>
              <p className="text-sm">
                {text.result(review.pending.length)} {text.deckNote(deckName)}
              </p>
              <ul className="flex flex-col gap-3">
                {review.pending.map((proposal, index) => (
                  <Proposal
                    key={proposal.id}
                    number={index + 1}
                    proposal={proposal}
                    draft={draft?.id === proposal.id ? draft : null}
                    simulated={review.simulated}
                    processedText={review.processedText}
                    busy={busy}
                    onJump={onJump}
                    onDraft={setDraft}
                    onAccept={() => {
                      void accept(proposal);
                    }}
                    onDiscard={() => {
                      void discard(proposal);
                    }}
                  />
                ))}
              </ul>
            </>
          )}
          <Button
            type="button"
            variant="ghost"

            className="self-start"
            onClick={() => {
              setReview(null);
              setDraft(null);
            }}
          >
            {text.again}
          </Button>
        </section>
      )}
      {problem ? (
        <p role="alert" className="text-sm font-medium text-danger">
          {problem}
        </p>
      ) : null}
      <p className="text-xs text-fg-muted">{t.aiCards.rules}</p>
    </div>
  );
}

function Proposal({
  number,
  proposal,
  draft,
  simulated,
  processedText,
  busy,
  onJump,
  onDraft,
  onAccept,
  onDiscard,
}: {
  number: number;
  proposal: OutlineProposal;
  /** El texto que el alumno está editando, o null si no la edita */
  draft: EditDraft | null;
  simulated: boolean;
  processedText: string;
  busy: boolean;
  onJump: (nodeId: string) => void;
  onDraft: (draft: EditDraft | null) => void;
  onAccept: () => void;
  onDiscard: () => void;
}) {
  const text = t.outlines.ai;
  // Una edición que agrega algo que la frase no dice se avisa, pero la decisión es del alumno
  const issues = draft
    ? checkCard(
        { kind: proposal.kind, front: draft.front, back: draft.back, quote: proposal.quote },
        processedText,
      )
    : [];
  return (
    <li
      aria-label={text.proposal(number)}
      className="flex flex-col gap-2 rounded-lg border border-line bg-surface p-3"
    >
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="neutral">{t.aiCards.kinds[proposal.kind]}</Badge>
        <Badge variant="warning">{t.aiCards.draftLabel}</Badge>
      </div>
      {draft ? (
        <div className="flex flex-col gap-2">
          <TextAreaField
            label={t.aiCards.front}
            value={draft.front}
            rows={2}
            onChange={(event) => {
              onDraft({ ...draft, front: event.target.value });
            }}
          />
          {proposal.kind === 'basic' || proposal.back !== '' ? (
            <TextAreaField
              label={t.aiCards.back}
              value={draft.back}
              rows={2}
              onChange={(event) => {
                onDraft({ ...draft, back: event.target.value });
              }}
            />
          ) : null}
          {issues.length > 0 ? (
            <p role="status" className="text-sm text-warning">
              {t.aiCards.editedIssues}
            </p>
          ) : null}
        </div>
      ) : (
        <>
          <p className="font-medium break-words">{proposal.front}</p>
          {proposal.back !== '' ? <p className="break-words">{proposal.back}</p> : null}
        </>
      )}
      <blockquote className="border-l-2 border-line-strong pl-3 text-sm text-fg-muted">
        <span className="block text-xs font-semibold">{text.quote}</span>
        <span className="break-words">{proposal.quote}</span>
      </blockquote>
      <Button
        type="button"
        variant="link"

        className="self-start px-0"
        onClick={() => {
          onJump(proposal.nodeId);
        }}
      >
        {text.goToLine}
      </Button>
      {proposal.duplicate ? <p className="text-sm text-warning">{t.aiCards.duplicate}</p> : null}
      {proposal.controversy ? (
        <ControversySignal controversy={{ ...proposal.controversy, simulated }} />
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button type="button" disabled={busy} onClick={onAccept}>
          {draft ? text.acceptEdited : text.accept}
        </Button>
        <Button
          type="button"
          variant="secondary"

          disabled={busy}
          onClick={() => {
            onDraft(draft ? null : { id: proposal.id, front: proposal.front, back: proposal.back });
          }}
        >
          {draft ? text.cancelEdit : text.edit}
        </Button>
        <Button type="button" variant="ghost" disabled={busy} onClick={onDiscard}>
          {text.discard}
        </Button>
      </div>
    </li>
  );
}
