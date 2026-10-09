// Consejos por sesgo en la cola del médico (8.5, pantalla 20). El texto base de cada consejo es un
// borrador. El médico lo aprueba, lo edita o lo rechaza, y los alumnos ven el resultado en el Tutor.
import { useState } from 'react';
import { useDataApi } from '@/data/context';
import type { AiArtifact } from '@/data/schemas/activity';
import type { User } from '@/data/schemas/people';
import { biasTaxonomy, biasTips } from '@/demo/content';
import { t } from '@/i18n/es-MX';
import { Badge } from '@/ui/components/badge';
import { Button } from '@/ui/components/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/ui/components/card';
import { Disclosure } from '@/ui/components/disclosure';
import { TextAreaField } from '@/ui/components/field';
import { TIP_MAX_CHARS, TIP_MIN_CHARS, tipReviewsFrom, type TipReview } from '../shared/tipReviews';
import { decideTip, InvalidTipError, reopenTip } from './draftActions';

const nameOf = new Map(biasTaxonomy.biases.map((bias) => [bias.key, bias.name]));

export function TipDrafts({
  physician,
  artifacts,
}: {
  physician: Pick<User, 'id'>;
  artifacts: readonly AiArtifact[];
}) {
  const text = t.draftsScreen.tips;
  const reviews = tipReviewsFrom(artifacts);
  return (
    <Card aria-labelledby="borradores-consejos">
      <CardHeader>
        <CardTitle id="borradores-consejos">{t.draftsScreen.sections.tips}</CardTitle>
        <CardDescription>{text.hint}</CardDescription>
      </CardHeader>
      <ul className="flex flex-col gap-2">
        {biasTips.tips.map((tip) => (
          <li key={tip.biasKey}>
            <TipRow
              biasKey={tip.biasKey}
              name={nameOf.get(tip.biasKey) ?? tip.biasKey}
              baseTip={tip.tip}
              review={reviews.get(tip.biasKey)}
              physician={physician}
            />
          </li>
        ))}
      </ul>
    </Card>
  );
}

function TipRow({
  biasKey,
  name,
  baseTip,
  review,
  physician,
}: {
  biasKey: string;
  name: string;
  baseTip: string;
  review: TipReview | undefined;
  physician: Pick<User, 'id'>;
}) {
  const text = t.draftsScreen.tips;
  const api = useDataApi();
  const status = review?.status ?? 'draft';
  const [value, setValue] = useState(review && review.status !== 'rejected' ? review.tip : baseTip);
  const [message, setMessage] = useState('');
  const [failed, setFailed] = useState('');

  const run = async (action: () => Promise<unknown>, done: string) => {
    setFailed('');
    try {
      await action();
      setMessage(done);
    } catch (caught) {
      setMessage('');
      setFailed(
        caught instanceof InvalidTipError
          ? text.invalid(TIP_MIN_CHARS, TIP_MAX_CHARS)
          : text.failed,
      );
    }
  };

  return (
    <Disclosure
      title={
        <span className="flex flex-wrap items-center gap-2">
          {name}
          <Badge
            variant={status === 'draft' ? 'warning' : status === 'rejected' ? 'neutral' : 'success'}
          >
            {text.status[status]}
          </Badge>
        </span>
      }
    >
      <TextAreaField
        label={`${text.text}. ${name}`}
        rows={3}
        value={value}
        hint={text.count(value.trim().length, TIP_MAX_CHARS)}
        onChange={(event) => {
          setValue(event.target.value);
          setMessage('');
        }}
      />
      {value.trim() !== baseTip.trim() ? (
        <p className="text-sm text-fg-muted">
          {text.base}. {baseTip}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          onClick={() => {
            void run(
              () =>
                decideTip(api, physician, { biasKey, baseTip, tip: value, decision: 'approve' }),
              text.saved,
            );
          }}
        >
          {text.approve}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => {
            void run(
              () => decideTip(api, physician, { biasKey, baseTip, tip: value, decision: 'reject' }),
              text.saved,
            );
          }}
        >
          {text.reject}
        </Button>
        {review ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setValue(baseTip);
              void run(() => reopenTip(api, biasKey), text.saved);
            }}
          >
            {text.reopen}
          </Button>
        ) : null}
      </div>
      <p role="status" className="text-sm font-medium text-success">
        {message}
      </p>
      {failed ? (
        <p role="alert" className="text-sm text-danger">
          {failed}
        </p>
      ) : null}
    </Disclosure>
  );
}
