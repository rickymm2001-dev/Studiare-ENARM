// Las tarjetas que saldrán del apunte, tal como las ve el motor, y las líneas que no se volvieron
// tarjeta con su motivo. Es también la forma accesible de saber qué marcas funcionaron, porque las
// insignias del editor no se leen en voz alta.
import { useMemo } from 'react';
import { maskCloze } from '@/engines/cloze';
import { cardCountOf, type CardPlan, type PlanIssue } from '@/engines/outline';
import { t } from '@/i18n/es-MX';
import { Badge } from '@/ui/components/badge';

const SHORT = 90;

function shorten(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length <= SHORT ? flat : `${flat.slice(0, SHORT - 1)}…`;
}

function frontOf(plan: CardPlan): string {
  return plan.draft.kind === 'cloze' ? maskCloze(plan.draft.text) : plan.draft.front;
}

export function CardPreview({
  plans,
  issues,
}: {
  plans: readonly CardPlan[];
  issues: readonly PlanIssue[];
}) {
  const text = t.outlines.preview;
  const total = useMemo(
    () => plans.reduce((sum, plan) => sum + cardCountOf(plan.draft), 0),
    [plans],
  );
  // Un mismo aviso repetido en muchas líneas se dice una vez con su cantidad
  const grouped = useMemo(() => {
    const counts = new Map<PlanIssue['code'], number>();
    for (const issue of issues) counts.set(issue.code, (counts.get(issue.code) ?? 0) + 1);
    return [...counts];
  }, [issues]);

  return (
    <section aria-labelledby="tarjetas-del-apunte" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="tarjetas-del-apunte" className="text-base font-semibold">
          {text.title}
        </h2>
        <Badge variant="neutral">{total.toLocaleString('es-MX')}</Badge>
      </div>
      <p role="status" className="text-sm text-fg-muted">
        {total === 0 ? text.none : text.count(total)}
      </p>
      {plans.length > 0 ? (
        <ul className="flex max-h-96 flex-col gap-2 overflow-y-auto">
          {plans.map((plan) => (
            <li key={plan.nodeId} className="rounded-md border border-line p-2 text-sm">
              <p className="font-semibold text-fg-muted">{text.kinds[plan.draft.kind]}</p>
              <p>{shorten(frontOf(plan))}</p>
              {plan.draft.kind !== 'cloze' ? (
                <p className="text-fg-muted">{shorten(plan.draft.back)}</p>
              ) : null}
              {plan.tags.length > 0 ? (
                <p className="mt-1 flex flex-wrap gap-1">
                  {plan.tags.map((tag) => (
                    <Badge key={tag} variant="neutral">
                      #{tag}
                    </Badge>
                  ))}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {grouped.length > 0 ? (
        <div className="rounded-md bg-warning-soft p-3 text-sm text-warning">
          <p className="font-semibold">{text.issuesTitle}</p>
          <ul className="mt-1 list-disc pl-5">
            {grouped.map(([code, count]) => (
              <li key={code}>
                {text.issues[code]}
                {count > 1 ? ` (${String(count)})` : ''}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
