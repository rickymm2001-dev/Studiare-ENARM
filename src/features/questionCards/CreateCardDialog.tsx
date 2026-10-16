// Crear tarjeta con una pregunta (B5, comentario 1). Va en cada pregunta de la revisión del examen y
// de la práctica. El alumno elige el mazo entre los suyos, los precargados que sigue y uno nuevo. La
// tarjeta llega armada con el texto del banco, sin IA, y la puede cambiar antes de guardarla. En los
// planes de pago también puede pedir una propuesta a la IA, anclada a la explicación y en borrador.
// Si edita la propuesta, se vuelve a revisar contra su cita con el mismo validador del generador y
// se avisa cuando ya no se apoya en ella. Si la guarda así, queda en borrador con el aviso a la
// vista, como en Crear tarjetas con IA. Guardar dos veces no duplica la tarjeta y el diálogo lo dice.
// En Gratis, si no sigue ningún precargado, no le sugiere seguir uno del catálogo, que es de pago (B8).
import { BookCheck, BookPlus, X } from 'lucide-react';
import { Dialog } from 'radix-ui';
import { useId, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { screenPath } from '@/app/screens';
import { useDataApi } from '@/data/context';
import { useLiveData } from '@/data/hooks';
import { newId } from '@/data/ids';
import { approveGeneration } from '@/data/usecases/aiCards';
import { validateDraft, type DraftError, type NoteDraft } from '@/data/usecases/manualDecks';
import {
  createQuestionCard,
  type QuestionCardResult,
  type QuestionCardSource,
} from '@/data/usecases/questionCards';
import { deckIds, ROOT_DECK_KEY } from '@/demo/content/deckEntities';
import { checkCard, type ProposedCard } from '@/engines/cardGen';
import { deckPath } from '@/engines/deckTree';
import { t } from '@/i18n/es-MX';
import { Badge } from '@/ui/components/badge';
import { Button } from '@/ui/components/button';
import { SelectField, TextAreaField, TextField } from '@/ui/components/field';
import { followedDeckIds } from '../decks/followed';
import { FeatureGate } from '../shared/FeatureGate';
import type { ReadySession } from '../shared/RequireSession';
import { usePlanText } from '../shared/useActivePlan';
import type { QuestionBundle } from '../simulator/useQuestion';
import { AiSuggestions } from './AiSuggestions';
import { NEW_DECK, questionCardChoices } from './deckChoices';
import { questionCardDraft, questionEnglishParts } from './questionCardDraft';

type From = 'exam_review' | 'practice_review';

/** ENARM 2027 solo agrupa a las ramas, así que no recibe tarjetas */
const CONTAINERS: ReadonlySet<string> = new Set([deckIds.deck(ROOT_DECK_KEY)]);

const EMPTY_DRAFT: NoteDraft = { kind: 'basic', front: '', back: '' };

/** La tarjeta como la revisa el validador de la IA. El reverso de una con huecos es su nota extra */
function proposalOf(draft: NoteDraft, quote: string): ProposedCard {
  return draft.kind === 'cloze'
    ? { kind: 'cloze', front: draft.text, back: draft.extra, quote }
    : { kind: 'basic', front: draft.front, back: draft.back, quote };
}

/**
 * El botón que abre el diálogo. El diálogo solo existe mientras está abierto. Si el alumno ya creó
 * una tarjeta con la pregunta, lo dice al lado y el botón lo lleva como descripción, así el lector
 * de pantalla lo anuncia con él. El botón sigue activo, porque puede querer otra en otro mazo
 */
export function CreateCardButton({
  session,
  bundle,
  from,
  label,
  created = false,
}: {
  session: ReadySession;
  bundle: QuestionBundle;
  from: From;
  /** Nombre para el lector de pantalla cuando hay varios botones iguales en la página */
  label?: string;
  /** Ya creó una tarjeta con esta pregunta, según sus eventos question_card_created */
  created?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const createdId = useId();
  return (
    <>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Button
          size="sm"
          variant="secondary"
          aria-label={label}
          aria-describedby={created ? createdId : undefined}
          onClick={() => {
            setOpen(true);
          }}
        >
          <BookPlus aria-hidden />
          {t.examReview.createCard.button}
        </Button>
        {created ? (
          // En el teléfono el aviso puede partirse en dos renglones y el ícono va con el primero
          <p id={createdId} className="flex items-start gap-1.5 text-sm text-fg-muted">
            <BookCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-success" />
            {t.examReview.createCard.alreadyCreated}
          </p>
        ) : null}
      </div>
      {open ? (
        <CreateCardDialog
          session={session}
          bundle={bundle}
          from={from}
          onClose={() => {
            setOpen(false);
          }}
        />
      ) : null}
    </>
  );
}

export function CreateCardDialog({
  session,
  bundle,
  from,
  onClose,
}: {
  session: ReadySession;
  bundle: QuestionBundle;
  from: From;
  onClose: () => void;
}) {
  const api = useDataApi();
  const text = t.examReview.createCard;
  const decks = useLiveData(() => api.repos.decks.list(), [api.repos]);
  const bankDraft = useMemo(() => questionCardDraft(bundle), [bundle]);
  const [target, setTarget] = useState('');
  const [newName, setNewName] = useState('');
  // Un ID por diálogo para el mazo nuevo, así guardar otra vez no crea otro mazo
  const [newDeckId] = useState(newId);
  const [draft, setDraft] = useState<NoteDraft>(bankDraft ?? EMPTY_DRAFT);
  const [source, setSource] = useState<QuestionCardSource>({ kind: 'bank' });
  // La explicación tal como la leyó el generador, para revisar la propuesta contra su cita
  const [aiSourceText, setAiSourceText] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<QuestionCardResult | null>(null);
  // Un doble toque no guarda dos veces mientras el primero sigue en curso
  const busy = useRef(false);

  const choices = useMemo(
    () =>
      decks === undefined
        ? []
        : questionCardChoices({
            decks,
            userId: session.user.id,
            followed: followedDeckIds(session, decks),
            containers: CONTAINERS,
          }),
    [decks, session],
  );
  const options = [
    { value: '', label: text.chooseDeck },
    ...choices.map((choice) => ({
      value: choice.deckId,
      label: choice.label,
      group: choice.group === 'own' ? text.ownGroup : text.preloadedGroup,
    })),
    { value: NEW_DECK, label: text.newDeckOption },
  ];
  const chosenPreloaded = choices.some(
    (choice) => choice.deckId === target && choice.group === 'preloaded',
  );
  const noPreloaded =
    decks !== undefined && !choices.some((choice) => choice.group === 'preloaded');
  // Sin precargados que siga, en Gratis no se sugiere seguir uno del catálogo, que es de pago (4.25, B8)
  const noPreloadedHint = usePlanText(session.user.id, 'deckCatalog', {
    open: text.noPreloaded,
    closed: t.freePlan.catalog.createCardNoPreloaded,
  });
  // La propuesta de la IA se revisa contra su cita con cada cambio. Sin cambios siempre pasa, porque
  // el generador ya la revisó. Lo que se agregue y la frase no diga se avisa, y no se corrige solo
  const aiIssues = useMemo(
    () => (source.kind === 'ai' ? checkCard(proposalOf(draft, source.quote), aiSourceText) : []),
    [source, draft, aiSourceText],
  );

  const save = async () => {
    if (busy.current) return;
    setProblem(null);
    if (target === '') {
      setProblem(text.errors.chooseDeck);
      return;
    }
    if (target === NEW_DECK && newName.trim() === '') {
      setProblem(text.errors.deckName);
      return;
    }
    const invalid: DraftError | null = validateDraft(draft);
    if (invalid) {
      setProblem(t.decks.editor.errors[invalid]);
      return;
    }
    busy.current = true;
    setSaving(true);
    try {
      const saved = await createQuestionCard(api, session.user, {
        question: bundle.question,
        target:
          target === NEW_DECK
            ? { kind: 'new', deckId: newDeckId, name: newName }
            : { kind: 'deck', deckId: target },
        draft,
        // En una pregunta de Inglés médico, lo que sigue en inglés se guarda con su idioma
        english: questionEnglishParts(bundle),
        source,
        from,
        layer: { name: text.layerDeckName, description: text.layerDeckDescription },
      });
      // La propuesta de la IA sale de borrador como generación porque el alumno la eligió
      if (source.kind === 'ai' && saved.status === 'created') {
        await approveGeneration(api, session.user, source.artifactId, 1);
      }
      setResult(saved);
    } catch {
      setProblem(t.decks.editor.saveError);
    } finally {
      busy.current = false;
      setSaving(false);
    }
  };

  const savedDeck = result && decks ? deckPath(decks, result.deckId).slice(-2).join(' › ') : '';

  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" />
        <Dialog.Content className="animate-rise fixed top-1/2 left-1/2 z-50 flex max-h-[92dvh] w-[calc(100%-1.5rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 flex-col gap-4 overflow-y-auto rounded-xl border border-line bg-surface p-4 shadow-raised sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <Dialog.Title className="text-xl font-extrabold">{text.title}</Dialog.Title>
              <Dialog.Description className="text-sm text-fg-muted">
                {text.description}
              </Dialog.Description>
            </div>
            <Dialog.Close
              className="flex size-touch shrink-0 items-center justify-center rounded-full hover:bg-muted"
              aria-label={text.close}
            >
              <X aria-hidden className="size-5" />
            </Dialog.Close>
          </div>

          <form
            className="flex flex-col gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            <SelectField
              label={text.deck}
              value={target}
              options={options}
              hint={chosenPreloaded ? text.layerHint : noPreloaded ? noPreloadedHint : undefined}
              onChange={(event) => {
                setTarget(event.target.value);
                setResult(null);
                setProblem(null);
              }}
            />
            {target === NEW_DECK ? (
              <TextField
                label={text.newDeckName}
                value={newName}
                maxLength={120}
                onChange={(event) => {
                  setNewName(event.target.value);
                }}
              />
            ) : null}

            <div className="flex flex-wrap items-center gap-2 text-sm">
              {source.kind === 'ai' ? (
                <Badge variant="warning">{t.aiCards.draftLabel}</Badge>
              ) : (
                <span className="text-fg-muted">{text.bankSource}</span>
              )}
              {source.kind === 'ai' && bankDraft ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setDraft(bankDraft);
                    setSource({ kind: 'bank' });
                    setResult(null);
                  }}
                >
                  {text.restoreBank}
                </Button>
              ) : null}
            </div>
            {source.kind === 'ai' ? (
              <p className="text-sm text-fg-muted">{t.examReview.ai.using}</p>
            ) : null}
            <DraftFields
              draft={draft}
              onChange={(next) => {
                setDraft(next);
                setResult(null);
              }}
            />
            {aiIssues.length > 0 ? (
              <p role="status" className="text-sm text-warning">
                {t.aiCards.editedIssues}
              </p>
            ) : null}

            {problem ? (
              <p role="alert" className="text-sm font-medium text-danger">
                {problem}
              </p>
            ) : null}
            <p role="status" className="text-sm font-medium">
              {result
                ? result.status === 'created'
                  ? text.saved(savedDeck)
                  : text.exists(savedDeck)
                : ''}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={saving}>
                {saving ? text.saving : text.save}
              </Button>
              {result ? (
                <Button asChild variant="secondary">
                  <Link to={screenPath('review')}>{text.goReview}</Link>
                </Button>
              ) : null}
            </div>
          </form>

          <section aria-labelledby="sugerir-con-ia" className="flex flex-col gap-2">
            <h3 id="sugerir-con-ia" className="font-semibold">
              {t.examReview.ai.title}
            </h3>
            <FeatureGate userId={session.user.id} feature="aiCards">
              <AiSuggestions
                session={session}
                bundle={bundle}
                onUse={(next, chosen, sourceText) => {
                  setDraft(next);
                  setSource(chosen);
                  setAiSourceText(sourceText);
                  setResult(null);
                  setProblem(null);
                }}
              />
            </FeatureGate>
          </section>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** Los campos de la tarjeta según su tipo. Una propuesta de la IA puede venir con huecos */
function DraftFields({
  draft,
  onChange,
}: {
  draft: NoteDraft;
  onChange: (draft: NoteDraft) => void;
}) {
  const editor = t.decks.editor;
  if (draft.kind === 'cloze') {
    return (
      <>
        <TextAreaField
          label={editor.text}
          hint={editor.clozeHint}
          value={draft.text}
          rows={5}
          onChange={(event) => {
            onChange({ ...draft, text: event.target.value });
          }}
        />
        <TextAreaField
          label={editor.extra}
          value={draft.extra}
          rows={3}
          onChange={(event) => {
            onChange({ ...draft, extra: event.target.value });
          }}
        />
      </>
    );
  }
  return (
    <>
      <TextAreaField
        label={editor.reverseFront}
        value={draft.front}
        rows={5}
        onChange={(event) => {
          onChange({ ...draft, front: event.target.value });
        }}
      />
      <TextAreaField
        label={editor.reverseBack}
        value={draft.back}
        rows={6}
        onChange={(event) => {
          onChange({ ...draft, back: event.target.value });
        }}
      />
    </>
  );
}
