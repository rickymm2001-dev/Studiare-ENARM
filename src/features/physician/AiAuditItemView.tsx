// Un texto de la muestra de la auditoría, tal como lo vería el alumno, o el médico en su cola si es una
// pregunta reestructurada, junto a su fuente (B12, 5.3). El médico ve el texto y de dónde sale, sin el
// modelo ni el prompt que lo escribió, para calificar el texto y no la máquina.
import { Bot } from 'lucide-react';
import type { ReactNode } from 'react';
import { aiAuditText } from '@/i18n/aiAudit';
import { Badge } from '@/ui/components/badge';
import type { MyItem } from '@/data/cloud/aiGate';

const text = aiAuditText.reviewer;

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex min-w-0 flex-col gap-2 rounded-lg border border-line bg-surface p-3">
      <h4 className="eyebrow text-fg-muted">{title}</h4>
      {children}
    </section>
  );
}

function Labeled({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <p className="text-xs font-semibold text-fg-muted">{label}</p>
      <div className="whitespace-pre-line text-sm">{children}</div>
    </div>
  );
}

function DraftBadges({ kind }: { kind: string }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Badge variant="simulated">
        <Bot aria-hidden className="size-3.5" />
        {kind}
      </Badge>
      <Badge variant="warning" className="whitespace-normal leading-tight">
        {text.draft}
      </Badge>
    </div>
  );
}

/** Lo que escribió la IA, según el motor */
function Output({ item }: { item: MyItem }) {
  switch (item.engine) {
    case 'forgetting': {
      const { output } = item;
      return (
        <div className="flex flex-col gap-2">
          <DraftBadges kind={aiAuditText.engines.forgetting} />
          {output.hypothesis === null ? (
            <p className="text-sm text-fg-muted">{text.noHypothesis}</p>
          ) : (
            <>
              <p>{output.hypothesis}</p>
              {output.studentMessage ? (
                <p className="text-sm text-fg-muted">{output.studentMessage}</p>
              ) : null}
            </>
          )}
          <Badge variant="neutral" className="self-start">
            {text.confidence[output.confidence] ?? output.confidence}
          </Badge>
        </div>
      );
    }
    case 'weekly_report': {
      const { output } = item;
      return (
        <div className="flex flex-col gap-2">
          <DraftBadges kind={aiAuditText.engines.weekly_report} />
          <Labeled label={text.reportSummary}>{output.summary}</Labeled>
          <Labeled label={text.reportPriorities}>
            <ol className="list-decimal pl-5">
              {output.priorities.map((priority) => (
                <li key={priority.ref}>{priority.text}</li>
              ))}
            </ol>
          </Labeled>
          {output.habit ? <Labeled label={text.reportHabit}>{output.habit}</Labeled> : null}
          {output.challenge ? (
            <Labeled label={text.reportChallenge}>{output.challenge}</Labeled>
          ) : null}
        </div>
      );
    }
    case 'flashcards': {
      const card = item.output.cards[0];
      if (!card) return null;
      return (
        <div className="flex flex-col gap-2">
          <DraftBadges kind={text.cardKinds[card.kind] ?? card.kind} />
          <Labeled label={text.cardFront}>{card.front}</Labeled>
          {card.back !== '' ? <Labeled label={text.cardBack}>{card.back}</Labeled> : null}
          <Labeled label={text.cardQuote}>{card.quote}</Labeled>
          {card.controversy ? (
            <Labeled label={text.cardControversy}>
              {card.controversy.reason}
              {card.controversy.sources.length > 0
                ? ` (${card.controversy.sources.map((source) => source.key).join(', ')})`
                : ''}
            </Labeled>
          ) : null}
        </div>
      );
    }
    case 'bias_tips': {
      return (
        <div className="flex flex-col gap-2">
          <DraftBadges kind={aiAuditText.engines.bias_tips} />
          <p>{item.output.tip}</p>
        </div>
      );
    }
    case 'restructure': {
      const { output } = item;
      return (
        <div className="flex flex-col gap-2">
          <DraftBadges kind={aiAuditText.engines.restructure} />
          <Labeled label={text.proposedQuestion}>{output.stem}</Labeled>
          <Labeled label={text.options}>
            <ol className="list-none">
              {output.options.map((option) => (
                <li key={option.label} className={option.isKey ? 'font-semibold' : undefined}>
                  {option.label}. {option.text}
                  {option.isKey ? ` · ${text.keyOption}` : ''}
                </li>
              ))}
            </ol>
          </Labeled>
          <Labeled label={text.explanation}>{output.explanation}</Labeled>
          <Labeled label={text.rationale}>{output.rationale}</Labeled>
          <Labeled label={text.quote}>{output.quote}</Labeled>
        </div>
      );
    }
  }
}

/** De dónde sale lo que le dieron a la IA */
function Source({ item }: { item: MyItem }) {
  switch (item.engine) {
    case 'forgetting':
      return (
        <ul className="flex flex-col gap-2 text-sm">
          {item.input.evidence.map((evidence) => (
            <li key={evidence.ref}>{evidence.text}</li>
          ))}
        </ul>
      );
    case 'weekly_report':
      return (
        <ul className="flex flex-col gap-2 text-sm">
          {item.input.priorities.map((priority) => (
            <li key={priority.ref}>
              <span className="font-medium">{priority.title}</span>. {priority.detail}
            </li>
          ))}
          {item.input.habit ? (
            <li>
              <span className="font-medium">{item.input.habit.title}</span>.{' '}
              {item.input.habit.detail}
            </li>
          ) : null}
          {item.input.challenge ? (
            <li>
              <span className="font-medium">{item.input.challenge.title}</span>.{' '}
              {item.input.challenge.detail}
            </li>
          ) : null}
        </ul>
      );
    case 'flashcards':
      return (
        <div className="flex flex-col gap-1 text-sm">
          {item.input.title ? <p className="font-medium">{item.input.title}</p> : null}
          <p className="whitespace-pre-line">{item.input.text}</p>
        </div>
      );
    case 'bias_tips':
      return (
        <div className="flex flex-col gap-2 text-sm">
          <Labeled label={text.tipBase}>{item.input.baseTip}</Labeled>
          <Labeled label={text.tipExamples}>
            <ul className="flex flex-col gap-1">
              {item.input.examples.map((example) => (
                <li key={example.ref}>{example.text}</li>
              ))}
            </ul>
          </Labeled>
        </div>
      );
    case 'restructure':
      return (
        <div className="flex flex-col gap-2 text-sm">
          <Labeled label={text.originalQuestion}>{item.input.stem}</Labeled>
          <ol className="list-none">
            {item.input.options.map((option) => (
              <li key={option.label} className={option.isKey ? 'font-semibold' : undefined}>
                {option.label}. {option.text}
                {option.isKey ? ` · ${text.keyOption}` : ''}
              </li>
            ))}
          </ol>
          <Labeled label={text.explanation}>{item.input.explanation}</Labeled>
        </div>
      );
  }
}

export function AuditItem({ item }: { item: MyItem }) {
  const kind = aiAuditText.sourceKinds[item.sourceKind] ?? item.sourceKind;
  return (
    <div className="grid items-start gap-3 lg:grid-cols-2">
      <Panel title={item.engine === 'restructure' ? text.physicianSees : text.studentSees}>
        <Output item={item} />
      </Panel>
      <Panel title={text.sourceTitle}>
        <Badge variant="neutral" className="self-start whitespace-normal leading-tight">
          {kind}
        </Badge>
        <Source item={item} />
      </Panel>
    </div>
  );
}
