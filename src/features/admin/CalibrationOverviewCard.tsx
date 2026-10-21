// Lo que publica la calibración nocturna (B14, 7.2 del plan de B14). De la última corrida buena, las
// preguntas por estado, los temas que más cuestan, los motivos de error que más pesan, el estado del
// detector de fatiga y el acuerdo del etiquetado con su paridad. Solo trae datos de 30 alumnos o más,
// porque la base los filtra, y sin ellos dice calibrando. Nunca hay un alumno suelto (1.7 del plan).
import { topicTaxonomy } from '@/demo/content';
import type { AdminCalibration } from '@/data/cloud/calibrationAdmin';
import { calibrationAdminTexts } from '@/i18n/calibrationAdmin';
import { causeNames } from '@/i18n/insights';
import { Card, CardDescription, CardHeader, CardTitle } from '@/ui/components/card';
import { ProgressBar } from '@/ui/components/progress-bar';
import { Hourglass } from 'lucide-react';

const text = calibrationAdminTexts.overview;
const BRANCH_NAMES: ReadonlyMap<string, string> = new Map(
  topicTaxonomy.branches.map((branch) => [branch.key, branch.name]),
);

/** pediatrics/neonatology se lee como Pediatría, Neonatología */
function topicTitle(key: string): string {
  const [branchKey = '', topicKey = ''] = key.split('/');
  const branch = topicTaxonomy.branches.find((item) => item.key === branchKey);
  const topic = branch?.topics.find((item) => item.key === topicKey);
  return [branch?.name ?? branchKey, topic?.name ?? topicKey].filter(Boolean).join(', ');
}

const ITEM_STATES = ['physician_estimate', 'provisional', 'calibrated'] as const;

const kappaText = (kappa: number) => kappa.toLocaleString('es-MX', { maximumFractionDigits: 2 });

function Calibrating({ children }: { children: string }) {
  return (
    <p role="status" className="flex items-start gap-1.5 text-sm text-fg-muted">
      <Hourglass aria-hidden className="mt-0.5 size-4 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

function Items({ items }: { items: AdminCalibration['overview']['items'] }) {
  const total = ITEM_STATES.reduce((sum, state) => sum + items[state], 0);
  return (
    <section aria-labelledby="calibracion-estados" className="flex flex-col gap-2">
      <h3 id="calibracion-estados" className="eyebrow text-fg-muted">
        {text.items.title}
      </h3>
      {total === 0 ? (
        <Calibrating>{text.items.empty}</Calibrating>
      ) : (
        <ul className="flex flex-col gap-2">
          {ITEM_STATES.map((state) => (
            <li key={state} className="flex flex-col gap-1">
              <span className="flex items-baseline justify-between gap-2 text-sm">
                <span className="font-medium">{text.items[state]}</span>
                <span className="text-fg-muted tabular-nums">
                  {text.items.share(items[state], total)}
                </span>
              </span>
              <ProgressBar
                value={items[state]}
                max={total}
                label={`${text.items[state]}. ${text.items.share(items[state], total)}`}
                className="h-2"
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Topics({ topics }: { topics: AdminCalibration['overview']['hardestTopics'] }) {
  return (
    <section aria-labelledby="calibracion-temas" className="flex flex-col gap-1.5">
      <h3 id="calibracion-temas" className="eyebrow text-fg-muted">
        {text.topics.title}
      </h3>
      <p className="text-sm text-fg-muted">{text.topics.hint}</p>
      {topics.length === 0 ? (
        <Calibrating>{text.topics.none}</Calibrating>
      ) : (
        <ol className="flex flex-col divide-y divide-line overflow-hidden rounded-lg border border-line">
          {topics.map((topic) => (
            <li key={topic.key} className="flex flex-col gap-0.5 px-3 py-2 text-sm">
              <span className="font-medium">{topicTitle(topic.key)}</span>
              <span className="text-fg-muted">
                {text.topics.line(topic.accuracy, topic.students)}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

/** Los tres motivos con más peso de una rama, del mayor al menor */
function topMotives(shares: Readonly<Record<string, number>>): string[] {
  return Object.entries(shares)
    .filter(([key, value]) => key !== 'reports' && value > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([key, value]) =>
      text.motives.share(
        Object.hasOwn(causeNames, key) ? causeNames[key as keyof typeof causeNames] : key,
        value,
      ),
    );
}

function Motives({ motives }: { motives: AdminCalibration['overview']['motives'] }) {
  const branches = Object.entries(motives).sort(
    (a, b) => (b[1].reports ?? 0) - (a[1].reports ?? 0),
  );
  return (
    <section aria-labelledby="calibracion-motivos" className="flex flex-col gap-1.5">
      <h3 id="calibracion-motivos" className="eyebrow text-fg-muted">
        {text.motives.title}
      </h3>
      <p className="text-sm text-fg-muted">{text.motives.hint}</p>
      {branches.length === 0 ? (
        <Calibrating>{text.motives.none}</Calibrating>
      ) : (
        <ul className="flex flex-col divide-y divide-line overflow-hidden rounded-lg border border-line">
          {branches.map(([branch, shares]) => (
            <li key={branch} className="flex flex-col gap-0.5 px-3 py-2 text-sm">
              <span className="font-medium">{BRANCH_NAMES.get(branch) ?? branch}</span>
              <span className="text-fg-muted">
                {[text.motives.reports(shares.reports ?? 0), ...topMotives(shares)].join(' · ')}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Fatigue({ data }: { data: AdminCalibration }) {
  const { fatigue } = data.overview;
  const need = data.settings.thresholds.fatigue.minStudents;
  return (
    <section aria-labelledby="calibracion-fatiga" className="flex flex-col gap-1.5">
      <h3 id="calibracion-fatiga" className="eyebrow text-fg-muted">
        {text.fatigue.title}
      </h3>
      {fatigue.state === 'calibrating' ? (
        <Calibrating>{text.fatigue.calibrating(fatigue.students, need)}</Calibrating>
      ) : fatigue.state === 'validated' ? (
        <p className="text-sm">{text.fatigue.validated(fatigue.students, fatigue.longSessions)}</p>
      ) : (
        <p className="text-sm">{text.fatigue.not_valid}</p>
      )}
    </section>
  );
}

function Agreement({ agreement }: { agreement: AdminCalibration['overview']['agreement'] }) {
  const copy = text.agreement;
  const kappa = agreement?.kappa ?? null;
  return (
    <section aria-labelledby="calibracion-acuerdo" className="flex flex-col gap-1.5">
      <h3 id="calibracion-acuerdo" className="eyebrow text-fg-muted">
        {copy.title}
      </h3>
      {agreement === null || kappa === null ? (
        <Calibrating>{copy.none}</Calibrating>
      ) : (
        <>
          <p className="text-sm font-medium">{copy.kappa(kappaText(kappa))}</p>
          <p
            className={
              agreement.parity === false
                ? 'text-sm font-medium text-warning'
                : 'text-sm text-fg-muted'
            }
          >
            {agreement.parity === null
              ? copy.unknown
              : agreement.parity
                ? copy.match
                : copy.mismatch}
          </p>
        </>
      )}
    </section>
  );
}

export function CalibrationOverviewCard({ data }: { data: AdminCalibration }) {
  // Sin una corrida buena no hay nada que mostrar, y los ceros dirían que no hay nada
  const hasGoodRun = data.lastOkAt !== null;
  return (
    <Card aria-labelledby="calibracion-publica" className="flex flex-col gap-4">
      <CardHeader className="mb-0">
        <CardTitle id="calibracion-publica">{text.title}</CardTitle>
        <CardDescription>{text.hint}</CardDescription>
      </CardHeader>
      {hasGoodRun ? (
        <>
          <Items items={data.overview.items} />
          <Topics topics={data.overview.hardestTopics} />
          <Motives motives={data.overview.motives} />
          <Fatigue data={data} />
          <Agreement agreement={data.overview.agreement} />
        </>
      ) : (
        <Calibrating>{text.none}</Calibrating>
      )}
    </Card>
  );
}
