// Acuerdo del etiquetado (pantalla 19, 7.11). Cola de doble etiquetado a ciegas y tablero de acuerdo
// entre médicos. El 20 % de las preguntas entra a la muestra, cada médico etiqueta el sesgo de sus
// distractores sin ver lo que puso el autor ni otro médico, y kappa dice cuánto coinciden. Con
// kappa menor a 0.4 o pocos pares, la interfaz del alumno habla de trampas y no de sesgos.
import { Gauge, ListChecks, Scale, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { usePreferences } from '@/app/preferences';
import { ScreenHeader } from '@/app/layout/ScreenHeader';
import { useSession } from '@/app/session';
import { DEFAULT_THRESHOLDS } from '@/config/thresholds';
import { useDataApi } from '@/data/context';
import { useLiveData } from '@/data/hooks';
import type { Option } from '@/data/schemas/bank';
import { ensureDemoBank } from '@/data/usecases/bank';
import { removeLabel, saveLabel, TAGGABLE_BIASES } from '@/data/usecases/labeling';
import { t } from '@/i18n/es-MX';
import { Button } from '@/ui/components/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/ui/components/card';
import { Disclosure } from '@/ui/components/disclosure';
import { SelectField } from '@/ui/components/field';
import { StatCell, StatPanel } from '@/ui/components/stat-panel';
import { CalibratingState, EmptyState, LoadingState } from '@/ui/states/states';
import { buildAgreementView, sampleQuestionIds, type QueueItem } from './agreementView';

const PAGE = 10;
const biasName = new Map(TAGGABLE_BIASES.map((bias) => [bias.key, bias.name]));
const biasDefinition = new Map(
  TAGGABLE_BIASES.map((bias) => [bias.key, bias.distractorDefinition]),
);
const fixed = (value: number) => value.toLocaleString('es-MX', { maximumFractionDigits: 2 });

export function AgreementScreen() {
  const text = t.agreementScreen;
  const api = useDataApi();
  const role = usePreferences((state) => state.role);
  const session = useSession();
  const me = session.status === 'ready' ? session.user.id : null;
  const [bankReady, setBankReady] = useState(false);
  useEffect(() => {
    void ensureDemoBank(api).then(() => {
      setBankReady(true);
    });
  }, [api]);

  const data = useLiveData(async () => {
    const [questions, labels, assignments] = await Promise.all([
      api.repos.questions.listLatest(),
      api.repos.biasLabels.list(),
      api.repos.reviewAssignments.list(),
    ]);
    const sample = new Set(sampleQuestionIds(questions));
    const inSample = questions.filter((question) => sample.has(question.questionId));
    const optionsByQuestion = new Map(
      await Promise.all(
        inSample.map(
          async (question) =>
            [question.id, await api.repos.options.listForQuestionVersion(question.id)] as const,
        ),
      ),
    );
    return { questions, labels, assignments, optionsByQuestion };
  }, [api.repos, bankReady]);

  const header = (
    <ScreenHeader title={t.screens.agreement.title} description={t.screens.agreement.description} />
  );
  if (data === undefined || !bankReady) {
    return (
      <>
        {header}
        <LoadingState />
      </>
    );
  }
  if (data.questions.length === 0) {
    return (
      <>
        {header}
        <EmptyState title={text.empty.title} description={text.empty.description} />
      </>
    );
  }

  const isPhysician = role === 'physician' && me !== null;
  const view = buildAgreementView({
    questions: data.questions,
    optionsByQuestion: data.optionsByQuestion,
    labels: data.labels,
    physicianId: isPhysician ? me : null,
    allowed: isPhysician
      ? new Set(
          data.assignments
            .filter((assignment) => assignment.physicianId === me)
            .map((assignment) => assignment.questionId),
        )
      : null,
  });
  const { report } = view;
  const minPairs = DEFAULT_THRESHOLDS.bias.minLabeledPairs;
  const threshold = DEFAULT_THRESHOLDS.bias.minKappaForBiasLanguage;
  const tags = Object.entries(report.byTag)
    .flatMap(([tag, result]) => (result ? [{ tag, result }] : []))
    .sort((a, b) => a.result.kappa - b.result.kappa);

  return (
    <>
      {header}
      <StatPanel label={text.stats.label} quad>
        <StatCell
          icon={<ListChecks />}
          label={text.stats.sample}
          value={view.sampleSize.toLocaleString('es-MX')}
          caption={text.stats.sampleCaption(view.sampleSize, view.sampleOptions)}
        />
        <StatCell
          icon={<Scale />}
          label={text.stats.mine}
          value={isPhysician ? `${view.mine.done}/${view.mine.total}` : '—'}
          caption={text.stats.mineCaption(view.mine.done, view.mine.total)}
        />
        <StatCell
          icon={<Users />}
          label={text.stats.pairs}
          value={report.pairs.toLocaleString('es-MX')}
          caption={text.stats.pairsCaption}
        />
        <StatCell
          icon={<Gauge />}
          label={text.stats.kappa}
          value={report.global ? fixed(report.global.kappa) : text.stats.noKappa}
          caption={text.stats.kappaCaption}
        />
      </StatPanel>

      {report.calibrating ? (
        <CalibratingState
          current={report.pairs}
          target={minPairs}
          unit={text.vocabulary.unit}
          title={text.vocabulary.title}
          description={`${text.vocabulary.calibrating} ${text.vocabulary.trap}`}
        />
      ) : (
        <Card aria-labelledby="acuerdo-vocabulario">
          <CardHeader className="mb-2">
            <CardTitle id="acuerdo-vocabulario">{text.vocabulary.title}</CardTitle>
            <CardDescription>{text.vocabulary[report.vocabulary]}</CardDescription>
          </CardHeader>
          {report.global ? (
            <p className="text-sm">
              {text.vocabulary.current(
                fixed(report.global.kappa),
                fixed(report.global.lower),
                fixed(report.global.upper),
              )}
            </p>
          ) : null}
          <p className="mt-1 text-sm text-fg-muted">{text.vocabulary.rule(threshold)}</p>
        </Card>
      )}

      <Card aria-labelledby="acuerdo-etiquetas">
        <CardHeader className="mb-2">
          <CardTitle id="acuerdo-etiquetas">{text.byTag.title}</CardTitle>
          <CardDescription>{text.byTag.hint}</CardDescription>
        </CardHeader>
        {tags.length === 0 ? (
          <p className="text-sm text-fg-muted">{text.byTag.none}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-fg-muted">
                  <th scope="col" className="py-1 pr-2">
                    {text.byTag.tag}
                  </th>
                  <th scope="col" className="py-1 pr-2 text-right">
                    {text.byTag.kappa}
                  </th>
                  <th scope="col" className="py-1 pr-2 text-right">
                    {text.byTag.interval}
                  </th>
                  <th scope="col" className="py-1 text-right">
                    {text.byTag.pairs}
                  </th>
                </tr>
              </thead>
              <tbody>
                {tags.map(({ tag, result }) => (
                  <tr key={tag} className="border-t border-line">
                    <th scope="row" className="py-1.5 pr-2 text-left font-medium">
                      {biasName.get(tag) ?? tag}
                    </th>
                    <td className="py-1.5 pr-2 text-right">{fixed(result.kappa)}</td>
                    <td className="py-1.5 pr-2 text-right">
                      {fixed(result.lower)} a {fixed(result.upper)}
                    </td>
                    <td className="py-1.5 text-right">{result.n}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Queue
        isPhysician={isPhysician}
        physician={isPhysician ? { id: me, role: 'physician' } : null}
        pending={view.pending}
        myLabels={
          new Map(
            data.labels
              .filter((label) => label.physicianId === me)
              .map((label) => [label.optionId, label.biasTag]),
          )
        }
      />
    </>
  );
}

function Queue({
  isPhysician,
  physician,
  pending,
  myLabels,
}: {
  isPhysician: boolean;
  physician: { id: string; role: 'physician' } | null;
  pending: QueueItem[];
  myLabels: ReadonlyMap<string, string>;
}) {
  const text = t.agreementScreen.queue;
  const api = useDataApi();
  const [shown, setShown] = useState(PAGE);
  const [message, setMessage] = useState<'saved' | 'failed' | null>(null);

  const choose = async (option: Option, tag: string) => {
    if (!physician) return;
    try {
      if (tag === '') await removeLabel(api, physician.id, option.optionId);
      else await saveLabel(api, physician, option, tag);
      setMessage('saved');
    } catch {
      setMessage('failed');
    }
  };

  return (
    <Card aria-labelledby="acuerdo-cola">
      <CardHeader className="mb-2">
        <CardTitle id="acuerdo-cola">{text.title}</CardTitle>
        <CardDescription>{isPhysician ? text.hint : text.adminNote}</CardDescription>
      </CardHeader>
      {isPhysician ? (
        pending.length === 0 ? (
          <p className="text-sm text-fg-muted">{text.empty}</p>
        ) : (
          <>
            <p className="mb-2 text-sm font-medium">{text.remaining(pending.length)}</p>
            <ul className="flex flex-col gap-2">
              {pending.slice(0, shown).map((item) => (
                <li key={item.question.id}>
                  <Disclosure
                    title={item.question.prompt}
                    summary={text.progress(item.done, item.options.length)}
                  >
                    {item.question.vignette ? (
                      <p className="text-sm">{item.question.vignette}</p>
                    ) : null}
                    {item.options.map((option) => {
                      const current = myLabels.get(option.optionId) ?? '';
                      return (
                        <div key={option.id} className="flex flex-col gap-1">
                          <p className="text-sm font-medium">{option.text}</p>
                          <SelectField
                            label={text.option(option.text)}
                            value={current}
                            options={[
                              { value: '', label: text.none },
                              ...TAGGABLE_BIASES.map((bias) => ({
                                value: bias.key,
                                label: bias.name,
                              })),
                            ]}
                            onChange={(event) => {
                              void choose(option, event.target.value);
                            }}
                          />
                          {current ? (
                            <p className="text-sm text-fg-muted">{biasDefinition.get(current)}</p>
                          ) : null}
                        </div>
                      );
                    })}
                  </Disclosure>
                </li>
              ))}
            </ul>
            {pending.length > shown ? (
              <Button
                variant="secondary"
                size="sm"
                className="mt-3"
                onClick={() => {
                  setShown(shown + PAGE);
                }}
              >
                {text.showMore(Math.min(PAGE, pending.length - shown))}
              </Button>
            ) : null}
          </>
        )
      ) : null}
      <p className="mt-3 text-sm text-fg-muted" role="status" aria-live="polite">
        {message === 'saved' ? text.saved : message === 'failed' ? text.failed : ''}
      </p>
    </Card>
  );
}
