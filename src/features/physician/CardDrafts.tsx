// Tarjetas de mazos públicos que esperan decisión del médico (pantalla 20). Aprobar o rechazar solo
// cambia el estado editorial de la tarjeta, no su texto.
import { useState } from 'react';
import { htmlToText } from '@/data/content/plainText';
import { useDataApi } from '@/data/context';
import type { Note } from '@/data/schemas/decks';
import { t } from '@/i18n/es-MX';
import { Badge } from '@/ui/components/badge';
import { Button } from '@/ui/components/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/ui/components/card';
import { EmptyState } from '@/ui/states/states';
import { decideNote, type PendingNote } from './draftActions';

const PAGE = 15;

const faces = (note: Note) =>
  note.kind === 'cloze'
    ? { front: htmlToText(note.text), back: htmlToText(note.extra) }
    : { front: htmlToText(note.front), back: htmlToText(note.back) };

export function CardDrafts({ pending }: { pending: readonly PendingNote[] }) {
  const text = t.draftsScreen.cards;
  const api = useDataApi();
  const [shown, setShown] = useState(PAGE);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const decide = async (id: string, status: 'approved' | 'rejected') => {
    setError('');
    try {
      await decideNote(api, id, status);
      setMessage(text.decided(t.bank.status[status]));
    } catch {
      setMessage('');
      setError(text.failed);
    }
  };

  if (pending.length === 0) {
    return <EmptyState title={text.empty.title} description={text.empty.description} />;
  }
  return (
    <Card aria-labelledby="borradores-tarjetas">
      <CardHeader>
        <CardTitle id="borradores-tarjetas">{t.draftsScreen.sections.cards}</CardTitle>
        <CardDescription>
          {text.hint} {text.remaining(pending.length)}.
        </CardDescription>
      </CardHeader>
      <p role="status" className="mb-2 text-sm font-medium text-success">
        {message}
      </p>
      {error ? (
        <p role="alert" className="mb-2 text-sm text-danger">
          {error}
        </p>
      ) : null}
      <ul className="flex flex-col divide-y divide-line">
        {pending.slice(0, shown).map(({ note, deck }) => {
          const { front, back } = faces(note);
          return (
            <li key={note.id} className="flex flex-col gap-2 py-3">
              <p className="flex flex-wrap items-center gap-2 text-xs text-fg-muted">
                <Badge variant="neutral">{deck.name}</Badge>
                <Badge variant="warning">{t.draftsScreen.draftLabel}</Badge>
              </p>
              <p className="text-sm">
                <span className="font-semibold">{text.front}. </span>
                {front}
              </p>
              {back ? (
                <p className="text-sm">
                  <span className="font-semibold">{text.back}. </span>
                  {back}
                </p>
              ) : null}
              <div className="flex gap-2">
                <Button
                  size="sm"
                  aria-label={`${text.approve}. ${front.slice(0, 60)}`}
                  onClick={() => {
                    void decide(note.id, 'approved');
                  }}
                >
                  {text.approve}
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  aria-label={`${text.reject}. ${front.slice(0, 60)}`}
                  onClick={() => {
                    void decide(note.id, 'rejected');
                  }}
                >
                  {text.reject}
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
      {pending.length > shown ? (
        <div className="mt-3">
          <Button
            variant="secondary"
            onClick={() => {
              setShown(shown + PAGE);
            }}
          >
            {text.showMore(Math.min(PAGE, pending.length - shown))}
          </Button>
        </div>
      ) : null}
    </Card>
  );
}
