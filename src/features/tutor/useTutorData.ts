// Los datos que necesita el tutor y la vista que sale de ellos. La pantalla del tutor y el widget
// de la última hipótesis usan lo mismo, así dicen lo mismo. Carga el banco completo para detectar
// confusiones entre preguntas parecidas, por eso solo se monta donde se necesita. El dominio, el informe de
// Conócete y la fatiga salen del modelo del alumno (B14), el mismo que lee Progreso.
import { useMemo } from 'react';
import { DEFAULT_THRESHOLDS } from '@/config/thresholds';
import { useDataApi } from '@/data/context';
import { useLiveData } from '@/data/hooks';
import type { AiArtifact } from '@/data/schemas/activity';
import type { ClinicalCase, Option, Question } from '@/data/schemas/bank';
import type { Card, Note } from '@/data/schemas/decks';
import type { AppEvent } from '@/data/schemas/events';
import { freeSubjectCardIds } from '@/data/usecases/outlines';
import { deckIds } from '@/demo/content/deckEntities';
import type { StudentModelBuild } from '@/engines/studentModel';
import { studyDayOf } from '@/engines/studyDay';
import { useDeckCatalog } from '../decks/useDeckCatalog';
import { useStudentModelBuild } from '../model/useStudentModel';
import { cardFaces, topicFromTags } from '../review/study';
import type { ReadySession } from '../shared/RequireSession';
import { applyTipReviews, tipReviewsFrom, type TipReview } from '../shared/tipReviews';
import type { CardFact } from './errorContexts';
import { hypothesisArtifactId } from './hypothesisStore';
import type { Hypothesis } from './tutorModel';
import { buildTutorView, type TutorView } from './tutorView';

export interface TutorData {
  catalog: NonNullable<ReturnType<typeof useDeckCatalog>>;
  bank: { questions: Question[]; options: Option[]; cases: ClinicalCase[] };
  content: { cards: Card[]; notes: Note[] };
  /** Lo del tutor que ya tiene artefacto. Hipótesis, informes semanales y consejos por sesgo */
  artifacts: AiArtifact[];
  /** Los consejos que un médico ya revisó, por clave de sesgo */
  tipReviews: ReadonlyMap<string, TipReview>;
  /** Cartas de una materia libre, que no cuentan en Conócete ni en el informe semanal (B6) */
  freeSubjectCards: ReadonlySet<string>;
  /** El modelo del alumno, el mismo que lee Progreso */
  model: StudentModelBuild;
}

export function useTutorData(
  session: ReadySession,
  events: readonly AppEvent[] | undefined,
): TutorData | undefined {
  const api = useDataApi();
  const userId = session.user.id;
  const catalog = useDeckCatalog();
  const model = useStudentModelBuild(session, events);
  const answeredIds = [
    ...new Set(
      (events ?? []).flatMap((event) =>
        event.type === 'question_answered' ? [event.payload.questionVersionId] : [],
      ),
    ),
  ];
  const bank = useLiveData(async () => {
    const latest = await api.repos.questions.listLatest();
    const known = new Set(latest.map((question) => question.id));
    const older = (
      await Promise.all(
        answeredIds.filter((id) => !known.has(id)).map((id) => api.repos.questions.get(id)),
      )
    ).filter((question): question is Question => question !== undefined);
    const questions = [...latest, ...older];
    const options = (
      await Promise.all(
        questions.map((question) => api.repos.options.listForQuestionVersion(question.id)),
      )
    ).flat();
    const cases = await api.repos.cases.list();
    return { questions, options, cases };
  }, [api.repos, answeredIds.join(',')]);
  const content = useLiveData(async () => {
    const [cards, notes] = await Promise.all([api.repos.cards.list(), api.repos.notes.list()]);
    return { cards, notes };
  }, [api.repos]);
  const artifacts = useLiveData(
    async () =>
      (await api.repos.aiArtifacts.list()).filter(
        (artifact) =>
          artifact.userId === userId &&
          (artifact.kind === 'hypothesis' ||
            artifact.kind === 'weekly_report' ||
            artifact.kind === 'bias_tip'),
      ),
    [api.repos, userId],
  );
  const tipReviews = useLiveData(
    async () => tipReviewsFrom(await api.repos.aiArtifacts.list()),
    [api.repos],
  );
  const freeSubjectCards = useLiveData(() => freeSubjectCardIds(api), [api.repos]);
  if (!catalog || !bank || !content || !artifacts || !tipReviews || !freeSubjectCards || !model) {
    return undefined;
  }
  return { catalog, bank, content, artifacts, tipReviews, freeSubjectCards, model };
}

/**
 * La vista del tutor con los datos cargados. Se recalcula solo cuando algo cambia. La parte pesada
 * depende de la bitácora, el banco y las tarjetas, también de cuáles son de una materia libre (B6),
 * no de los artefactos, así responder una hipótesis o revisar un consejo no la vuelve a calcular
 * completa
 */
export function useTutorView(
  session: ReadySession,
  events: readonly AppEvent[],
  data: TutorData,
): TutorView {
  const { user, settings } = session;
  const { catalog, bank, content, tipReviews, freeSubjectCards, model } = data;
  const base = useMemo(() => {
    const noteById = new Map(content.notes.map((note) => [note.id, note]));
    const catalogTopic = new Map(
      catalog.flatMap((file) =>
        file.notes.map((note) => [deckIds.note(note.key), note.topic] as const),
      ),
    );
    const cards = new Map<string, CardFact>(
      content.cards.map((card) => {
        const note = noteById.get(card.noteId);
        return [
          card.id,
          {
            topic: catalogTopic.get(card.noteId) ?? topicFromTags(note?.tags),
            // La respuesta de la carta. En una inversa la carta 1 responde con el frente. Una cloze
            // no enumera una respuesta, así que no entra a la regla de listas
            back: note && note.kind !== 'cloze' ? cardFaces(note, card.ordinal).back : null,
          },
        ];
      }),
    );
    const now = new Date();
    return buildTutorView({
      now,
      events,
      bank: {
        questions: new Map(bank.questions.map((question) => [question.id, question])),
        options: new Map(bank.options.map((option) => [option.id, option])),
        cases: new Map(bank.cases.map((item) => [item.id, item])),
      },
      questions: bank.questions,
      options: bank.options,
      cards,
      timeZone: user.timeZone,
      today: studyDayOf(now, user.timeZone),
      desiredRetention: settings.desiredRetention,
      thresholds: DEFAULT_THRESHOLDS,
      freeSubjectCards,
      model,
    });
  }, [
    events,
    catalog,
    bank,
    content,
    freeSubjectCards,
    model,
    user.timeZone,
    settings.desiredRetention,
  ]);
  // El texto que revisó un médico reemplaza al base, y el que rechazó no se muestra
  return useMemo(
    () => ({ ...base, biasTips: applyTipReviews(base.biasTips, tipReviews) }),
    [base, tipReviews],
  );
}

/** Estado de respuesta de cada hipótesis por su clave. Sin respuesta no aparece */
export function artifactStatuses(
  userId: string,
  artifacts: readonly AiArtifact[],
  hypotheses: readonly Pick<Hypothesis, 'key'>[],
) {
  const byId = new Map(artifacts.map((artifact) => [artifact.id, artifact.status]));
  return new Map(
    hypotheses.flatMap((hypothesis) => {
      const status = byId.get(hypothesisArtifactId(userId, hypothesis.key));
      return status ? [[hypothesis.key, status] as const] : [];
    }),
  );
}
