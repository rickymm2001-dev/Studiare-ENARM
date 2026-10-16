// Acuerdo del etiquetado (pantalla 19, 4.4 del plan de B11). Tablero del acuerdo entre la etiqueta que
// puso el autor de cada distractor y la que puso a ciegas el revisor al revisarlo. Ya no hay muestra
// del 20 %. Cada revisión etiqueta todos sus distractores (8.9). Pares, kappa global con su intervalo,
// kappa por etiqueta, el vocabulario que usa la app del alumno con su regla y estado calibrando hasta
// 30 pares. Debajo, las preguntas en revisión que al médico le faltan por etiquetar a ciegas. El detalle
// se calcula aquí con los pares de editor_label_pairs, sin texto. Con la nube suma el historial noche por
// noche del kappa que calcula la calibración, con su paridad contra este tablero (B14).
import { Gauge, ListChecks, Users } from 'lucide-react';
import { Link } from 'react-router';
import { usePreferences } from '@/app/preferences';
import { ScreenHeader } from '@/app/layout/ScreenHeader';
import { SCREENS } from '@/app/screens';
import { DEFAULT_THRESHOLDS } from '@/config/thresholds';
import type { EditorListItem } from '@/data/bank/contracts';
import { TAGGABLE_BIASES } from '@/data/usecases/labeling';
import { computePairAgreement } from '@/engines/agreement';
import { t } from '@/i18n/es-MX';
import { physicianText } from '@/i18n/physician';
import { Button } from '@/ui/components/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/ui/components/card';
import { StatCell, StatPanel } from '@/ui/components/stat-panel';
import { CalibratingState, ErrorState, LoadingState } from '@/ui/states/states';
import { AgreementHistoryCard } from './AgreementHistoryCard';
import { sourceKeyLabel } from './reviewSteps';
import { useEditorialRepo } from './useEditorialRepo';
import { useRepoQuery } from './useRepoQuery';

const biasName = new Map(TAGGABLE_BIASES.map((bias) => [bias.key, bias.name]));
const fixed = (value: number) => value.toLocaleString('es-MX', { maximumFractionDigits: 2 });
const PENDING_LIMIT = 500;

export function AgreementScreen() {
  const text = physicianText.agreementScreen;
  const role = usePreferences((state) => state.role);
  const isPhysician = role === 'physician';
  const { repo, ready, key } = useEditorialRepo();
  const { state, reload } = useRepoQuery(
    async () => {
      const [pairs, pending] = await Promise.all([
        repo.labelPairs(),
        isPhysician
          ? repo.list({ view: 'to_review' }, { limit: PENDING_LIMIT, offset: 0 })
          : Promise.resolve(null),
      ]);
      return {
        pairs,
        pending: (pending?.items ?? []).filter((item) => item.reviewState === 'blind_pending'),
      };
    },
    `${key}|${String(isPhysician)}`,
    ready,
  );

  const header = (
    <ScreenHeader
      title={t.screens.agreement.title}
      description={physicianText.descriptions.agreement}
    />
  );
  if (state.status === 'loading') {
    return (
      <>
        {header}
        <LoadingState />
      </>
    );
  }
  if (state.status === 'failed') {
    return (
      <>
        {header}
        <ErrorState
          title={text.failed}
          description={physicianText.errors[state.code] ?? ''}
          onRetry={reload}
        />
      </>
    );
  }

  const { pairs, pending } = state.value;
  const report = computePairAgreement(pairs, DEFAULT_THRESHOLDS.bias);
  const minPairs = DEFAULT_THRESHOLDS.bias.minLabeledPairs;
  const threshold = DEFAULT_THRESHOLDS.bias.minKappaForBiasLanguage;
  const tags = Object.entries(report.byTag)
    .flatMap(([tag, result]) => (result ? [{ tag, result }] : []))
    .sort((a, b) => a.result.kappa - b.result.kappa);

  return (
    <>
      {header}
      <StatPanel label={text.stats.label}>
        <StatCell
          icon={<ListChecks />}
          label={text.stats.pending}
          value={isPhysician ? pending.length.toLocaleString('es-MX') : '—'}
          caption={text.stats.pendingCaption}
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
          // Mientras calibra no se muestra un kappa de pocos pares, que es ruido
          value={
            report.global && !report.calibrating ? fixed(report.global.kappa) : text.stats.noKappa
          }
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

      <AgreementHistoryCard cloud={repo.kind === 'cloud'} ready={ready} sourceKey={key} />

      <PendingQueue isPhysician={isPhysician} pending={pending} />
    </>
  );
}

/** Las preguntas en revisión que al médico le faltan por etiquetar a ciegas, con el enlace al editor */
function PendingQueue({
  isPhysician,
  pending,
}: {
  isPhysician: boolean;
  pending: readonly EditorListItem[];
}) {
  const text = physicianText.agreementScreen.queue;
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
            <ul className="flex flex-col divide-y divide-line">
              {pending.map((item) => {
                const label = sourceKeyLabel(item.sourceKey);
                return (
                  <li key={item.questionId} className="flex flex-wrap items-center gap-2 py-2">
                    <span className="min-w-0 flex-1 text-sm">
                      {label ? <span className="mr-2 font-semibold">{label}</span> : null}
                      {item.promptPreview}
                    </span>
                    <Button asChild size="sm" variant="secondary">
                      <Link to={`${SCREENS.questionEditor.path}?pregunta=${item.questionId}`}>
                        {text.open}
                      </Link>
                    </Button>
                  </li>
                );
              })}
            </ul>
          </>
        )
      ) : null}
    </Card>
  );
}
