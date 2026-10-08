// Exportar mis tarjetas a CSV (D-093). El archivo lleva encabezados y un identificador por nota, así
// que volver a importarlo en Studiare o en Anki no duplica nada.
import { FileDown } from 'lucide-react';
import { useState } from 'react';
import { useDataApi } from '@/data/context';
import { isEditableDeck, type Deck } from '@/data/schemas/decks';
import { exportDecksCsv } from '@/data/usecases/exportDecks';
import { deckIndent, flattenDeckTree } from '@/engines/deckTree';
import { t } from '@/i18n/es-MX';
import { Button } from '@/ui/components/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/ui/components/card';
import { SelectField } from '@/ui/components/field';
import type { ReadySession } from '../shared/RequireSession';

/** Entrega el archivo al navegador como descarga, sin pasar por ningún servidor */
function download(fileName: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function ExportDecksCard({
  session,
  decks,
}: {
  session: ReadySession;
  decks: readonly Deck[];
}) {
  const api = useDataApi();
  const [deckId, setDeckId] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  const own = flattenDeckTree(decks.filter((deck) => isEditableDeck(deck, session.user.id)));
  if (own.length === 0) return null;
  // Si el mazo elegido ya no existe, se exportan todos
  const valid = own.some(({ deck }) => deck.id === deckId) ? deckId : '';

  const run = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const result = await exportDecksCsv(api, session.user, valid === '' ? undefined : valid);
      if (result.notes === 0) {
        setMessage({ text: t.exporter.empty, error: false });
        return;
      }
      download(result.fileName, result.content);
      setMessage({ text: t.exporter.done(result.notes, result.fileName), error: false });
    } catch {
      setMessage({ text: t.exporter.error, error: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card aria-labelledby="exportar-titulo">
      <CardHeader>
        <CardTitle id="exportar-titulo" className="flex items-center gap-2">
          <FileDown aria-hidden className="size-5 text-primary" />
          {t.exporter.title}
        </CardTitle>
        <CardDescription>{t.exporter.intro}</CardDescription>
      </CardHeader>
      <form
        className="flex flex-col gap-3 sm:flex-row sm:items-end"
        onSubmit={(event) => {
          event.preventDefault();
          void run();
        }}
      >
        <SelectField
          className="flex-1"
          label={t.exporter.deckLabel}
          value={valid}
          onChange={(event) => {
            setDeckId(event.target.value);
          }}
          options={[
            { value: '', label: t.exporter.all },
            ...own.map(({ deck, depth }) => ({
              value: deck.id,
              label: `${deckIndent(depth)}${deck.name}`,
            })),
          ]}
        />
        <Button type="submit" variant="secondary" disabled={busy}>
          {busy ? t.exporter.working : t.exporter.button}
        </Button>
      </form>
      {message ? (
        <p
          role={message.error ? 'alert' : 'status'}
          className={message.error ? 'text-sm text-danger' : 'text-sm text-fg-muted'}
        >
          {message.text}
        </p>
      ) : null}
    </Card>
  );
}
