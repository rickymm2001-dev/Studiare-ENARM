// Cola de borradores de IA (pantalla 20, 10.2). Preguntas reestructuradas, consejos por sesgo y
// tarjetas de mazos públicos. Todo entra como borrador y no llega a un alumno sin que un médico lo
// apruebe (4.2, 8.6). El médico ve lo de las preguntas que le asignaron y el admin todo.
import { useState } from 'react';
import { FileText, Lightbulb, Layers } from 'lucide-react';
import { usePreferences } from '@/app/preferences';
import { ScreenHeader } from '@/app/layout/ScreenHeader';
import { useSession } from '@/app/session';
import { useDataApi } from '@/data/context';
import { useLiveData } from '@/data/hooks';
import { biasTips } from '@/demo/content';
import { t } from '@/i18n/es-MX';
import { physicianText } from '@/i18n/physician';
import { Button } from '@/ui/components/button';
import { DemoContentLabel } from '@/ui/components/labels';
import { StatCell, StatPanel } from '@/ui/components/stat-panel';
import { LoadingState } from '@/ui/states/states';
import { useBankReady } from '../shared/useBankReady';
import { tipReviewsFrom } from '../shared/tipReviews';
import { CardDrafts } from './CardDrafts';
import { pendingPublicNotes } from './draftActions';
import { QuestionDrafts } from './QuestionDrafts';
import { TipDrafts } from './TipDrafts';

type Section = 'questions' | 'tips' | 'cards';
const SECTIONS: readonly Section[] = ['questions', 'tips', 'cards'];

export function AiDraftsScreen() {
  const text = physicianText.draftsScreen;
  const api = useDataApi();
  const role = usePreferences((state) => state.role);
  const session = useSession();
  const bankReady = useBankReady();
  const [section, setSection] = useState<Section>('questions');
  const [notice, setNotice] = useState('');

  const data = useLiveData(async () => {
    const [artifacts, latest, assignments, decks, notes] = await Promise.all([
      api.repos.aiArtifacts.list(),
      api.repos.questions.listLatest(),
      api.repos.reviewAssignments.list(),
      api.repos.decks.list(),
      api.repos.notes.list(),
    ]);
    return { artifacts, latest, assignments, decks, notes };
  }, [api.repos, bankReady]);

  const header = (
    <ScreenHeader
      title={t.screens.aiDrafts.title}
      description={text.hint}
      badges={<DemoContentLabel />}
    />
  );
  if (data === undefined || !bankReady || session.status !== 'ready') {
    return (
      <>
        {header}
        <LoadingState />
      </>
    );
  }
  const me = session.user;
  const isPhysician = role === 'physician';
  const mine = new Set(
    data.assignments
      .filter((assignment) => assignment.physicianId === me.id)
      .map((assignment) => assignment.questionId),
  );
  // Solo originales de un caso suelto. Los casos seriados y las variantes no se reestructuran
  const candidates = data.latest.filter(
    (question) =>
      question.caseId === null &&
      question.variantOf === undefined &&
      (!isPhysician || mine.has(question.questionId)),
  );
  const reviews = tipReviewsFrom(data.artifacts);
  const pendingCards = pendingPublicNotes(data.decks, data.notes);
  const pendingQuestions = data.artifacts.filter(
    (artifact) => artifact.kind === 'restructured_question' && artifact.status === 'draft',
  ).length;
  const pendingTips = biasTips.tips.filter((tip) => {
    const status = reviews.get(tip.biasKey)?.status;
    return status === undefined || status === 'draft';
  }).length;

  const icons = { questions: <FileText />, tips: <Lightbulb />, cards: <Layers /> } as const;
  const counts = {
    questions: pendingQuestions,
    tips: pendingTips,
    cards: pendingCards.length,
  } satisfies Record<Section, number>;

  return (
    <>
      {header}
      <StatPanel label={text.stats.label}>
        {SECTIONS.map((key) => (
          <StatCell
            key={key}
            icon={icons[key]}
            label={text.stats[key]}
            value={counts[key].toLocaleString('es-MX')}
          />
        ))}
      </StatPanel>
      <div role="group" aria-label={text.sections.label} className="flex flex-wrap gap-2">
        {SECTIONS.map((key) => (
          <Button
            key={key}
            variant={section === key ? 'primary' : 'secondary'}
            aria-pressed={section === key}
            onClick={() => {
              setSection(key);
              setNotice('');
            }}
          >
            {text.sections[key]}
          </Button>
        ))}
      </div>
      {section === 'questions' ? (
        <QuestionDrafts
          physician={{ id: me.id, alias: me.alias }}
          questions={candidates}
          artifacts={data.artifacts}
          notice={notice}
          onNotice={setNotice}
        />
      ) : null}
      {section === 'tips' ? <TipDrafts physician={me} artifacts={data.artifacts} /> : null}
      {section === 'cards' ? <CardDrafts pending={pendingCards} /> : null}
    </>
  );
}
