// Retar a un compañero del grupo a un duelo (9.6). En la demostración el rival es un compañero simulado
// y en la nube (B7) otro miembro del grupo, que juega las mismas preguntas cuando pueda. Quien llama
// decide cómo se crea el duelo y qué decir si no se pudo.
import { Swords } from 'lucide-react';
import { useState, type SyntheticEvent } from 'react';
import { DUEL_QUESTIONS } from '@/engines/party';
import { t } from '@/i18n/es-MX';
import { Button } from '@/ui/components/button';
import { SelectField } from '@/ui/components/field';

export function NewDuelForm({
  rivals,
  onCreate,
  emptyText,
}: {
  rivals: readonly { id: string; alias: string }[];
  /** Crea el duelo. Devuelve null si se creó o el mensaje que hay que mostrar */
  onCreate: (rivalId: string) => Promise<string | null>;
  /** Lo que se dice cuando no hay a quién retar */
  emptyText: string;
}) {
  const text = t.party.duel;
  const [open, setOpen] = useState(false);
  const [rivalId, setRivalId] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (rivals.length === 0) return <p className="mt-3 text-sm text-fg-muted">{emptyText}</p>;
  if (!open) {
    return (
      <Button
        variant="secondary"
        size="sm"
        className="mt-3 self-start"
        onClick={() => {
          setOpen(true);
        }}
      >
        <Swords aria-hidden />
        {text.newButton}
      </Button>
    );
  }

  const chosen = rivals.find((member) => member.id === rivalId) ?? rivals[0];
  const submit = async (event: SyntheticEvent) => {
    event.preventDefault();
    if (!chosen || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const failure = await onCreate(chosen.id);
      if (failure === null) setOpen(false);
      else setMessage(failure);
    } catch {
      setMessage(text.createFailed);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className="mt-3 flex flex-col gap-3 rounded-md border border-line p-3"
      onSubmit={(event) => {
        void submit(event);
      }}
    >
      <SelectField
        label={text.rival}
        value={chosen?.id ?? ''}
        options={rivals.map((member) => ({ value: member.id, label: member.alias }))}
        onChange={(event) => {
          setRivalId(event.target.value);
        }}
      />
      <p className="text-sm text-fg-muted">{text.rules(DUEL_QUESTIONS)}</p>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={busy}>
          {text.create}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            setOpen(false);
            setMessage(null);
          }}
        >
          {t.party.cancel}
        </Button>
      </div>
      {message ? (
        <p role="alert" className="text-sm text-danger">
          {message}
        </p>
      ) : null}
    </form>
  );
}
